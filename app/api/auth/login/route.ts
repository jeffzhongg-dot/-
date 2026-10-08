import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { boundedJson } from '../../../../lib/body';
import { checkOrigin, failure } from '../../../../lib/http';
import { serverClient } from '../../../../lib/supabase';
import { AppError, ownerMatches } from '../../../../lib/security';
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const client = await serverClient();
    const input = z.object({ email: z.email().max(254), password: z.string().min(1).max(1024) }).safeParse(await boundedJson(req, 4096));
    if (!input.success) throw new AppError('请输入有效的邮箱与密码。');
    const { data, error } = await client.auth.signInWithPassword(input.data);
    if (error || !data.user) throw new AppError('登录失败，请检查邮箱、密码或稍后重试。', 401);
    const { data: allowed, error: policyError } = await client.rpc('is_app_owner');
    if (!ownerMatches(data.user.id) || policyError || allowed !== true) {
      await client.auth.signOut({ scope: 'local' });
      throw new AppError('该账号没有访问权限或初始化尚未完成。', 403);
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
