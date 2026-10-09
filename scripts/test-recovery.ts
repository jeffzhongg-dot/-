/** Synthetic localhost-only Auth recovery integration. Never use real credentials. */
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
import { promises as fs } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const status=JSON.parse(await fs.readFile('/tmp/job-agent-local-status.json','utf8'));
const api=status.API_URL;
assert.equal(new URL(api).hostname,'127.0.0.1');
const admin=createClient(api,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const suffix=randomBytes(6).toString('hex');
const password=randomBytes(24).toString('hex'), newPassword=randomBytes(24).toString('hex');
const ownerEmail=`recovery-owner-${suffix}@example.test`,otherEmail=`recovery-other-${suffix}@example.test`;
async function verifyDefaultLink(actionLink: string) {
  const url=new URL(actionLink);
  assert.equal(url.hostname,'127.0.0.1');
  // Minimal test gateway mounts Auth under /auth/v1; GoTrue's local external
  // URL is its root. Hosted Supabase already generates the mounted path.
  if(url.pathname==='/verify') url.pathname='/auth/v1/verify';
  return fetch(url,{redirect:'manual'});
}
const ids:string[]=[];
let server:ReturnType<typeof spawn>|undefined;
try {
  for(const email of [ownerEmail,otherEmail]) {const r=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(r.error,null);ids.push(r.data.user!.id);}
  const applied=spawnSync('docker',['exec','-i','supabase_db_job-search-agent-private','psql','-U','postgres','-v','ON_ERROR_STOP=1'],{input:`insert into private.app_owner(singleton,user_id) values(true,'${ids[0]}') on conflict(singleton) do update set user_id=excluded.user_id;`,encoding:'utf8'});
  assert.equal(applied.status,0);
  const env={...process.env,SUPABASE_URL:api,SUPABASE_PUBLISHABLE_KEY:status.ANON_KEY,SUPABASE_OWNER_USER_ID:ids[0],DEPLOYMENT_LOCKED:'true',COOKIE_SECURE:'false'};
  const build=spawn('npm',['run','build'],{env,stdio:'inherit'});
  assert.equal(await new Promise(resolve=>build.on('exit',resolve)),0);
  const base='http://127.0.0.1:3100';
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3100'],{env,stdio:'ignore'});
  let ready=false;for(let i=0;i<80;i++){try{if((await fetch(`${base}/login`)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready);
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try {
    const context=await browser.newContext();
    const post=(path:string,data:object,origin=base)=>context.request.post(base+path,{headers:{origin},data});
    assert.equal((await post('/api/auth/password',{password:newPassword})).status(),401);
    assert.equal((await post('/api/auth/recovery',{token_hash:'a'.repeat(64)},'https://evil.example')).status(),403);
    assert.equal((await post('/api/auth/recovery',{token_hash:'a'.repeat(64),type:'signup'})).status(),400);
    assert.equal((await post('/api/auth/recovery',{token_hash:'a'.repeat(64)})).status(),401);
    const otherLink=await admin.auth.admin.generateLink({type:'recovery',email:otherEmail});assert.equal(otherLink.error,null);
    assert.equal((await post('/api/auth/recovery',{token_hash:otherLink.data.properties.hashed_token})).status(),403);
    assert.equal((await post('/api/auth/password',{password:newPassword})).status(),401);
    const link=await admin.auth.admin.generateLink({type:'recovery',email:ownerEmail});assert.equal(link.error,null);
    const hash=link.data.properties.hashed_token;
    const page=await context.newPage();
    await page.goto(`${base}/reset-password#token_hash=${hash}&type=recovery`);
    await page.getByRole('button',{name:'验证本人恢复链接'}).click();
    await page.getByLabel('新密码（16–128 位）',{exact:true}).waitFor();
    assert.equal(page.url(),`${base}/reset-password`);
    assert.equal((await context.request.get(base+'/api/profile')).status(),503,'Data remains locked after recovery');
    await page.getByLabel('新密码（16–128 位）',{exact:true}).fill(newPassword);
    await page.getByLabel('再次输入新密码').fill('different-password-123');
    await page.getByRole('button',{name:'保存新密码'}).click();
    await page.getByRole('alert').filter({hasText:'两次输入的密码不一致'}).waitFor();
    await page.getByLabel('再次输入新密码').fill(newPassword);
    await page.getByRole('button',{name:'保存新密码'}).click();
    await page.getByRole('status').filter({hasText:'密码更新成功'}).waitFor();
    assert.equal((await post('/api/auth/recovery',{token_hash:hash})).status(),401,'Consumed recovery token rejected');
    const owner=createClient(api,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const login=await owner.auth.signInWithPassword({email:ownerEmail,password:newPassword});assert.equal(login.error,null);assert.equal(login.data.user!.id,ids[0]);assert.equal((await owner.rpc('is_app_owner')).data,true);
    assert.ok((await owner.auth.signInWithPassword({email:ownerEmail,password})).error);
    const other=createClient(api,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    assert.equal((await other.auth.signInWithPassword({email:otherEmail,password})).error,null);
    assert.ok((await other.auth.signInWithPassword({email:otherEmail,password:newPassword})).error);
    assert.equal((await post('/api/auth/login',{email:ownerEmail,password:newPassword})).status(),200);
    assert.equal((await context.request.get(base+'/api/profile')).status(),503);
    await page.goto(base+'/login#error=access_denied&error_code=otp_expired');
    await page.getByRole('alert').filter({hasText:'恢复邮件的链接已失效'}).waitFor();
    assert.equal(page.url(),base+'/login');
    // Follow the official default ConfirmationURL verification, without sending mail.
    const defaultLink=await admin.auth.admin.generateLink({type:'recovery',email:ownerEmail});assert.equal(defaultLink.error,null);
    const verified=await verifyDefaultLink(defaultLink.data.properties.action_link);
    assert.ok([302,303].includes(verified.status));
    const destination=new URL(verified.headers.get('location')!);
    assert.equal(new URLSearchParams(destination.hash.slice(1)).get('type'),'recovery');
    await page.goto(base+'/'+destination.hash);
    await page.getByRole('heading',{name:'设置新密码'}).waitFor();
    await page.getByRole('button',{name:'验证本人恢复链接'}).click();
    await page.getByLabel('新密码（16–128 位）',{exact:true}).waitFor();
    assert.equal(page.url(),base+'/reset-password');
    assert.equal((await context.request.get(base+'/api/profile')).status(),503);
    const nextPassword=randomBytes(24).toString('hex');
    await page.getByLabel('新密码（16–128 位）',{exact:true}).fill(nextPassword);
    await page.getByLabel('再次输入新密码').fill(nextPassword);
    await page.getByRole('button',{name:'保存新密码'}).click();
    await page.getByRole('status').filter({hasText:'密码更新成功'}).waitFor();
    const defaultLogin=await owner.auth.signInWithPassword({email:ownerEmail,password:nextPassword});
    assert.equal(defaultLogin.error,null);assert.equal(defaultLogin.data.user!.id,ids[0]);
    assert.equal((await owner.rpc('is_app_owner')).data,true);
    const outsiderLink=await admin.auth.admin.generateLink({type:'recovery',email:otherEmail});assert.equal(outsiderLink.error,null);
    const outsiderVerify=await verifyDefaultLink(outsiderLink.data.properties.action_link);
    const outsiderDestination=new URL(outsiderVerify.headers.get('location')!);
    await page.goto(base+'/login'+outsiderDestination.hash);
    await page.getByRole('button',{name:'验证本人恢复链接'}).click();
    await page.getByRole('alert').filter({hasText:'没有密码恢复权限'}).waitFor();
    assert.equal((await post('/api/auth/password',{password:nextPassword})).status(),401);
    assert.equal((await other.auth.signInWithPassword({email:otherEmail,password})).error,null);
    assert.equal((await post('/api/auth/recovery',{access_token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.fake',refresh_token:'synthetic_refresh_token_123456789'})).status(),401);
    await context.close();
    console.log('PASS: real local default ConfirmationURL recovery and custom OTP, owner-only update, UID/allowlist preserved, old password/token rejected, CSRF and anonymous denial, locked data, browser form and expired-link handling');
  } finally {await browser.close();}
} finally {
  server?.kill('SIGTERM');
  for(const id of ids) await admin.auth.admin.deleteUser(id);
}
