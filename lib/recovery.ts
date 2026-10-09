import type { SupabaseClient } from '@supabase/supabase-js';
import { ownerMatches } from './security';

import { AuthDiagnosticError, authDiagnostic } from './auth-diagnostics';

// Auth recovery must remain usable while career data is deployment-locked.
export async function checkRecoveryOwner(client: SupabaseClient, ownerId?: string) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw authDiagnostic('recovery_identity', error);
  const { data: allowed, error: policyError } = await client.rpc('is_app_owner');
  if (!ownerMatches(data.user.id, ownerId) || policyError || allowed !== true) {
    await client.auth.signOut({ scope: 'local' });
    if (!ownerMatches(data.user.id, ownerId)) throw new AuthDiagnosticError('RECOVERY_OWNER_MISMATCH', '该账号没有密码恢复权限，账号与网站配置的本人 UID 不一致。', 403);
    if (policyError) throw new AuthDiagnosticError('RECOVERY_WHITELIST_UNAVAILABLE', '没有密码恢复权限：数据库白名单检查未完成，请核对初始化与服务配置。', 503);
    throw new AuthDiagnosticError('RECOVERY_WHITELIST_DENIED', '该账号没有密码恢复权限，数据库本人白名单未授权。', 403);
  }
  return data.user;
}
