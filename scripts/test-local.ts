/** Local-only verification. NEVER seeds a hosted project or uses a real person's documents. */
import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { makePdf } from '../tests/fixtures';
const statusPath=process.env.LOCAL_SUPABASE_STATUS || '/tmp/job-agent-local-status.json';
const status=JSON.parse(await fs.readFile(statusPath,'utf8'));
const api=status.API_URL||status.api_url;const anon=status.ANON_KEY||status.anon_key;const adminKey=status.SERVICE_ROLE_KEY||status.service_role_key;
if(!api||!anon||!adminKey||!['127.0.0.1','localhost'].includes(new URL(api).hostname)) throw new Error('Only a local Supabase test stack is permitted.');
const admin=createClient(api,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
const suffix=randomBytes(5).toString('hex');const password=randomBytes(24).toString('hex');
const ownerEmail=`owner-${suffix}@example.test`,otherEmail=`other-${suffix}@example.test`;
async function create(email:string){const result=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(result.error,null);return result.data.user!.id;}
const owner=await create(ownerEmail),other=await create(otherEmail);
const sql=`insert into private.app_owner(singleton,user_id) values(true,'${owner}') on conflict(singleton) do update set user_id=excluded.user_id;`;
const applied=spawnSync('docker',['exec','-i','supabase_db_job-search-agent-private','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
if(applied.status!==0) throw new Error('Local owner SQL setup failed.');
const localEnv={...process.env,SUPABASE_URL:api,SUPABASE_PUBLISHABLE_KEY:anon,SUPABASE_OWNER_USER_ID:owner,DEPLOYMENT_LOCKED:'false',COOKIE_SECURE:'false',TEST_OWNER_EMAIL:ownerEmail,TEST_OWNER_PASSWORD:password,TEST_OTHER_EMAIL:otherEmail,TEST_OTHER_PASSWORD:password,TEST_BASE_URL:'http://127.0.0.1:3000'};
const clients=[createClient(api,anon,{auth:{persistSession:false}}),createClient(api,anon,{auth:{persistSession:false}})];
assert.equal((await clients[0].auth.signInWithPassword({email:ownerEmail,password})).error,null);
assert.equal((await clients[1].auth.signInWithPassword({email:otherEmail,password})).error,null);
const [own,outsider]=clients;
const stranger=createClient(api,anon,{auth:{persistSession:false}});
const signup=await stranger.auth.signUp({email:`blocked-${suffix}@example.test`,password});assert.ok(signup.error,'Public signup must be disabled');
assert.equal((await own.rpc('is_app_owner')).data,true);assert.equal((await outsider.rpc('is_app_owner')).data,false);
assert.ok((await stranger.from('career_profiles').select('*')).error);
assert.deepEqual((await outsider.from('career_profiles').select('*')).data,[]);
assert.ok((await outsider.from('career_profiles').insert({user_id:other,profile:{}})).error);
assert.ok((await own.from('career_profiles').insert({user_id:other,profile:{}})).error);
const id=crypto.randomUUID();const source=`${owner}/${id}/source.pdf`;const bytes=await makePdf();
assert.equal((await own.rpc('reserve_document',{document_id:id,document_metadata:{id,name:'security.pdf',kind:'resume',format:'PDF',pages:[],warnings:[],createdAt:new Date().toISOString()},file_size:bytes.length})).error,null);
assert.equal((await own.storage.from('career-private').upload(source,bytes,{contentType:'application/pdf'})).error,null);
assert.ok((await stranger.storage.from('career-private').download(source)).error);
assert.ok((await outsider.storage.from('career-private').download(source)).error);
assert.ok((await outsider.storage.from('career-private').createSignedUrl(source,60)).error);
assert.ok((await own.storage.from('career-private').upload(`${other}/${id}/source.pdf`,bytes,{contentType:'application/pdf'})).error);
assert.equal((await own.storage.from('career-private').download(source)).error,null);
assert.ok((await own.rpc('save_career_profile',{input_profile:{},expected_revision:99})).error);
const first=await own.rpc('claim_document',{document_id:id,operation:'parse'}).single<{metadata:unknown;lease_token:string}>();assert.equal(first.error,null);
assert.ok((await own.rpc('claim_document',{document_id:id,operation:'parse'})).error,'Database lease must prevent concurrent parsing');
assert.ok((await own.rpc('finish_document',{document_id:id,token:crypto.randomUUID(),document_metadata:first.data.metadata,next_cursor:1,document_status:'processing'})).error,'Wrong lease must fail');
assert.equal((await own.rpc('finish_document',{document_id:id,token:first.data.lease_token,document_metadata:first.data.metadata,next_cursor:1,document_status:'error'})).error,null);
const deletion=await own.rpc('claim_document',{document_id:id,operation:'delete'}).single<{lease_token:string}>();assert.equal(deletion.error,null);
assert.ok((await own.storage.from('career-private').upload(`${owner}/${id}/p1.png`,bytes,{contentType:'image/png'})).error,'Tombstone must reject stale parser writes');
assert.equal((await own.storage.from('career-private').remove([source])).error,null);
assert.equal((await own.rpc('complete_document_delete',{document_id:id,token:deletion.data.lease_token})).error,null);
console.log('PASS: local Auth signup disabled, owner allowlist, database/storage RLS, IDOR, revision and lease checks');
const build=spawn('npm',['run','build'],{env:localEnv,stdio:'inherit'});
assert.equal(await new Promise<number|null>(resolve=>build.on('exit',resolve)),0,'Local target build must pass');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3000'],{env:localEnv,stdio:['ignore','ignore','ignore']});
try{
 let ready=false;for(let i=0;i<50;i++){try{const r=await fetch('http://127.0.0.1:3000/login');if(r.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
 assert.ok(ready,'Local private test server must start');
 const browser=spawn('npm',['run','test:e2e'],{env:localEnv,stdio:'inherit'});
 const exit=await new Promise<number|null>(resolve=>browser.on('exit',resolve));assert.equal(exit,0,'Browser verification must pass');
}finally{
 server.kill('SIGTERM');
 await new Promise<void>(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',()=>resolve());setTimeout(resolve,5000).unref();});
 await admin.auth.admin.deleteUser(owner);await admin.auth.admin.deleteUser(other);
}
