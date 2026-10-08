import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwner } from '../../../lib/supabase';
import { checkOrigin, failure } from '../../../lib/http';
import { boundedJson } from '../../../lib/body';
import { deleteDocument, load } from '../../../lib/repository';
import { AppError } from '../../../lib/security';
export const maxDuration=60;
export async function DELETE(req: NextRequest) {
  try {
    checkOrigin(req);const {client,user}=await requireOwner();
    const input=z.object({id:z.uuid()}).safeParse(await boundedJson(req,4096));
    if(!input.success) throw new AppError('文件编号无效。');
    await deleteDocument(client,user.id,input.data.id);
    return NextResponse.json({state:await load(client,user.id)});
  } catch(error){return failure(error);}
}
