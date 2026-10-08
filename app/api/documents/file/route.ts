import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '../../../../lib/supabase';
import { findDocument } from '../../../../lib/repository';
import { AppError, BUCKET, uuid } from '../../../../lib/security';
import { failure, assertResult } from '../../../../lib/http';
export async function GET(req:NextRequest) {
  try {
    const {client,user}=await requireOwner();const id=req.nextUrl.searchParams.get('id')||'';
    if(!uuid.test(id)) throw new AppError('文件编号无效。');
    const row=await findDocument(client,user.id,id);
    if(row.status==='deleting') throw new AppError('文件正在删除。',404);
    const result=await client.storage.from(BUCKET).createSignedUrl(row.original_path,60,{download:row.metadata.name});assertResult(result.error);
    if(!result.data) throw new AppError('无法下载原件。',404);
    return NextResponse.json({url:result.data.signedUrl});
  }catch(error){return failure(error);}
}
