-- Run against a dedicated Supabase project as postgres. Browser roles have no
-- direct table access; the Vercel backend validates Supabase identities and roles.
create table if not exists public.library (id integer primary key check (id = 1), meta jsonb not null);
create table if not exists public.plans (id text primary key, position integer not null, data jsonb not null,
  name text generated always as (data->>'name') stored);
create table if not exists public.seats (id text primary key, row_label text not null, seat_number integer not null);
create table if not exists public.students (id text primary key, position integer not null, data jsonb not null,
  name text generated always as (data->>'name') stored,
  phone text generated always as (data->>'phone') stored,
  plan_id text generated always as (data->>'planId') stored references public.plans(id) deferrable initially deferred,
  seat_id text generated always as (nullif(data->>'seat', '')) stored references public.seats(id) deferrable initially deferred);
create unique index if not exists students_active_phone on public.students(phone) where data->>'archivedAt' is null;
create unique index if not exists students_active_seat on public.students(seat_id) where data->>'archivedAt' is null and seat_id is not null;
create table if not exists public.payments (id text primary key, position integer not null, data jsonb not null,
  student_id text generated always as (data->>'studentId') stored references public.students(id) deferrable initially deferred,
  month text generated always as (data->>'month') stored);
create unique index if not exists payments_student_month on public.payments(student_id, month) where coalesce(data->>'voided', 'false') <> 'true';
create table if not exists public.attendance (id text primary key, position integer not null, data jsonb not null,
  student_id text generated always as (data->>'studentId') stored references public.students(id) deferrable initially deferred);
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id text not null unique check (user_id = lower(user_id) and user_id ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
  name text not null, role text not null default 'pending' check (role in ('pending','student','staff','owner','disabled')),
  student_id text unique references public.students(id) deferrable initially deferred,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.cloud_sessions (token text primary key, user_id uuid not null references public.profiles(id) on delete cascade, expires timestamptz not null);
create table if not exists public.auth_limits (key text primary key, hits integer not null, expires timestamptz not null);
create table if not exists public.notification_batches (id text primary key, fingerprint text not null, created text not null, kind text not null, mode text not null);
create table if not exists public.notification_items (id text primary key, batch_id text not null references public.notification_batches(id), dedupe text unique not null, status text not null, data jsonb not null, claimed_at timestamptz);
create index if not exists notification_queue on public.notification_items(status);
create table if not exists public.notification_drafts (kind text primary key, text text not null);
create table if not exists public.legacy_accounts (user_id text primary key, data jsonb not null);
create table if not exists public.account_audit (id bigint generated always as identity primary key, actor uuid, user_id uuid, before_role text, after_role text, student_id text, created_at timestamptz not null default now());

create or replace function public.create_library_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare requested_id text;
begin
  requested_id := lower(coalesce(new.raw_user_meta_data->>'user_id', 'user-' || replace(new.id::text, '-', '')));
  if requested_id !~ '^[a-z0-9][a-z0-9._-]{2,39}$' then raise exception 'Invalid user ID'; end if;
  insert into public.profiles(id, user_id, name, role)
    values(new.id, requested_id, left(coalesce(new.raw_user_meta_data->>'name', requested_id), 80), 'pending');
  return new;
end;
$$;
revoke all on function public.create_library_profile() from public, anon, authenticated;
drop trigger if exists on_library_auth_user_created on auth.users;
create trigger on_library_auth_user_created after insert on auth.users for each row execute function public.create_library_profile();

do $$
declare table_name text;
begin
  foreach table_name in array array['library','plans','seats','students','payments','attendance','profiles','cloud_sessions','auth_limits','notification_batches','notification_items','notification_drafts','legacy_accounts','account_audit'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
  end loop;
end;
$$;
