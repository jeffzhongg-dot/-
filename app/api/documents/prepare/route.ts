import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireOwner } from '../../../../lib/supabase';
import { checkOrigin, failure, assertResult } from '../../../../lib/http';
import { boundedJson } from '../../../../lib/body';
import { validateUpload, storagePath, BUCKET, AppError } from '../../../../lib/security';
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req); const { client,user } = await requireOwner();
    const input = z.object({ name:z.string(),size:z.number(),kind:z.enum(['resume','portfolio']) }).safeParse(await boundedJson(req,4096));
    if (!input.success) throw new AppError('上传信息无效。');
    const info=validateUpload(input.data); const id=randomUUID();
    const document={id,name:input.data.name,kind:input.data.kind,format:info.format,pages:[],warnings:[],createdAt:new Date().toISOString()};
    const reserved=await client.rpc('reserve_document',{document_id:id,document_metadata:document,file_size:input.data.size}); assertResult(reserved.error);
    const path=storagePath(user.id,id,`source.${info.extension}`);
    const signed=await client.storage.from(BUCKET).createSignedUploadUrl(path,{upsert:false});
    if (signed.error || !signed.data) {
      await client.from('career_documents').delete().eq('id',id).eq('user_id',user.id);
      throw new AppError('无法准备私有上传，请检查 Storage 配置。',503);
    }
    return NextResponse.json({ id,uploadUrl:signed.data.signedUrl,contentType:info.contentType });
  } catch(error) { return failure(error); }
}
