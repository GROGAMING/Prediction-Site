-- FULLTIME production schema (Supabase / Postgres).
-- Not used by the MVP. Apply when migrating off localStorage.
-- Auth: use Supabase Auth (email or phone OTP) instead of name+PIN.

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text not null unique check (char_length(display_name) between 2 and 20),
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table fixtures (
  id        bigint generated always as identity primary key,
  gameweek  int not null,
  home_team text not null,
  away_team text not null,
  kickoff   timestamptz not null,
  home_goals int,          -- null until result entered
  away_goals int,
  external_ref text        -- id from fixtures API (e.g. football-data.org) for auto-sync
);

create table predictions (
  user_id    uuid not null references profiles(id) on delete cascade,
  fixture_id bigint not null references fixtures(id) on delete cascade,
  home_goals int not null check (home_goals between 0 and 20),
  away_goals int not null check (away_goals between 0 and 20),
  updated_at timestamptz not null default now(),
  primary key (user_id, fixture_id)
);

create table leagues (
  id         bigint generated always as identity primary key,
  code       text not null unique,
  name       text not null,
  owner_id   uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table league_members (
  league_id bigint not null references leagues(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

-- ---------------------------------------------------------------
-- Payments layer (season pots). Do NOT enable before confirming
-- licensing position under the Gambling Regulation Act 2024 (IE).
-- ---------------------------------------------------------------
create table entries (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references profiles(id),
  season          text not null,               -- e.g. '2026-27'
  amount_cents    int not null check (amount_cents > 0),
  currency        text not null default 'eur',
  stripe_payment_intent text unique,
  created_at      timestamptz not null default now()
);

create table payouts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references profiles(id),
  season       text not null,
  rank         int not null,
  amount_cents int not null,
  paid_at      timestamptz
);

-- Pot for a season = sum(entries.amount_cents) - platform fee.
create view season_pot as
  select season, currency, sum(amount_cents) as gross_cents
  from entries group by season, currency;

-- Scoring: 3 exact, 1 correct result, 0 otherwise.
create or replace function prediction_points(ph int, pa int, rh int, ra int)
returns int language sql immutable as $$
  select case
    when rh is null or ra is null then null
    when ph = rh and pa = ra then 3
    when sign(ph - pa) = sign(rh - ra) then 1
    else 0
  end;
$$;

create view leaderboard as
  select p.user_id,
         pr.display_name,
         count(*) filter (where prediction_points(p.home_goals,p.away_goals,f.home_goals,f.away_goals) is not null) as played,
         count(*) filter (where prediction_points(p.home_goals,p.away_goals,f.home_goals,f.away_goals) = 3) as exact,
         coalesce(sum(prediction_points(p.home_goals,p.away_goals,f.home_goals,f.away_goals)), 0) as points
  from predictions p
  join fixtures f on f.id = p.fixture_id
  join profiles pr on pr.id = p.user_id
  group by p.user_id, pr.display_name
  order by points desc, exact desc;

-- Row Level Security outline:
--   profiles:     user reads all, updates own row.
--   fixtures:     everyone reads; only is_admin inserts/updates.
--   predictions:  user reads/writes own rows; writes rejected once
--                 fixture kickoff has passed (enforce with a trigger
--                 or a `with check (now() < kickoff)` policy join).
--   leagues/members: readable by members; anyone inserts membership
--                 for themselves given a valid code.
--   entries/payouts: user reads own; writes only via service role
--                 (Stripe webhook edge function).
