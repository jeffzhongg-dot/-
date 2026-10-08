import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AppError } from './security';
export function checkOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  let matched = false;
  try { matched = Boolean(origin && new URL(origin).host === req.headers.get('host')); } catch { /* reject malformed origin */ }
  if (!matched) throw new AppError('拒绝跨站请求，请从本应用页面操作。', 403);
}
export function failure(error: unknown) {
  if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
  // Never disclose database details, URLs, uploaded text or provider bodies.
  return NextResponse.json({ error: '操作未完成，请检查服务配置，或重新加载后重试。' }, { status: 500 });
}
export function assertResult(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.message.includes('document_limit')) throw new AppError('最多保存 4 个文件，请先删除不需要的资料。', 409);
  if (error.message.includes('busy')) throw new AppError('资料正在处理，请稍后重试。', 409);
  if (error.message.includes('stale')) throw new AppError('资料已被修改，请重新加载页面后重试。', 409);
  if (error.message.includes('not_found')) throw new AppError('找不到文件。', 404);
  if (error.message.includes('forbidden')) throw new AppError('没有访问权限。', 403);
  throw new AppError('数据库或存储操作未完成，请检查初始化与权限配置后重试。', 503);
}
