import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkRecoveryOwner } from '../lib/recovery';
const owner='11111111-1111-4111-8111-111111111111';
function mock(id: string|null, allowed: boolean|null, policyError: object|null = null) {
  let signedOut = false;
  const client = {auth: {getUser: async()=>({data:{user:id?{id}:null}, error:id?null:{message:'expired'}}), signOut:async()=>{signedOut=true;}}, rpc:async()=>({data:allowed,error:policyError})} as unknown as SupabaseClient;
  return {client, signedOut:()=>signedOut};
}
test('password recovery requires a verified user and exact owner UID',async()=>{
  await assert.rejects(checkRecoveryOwner(mock(null,true).client,owner),/身份验证未通过/);
  const other=mock('22222222-2222-4222-8222-222222222222',true);
  await assert.rejects(checkRecoveryOwner(other.client,owner),/没有密码恢复权限/);
  assert.equal(other.signedOut(),true);
});
test('password recovery fails closed on missing whitelist or database error',async()=>{
  for(const m of [mock(owner,false),mock(owner,null,{message:'rpc failure'})]) {
    await assert.rejects(checkRecoveryOwner(m.client,owner),/没有密码恢复权限/);
    assert.equal(m.signedOut(),true);
  }
  assert.equal((await checkRecoveryOwner(mock(owner,true).client,owner)).id,owner);
});

test('default recovery fragments are accepted only as recovery and errors fail closed', async()=>{
  const { recoveryCredentials } = await import('../lib/recovery-link');
  const access='eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';
  const refresh='synthetic_refresh_token_123456789';
  const fragment=`#access_token=${access}&refresh_token=${refresh}&type=recovery`;
  assert.deepEqual(recoveryCredentials(fragment),{access_token:access,refresh_token:refresh});
  assert.equal(recoveryCredentials(fragment.replace('recovery','signup')),null);
  assert.equal(recoveryCredentials(fragment+'&error=access_denied'),null);
  assert.equal(recoveryCredentials('#type=recovery&access_token='+access),null);
  assert.equal(recoveryCredentials('#type=recovery&token_hash=bad'),null);
  assert.deepEqual(recoveryCredentials('#type=recovery&token_hash='+'a'.repeat(56)),{token_hash:'a'.repeat(56)});
});
