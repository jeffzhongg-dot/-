import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { boundedJson } from '../../../../lib/body';
import { checkOrigin, failure } from '../../../../lib/http';
import { serverClient } from '../../../../lib/supabase';
import { AppError } from '../../../../lib/security';
import { AuthDiagnosticError, diagnoseAuthExchange, issuerMismatch, logAuthDiagnostic } from '../../../../lib/auth-diagnostics';
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
    if (error) throw await diagnoseAuthExchange('recovery_exchange', error, 'access_token' in input.data && issuerMismatch(input.data.access_token, process.env.SUPABASE_URL));
    await checkRecoveryOwner(client);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof AuthDiagnosticError) logAuthDiagnostic(error);
    return failure(error);
  }
}
