import { AppError } from './security';

export type AuthStage = 'recovery_exchange' | 'recovery_identity' | 'recovery_owner' | 'recovery_whitelist' | 'password_login' | 'password_update';
const codes = new Set(['unexpected_failure', 'validation_failed', 'bad_json', 'email_exists', 'phone_exists', 'bad_jwt', 'not_admin', 'no_authorization', 'user_not_found', 'session_not_found', 'session_expired', 'refresh_token_not_found', 'refresh_token_already_used', 'flow_state_not_found', 'flow_state_expired', 'signup_disabled', 'user_banned', 'provider_email_needs_verification', 'invite_not_found', 'bad_oauth_state', 'bad_oauth_callback', 'oauth_provider_not_supported', 'unexpected_audience', 'single_identity_not_deletable', 'email_conflict_identity_not_deletable', 'identity_already_exists', 'email_provider_disabled', 'phone_provider_disabled', 'too_many_enrolled_mfa_factors', 'mfa_factor_name_conflict', 'mfa_factor_not_found', 'mfa_ip_address_mismatch', 'mfa_challenge_expired', 'webauthn_challenge_expired', 'mfa_verification_failed', 'mfa_verification_rejected', 'insufficient_aal', 'captcha_failed', 'saml_provider_disabled', 'manual_linking_disabled', 'sms_send_failed', 'email_not_confirmed', 'phone_not_confirmed', 'reauth_nonce_missing', 'saml_relay_state_not_found', 'saml_relay_state_expired', 'saml_idp_not_found', 'saml_assertion_no_user_id', 'saml_assertion_no_email', 'user_already_exists', 'sso_provider_not_found', 'saml_metadata_fetch_failed', 'saml_idp_already_exists', 'sso_domain_already_exists', 'saml_entity_id_mismatch', 'conflict', 'provider_disabled', 'user_sso_managed', 'reauthentication_needed', 'same_password', 'reauthentication_not_valid', 'otp_expired', 'otp_disabled', 'identity_not_found', 'weak_password', 'over_request_rate_limit', 'over_email_send_rate_limit', 'over_sms_send_rate_limit', 'bad_code_verifier', 'anonymous_provider_disabled', 'hook_timeout', 'hook_timeout_after_retry', 'hook_payload_over_size_limit', 'hook_payload_invalid_content_type', 'request_timeout', 'mfa_phone_enroll_not_enabled', 'mfa_phone_verify_not_enabled', 'mfa_totp_enroll_not_enabled', 'mfa_totp_verify_not_enabled', 'mfa_webauthn_enroll_not_enabled', 'mfa_webauthn_verify_not_enabled', 'mfa_recovery_codes_enroll_not_enabled', 'mfa_recovery_codes_verify_not_enabled', 'mfa_recovery_codes_locked', 'mfa_recovery_codes_sole_factor', 'mfa_verified_factor_exists', 'invalid_credentials', 'email_address_not_authorized', 'email_address_invalid']);
const names = new Set(['AuthApiError','AuthUnknownError','AuthSessionMissingError','AuthInvalidTokenResponseError','AuthInvalidCredentialsError','AuthImplicitGrantRedirectError','AuthPKCEGrantCodeExchangeError','AuthPKCECodeVerifierMissingError','AuthRetryableFetchError','AuthRefreshDiscardedError','AuthWeakPasswordError','AuthInvalidJwtError','TypeError']);
export class AuthDiagnosticError extends AppError {
  constructor(public diagnostic: string, message: string, status: number) {
    super(`${message}（诊断编号：${diagnostic}）`, status);
  }
}

/** Untrusted claims are used only to explain a failure, NEVER to authorize. */
export function issuerMismatch(token: string, projectUrl?: string): boolean {
  if (!projectUrl) return false;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (typeof payload.iss !== 'string' || !payload.iss.startsWith('https://')) return false;
    return payload.iss.replace(/\/$/, '') !== `${new URL(projectUrl).origin}/auth/v1`;
  } catch { return false; }
}

/** Only enum codes and numeric status are retained, never provider bodies. */
export function authDiagnostic(stage: AuthStage, error: unknown, mismatch = false): AuthDiagnosticError {
  const value = error && typeof error === 'object' ? error as {code?: unknown; status?: unknown; name?: unknown} : {};
  const code = typeof value.code === 'string' && codes.has(value.code) ? value.code : 'unclassified';
  const status = typeof value.status === 'number' && Number.isInteger(value.status) && value.status >= 400 && value.status <= 599 ? value.status : null;
  let reason = 'AUTH_REJECTED';
  let message = '身份验证未通过，可能涉及会话或项目配置；不能据此判断密码错误。';
  let http = 401;
  if (mismatch) { reason='PROJECT_MISMATCH'; message='恢复会话的签发地址与网站配置的 Supabase 地址不一致，请核对部署配置。'; }
  else if (status===429 || code.startsWith('over_')) {reason='RATE_LIMIT'; message='身份服务暂时限流，请等待后再试。'; http=429;}
  else if (value.name==='AuthRetryableFetchError' || value.name==='TypeError' || status!==null && status>=500) {reason='SERVICE_UNAVAILABLE';message='身份服务暂时无法连接或返回服务错误，请稍后重试。';http=503;}
  else if(code==='otp_expired') {reason='LINK_INVALID';message='恢复链接已过期、已使用或无效，请申请新的密码恢复邮件。';}
  else if(['session_not_found','session_expired','refresh_token_not_found','refresh_token_already_used'].includes(code)) {reason='SESSION_INVALID';message='恢复会话已失效，请使用新的恢复邮件。';}
  else if(code==='bad_jwt') {reason='TOKEN_REJECTED';message='身份服务拒绝恢复凭据，请核对项目配置或申请新邮件。';}
  else if(code==='invalid_credentials') {reason='CREDENTIALS_REJECTED';message='邮箱或密码未通过身份服务验证，请核对所用项目与账号。';}
  else if(code==='email_not_confirmed') {reason='EMAIL_UNCONFIRMED';message='身份服务提示邮箱尚未确认，请在账号后台检查。';}
  else if(code==='user_banned') {reason='USER_BLOCKED';message='身份服务提示账号被停用，请在账号后台检查。';}
  else if(code==='weak_password' || code==='same_password') {reason='PASSWORD_POLICY';message='新密码不符合项目要求，或与原密码相同，请换一个独立强密码。';http=400;}
  else if(code==='reauthentication_needed') {reason='REAUTH_REQUIRED';message='身份服务要求重新验证账号，请使用新的恢复邮件。';http=401;}
  const detail = reason === 'AUTH_REJECTED'
    ? `_H${status ?? 0}_${typeof value.name === 'string' && names.has(value.name) ? value.name.toUpperCase() : 'UNKNOWN'}_${code.toUpperCase()}` : '';
  return new AuthDiagnosticError(`${stage.toUpperCase()}_${reason}${detail}`,message,http);
}

export function logAuthDiagnostic(error: AuthDiagnosticError) {
  // A single fixed-field line. No emails, UIDs, URLs, tokens, stacks or errors.
  console.warn(JSON.stringify({event:'auth_diagnostic',diagnostic:error.diagnostic,status:error.status}));
}

/** Read-only gateway check on ambiguous Auth rejection; never logs the response. */
export async function diagnoseAuthExchange(stage: AuthStage, error: unknown, mismatch=false, options: {url?: string; key?: string; fetcher?: typeof fetch} = {}): Promise<AuthDiagnosticError> {
  const initial = authDiagnostic(stage,error,mismatch);
  if (!initial.diagnostic.includes('_AUTH_REJECTED_') && !initial.diagnostic.endsWith('_TOKEN_REJECTED')) return initial;
  const url=options.url ?? process.env.SUPABASE_URL, key=options.key ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return initial;
  try {
    const settings = await (options.fetcher ?? fetch)(`${url.replace(/\/$/,'')}/auth/v1/settings`, {
      headers:{apikey:key},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000),
    });
    const status=settings.status;
    await settings.body?.cancel();
    if(status===401 || status===403) return new AuthDiagnosticError(`${stage.toUpperCase()}_PROJECT_KEY_REJECTED`,'身份服务拒绝网站的项目密钥，请核对 Vercel 的 Supabase URL 与 Publishable key 是否来自同一项目。',503);
    if(status>=500 || status===429) return authDiagnostic(stage,{status});
  } catch { /* Keep original failure; a probe failure does not prove a bad key. */ }
  return initial;
}
