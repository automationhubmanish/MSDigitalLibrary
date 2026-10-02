import {neon} from '@neondatabase/serverless';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
const hash=v=>createHash('sha256').update(v).digest();
const cookie=req=>(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('ms_owner='))?.slice(9);
let initialized;
async function database(){if(!process.env.DATABASE_URL)throw Error('Database not configured');const sql=neon(process.env.DATABASE_URL);if(!initialized){initialized=sql`CREATE TABLE IF NOT EXISTS library_records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, data JSONB NOT NULL)` .then(()=>sql`CREATE UNIQUE INDEX IF NOT EXISTS library_active_seat ON library_records ((data->>'seat')) WHERE kind='student' AND COALESCE(data->>'active','true') <> 'false' AND COALESCE(data->>'seat','') <> ''`).catch(e=>{initialized=undefined;throw e});}await initialized;return sql;}
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');const path=new URL(req.url,'https://local.invalid').pathname;
if(!['/api/library','/api/owner-auth'].includes(path))return res.status(404).json({error:'Not found'});
if(!['GET','POST','DELETE'].includes(req.method))return res.status(405).end();
if(req.headers.origin&&req.headers.origin!=='https://'+req.headers.host)return res.status(403).json({error:'Request origin is not allowed.'});
try{const sql=await database();const token=cookie(req);const sid=token&&/^[a-f0-9]{64}$/.test(token)?'session-'+hash(token).toString('hex'):null;
const session=sid?(await sql`SELECT data FROM library_records WHERE id=${sid} AND kind='owner-session'`)[0]:null;const authenticated=!!session&&session.data.expires>Date.now();
if(path==='/api/owner-auth'){
 if(req.method==='GET')return res.json({authenticated});
 if(req.method==='DELETE'){if(sid)await sql`DELETE FROM library_records WHERE id=${sid} AND kind='owner-session'`;res.setHeader('Set-Cookie','ms_owner=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');return res.json({ok:true});}
 const ip=(req.headers['x-forwarded-for']||'owner').split(',')[0];const aid='login-'+hash(ip).toString('hex');const bucket=Math.floor(Date.now()/900000);
 const attempt=await sql`INSERT INTO library_records(id,kind,data) VALUES(${aid},'login-attempt',jsonb_build_object('bucket',${bucket}::bigint,'count',1)) ON CONFLICT(id) DO UPDATE SET data=jsonb_build_object('bucket',${bucket}::bigint,'count',CASE WHEN (library_records.data->>'bucket')::bigint=${bucket}::bigint THEN (library_records.data->>'count')::integer+1 ELSE 1 END) RETURNING data`;
 if(attempt[0].data.count>15)return res.status(429).json({error:'Too many login attempts. Try again in 15 minutes.'});
 const body=req.body||{};if(!process.env.LIBRARY_OWNER_PASSWORD)return res.status(503).json({error:'Owner login is not configured.'});
 if(body.username!=='msl_manish'||typeof body.password!=='string'||body.password.length>128||!timingSafeEqual(hash(body.password),hash(process.env.LIBRARY_OWNER_PASSWORD)))return res.status(401).json({error:'Incorrect username or password.'});
 const issued=randomBytes(32).toString('hex');const id='session-'+hash(issued).toString('hex');const data=JSON.stringify({expires:Date.now()+43200000});await sql`INSERT INTO library_records(id,kind,data) VALUES(${id},'owner-session',${data}::jsonb)`;await sql`DELETE FROM library_records WHERE kind='owner-session' AND (data->>'expires')::bigint<${Date.now()}::bigint`;res.setHeader('Set-Cookie',`ms_owner=${issued}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`);return res.json({authenticated:true});
}
if(!authenticated)return res.status(401).json({error:'Sign in required'});
if(req.method==='GET'){const rows=await sql`SELECT id,kind,data FROM library_records WHERE kind IN ('student','payment','attendance','settings','reminder')`;return res.json(rows.map(r=>({...r.data,id:r.id,kind:r.kind})));}
if(req.method!=='POST')return res.status(405).end();
const {id,kind,data}=req.body||{};if(typeof id!=='string'||id.length>100||!['student','payment','attendance','settings','reminder'].includes(kind)||!data||typeof data!=='object'||Array.isArray(data)||JSON.stringify(data).length>10000)return res.status(400).json({error:'Invalid record'});
if(kind==='student'){if(typeof data.name!=='string'||!data.name.trim()||!['6','8','12'].includes(String(data.plan)))return res.status(400).json({error:'Name and a valid plan are required'});data.seat=String(data.seat||'').trim().toUpperCase();if(data.seat&&!/^[A-F][1-9]$/.test(data.seat))return res.status(400).json({error:'Choose a seat from A1 to F9.'});}
if(kind==='payment'&&(!Number.isFinite(Number(data.amount))||Number(data.amount)<=0||!/^\d{4}-\d{2}$/.test(data.month)))return res.status(400).json({error:'Enter a valid payment amount and month.'});
const existing=(await sql`SELECT kind FROM library_records WHERE id=${id}`)[0];if(existing&&existing.kind!==kind)return res.status(409).json({error:'Record type cannot be changed.'});
await sql`INSERT INTO library_records(id,kind,data) VALUES(${id},${kind},${JSON.stringify(data)}::jsonb) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data`;return res.json({ok:true});
}catch(e){if(e.code==='23505')return res.status(409).json({error:'This seat is already assigned.'});console.error('Library request failed',e.message);return res.status(503).json({error:'Library service is unavailable. Please try again.'});}
}
