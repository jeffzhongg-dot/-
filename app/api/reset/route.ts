import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '../../../lib/supabase';
import { deleteDocument, load } from '../../../lib/repository';
import { checkOrigin, failure, assertResult } from '../../../lib/http';
import { emptyProfile } from '../../../lib/types';
export const maxDuration=60;
export async function DELETE(req:NextRequest) {
  try {
    checkOrigin(req);const {client,user}=await requireOwner();const state=await load(client,user.id);
    // One call removes one document; the browser repeats to keep requests under serverless time limits.
    if(state.documents[0]) {await deleteDocument(client,user.id,state.documents[0].id);return NextResponse.json({remaining:Math.max(0,state.documents.length-1)});}
    const latest=await load(client,user.id);
    const result=await client.rpc('save_career_profile',{input_profile:emptyProfile(),expected_revision:latest.revision||0});assertResult(result.error);
    return NextResponse.json({remaining:0,done:true});
  }catch(error){return failure(error);}
}
