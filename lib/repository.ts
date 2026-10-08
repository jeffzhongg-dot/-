import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Document, State, emptyProfile } from './types';
import { AppError, BUCKET, storagePath } from './security';
import { assertResult } from './http';
export type RecordRow = { id: string; user_id: string; metadata: Document; original_path: string; expected_size: number; next_page: number; status: 'pending' | 'processing' | 'ready' | 'error' | 'deleting'; lease_token: string; lease_expires_at: string };
export async function load(client: SupabaseClient, userId: string): Promise<State> {
  const [profile, documents] = await Promise.all([
    client.from('career_profiles').select('profile,revision,updated_at').eq('user_id', userId).maybeSingle(),
    client.from('career_documents').select('metadata,status,next_page').eq('user_id',userId).order('updated_at'),
  ]);
  assertResult(profile.error); assertResult(documents.error);
  return { profile: profile.data?.profile || emptyProfile(), revision: profile.data?.revision || 0, updatedAt: profile.data?.updated_at,
    documents: (documents.data || []).map(row => ({ ...row.metadata, status: row.status, nextPage: row.next_page })) };
}
export async function findDocument(client: SupabaseClient, userId: string, id: string): Promise<RecordRow> {
  const result = await client.from('career_documents').select('*').eq('user_id',userId).eq('id',id).maybeSingle();
  assertResult(result.error); if (!result.data) throw new AppError('找不到文件。',404); return result.data;
}
export async function claim(client: SupabaseClient, id: string, operation: 'parse' | 'ai' | 'delete'): Promise<RecordRow> {
  const { data, error } = await client.rpc('claim_document', { document_id: id, operation }).single<RecordRow>(); assertResult(error); if(!data) throw new AppError('找不到文件。',404); return data;
}
export async function deleteDocument(client: SupabaseClient, userId: string, id: string) {
  const doc = await claim(client,id,'delete');
  try {
    const prefix = `${userId}/${id}`;
    // A tombstone denies new parser uploads; owner-only listing collects partial assets as well.
    for (let batch=0; batch<20; batch++) {
      const listing = await client.storage.from(BUCKET).list(prefix, { limit: 1000 });
      assertResult(listing.error);
      const names = (listing.data || []).filter(item => item.id).map(item => storagePath(userId,id,item.name));
      if (!names.length) break;
      const removed = await client.storage.from(BUCKET).remove(names); assertResult(removed.error);
      if (batch === 19) throw new AppError('文件较多，删除尚未完成，请重试。',409);
    }
    const result = await client.rpc('complete_document_delete',{document_id:id,token:doc.lease_token}); assertResult(result.error);
  } catch (error) {
    // Allow an immediate retry; preserve the tombstone and the manifest until storage removal succeeds.
    await client.from('career_documents').update({ lease_token:null,lease_expires_at:null }).eq('id',id).eq('user_id',userId).eq('lease_token',doc.lease_token);
    throw error;
  }
}
