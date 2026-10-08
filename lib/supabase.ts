import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { AppError, configured, ownerMatches } from './security';
export async function serverClient() {
  if (!configured()) throw new AppError('尚未配置 Supabase；为保护私人资料，当前拒绝登录和数据访问。', 503);
  const url = new URL(process.env.SUPABASE_URL!);
  const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(process.env.VERCEL !== '1' && local)) throw new AppError('Supabase 必须使用 HTTPS 地址。', 503);
  const jar = await cookies();
  return createServerClient(url.href, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: { httpOnly: true, sameSite: 'strict', path: '/', secure: process.env.VERCEL === '1' || process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production' },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: entries => {
        try { for (const { name, value, options } of entries) jar.set(name, value, { ...options, httpOnly: true, sameSite: 'strict' }); }
        catch { /* Server components cannot refresh cookies; the next authenticated API request will refresh. */ }
      },
    },
  });
}
export async function requireOwner() {
  if (process.env.DEPLOYMENT_LOCKED !== 'false') throw new AppError('部署尚未通过权限验证，资料功能暂时锁定。',503);
  const client = await serverClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new AppError('请先登录。', 401);
  if (!ownerMatches(data.user.id)) throw new AppError('此账号没有使用权限。', 403);
  const { data: allowed, error: policyError } = await client.rpc('is_app_owner');
  if (policyError) throw new AppError('数据库尚未完成初始化或权限配置，请按部署说明检查。', 503);
  if (allowed !== true) throw new AppError('数据库账号授权不匹配，已拒绝访问。', 403);
  return { client, user: data.user };
}
