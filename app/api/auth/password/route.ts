import { AuthDiagnosticError, authDiagnostic, logAuthDiagnostic } from '../../../../lib/auth-diagnostics';
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
    const input = z.object({ password: z.string().min(16).max(128).regex(/^[^\x00-\x1f\x7f]+$/) }).strict().safeParse(await boundedJson(req, 4096));
    if (!input.success) throw new AppError('请使用 16–128 位、无控制字符的独立强密码。');
    const client = await serverClient();
    const user = await checkRecoveryOwner(client);
    const { data, error } = await client.auth.updateUser({ password: input.data.password });
    if (error) throw authDiagnostic('password_update', error);
    if (data.user?.id !== user.id) throw new AuthDiagnosticError('PASSWORD_UPDATE_USER_MISMATCH', '密码更新返回的账号不匹配，未确认完成。', 403);
    await client.auth.signOut({ scope: 'local' });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { if (error instanceof AuthDiagnosticError) logAuthDiagnostic(error); return failure(error); }
}
