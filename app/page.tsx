import { redirect } from 'next/navigation';
import { requireOwner } from '../lib/supabase';
import Workspace from '../components/Workspace';
export const dynamic = 'force-dynamic';
export default async function Home() {
  try { await requireOwner(); } catch { redirect('/login'); }
  return <Workspace/>;
}
