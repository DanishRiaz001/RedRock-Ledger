-- Fix: profiles?select=* returned 500 (Internal Server Error) every time,
-- which is why "who changed this" names never resolved in Change Log /
-- Comments (the app couldn't fetch the team's profile list at all).
--
-- Root cause: rr_is_admin() directly queries `profiles` but was never
-- marked SECURITY DEFINER, unlike every other rr_/is_admin helper in this
-- schema. Two policies on profiles (profiles_select, profiles_admin_update)
-- call rr_is_admin() to decide access — that call runs the same query
-- against `profiles` again, which re-triggers RLS on `profiles`, which
-- calls rr_is_admin() again: infinite recursion (Postgres error 42P17),
-- surfaced by PostgREST as a plain 500 with no useful detail.
--
-- rr_access_level() (used by rr_can_read/rr_can_write/rr_can_write_settings)
-- and is_admin()/is_admin(uuid) are already correctly SECURITY DEFINER —
-- this just brings rr_is_admin() in line with its siblings.
CREATE OR REPLACE FUNCTION public.rr_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$function$;
