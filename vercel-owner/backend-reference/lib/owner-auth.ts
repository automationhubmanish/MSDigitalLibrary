import {env} from 'cloudflare:workers';
import {headers} from 'next/headers';
export async function hash(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
export async function hasOwnerSession(){const h=await headers();const token=(h.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('ms_owner='))?.slice(9);if(!token||!/^[a-f0-9]{64}$/.test(token))return false;const row=await env.DB!.prepare("SELECT data FROM library_records WHERE id=? AND kind='owner-session'").bind('session-'+await hash(token)).first<{data:string}>();return !!row&&JSON.parse(row.data).expires>Date.now();}
