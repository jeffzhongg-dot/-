import { NextRequest, NextResponse } from 'next/server';
import { checkOrigin, failure } from '../../../../lib/http';
import { AppError } from '../../../../lib/security';
import { serverClient } from '../../../../lib/supabase';
export async function POST(req: NextRequest) {
  try { checkOrigin(req); const client = await serverClient(); const {error}=await client.auth.signOut({ scope: 'local' }); if(error) throw new AppError('退出登录未完成，请重试。',503); return NextResponse.json({ ok: true }); }
  catch (error) { return failure(error); }
}
