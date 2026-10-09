import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authDiagnostic, issuerMismatch, logAuthDiagnostic } from '../lib/auth-diagnostics';
test('diagnostics distinguish failures without propagating provider secrets',()=>{
  const secret='PRIVATE_TOKEN_PASSWORD_EMAIL_URL';
  const cases:[unknown,string,number][]=[
    [{code:'otp_expired',message:secret},'LINK_INVALID',401],
    [{code:'invalid_credentials'},'CREDENTIALS_REJECTED',401],
    [{status:429},'RATE_LIMIT',429],
    [{name:'AuthRetryableFetchError'},'SERVICE_UNAVAILABLE',503],
    [{code:'refresh_token_not_found'},'SESSION_INVALID',401],
    [{code:'bad_jwt'},'TOKEN_REJECTED',401],
    [{code:'weak_password'},'PASSWORD_POLICY',400],
    [{code:secret,message:secret,name:secret,status:401},'AUTH_REJECTED',401],
  ];
  for(const [provider,reason,status] of cases){
    const result=authDiagnostic('recovery_exchange',provider);
    assert.ok(result.diagnostic.includes(reason));assert.equal(result.status,status);
    assert.ok(!result.message.includes(secret));
  }
  assert.ok(authDiagnostic('recovery_exchange',{code:'otp_expired'},true).diagnostic.endsWith('PROJECT_MISMATCH'));
});
test('issuer parsing is diagnostic only and handles malformed and legacy tokens',()=>{
  const jwt=(iss:string)=>`header.${Buffer.from(JSON.stringify({iss})).toString('base64url')}.signature`;
  assert.equal(issuerMismatch(jwt('https://one.supabase.co/auth/v1'),'https://two.supabase.co'),true);
  assert.equal(issuerMismatch(jwt('https://one.supabase.co/auth/v1'),'https://one.supabase.co/'),false);
  assert.equal(issuerMismatch(jwt('supabase'),'https://one.supabase.co'),false);
  assert.equal(issuerMismatch('bad','https://one.supabase.co'),false);
});
test('diagnostic log contains only fixed code and status',()=>{
  const original=console.warn;const lines:string[]=[];
  try{console.warn=(line:string)=>{lines.push(line);};logAuthDiagnostic(authDiagnostic('recovery_exchange',{message:'secret',code:'secret',status:401}));}
  finally{console.warn=original;}
  assert.deepEqual(JSON.parse(lines[0]),{event:'auth_diagnostic',diagnostic:'RECOVERY_EXCHANGE_AUTH_REJECTED_H401_UNKNOWN_UNCLASSIFIED',status:401});
});

test('read-only settings probe distinguishes rejected project key without changing auth',async()=>{
  const {diagnoseAuthExchange}=await import('../lib/auth-diagnostics');
  let calls=0;
  const options={url:'https://example.supabase.co',key:'synthetic-key',fetcher:(async (url, init)=>{
    calls++;assert.equal(url,'https://example.supabase.co/auth/v1/settings');assert.equal(init?.redirect,'error');assert.equal(init?.body,undefined);
    return new Response('private provider body',{status:401});
  }) as typeof fetch};
  const result=await diagnoseAuthExchange('recovery_exchange',{status:401},false,options);
  assert.ok(result.diagnostic.endsWith('PROJECT_KEY_REJECTED'));assert.ok(!result.message.includes('private provider body'));
  await diagnoseAuthExchange('recovery_exchange',{code:'otp_expired'},false,options);assert.equal(calls,1);
  const valid=await diagnoseAuthExchange('recovery_exchange',{status:401},false,{...options,fetcher:(async()=>new Response('{}',{status:200})) as typeof fetch});
  assert.ok(valid.diagnostic.includes('AUTH_REJECTED'));
});

 test('unmapped official errors retain safe SDK name, status and code only',()=>{
  const result=authDiagnostic('recovery_exchange',{name:'AuthApiError',status:403,code:'no_authorization',message:'PRIVATE',details:'TOKEN'});
  assert.equal(result.diagnostic,'RECOVERY_EXCHANGE_AUTH_REJECTED_H403_AUTHAPIERROR_NO_AUTHORIZATION');
  assert.ok(!result.message.includes('PRIVATE'));
  assert.ok(!result.message.includes('TOKEN'));
});
