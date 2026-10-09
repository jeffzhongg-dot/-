import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { boundedJson } from '../../../../lib/body';
import { checkOrigin, failure } from '../../../../lib/http';
import { serverClient } from '../../../../lib/supabase';
import { AppError } from '../../../../lib/security';
import { checkRecoveryOwner } from '../../../../lib/recovery';

export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const input = z.union([
      z.object({ token_hash: z.string().regex(/^[a-fA-F0-9]{56,64}$/) }).strict(),
      z.object({ access_token: z.string().max(8192).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/), refresh_token: z.string().regex(/^[A-Za-z0-9_-]{8,512}$/) }).strict(),
    ]).safeParse(await boundedJson(req, 16384));
    if (!input.success) throw new AppError('恢复链接格式无效，请申请新的密码恢复邮件。');
    const client = await serverClient();
    // Never accept caller-controlled OTP types, redirect targets or admin keys.
    const { error } = 'token_hash' in input.data
      ? await client.auth.verifyOtp({ token_hash: input.data.token_hash, type: 'recovery' })
      : await client.auth.setSession(input.data);
    if (error) throw new AppError('恢复链接已过期、已使用或无效，请申请新的密码恢复邮件。', 401);
    await checkRecoveryOwner(client);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
