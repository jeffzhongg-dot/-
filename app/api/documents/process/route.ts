import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwner } from '../../../../lib/supabase';
import { checkOrigin, failure, assertResult } from '../../../../lib/http';
import { boundedJson } from '../../../../lib/body';
import { AppError, BUCKET, storagePath } from '../../../../lib/security';
import { claim, load } from '../../../../lib/repository';
import { parseFile } from '../../../../lib/parse';
import { extractProfile } from '../../../../lib/profile';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req); const {client,user}=await requireOwner();
    const input=z.object({id:z.uuid()}).safeParse(await boundedJson(req,4096));
    if (!input.success) throw new AppError('文件编号无效。');
    const row=await claim(client,input.data.id,'parse');
    try {
      if (row.status === 'ready') {
        const released=await client.rpc('finish_document',{document_id:row.id,token:row.lease_token,document_metadata:row.metadata,next_cursor:row.next_page,document_status:'ready'});assertResult(released.error);
        return NextResponse.json({state:await load(client,user.id),done:true});
      }
      const source=await client.storage.from(BUCKET).download(row.original_path);
      if (source.error || !source.data) throw new AppError('原件尚未上传或无法读取，请重新上传或删除该记录。',409);
      if (source.data.size !== row.expected_size) throw new AppError('原件大小与上传声明不一致，请删除后重新上传。');
      const buffer=Buffer.from(await source.data.arrayBuffer());
      const result=await parseFile(row.metadata.name,buffer,{start:row.next_page,count:3});
      if (result.format !== row.metadata.format || !result.pages.length) throw new AppError('文件格式或解析页码无效。');
      const assets=Object.entries(result.assets);
      let total=0;
      for(const [asset,bytes] of assets) { total+=bytes.length; if(bytes.length>4*1024*1024 || total>48*1024*1024) throw new AppError('页面图片过大，请压缩或拆分作品集。'); }
      // Sequential bounded uploads avoid large CPU/memory spikes on serverless instances.
      for(const [asset,bytes] of assets) {
        const stored=await client.storage.from(BUCKET).upload(storagePath(user.id,row.id,asset),bytes,{upsert:true,contentType:asset.endsWith('png')?'image/png':'image/jpeg',cacheControl:'0'});
        assertResult(stored.error);
      }
      const metadata={...row.metadata,format:result.format,pages:[...row.metadata.pages,...result.pages],warnings:result.warnings,totalPages:result.totalPages,error:undefined};
      const next=result.pages.at(-1)!.number+1; const done=next>result.totalPages;
      const candidates=extractProfile({...metadata,pages:result.pages});
      const finished=await client.rpc('finish_document',{document_id:row.id,token:row.lease_token,document_metadata:metadata,next_cursor:next,document_status:done?'ready':'processing',candidates});assertResult(finished.error);
      return NextResponse.json({state:await load(client,user.id),done,parsed:next-1,total:result.totalPages});
    } catch(error) {
      const message=error instanceof AppError?error.message:error instanceof Error && /PDF|PPTX|文件|页|XML/.test(error.message)?error.message.slice(0,180):'解析未完成，请重试或检查 Storage 与文件格式。';
      await client.rpc('finish_document',{document_id:row.id,token:row.lease_token,document_metadata:{...row.metadata,error:message},next_cursor:row.next_page,document_status:'error'});
      throw new AppError(message,error instanceof AppError?error.status:400);
    }
  } catch(error) {return failure(error);}
}
