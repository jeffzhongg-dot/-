-- First disable public sign-ups, then manually create your own user in Authentication > Users.
-- Replace the UUID below with that user's User UID. Never paste a password here.
insert into private.app_owner(singleton,user_id)
values(true,'REPLACE_WITH_YOUR_USER_UUID'::uuid)
on conflict(singleton) do update set user_id=excluded.user_id;
-- SUPABASE_OWNER_USER_ID in your server settings MUST match this exact UID.
