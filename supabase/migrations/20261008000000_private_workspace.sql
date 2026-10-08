-- Run in Supabase SQL Editor. No service-role key is used by the application.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.app_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null references auth.users(id) on delete cascade
);
revoke all on private.app_owner from public, anon, authenticated;

create or replace function public.is_app_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.app_owner where user_id = (select auth.uid()));
$$;
revoke all on function public.is_app_owner() from public;
grant execute on function public.is_app_owner() to authenticated;

create table if not exists public.career_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null default '{"name":"","headline":"","summary":"","work":[],"projects":[],"skills":[],"industries":[]}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(profile) = 'object' and octet_length(profile::text) <= 1048576)
);
create table if not exists public.career_documents (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  metadata jsonb not null,
  original_path text not null,
  expected_size integer not null check (expected_size between 1 and 15728640),
  next_page integer not null default 1 check (next_page between 1 and 61),
  status text not null default 'pending' check (status in ('pending','processing','ready','error','deleting')),
  lease_token uuid,
  lease_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 700000),
  check (original_path = user_id::text || '/' || id::text || '/source.' || case when metadata->>'format' = 'PDF' then 'pdf' else 'pptx' end)
);
create index if not exists career_documents_user_idx on public.career_documents(user_id);
alter table public.career_profiles enable row level security;
alter table public.career_profiles force row level security;
alter table public.career_documents enable row level security;
alter table public.career_documents force row level security;
revoke all on public.career_profiles, public.career_documents from anon, authenticated;
grant select, insert, update, delete on public.career_profiles, public.career_documents to authenticated;
drop policy if exists owner_profiles on public.career_profiles;
create policy owner_profiles on public.career_profiles for all to authenticated
using ((select public.is_app_owner()) and user_id = (select auth.uid()))
with check ((select public.is_app_owner()) and user_id = (select auth.uid()));
drop policy if exists owner_documents on public.career_documents;
create policy owner_documents on public.career_documents for all to authenticated
using ((select public.is_app_owner()) and user_id = (select auth.uid()))
with check ((select public.is_app_owner()) and user_id = (select auth.uid()));

create or replace function public.reserve_document(document_id uuid, document_metadata jsonb, file_size integer)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_app_owner() then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if (select count(*) from public.career_documents where user_id=auth.uid()) >= 4 then raise exception 'document_limit'; end if;
  insert into public.career_profiles(user_id) values(auth.uid()) on conflict do nothing;
  insert into public.career_documents(id,user_id,metadata,original_path,expected_size)
  values(document_id,auth.uid(),document_metadata,auth.uid()::text || '/' || document_id::text || '/source.' || case when document_metadata->>'format'='PDF' then 'pdf' else 'pptx' end,file_size);
end $$;

create or replace function public.claim_document(document_id uuid, operation text default 'parse')
returns public.career_documents language plpgsql security invoker set search_path = '' as $$
declare doc public.career_documents;
begin
  if not public.is_app_owner() then raise exception 'forbidden'; end if;
  select * into doc from public.career_documents where id=document_id and user_id=auth.uid() for update;
  if not found then raise exception 'not_found'; end if;
  if doc.lease_expires_at > now() then raise exception 'busy'; end if;
  if doc.status='deleting' and operation <> 'delete' then raise exception 'not_found'; end if;
  if operation not in ('parse','ai','delete') then raise exception 'forbidden'; end if;
  if operation='ai' and doc.status <> 'ready' then raise exception 'busy'; end if;
  update public.career_documents set lease_token=gen_random_uuid(), lease_expires_at=now()+interval '150 seconds',
    status=case when operation='delete' then 'deleting' when operation='parse' and status <> 'ready' then 'processing' else status end,
    updated_at=now() where id=document_id returning * into doc;
  return doc;
end $$;

create or replace function public.finish_document(document_id uuid, token uuid, document_metadata jsonb, next_cursor integer, document_status text, candidates jsonb default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare doc public.career_documents; key text; old_profile jsonb; new_profile jsonb;
begin
  if not public.is_app_owner() then raise exception 'forbidden'; end if;
  -- Lock profile BEFORE document consistently, to serialize evidence and manual edits.
  select profile into old_profile from public.career_profiles where user_id=auth.uid() for update;
  select * into doc from public.career_documents where id=document_id and user_id=auth.uid() for update;
  if not found or doc.lease_token is distinct from token or doc.lease_expires_at <= now() or doc.status='deleting' then raise exception 'stale'; end if;
  if document_status not in ('processing','ready','error') then raise exception 'forbidden'; end if;
  update public.career_documents set metadata=document_metadata, next_page=next_cursor, status=document_status,
    lease_token=null,lease_expires_at=null,updated_at=now() where id=document_id;
  if candidates is not null then
    new_profile := old_profile;
    foreach key in array array['work','projects','skills','industries'] loop
      new_profile := jsonb_set(new_profile,array[key],coalesce((select jsonb_agg(e) from (select e from jsonb_array_elements(coalesce(old_profile->key,'[]'::jsonb) || coalesce(candidates->key,'[]'::jsonb)) e limit 150) limited),'[]'::jsonb));
    end loop;
    update public.career_profiles set profile=new_profile,revision=revision+1,updated_at=now() where user_id=auth.uid();
  end if;
end $$;

create or replace function public.save_career_profile(input_profile jsonb, expected_revision bigint)
returns void language plpgsql security invoker set search_path = '' as $$
declare current_revision bigint;
begin
  if not public.is_app_owner() then raise exception 'forbidden'; end if;
  insert into public.career_profiles(user_id) values(auth.uid()) on conflict do nothing;
  select revision into current_revision from public.career_profiles where user_id=auth.uid() for update;
  if current_revision <> expected_revision then raise exception 'stale'; end if;
  update public.career_profiles set profile=input_profile,revision=revision+1,updated_at=now() where user_id=auth.uid();
end $$;

create or replace function public.complete_document_delete(document_id uuid, token uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare doc public.career_documents; key text; p jsonb;
begin
  if not public.is_app_owner() then raise exception 'forbidden'; end if;
  select profile into p from public.career_profiles where user_id=auth.uid() for update;
  select * into doc from public.career_documents where id=document_id and user_id=auth.uid() for update;
  if not found or doc.status <> 'deleting' or doc.lease_token is distinct from token or doc.lease_expires_at <= now() then raise exception 'stale'; end if;
  foreach key in array array['work','projects','skills','industries'] loop
    p := jsonb_set(p,array[key],coalesce((select jsonb_agg(item) from jsonb_array_elements(p->key) item where item->>'source' <> document_id::text or not (item ? 'source')),'[]'::jsonb));
  end loop;
  update public.career_profiles set profile=p,revision=revision+1,updated_at=now() where user_id=auth.uid();
  delete from public.career_documents where id=document_id;
end $$;

revoke all on function public.reserve_document(uuid,jsonb,integer), public.claim_document(uuid,text), public.finish_document(uuid,uuid,jsonb,integer,text,jsonb), public.save_career_profile(jsonb,bigint), public.complete_document_delete(uuid,uuid) from public, anon;
grant execute on function public.reserve_document(uuid,jsonb,integer), public.claim_document(uuid,text), public.finish_document(uuid,uuid,jsonb,integer,text,jsonb), public.save_career_profile(jsonb,bigint), public.complete_document_delete(uuid,uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('career-private','career-private',false,15728640,array['application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/png','image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.owns_career_object(object_name text, include_deleting boolean default false)
returns boolean language sql stable security invoker set search_path = '' as $$
  select public.is_app_owner() and exists (
    select 1 from public.career_documents d where d.user_id=(select auth.uid())
      and object_name like d.user_id::text || '/' || d.id::text || '/%'
      and (include_deleting or d.status <> 'deleting')
      and split_part(object_name,'/',3) ~ '^(source\.(pdf|pptx)|p[0-9]+(-[0-9]+)?\.(png|jpg))$'
      and array_length(string_to_array(object_name,'/'),1)=3
  );
$$;
revoke all on function public.owns_career_object(text,boolean) from public,anon;
grant execute on function public.owns_career_object(text,boolean) to authenticated;
drop policy if exists career_storage_read on storage.objects;
drop policy if exists career_storage_insert on storage.objects;
drop policy if exists career_storage_update on storage.objects;
drop policy if exists career_storage_delete on storage.objects;
create policy career_storage_read on storage.objects for select to authenticated using (bucket_id='career-private' and public.owns_career_object(name,true));
create policy career_storage_insert on storage.objects for insert to authenticated with check (bucket_id='career-private' and public.owns_career_object(name));
create policy career_storage_update on storage.objects for update to authenticated using (bucket_id='career-private' and public.owns_career_object(name)) with check (bucket_id='career-private' and public.owns_career_object(name));
create policy career_storage_delete on storage.objects for delete to authenticated using (bucket_id='career-private' and public.owns_career_object(name,true));
commit;
