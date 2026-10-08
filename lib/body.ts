import type { NextRequest } from 'next/server';
/** Enforce a real stream limit, including chunked requests with no Content-Length. */
export async function boundedBody(req: NextRequest, max: number): Promise<Uint8Array> {
  if (Number(req.headers.get('content-length') || 0) > max) throw new Error('请求内容过大，请减少文件或文字大小。');
  if (!req.body) throw new Error('请求内容不能为空。');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > max) { await reader.cancel(); throw new Error('请求内容过大，请减少文件或文字大小。'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new Uint8Array(Buffer.concat(chunks, length));
}
export async function boundedJson(req: NextRequest, max: number) {
  return JSON.parse(new TextDecoder().decode(await boundedBody(req, max)));
}
