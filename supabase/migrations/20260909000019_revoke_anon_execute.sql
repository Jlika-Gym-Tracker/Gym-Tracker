-- JLIKA Gym — take EXECUTE away from anon on every SECURITY DEFINER function.
--
-- Supabase sets default privileges that grant EXECUTE on new functions to anon
-- and authenticated. `revoke all ... from public` does not undo that, because
-- the grant to anon is explicit rather than inherited — so every helper written
-- so far was callable by anyone holding the publishable key, which ships in the
-- browser.
--
-- Nothing leaked: each function reads auth.uid() itself and returns false, zero
-- rows, or raises for an anonymous caller. But two were genuinely wrong:
--
--   * recompute_league_scores rewrites every score in every season. Callable by
--     anyone, it is a free way to hammer the database.
--   * the *_owner helpers map a resource id to its owner's user id with no
--     auth check at all.
--
-- New SECURITY DEFINER functions must revoke from anon explicitly. Revoking
-- from public is not enough.

do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke all on function %s from anon', fn.signature);
    execute format('revoke all on function %s from authenticated', fn.signature);
    execute format('revoke all on function %s from public', fn.signature);
  end loop;
end
$$;

-- Grant back only what the app calls from a signed-in session.
grant execute on function public.crew_overview() to authenticated;
grant execute on function public.redeem_crew_invite(text) to authenticated;
grant execute on function public.league_standings(uuid) to authenticated;
grant execute on function public.is_league_member(uuid) to authenticated;
grant execute on function public.is_challenge_participant(uuid) to authenticated;
grant execute on function public.is_challenge_creator(uuid) to authenticated;
grant execute on function public.coach_can_read(uuid, text) to authenticated;
grant execute on function public.program_week_owner(uuid) to authenticated;
grant execute on function public.program_day_owner(uuid) to authenticated;
grant execute on function public.session_owner(uuid) to authenticated;
grant execute on function public.redeem_coach_invite(text) to authenticated;
grant execute on function public.coach_roster() to authenticated;
grant execute on function public.coach_names(uuid[]) to authenticated;

-- Deliberately not granted to anyone:
--   recompute_league_scores — rewrites every score in every season; only the
--     nightly pg_cron job, which runs as the table owner, should call it.
--   handle_new_user — a trigger function; nothing should invoke it directly.
