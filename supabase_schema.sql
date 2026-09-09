-- Run this in your Supabase SQL editor

-- Profiles (linked to auth.users)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null,
  role text not null check (role in ('creator', 'business')),
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "Users can read own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'creator')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Creators
create table creators (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references profiles(id) on delete cascade unique,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  bio text,
  instagram_handle text,
  tiktok_handle text,
  follower_count integer default 0,
  niche text,
  city text,
  created_at timestamptz default now()
);
alter table creators enable row level security;
create policy "Creators can read/write own record" on creators for all using (auth.uid() = profile_id);
create policy "Anyone can read approved creators" on creators for select using (status = 'approved');

-- Businesses
create table businesses (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references profiles(id) on delete cascade unique,
  business_name text not null,
  description text,
  address text,
  city text,
  latitude numeric,
  longitude numeric,
  subscription_tier text default 'starter' check (subscription_tier in ('starter', 'growth', 'pro')),
  created_at timestamptz default now()
);
alter table businesses enable row level security;
create policy "Businesses can read/write own record" on businesses for all using (auth.uid() = profile_id);
create policy "Anyone can read businesses" on businesses for select using (true);

-- Circuits
create table circuits (
  id uuid default gen_random_uuid() primary key,
  business_id uuid references businesses(id) on delete cascade,
  title text not null,
  description text,
  redemption_type text not null check (redemption_type in ('code', 'voucher')),
  eligibility_min_followers integer default 0,
  eligibility_niches text[],
  expires_at timestamptz,
  is_active boolean default true,
  created_at timestamptz default now()
);
alter table circuits enable row level security;
create policy "Anyone can read active circuits" on circuits for select using (is_active = true);
create policy "Business owners can manage their circuits" on circuits for all
  using (business_id in (select id from businesses where profile_id = auth.uid()));

-- Circuit codes (for code-type redemptions)
create table circuit_codes (
  id uuid default gen_random_uuid() primary key,
  circuit_id uuid references circuits(id) on delete cascade,
  code text not null,
  is_used boolean default false,
  created_at timestamptz default now()
);
alter table circuit_codes enable row level security;
create policy "Business owners can manage codes" on circuit_codes for all
  using (circuit_id in (select id from circuits where business_id in (select id from businesses where profile_id = auth.uid())));

-- Redemptions
create table redemptions (
  id uuid default gen_random_uuid() primary key,
  circuit_id uuid references circuits(id) on delete cascade,
  creator_id uuid references creators(id) on delete cascade,
  code text,
  voucher_id text,
  status text default 'claimed' check (status in ('claimed', 'checked_in', 'completed')),
  claimed_at timestamptz default now(),
  checked_in_at timestamptz,
  check_in_latitude numeric,
  check_in_longitude numeric,
  unique(circuit_id, creator_id)
);
alter table redemptions enable row level security;
create policy "Creators can manage own redemptions" on redemptions for all
  using (creator_id in (select id from creators where profile_id = auth.uid()));
create policy "Businesses can read redemptions for their circuits" on redemptions for select
  using (circuit_id in (select id from circuits where business_id in (select id from businesses where profile_id = auth.uid())));

-- Posts
create table posts (
  id uuid default gen_random_uuid() primary key,
  redemption_id uuid references redemptions(id) on delete cascade,
  creator_id uuid references creators(id) on delete cascade,
  business_id uuid references businesses(id) on delete cascade,
  video_url text not null,
  platform text check (platform in ('tiktok', 'instagram', 'youtube', 'other')),
  views integer,
  likes integer,
  comments integer,
  submitted_at timestamptz default now()
);
alter table posts enable row level security;
create policy "Creators can insert own posts" on posts for insert
  with check (creator_id in (select id from creators where profile_id = auth.uid()));
create policy "Businesses can read posts for their circuits" on posts for select
  using (business_id in (select id from businesses where profile_id = auth.uid()));
create policy "Creators can read own posts" on posts for select
  using (creator_id in (select id from creators where profile_id = auth.uid()));
