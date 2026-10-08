export class AppError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const BUCKET = 'career-private';
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function configured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && uuid.test(process.env.SUPABASE_OWNER_USER_ID || ''));
}
export function ownerMatches(userId: string, ownerId = process.env.SUPABASE_OWNER_USER_ID) { return Boolean(ownerId && uuid.test(ownerId) && userId === ownerId); }
export function storagePath(userId: string, documentId: string, asset: string) {
  if (!uuid.test(userId) || !uuid.test(documentId) || !/^(source\.(pdf|pptx)|p\d+(?:-\d+)?\.(png|jpg))$/.test(asset)) throw new AppError('文件路径无效。');
  return `${userId}/${documentId}/${asset}`;
}
export function validateUpload(input: { name: string; size: number; kind: string }) {
  if (!input.name || input.name.length > 150 || /[\x00-\x1f/\\]/.test(input.name)) throw new AppError('文件名不安全或过长。');
  if (!Number.isInteger(input.size) || input.size < 1 || input.size > 15 * 1024 * 1024) throw new AppError('文件不能为空，单个文件最大 15 MB。');
  if (!['resume', 'portfolio'].includes(input.kind)) throw new AppError('资料类型无效。');
  const ext = input.name.split('.').pop()?.toLowerCase();
  if (!['pdf', 'pptx'].includes(ext || '') || input.kind === 'resume' && ext !== 'pdf') throw new AppError('简历仅支持 PDF；作品集支持 PDF / PPTX。');
  return { format: ext === 'pdf' ? 'PDF' as const : 'PPTX' as const, extension: ext!, contentType: ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
}
