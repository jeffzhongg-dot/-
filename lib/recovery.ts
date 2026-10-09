import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, ownerMatches } from './security';

// Auth recovery must remain usable while career data is deployment-locked.
export async function checkRecoveryOwner(client: SupabaseClient, ownerId?: string) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new AppError('恢复链接已失效，请申请新的密码恢复邮件。', 401);
  const { data: allowed, error: policyError } = await client.rpc('is_app_owner');
  if (!ownerMatches(data.user.id, ownerId) || policyError || allowed !== true) {
    await client.auth.signOut({ scope: 'local' });
    throw new AppError('该账号没有密码恢复权限，请核对本人账号与白名单。', 403);
  }
  return data.user;
}
