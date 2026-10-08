/** Minimal official-component Supabase stack for synthetic security testing only. */
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import http from 'node:http';
import assert from 'node:assert/strict';
const dir='/tmp/job-agent-local-stack';await fs.mkdir(dir,{recursive:true,mode:0o700});
const prefix='job-agent-local-test';const db='supabase_db_job-search-agent-private';
function docker(args:string[],input?:string){const r=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:1024*1024*5});if(r.status!==0)throw new Error(`Docker operation failed: ${args[0]} ${args[1]||''}: ${(r.stderr||'').split('\n').find(line=>line.includes('ERROR:'))?.replace(/[0-9a-f]{48,}/g,'[redacted]')||'check named container health'}`);return r.stdout.trim();}
const password=randomBytes(24).toString('hex');const secret=randomBytes(48).toString('hex');
async function token(role:string){return new SignJWT({role}).setProtectedHeader({alg:'HS256',typ:'JWT'}).setIssuer('supabase').setIssuedAt().setExpirationTime('2h').sign(new TextEncoder().encode(secret));}
const anon=await token('anon'),service=await token('service_role');
async function env(name:string,values:Record<string,string>){const file=`${dir}/${name}.env`;await fs.writeFile(file,Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n'),{mode:0o600});return file;}
const containers=[db,`${prefix}-auth`,`${prefix}-rest`,`${prefix}-storage`];
try{docker(['network','create','--label','job-agent.synthetic-test=true',prefix]);}catch{/* a previously created test network is harmless */}
for(const container of containers){const existing=spawnSync('docker',['inspect','-f','{{index .Config.Labels "job-agent.synthetic-test"}}',container],{encoding:'utf8'});if(existing.status===0){if(existing.stdout.trim()!=='true')throw new Error('Refusing to remove an existing non-test container.');docker(['rm','-f','-v',container]);}}
docker(['run','-d','--name',db,'--network',prefix,'--network-alias','db','--label','job-agent.synthetic-test=true','--env-file',await env('db',{POSTGRES_PASSWORD:password}),'postgres:17-alpine']);
for(let i=0;i<50;i++){try{docker(['exec',db,'pg_isready','-h','127.0.0.1','-U','postgres']);break;}catch{await new Promise(r=>setTimeout(r,200));}}
const bootstrap=`
create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
create role authenticator login noinherit password '${password}';grant anon,authenticated,service_role to authenticator;
create role supabase_auth_admin login password '${password}';alter role supabase_auth_admin set search_path=auth,public;create schema auth authorization supabase_auth_admin;
create role supabase_storage_admin login password '${password}' bypassrls;
create schema storage authorization supabase_storage_admin;create schema extensions;
grant usage on schema public,extensions to anon,authenticated,service_role;
grant usage on schema auth to anon,authenticated,service_role;
create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'$$;
alter function auth.uid() owner to supabase_auth_admin;alter function auth.role() owner to supabase_auth_admin;
grant execute on function auth.uid(),auth.role() to anon,authenticated,service_role;
grant all on schema public to supabase_auth_admin,supabase_storage_admin;
grant anon,authenticated,service_role to supabase_storage_admin;
alter default privileges in schema public grant all on tables to service_role;
`;
docker(['exec','-i',db,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],bootstrap);
const authenv=await env('auth',{GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:`postgres://supabase_auth_admin:${password}@db:5432/postgres`,GOTRUE_SITE_URL:'http://127.0.0.1:3000',API_EXTERNAL_URL:'http://127.0.0.1:54321',GOTRUE_JWT_SECRET:secret,GOTRUE_JWT_EXP:'3600',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_DISABLE_SIGNUP:'true',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'true'});
docker(['run','-d','--name',`${prefix}-auth`,'--network',prefix,'--label','job-agent.synthetic-test=true','-p','127.0.0.1:54324:9999','--env-file',authenv,'ghcr.io/supabase/gotrue:v2.197.0']);
const restenv=await env('rest',{PGRST_DB_URI:`postgres://authenticator:${password}@db:5432/postgres`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_DB_EXTRA_SEARCH_PATH:'public,extensions'});
docker(['run','-d','--name',`${prefix}-rest`,'--network',prefix,'--label','job-agent.synthetic-test=true','-p','127.0.0.1:54325:3000','--env-file',restenv,'ghcr.io/supabase/postgrest:v16.4']);
const storageenv=await env('storage',{ANON_KEY:anon,SERVICE_KEY:service,PGRST_JWT_SECRET:secret,AUTH_JWT_SECRET:secret,POSTGREST_URL:`http://${prefix}-rest:3000`,DATABASE_URL:`postgres://supabase_storage_admin:${password}@db:5432/postgres`,FILE_SIZE_LIMIT:'15728640',STORAGE_BACKEND:'file',FILE_STORAGE_BACKEND_PATH:'/var/lib/storage',TENANT_ID:'local',REGION:'local',GLOBAL_S3_BUCKET:'local',ENABLE_IMAGE_TRANSFORMATION:'false'});
docker(['run','-d','--name',`${prefix}-storage`,'--network',prefix,'--label','job-agent.synthetic-test=true','-p','127.0.0.1:54326:5000','--env-file',storageenv,'ghcr.io/supabase/storage-api:v1.79.36']);
async function healthy(url:string){for(let i=0;i<100;i++){try{const r=await fetch(url);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,300));}throw new Error('Local service health check failed. Inspect only the named synthetic test containers.');}
await healthy('http://127.0.0.1:54324/health');await healthy('http://127.0.0.1:54325/');await healthy('http://127.0.0.1:54326/status');
// Match platform grants. Storage's own migrations provide its production-compatible schema and RLS.
docker(['exec','-i',db,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],`grant usage on schema storage to anon,authenticated,service_role;grant select,insert,update,delete on all tables in schema storage to anon,authenticated,service_role;grant execute on all functions in schema storage to anon,authenticated,service_role;grant all on all tables in schema auth to service_role;`);
docker(['exec','-i',db,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],`create or replace function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;`);
const migration=await fs.readFile('supabase/migrations/20261008000000_private_workspace.sql','utf8');
docker(['exec','-i',db,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],migration+"\nnotify pgrst,'reload schema';");
const check=docker(['exec','-i',db,'psql','-U','postgres','-At'],`select relrowsecurity from pg_class where oid='storage.objects'::regclass;`);assert.equal(check,'t');
// Local reverse proxy keeps the SDK paths identical to a hosted Supabase URL. No keys are logged.
const gateway=http.createServer((req,res)=>{
 let target:URL;const route=req.url||'/';
 if(route.startsWith('/auth/v1/'))target=new URL(route.slice('/auth/v1'.length),'http://127.0.0.1:54324');
 else if(route.startsWith('/rest/v1/'))target=new URL(route.slice('/rest/v1'.length),'http://127.0.0.1:54325');
 else if(route.startsWith('/storage/v1/'))target=new URL(route.slice('/storage/v1'.length),'http://127.0.0.1:54326');
 else{res.writeHead(404);res.end();return;}
 const headers:http.OutgoingHttpHeaders={...req.headers,host:target.host};delete headers.origin;
 if(!headers.authorization && headers.apikey)headers.authorization=`Bearer ${headers.apikey}`;
 if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'http://127.0.0.1:3000','Access-Control-Allow-Headers':'content-type,x-upsert,cache-control','Access-Control-Allow-Methods':'PUT,GET,OPTIONS'});res.end();return;}
 const proxy=http.request(target,{method:req.method,headers},response=>{
   res.writeHead(response.statusCode||500,{...response.headers,'Access-Control-Allow-Origin':'http://127.0.0.1:3000','Access-Control-Allow-Headers':'content-type,x-upsert,cache-control','Access-Control-Allow-Methods':'PUT,GET,OPTIONS'});response.pipe(res);
 });
 proxy.on('error',()=>{if(!res.headersSent){res.writeHead(502);res.end();}else res.destroy();});
 req.pipe(proxy);
});
await new Promise<void>(resolve=>gateway.listen(54321,'127.0.0.1',resolve));
await fs.writeFile('/tmp/job-agent-local-status.json',JSON.stringify({API_URL:'http://127.0.0.1:54321',ANON_KEY:anon,SERVICE_ROLE_KEY:service}),{mode:0o600});
console.log('Local synthetic Supabase components ready. Credentials retained only in /tmp with restricted permissions.');
async function cleanup(){gateway.close();for(const c of containers){try{docker(['rm','-f','-v',c]);}catch{}}try{docker(['network','rm',prefix]);}catch{}await fs.rm(dir,{recursive:true,force:true});await fs.rm('/tmp/job-agent-local-status.json',{force:true});process.exit(0);}
process.once('SIGTERM',()=>void cleanup());process.once('SIGINT',()=>void cleanup());
