import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '../../../lib/supabase';
import { findDocument } from '../../../lib/repository';
import { BUCKET, uuid, storagePath } from '../../../lib/security';
export const runtime='nodejs';
export async function GET(req:NextRequest) {
  try {
    const {client,user}=await requireOwner();const id=req.nextUrl.searchParams.get('doc')||'';const asset=req.nextUrl.searchParams.get('asset')||'';
    if(!uuid.test(id)||!/^p\d+(?:-\d+)?\.(png|jpg)$/.test(asset)) return new NextResponse(null,{status:404});
    const row=await findDocument(client,user.id,id);
    if(row.status==='deleting'||!row.metadata.pages.some(p=>p.preview===asset||p.media.includes(asset))) return new NextResponse(null,{status:404});
    const result=await client.storage.from(BUCKET).createSignedUrl(storagePath(user.id,id,asset),60);
    if(result.error||!result.data) return new NextResponse(null,{status:404});
    return NextResponse.redirect(result.data.signedUrl,302);
  }catch{return new NextResponse(null,{status:404});}
}
