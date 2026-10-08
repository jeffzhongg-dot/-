import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwner } from '../../../lib/supabase';
import { checkOrigin, failure, assertResult } from '../../../lib/http';
import { load } from '../../../lib/repository';
import { boundedJson } from '../../../lib/body';
import { profileSchema } from '../../../lib/validation';
import { Category } from '../../../lib/types';
import { AppError } from '../../../lib/security';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET() {
  try {const {client,user}=await requireOwner();return NextResponse.json({state:await load(client,user.id),aiConfigured:Boolean(process.env.AI_API_KEY)});}
  catch(error){return failure(error);}
}
export async function PUT(req:NextRequest) {
  try {
    checkOrigin(req);const {client,user}=await requireOwner();
    const input=z.object({profile:profileSchema,revision:z.number().int().nonnegative()}).safeParse(await boundedJson(req,1024*1024));
    if(!input.success) throw new AppError('档案格式不正确，请检查文字与条目内容。');
    const state=await load(client,user.id);
    for(const key of ['work','projects','skills','industries'] as Category[]) for(const item of input.data.profile[key]) {
      if(item.source) {const doc=state.documents.find(d=>d.id===item.source && d.status!=='deleting');if(!doc?.pages.some(p=>p.number===item.page)) throw new AppError('档案来源页码无效，请重新加载。');}
      else if(item.page!==0) throw new AppError('手动条目不能引用不存在的来源。');
      const original=state.profile[key].find(e=>e.id===item.id);
      if(!original || original.text!==item.text || original.source!==item.source || original.page!==item.page) item.origin='用户填写';
    }
    const result=await client.rpc('save_career_profile',{input_profile:input.data.profile,expected_revision:input.data.revision});assertResult(result.error);
    return NextResponse.json({state:await load(client,user.id)});
  }catch(error){return failure(error);}
}
