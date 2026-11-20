-- Clubs: a friends' group with its own list of live tables. Anyone with the club's code or link joins;
-- only the owner and the managers the owner picks open tables in the club. Play chips only, no real money.
create table if not exists public.poker_clubs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (char_length(name) between 2 and 30),
  owner_id uuid not null,
  created_at timestamptz not null default now()
);
create table if not exists public.poker_club_members (
  club_id uuid not null references public.poker_clubs(id) on delete cascade,
  player_id uuid not null,
  role text not null default 'member' check (role in ('owner', 'manager', 'member')),
  joined_at timestamptz not null default now(),
  primary key (club_id, player_id)
);
create index if not exists poker_club_members_player on public.poker_club_members(player_id);
alter table public.poker_rooms add column if not exists club_id uuid references public.poker_clubs(id) on delete set null;
create index if not exists poker_rooms_club on public.poker_rooms(club_id) where club_id is not null;
alter table public.poker_clubs enable row level security;
alter table public.poker_club_members enable row level security;
-- no policies: only the security-definer functions below (and the server) read or write these tables

create or replace function public.poker_club_create(p_id uuid, p_secret text, p_name text)
returns table(id uuid, code text) language plpgsql security definer set search_path = '' as $$
declare c text; cid uuid; alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int; tries int := 0; nm text := btrim(coalesce(p_name, ''));
begin
  if public.poker_check_secret(p_id, p_secret) is not true then raise exception 'bad secret'; end if;
  if char_length(nm) < 2 or char_length(nm) > 30 then raise exception 'bad name'; end if;
  if (select count(*) from public.poker_clubs k where k.owner_id = p_id) >= 5 then raise exception 'too many clubs'; end if;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(alpha, 1 + floor(random() * 32)::int, 1); end loop;
    begin
      insert into public.poker_clubs as k (code, name, owner_id) values (c, nm, p_id) returning k.id into cid;
      exit;
    exception when unique_violation then tries := tries + 1; if tries > 20 then raise exception 'no free code'; end if;
    end;
  end loop;
  insert into public.poker_club_members (club_id, player_id, role) values (cid, p_id, 'owner');
  return query select cid, c;
end $$;

create or replace function public.poker_club_join(p_id uuid, p_secret text, p_code text)
returns table(id uuid, code text, name text) language plpgsql security definer set search_path = '' as $$
declare k public.poker_clubs;
begin
  if public.poker_check_secret(p_id, p_secret) is not true then raise exception 'bad secret'; end if;
  select * into k from public.poker_clubs c where c.code = upper(btrim(p_code));
  if k.id is null then raise exception 'no club'; end if;
  if (select count(*) from public.poker_club_members m where m.player_id = p_id) >= 20 then raise exception 'too many memberships'; end if;
  if not exists (select 1 from public.poker_club_members m where m.club_id = k.id and m.player_id = p_id) then
    if (select count(*) from public.poker_club_members m where m.club_id = k.id) >= 300 then raise exception 'club full'; end if;
    insert into public.poker_club_members (club_id, player_id) values (k.id, p_id);
  end if;
  return query select k.id, k.code, k.name;
end $$;

-- leaving: a member leaves; the owner leaving closes the whole club
create or replace function public.poker_club_leave(p_id uuid, p_secret text, p_club uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.poker_check_secret(p_id, p_secret) is not true then raise exception 'bad secret'; end if;
  if exists (select 1 from public.poker_clubs k where k.id = p_club and k.owner_id = p_id) then
    delete from public.poker_clubs k where k.id = p_club;
  else
    delete from public.poker_club_members m where m.club_id = p_club and m.player_id = p_id;
  end if;
end $$;

-- the owner removes a member or sets a member's role (manager / member)
create or replace function public.poker_club_member_set(p_id uuid, p_secret text, p_club uuid, p_player uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.poker_check_secret(p_id, p_secret) is not true then raise exception 'bad secret'; end if;
  if not exists (select 1 from public.poker_clubs k where k.id = p_club and k.owner_id = p_id) then raise exception 'owner only'; end if;
  if p_player = p_id then raise exception 'not yourself'; end if;
  if p_role = 'remove' then delete from public.poker_club_members m where m.club_id = p_club and m.player_id = p_player;
  elsif p_role in ('manager', 'member') then update public.poker_club_members m set role = p_role where m.club_id = p_club and m.player_id = p_player;
  else raise exception 'bad role'; end if;
end $$;

-- my clubs, with how many members and how many live tables each has
create or replace function public.poker_club_mine(p_id uuid, p_secret text)
returns table(id uuid, code text, name text, role text, members int, tables int) language plpgsql stable security definer set search_path = '' as $$
begin
  if public.poker_check_secret(p_id, p_secret) is not true then raise exception 'bad secret'; end if;
  return query
    select k.id, k.code, k.name, m.role,
      (select count(*)::int from public.poker_club_members x where x.club_id = k.id),
      (select count(*)::int from public.poker_rooms r join public.poker_table_state s on s.code = r.code where r.club_id = k.id and r.closed_at is null and r.created_at > now() - interval '2 days' and coalesce(s.state->>'phase', '') <> 'over')
    from public.poker_club_members m join public.poker_clubs k on k.id = m.club_id
    where m.player_id = p_id order by m.joined_at desc;
end $$;

-- one club for a member: its members and its live tables (seats, settings, phase) read from the table state
create or replace function public.poker_club_get(p_id uuid, p_secret text, p_club uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me text;
begin
  if public.poker_check_secret(p_id, p_secret) is not true then raise exception 'bad secret'; end if;
  select m.role into me from public.poker_club_members m where m.club_id = p_club and m.player_id = p_id;
  if me is null then raise exception 'not a member'; end if;
  return (select jsonb_build_object(
    'id', k.id, 'code', k.code, 'name', k.name, 'role', me,
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.player_id, 'nick', coalesce(p.nickname, 'שחקן'), 'role', m.role) order by (m.role = 'owner') desc, (m.role = 'manager') desc, m.joined_at)
       from public.poker_club_members m left join public.poker_players p on p.id = m.player_id where m.club_id = k.id), '[]'::jsonb),
    'tables', coalesce((select jsonb_agg(jsonb_build_object(
        'code', r.code,
        'host', coalesce(s.state->'players'->0->>'nick', ''),
        'seated', coalesce(jsonb_array_length(s.state->'players'), 0),
        'phase', coalesce(s.state->>'phase', 'lobby'),
        'hand', coalesce((s.state->>'handNo')::int, 0),
        'cfg', s.state->'cfg',
        'bb', s.state->'bb') order by r.created_at desc)
       from public.poker_rooms r join public.poker_table_state s on s.code = r.code
       where r.club_id = k.id and r.closed_at is null and r.created_at > now() - interval '2 days' and coalesce(s.state->>'phase', '') <> 'over'), '[]'::jsonb))
    from public.poker_clubs k where k.id = p_club);
end $$;

-- the server asks: may this player open a table in this club / sit at this club's table?
create or replace function public.poker_club_role(p_club uuid, p_player uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.poker_club_members m where m.club_id = p_club and m.player_id = p_player;
$$;

revoke all on function public.poker_club_role(uuid, uuid) from public, anon, authenticated;
grant execute on function public.poker_club_create(uuid, text, text), public.poker_club_join(uuid, text, text), public.poker_club_leave(uuid, text, uuid),
  public.poker_club_member_set(uuid, text, uuid, uuid, text), public.poker_club_mine(uuid, text), public.poker_club_get(uuid, text, uuid) to anon, authenticated;
