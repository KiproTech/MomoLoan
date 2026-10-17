-- =============================================================================
-- MoMo Loan  |  Supabase schema, security policies and server-side workflow
-- =============================================================================
--
-- HOW TO RUN
--   1. Supabase Dashboard -> SQL Editor -> New query.
--   2. Paste this whole file and click "Run". It is idempotent: re-running it
--      on an existing project updates functions and policies in place and
--      keeps your data.
--   3. Authentication -> Providers -> Email: decide whether "Confirm email"
--      is on. The app supports both settings.
--   4. Create an administrator (see the last section of this file).
--
-- PREREQUISITES
--   * A Supabase project (Auth is enabled by default).
--   * This file is run as the `postgres` role (what the SQL Editor uses).
--   * If public.profiles already exists it is reused (missing columns are
--     added); no other existing table is touched.
--
-- SMS VERIFICATION (MANUAL)
--   This application never sends an SMS and has no SMS gateway. An administrator
--   sends the verification SMS to the applicant's registered number by their own
--   external process, then presses "Mark SMS as Sent". That records the time and
--   the administrator and moves the application to "Awaiting SMS Verification".
--   The applicant copies the real SMS from their phone and pastes it into the app;
--   the administrator then approves, rejects, or asks for a resubmission.
--
-- SECURITY MODEL
--   * Row Level Security is ON for every table.
--   * Browser clients (anon / authenticated roles) get SELECT only, and only
--     through RLS policies. They have NO insert/update/delete privileges.
--   * Every state change happens inside SECURITY DEFINER functions that check
--     auth.uid(), the caller's role and the current status (a state machine),
--     and lock the row so two administrators cannot act on one request at once.
--   * Administrators cannot review or submit their own application.
--   * Roles live in public.profiles.role and can only be changed from the SQL
--     Editor / service role, never from the browser.
--   * The service-role key is never needed by the React app.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Profiles (one row per auth user; holds the role)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'applicant',
  created_at  timestamptz not null default now()
);

-- Reuse an existing profiles table if there already is one.
alter table public.profiles add column if not exists email      text;
alter table public.profiles add column if not exists full_name  text;
alter table public.profiles add column if not exists role       text not null default 'applicant';
alter table public.profiles add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('applicant', 'admin'));
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 2. Applicants (registration details + overall application status)
-- -----------------------------------------------------------------------------
create sequence if not exists public.applicant_ref_seq start 1000;

create table if not exists public.applicants (
  id                    uuid primary key default gen_random_uuid(),
  applicant_ref         text not null unique
                          default ('ML-' || lpad(nextval('public.applicant_ref_seq')::text, 6, '0')),
  user_id               uuid not null unique references auth.users (id) on delete cascade,
  full_name             text not null check (char_length(btrim(full_name)) between 2 and 120),
  date_of_birth         date not null,
  phone_number          text not null check (phone_number ~ '^\+256[347][0-9]{8}$'),
  email                 text not null,
  country               text not null default 'Uganda' check (country = 'Uganda'),
  district              text not null check (char_length(btrim(district)) between 2 and 80),
  address               text not null check (char_length(btrim(address)) between 3 and 250),
  occupation            text check (occupation is null or char_length(occupation) <= 80),
  status                text not null default 'pending_registration'
                          check (status in ('pending_registration', 'pending_admin_action', 'sms_sent',
                                            'pending_admin_validation', 'approved', 'rejected', 'expired')),
  details_confirmed_at  timestamptz,
  approved_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_applicants_status on public.applicants (status);


-- -----------------------------------------------------------------------------
-- 3. SMS verification requests (one per attempt)
-- -----------------------------------------------------------------------------
create table if not exists public.sms_verification_requests (
  id            uuid primary key default gen_random_uuid(),
  applicant_id  uuid not null references public.applicants (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  attempt_no    integer not null default 1 check (attempt_no >= 1),
  phone_number  text not null,                       -- snapshot taken at request time
  status        text not null default 'pending_admin_action'
                  check (status in ('pending_admin_action', 'sms_sent', 'pending_admin_validation',
                                    'approved', 'rejected', 'expired')),
  requested_at  timestamptz not null default now(),
  sms_sent_at   timestamptz,                          -- when an administrator marked the SMS as sent
  sms_sent_by   uuid references auth.users (id) on delete set null,
  submitted_at  timestamptz,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (applicant_id, attempt_no)
);

-- Prevent duplicate requests: only ONE open request per applicant.
create unique index if not exists uq_one_open_request_per_applicant
  on public.sms_verification_requests (applicant_id)
  where status in ('pending_admin_action', 'sms_sent', 'pending_admin_validation');

create index if not exists idx_requests_status_requested
  on public.sms_verification_requests (status, requested_at desc);
create index if not exists idx_requests_user on public.sms_verification_requests (user_id);

-- Upgrading an earlier version of this schema (all no-ops on a fresh project).
alter table public.sms_verification_requests add column if not exists sms_sent_by uuid references auth.users (id) on delete set null;
alter table public.sms_verification_requests drop column if exists expires_at;
drop function if exists public.admin_simulate_sms_sent(uuid);
drop function if exists public.expire_stale_requests();
drop function if exists public._normalize_sms_text(text);
drop table if exists public.simulated_sms_messages;


-- -----------------------------------------------------------------------------
-- 5. Applicant message submissions
-- -----------------------------------------------------------------------------
create table if not exists public.sms_submissions (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid not null references public.sms_verification_requests (id) on delete cascade,
  applicant_id       uuid not null references public.applicants (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  submission_no      integer not null default 1 check (submission_no >= 1),   -- above 1 after a requested resubmission
  submitted_message  text not null check (char_length(btrim(submitted_message)) between 1 and 2000),
  submitted_at       timestamptz not null default now()
);
-- Upgrading an earlier version: several submissions per request are now allowed.
alter table public.sms_submissions drop constraint if exists sms_submissions_request_id_key;
alter table public.sms_submissions add column if not exists submission_no integer not null default 1;
alter table public.sms_submissions drop column if exists auto_match;
create unique index if not exists uq_submission_no on public.sms_submissions (request_id, submission_no);


-- -----------------------------------------------------------------------------
-- 6. Verification decisions (administrator approve / reject)
-- -----------------------------------------------------------------------------
create table if not exists public.verification_decisions (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null unique references public.sms_verification_requests (id) on delete cascade,
  applicant_id  uuid not null references public.applicants (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  decision      text not null check (decision in ('approved', 'rejected')),
  reason        text,
  decided_by    uuid references auth.users (id) on delete set null,
  decided_at    timestamptz not null default now(),
  constraint reject_needs_reason
    check (decision = 'approved' or char_length(btrim(coalesce(reason, ''))) >= 5)
);


-- -----------------------------------------------------------------------------
-- 7. Request history (status timeline) , notifications , audit log
-- -----------------------------------------------------------------------------
create table if not exists public.request_events (
  id            bigint generated always as identity primary key,
  request_id    uuid not null references public.sms_verification_requests (id) on delete cascade,
  applicant_id  uuid not null references public.applicants (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  from_status   text,
  to_status     text not null,
  actor_id      uuid references auth.users (id) on delete set null,
  actor_role    text not null check (actor_role in ('applicant', 'admin', 'system')),
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_events_request on public.request_events (request_id, created_at);

create table if not exists public.notifications (
  id                 uuid primary key default gen_random_uuid(),
  recipient_role     text not null check (recipient_role in ('admin', 'applicant')),
  recipient_user_id  uuid references auth.users (id) on delete cascade,   -- NULL = all administrators
  applicant_id       uuid references public.applicants (id) on delete cascade,
  request_id         uuid references public.sms_verification_requests (id) on delete cascade,
  type               text not null check (type in ('verification_requested', 'sms_sent', 'sms_submitted',
                                                   'verification_approved', 'verification_rejected',
                                                   'verification_expired', 'resubmission_requested')),
  title              text not null,
  body               text not null,
  read_at            timestamptz,
  created_at         timestamptz not null default now(),
  check ((recipient_role = 'applicant') = (recipient_user_id is not null))
);
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('verification_requested', 'sms_sent', 'sms_submitted', 'verification_approved',
                  'verification_rejected', 'verification_expired', 'resubmission_requested'));
create index if not exists idx_notifications_user  on public.notifications (recipient_user_id, created_at desc);
create index if not exists idx_notifications_admin on public.notifications (created_at desc) where recipient_role = 'admin';

create table if not exists public.audit_logs (
  id            bigint generated always as identity primary key,
  actor_id      uuid references auth.users (id) on delete set null,
  actor_role    text not null,
  action        text not null,
  entity_type   text not null,
  entity_id     uuid,
  applicant_id  uuid references public.applicants (id) on delete set null,
  request_id    uuid references public.sms_verification_requests (id) on delete set null,
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_audit_created on public.audit_logs (created_at desc);


-- -----------------------------------------------------------------------------
-- 8. Helper functions and triggers
-- -----------------------------------------------------------------------------

-- 8.1  Is the caller an administrator?  (SECURITY DEFINER avoids RLS recursion.)
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- 8.2  updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_applicants_touch on public.applicants;
create trigger trg_applicants_touch before update on public.applicants
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_requests_touch on public.sms_verification_requests;
create trigger trg_requests_touch before update on public.sms_verification_requests
  for each row execute function public.touch_updated_at();

-- 8.3  Status state machine (defence in depth: applies to ANY update, even from SQL).
--      Request:   pending_admin_action -> sms_sent -> pending_admin_validation -> approved | rejected
--                 pending_admin_validation -> sms_sent (administrator requests a resubmission)
--                 sms_sent -> expired (legacy status, no longer set automatically)
--      Applicant: as above, plus rejected/expired -> pending_registration | pending_admin_action
create or replace function public._status_transition_allowed(p_entity text, p_old text, p_new text)
returns boolean
language sql immutable
as $$
  select p_old = p_new or case p_entity
    when 'request' then
      (p_old, p_new) in (('pending_admin_action', 'sms_sent'),
                         ('sms_sent', 'pending_admin_validation'),
                         ('sms_sent', 'expired'),
                         ('pending_admin_validation', 'sms_sent'),
                         ('pending_admin_validation', 'approved'),
                         ('pending_admin_validation', 'rejected'))
    when 'applicant' then
      (p_old, p_new) in (('pending_registration', 'pending_admin_action'),
                         ('pending_admin_action', 'sms_sent'),
                         ('sms_sent', 'pending_admin_validation'),
                         ('sms_sent', 'expired'),
                         ('pending_admin_validation', 'sms_sent'),
                         ('pending_admin_validation', 'approved'),
                         ('pending_admin_validation', 'rejected'),
                         ('rejected', 'pending_registration'),
                         ('rejected', 'pending_admin_action'),
                         ('expired', 'pending_registration'),
                         ('expired', 'pending_admin_action'))
    else false end;
$$;

create or replace function public._guard_request_status()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public._status_transition_allowed('request', old.status, new.status) then
    raise exception 'Invalid verification status change: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create or replace function public._guard_applicant_status()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public._status_transition_allowed('applicant', old.status, new.status) then
    raise exception 'Invalid application status change: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_requests_status_guard on public.sms_verification_requests;
create trigger trg_requests_status_guard before update of status on public.sms_verification_requests
  for each row execute function public._guard_request_status();

drop trigger if exists trg_applicants_status_guard on public.applicants;
create trigger trg_applicants_status_guard before update of status on public.applicants
  for each row execute function public._guard_applicant_status();

-- 8.4  Internal writers (not callable from the browser)
create or replace function public._log_event(
  p_request public.sms_verification_requests, p_from text, p_to text,
  p_actor uuid, p_actor_role text, p_note text default null)
returns void language sql
set search_path = public, pg_temp
as $$
  insert into public.request_events (request_id, applicant_id, user_id, from_status, to_status, actor_id, actor_role, note)
  values (p_request.id, p_request.applicant_id, p_request.user_id, p_from, p_to, p_actor, p_actor_role, p_note);
$$;

create or replace function public._audit(
  p_actor uuid, p_actor_role text, p_action text, p_entity_type text, p_entity_id uuid,
  p_applicant uuid, p_request uuid, p_details jsonb default '{}'::jsonb)
returns void language sql
set search_path = public, pg_temp
as $$
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, applicant_id, request_id, details)
  values (p_actor, p_actor_role, p_action, p_entity_type, p_entity_id, p_applicant, p_request, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function public._notify(
  p_role text, p_user uuid, p_applicant uuid, p_request uuid, p_type text, p_title text, p_body text)
returns void language sql
set search_path = public, pg_temp
as $$
  insert into public.notifications (recipient_role, recipient_user_id, applicant_id, request_id, type, title, body)
  values (p_role, p_user, p_applicant, p_request, p_type, p_title, p_body);
$$;

-- 8.5  Ugandan phone number normalisation -> +256XXXXXXXXX (raises if invalid)
create or replace function public._normalize_ug_phone(p_phone text)
returns text
language plpgsql immutable
as $$
declare
  d text := regexp_replace(coalesce(p_phone, ''), '[\s\-\(\)\.]', '', 'g');
begin
  if    d ~ '^\+256[0-9]{9}$' then null;
  elsif d ~ '^256[0-9]{9}$'   then d := '+' || d;
  elsif d ~ '^0[0-9]{9}$'     then d := '+256' || substr(d, 2);
  elsif d ~ '^[0-9]{9}$'      then d := '+256' || d;
  else
    raise exception 'Enter a valid Ugandan phone number, e.g. +256 772 123 456' using errcode = '22023';
  end if;
  if d !~ '^\+256[347][0-9]{8}$' then
    raise exception 'Enter a valid Ugandan phone number, e.g. +256 772 123 456' using errcode = '22023';
  end if;
  return d;
end $$;

-- 8.6  Create / update registration details (shared by signup trigger and save_registration)
create or replace function public._upsert_applicant(
  p_user uuid, p_email text, p_full_name text, p_dob date, p_phone text,
  p_district text, p_address text, p_occupation text)
returns public.applicants
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_phone text := public._normalize_ug_phone(p_phone);
  v_row   public.applicants;
begin
  if char_length(btrim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Enter your full name' using errcode = '22023';
  end if;
  if p_dob is null or p_dob > current_date - interval '18 years' or p_dob < current_date - interval '100 years' then
    raise exception 'You must be at least 18 years old to apply' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_district, ''))) < 2 then
    raise exception 'Enter your district' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_address, ''))) < 3 then
    raise exception 'Enter your residential address' using errcode = '22023';
  end if;

  select * into v_row from public.applicants where user_id = p_user for update;

  if found then
    if v_row.status not in ('pending_registration', 'rejected', 'expired') then
      raise exception 'Your details can no longer be edited while verification is in progress or approved'
        using errcode = '55000';
    end if;
    update public.applicants
       set full_name = btrim(p_full_name), date_of_birth = p_dob, phone_number = v_phone,
           email = p_email, district = btrim(p_district), address = btrim(p_address),
           occupation = nullif(btrim(coalesce(p_occupation, '')), ''),
           status = 'pending_registration', details_confirmed_at = null
     where id = v_row.id
    returning * into v_row;
  else
    insert into public.applicants (user_id, full_name, date_of_birth, phone_number, email, district, address, occupation)
    values (p_user, btrim(p_full_name), p_dob, v_phone, p_email, btrim(p_district), btrim(p_address),
            nullif(btrim(coalesce(p_occupation, '')), ''))
    returning * into v_row;
  end if;
  return v_row;
end $$;

-- 8.7  New auth user -> profile (always 'applicant') + pending registration if details were supplied.
--      Roles are NEVER taken from user-supplied metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, nullif(btrim(m ->> 'full_name'), ''), 'applicant')
  on conflict (id) do nothing;

  if m ? 'phone_number' then
    begin
      perform public._upsert_applicant(new.id, new.email, m ->> 'full_name', (m ->> 'date_of_birth')::date,
                                       m ->> 'phone_number', m ->> 'district', m ->> 'address', m ->> 'occupation');
    exception when others then
      -- Never block sign-up: the app will ask for the details again.
      raise warning 'momo: could not create pending registration for %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Back-fill profiles for users that already exist.
insert into public.profiles (id, email, role)
select u.id, u.email, 'applicant' from auth.users u
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 9. Client-callable functions (RPC). Each one authenticates and validates state.
-- -----------------------------------------------------------------------------

-- 9.1  Applicant: save registration details (status stays / returns to pending_registration)
create or replace function public.save_registration(
  p_full_name text, p_date_of_birth date, p_phone_number text,
  p_district text, p_address text, p_occupation text default null)
returns public.applicants
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if public.is_admin() then
    raise exception 'Administrator accounts cannot submit applications' using errcode = '42501';
  end if;
  select email into v_email from auth.users where id = v_uid;
  return public._upsert_applicant(v_uid, v_email, p_full_name, p_date_of_birth, p_phone_number,
                                  p_district, p_address, p_occupation);
end $$;

-- 9.2  Applicant: confirm details ("Continue") -> creates the verification request
create or replace function public.request_sms_verification()
returns public.sms_verification_requests
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  a     public.applicants;
  r     public.sms_verification_requests;
  v_n   integer;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if public.is_admin() then
    raise exception 'Administrator accounts cannot submit applications' using errcode = '42501';
  end if;

  select * into a from public.applicants where user_id = v_uid for update;
  if not found then
    raise exception 'Complete your registration details first' using errcode = '55000';
  end if;
  if a.status not in ('pending_registration', 'rejected', 'expired') then
    raise exception 'A verification request already exists for your application (status: %)', a.status
      using errcode = '55000';
  end if;

  select coalesce(max(attempt_no), 0) + 1 into v_n
    from public.sms_verification_requests where applicant_id = a.id;

  insert into public.sms_verification_requests (applicant_id, user_id, attempt_no, phone_number)
  values (a.id, v_uid, v_n, a.phone_number)
  returning * into r;

  update public.applicants set status = 'pending_admin_action', details_confirmed_at = now() where id = a.id;

  perform public._log_event(r, null, 'pending_admin_action', v_uid, 'applicant', 'Application submitted');
  perform public._audit(v_uid, 'applicant', 'verification_requested', 'sms_verification_request', r.id, a.id, r.id,
                        jsonb_build_object('attempt_no', v_n));
  perform public._notify('admin', null, a.id, r.id, 'verification_requested',
                         'New application submitted',
                         format('%s (%s) has submitted an application and is waiting for verification.', a.full_name, a.applicant_ref));
  return r;
end $$;

-- 9.3  Administrator: mark the verification SMS as sent.
--      The administrator has ALREADY sent the SMS by their own external process. This function sends
--      nothing and generates no message: it records who confirmed it and when, and moves the
--      application to "Awaiting SMS Verification" (status sms_sent).
create or replace function public.admin_mark_sms_sent(p_request_id uuid)
returns public.sms_verification_requests
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  r       public.sms_verification_requests;
  a       public.applicants;
begin
  if v_admin is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select * into r from public.sms_verification_requests where id = p_request_id for update;
  if not found then raise exception 'Verification request not found' using errcode = 'P0002'; end if;
  if r.user_id = v_admin then
    raise exception 'Administrators cannot review their own application' using errcode = '42501';
  end if;
  if r.status <> 'pending_admin_action' then
    raise exception 'This application is already %, so the SMS cannot be marked as sent again', r.status
      using errcode = '55000';
  end if;
  select * into a from public.applicants where id = r.applicant_id for update;

  update public.sms_verification_requests
     set status = 'sms_sent', sms_sent_at = now(), sms_sent_by = v_admin
   where id = r.id
  returning * into r;
  update public.applicants set status = 'sms_sent' where id = a.id;

  perform public._log_event(r, 'pending_admin_action', 'sms_sent', v_admin, 'admin', 'Administrator marked the SMS as sent');
  perform public._audit(v_admin, 'admin', 'sms_marked_sent', 'sms_verification_request', r.id, a.id, r.id,
                        jsonb_build_object('phone_number', r.phone_number));
  perform public._notify('applicant', r.user_id, a.id, r.id, 'sms_sent',
                         'SMS verification required',
                         format('A verification message has been sent to your registered phone number ending in %s. Open your application, paste the complete SMS and submit it for verification.',
                                right(r.phone_number, 4)));
  return r;
end $$;

-- 9.4  Applicant: submit the SMS text they received. Allowed only while the application is
--      "Awaiting SMS Verification"; a second click or a replay fails because the status has moved on.
create or replace function public.submit_sms_verification(p_request_id uuid, p_message text)
returns public.sms_submissions
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  r     public.sms_verification_requests;
  s     public.sms_submissions;
  v_n   integer;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;

  -- Only the owner can see/lock the request; anyone else gets "not found".
  select * into r from public.sms_verification_requests where id = p_request_id and user_id = v_uid for update;
  if not found then raise exception 'Verification request not found' using errcode = 'P0002'; end if;

  if r.status <> 'sms_sent' then
    raise exception 'A message can only be submitted while the application is awaiting SMS verification (current status: %)', r.status
      using errcode = '55000';
  end if;
  if char_length(btrim(coalesce(p_message, ''))) = 0 then
    raise exception 'Paste the complete SMS message before submitting' using errcode = '22023';
  end if;
  if char_length(p_message) > 2000 then
    raise exception 'The message is too long' using errcode = '22023';
  end if;

  select coalesce(max(submission_no), 0) + 1 into v_n from public.sms_submissions where request_id = r.id;

  insert into public.sms_submissions (request_id, applicant_id, user_id, submission_no, submitted_message)
  values (r.id, r.applicant_id, v_uid, v_n, p_message)
  returning * into s;

  update public.sms_verification_requests
     set status = 'pending_admin_validation', submitted_at = s.submitted_at where id = r.id;
  update public.applicants set status = 'pending_admin_validation' where id = r.applicant_id;

  perform public._log_event(r, 'sms_sent', 'pending_admin_validation', v_uid, 'applicant', 'SMS message submitted');
  perform public._audit(v_uid, 'applicant', 'sms_submitted', 'sms_submission', s.id, r.applicant_id, r.id,
                        jsonb_build_object('submission_no', v_n));
  perform public._notify('admin', null, r.applicant_id, r.id, 'sms_submitted',
                         'Verification submitted for review',
                         format('%s has submitted an SMS message for review.',
                                (select full_name from public.applicants where id = r.applicant_id)));
  return s;
end $$;

-- 9.5  Administrator: approve the submitted message.
create or replace function public.admin_approve_verification(p_request_id uuid)
returns public.verification_decisions
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  r       public.sms_verification_requests;
  d       public.verification_decisions;
begin
  if v_admin is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select * into r from public.sms_verification_requests where id = p_request_id for update;
  if not found then raise exception 'Verification request not found' using errcode = 'P0002'; end if;
  if r.user_id = v_admin then
    raise exception 'Administrators cannot review their own application' using errcode = '42501';
  end if;
  if r.status <> 'pending_admin_validation' then
    raise exception 'This application is % and cannot be approved', r.status using errcode = '55000';
  end if;
  if not exists (select 1 from public.sms_submissions where request_id = r.id) then
    raise exception 'No submitted message was found for this application' using errcode = '55000';
  end if;

  insert into public.verification_decisions (request_id, applicant_id, user_id, decision, decided_by)
  values (r.id, r.applicant_id, r.user_id, 'approved', v_admin)
  returning * into d;

  update public.sms_verification_requests set status = 'approved', decided_at = d.decided_at where id = r.id;
  update public.applicants set status = 'approved', approved_at = d.decided_at where id = r.applicant_id;

  perform public._log_event(r, 'pending_admin_validation', 'approved', v_admin, 'admin', 'Application approved');
  perform public._audit(v_admin, 'admin', 'verification_approved', 'verification_decision', d.id, r.applicant_id, r.id, '{}'::jsonb);
  perform public._notify('applicant', r.user_id, r.applicant_id, r.id, 'verification_approved',
                         'Application approved',
                         'Your phone number is verified and your application has been approved.');
  return d;
end $$;

-- 9.6  Administrator: reject (reason required)
create or replace function public.admin_reject_verification(p_request_id uuid, p_reason text)
returns public.verification_decisions
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_admin  uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  r        public.sms_verification_requests;
  d        public.verification_decisions;
begin
  if v_admin is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if char_length(v_reason) < 5 then
    raise exception 'Enter a rejection reason (at least 5 characters)' using errcode = '22023';
  end if;

  select * into r from public.sms_verification_requests where id = p_request_id for update;
  if not found then raise exception 'Verification request not found' using errcode = 'P0002'; end if;
  if r.user_id = v_admin then
    raise exception 'Administrators cannot review their own application' using errcode = '42501';
  end if;
  if r.status <> 'pending_admin_validation' then
    raise exception 'This application is % and cannot be rejected', r.status using errcode = '55000';
  end if;

  insert into public.verification_decisions (request_id, applicant_id, user_id, decision, reason, decided_by)
  values (r.id, r.applicant_id, r.user_id, 'rejected', v_reason, v_admin)
  returning * into d;

  update public.sms_verification_requests set status = 'rejected', decided_at = d.decided_at where id = r.id;
  update public.applicants set status = 'rejected' where id = r.applicant_id;

  perform public._log_event(r, 'pending_admin_validation', 'rejected', v_admin, 'admin', v_reason);
  perform public._audit(v_admin, 'admin', 'verification_rejected', 'verification_decision', d.id, r.applicant_id, r.id,
                        jsonb_build_object('reason', v_reason));
  perform public._notify('applicant', r.user_id, r.applicant_id, r.id, 'verification_rejected',
                         'Application rejected',
                         'Reason: ' || rtrim(v_reason, '.!? ') || '. You can update your details and submit again.');
  return d;
end $$;

-- 9.7  Administrator: ask the applicant to submit the SMS message again (reason required).
--      The application returns to "Awaiting SMS Verification"; earlier submissions are kept.
create or replace function public.admin_request_resubmission(p_request_id uuid, p_reason text)
returns public.sms_verification_requests
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_admin  uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  r        public.sms_verification_requests;
begin
  if v_admin is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if char_length(v_reason) < 5 then
    raise exception 'Explain what the applicant should correct (at least 5 characters)' using errcode = '22023';
  end if;

  select * into r from public.sms_verification_requests where id = p_request_id for update;
  if not found then raise exception 'Verification request not found' using errcode = 'P0002'; end if;
  if r.user_id = v_admin then
    raise exception 'Administrators cannot review their own application' using errcode = '42501';
  end if;
  if r.status <> 'pending_admin_validation' then
    raise exception 'This application is % and a resubmission cannot be requested', r.status using errcode = '55000';
  end if;

  update public.sms_verification_requests set status = 'sms_sent', submitted_at = null where id = r.id returning * into r;
  update public.applicants set status = 'sms_sent' where id = r.applicant_id;

  perform public._log_event(r, 'pending_admin_validation', 'sms_sent', v_admin, 'admin', v_reason);
  perform public._audit(v_admin, 'admin', 'resubmission_requested', 'sms_verification_request', r.id, r.applicant_id, r.id,
                        jsonb_build_object('reason', v_reason));
  perform public._notify('applicant', r.user_id, r.applicant_id, r.id, 'resubmission_requested',
                         'Resubmission requested',
                         'Reason: ' || rtrim(v_reason, '.!? ') || '. Open your application and submit the complete SMS message again.');
  return r;
end $$;


-- 9.8  Notifications: mark as read (browser cannot UPDATE the table directly)
create or replace function public.mark_notification_read(p_id uuid)
returns void
language sql security definer
set search_path = public, pg_temp
as $$
  update public.notifications n set read_at = now()
   where n.id = p_id and n.read_at is null
     and ((n.recipient_role = 'applicant' and n.recipient_user_id = auth.uid())
          or (n.recipient_role = 'admin' and public.is_admin()));
$$;

create or replace function public.mark_all_notifications_read()
returns void
language sql security definer
set search_path = public, pg_temp
as $$
  update public.notifications n set read_at = now()
   where n.read_at is null
     and ((n.recipient_role = 'applicant' and n.recipient_user_id = auth.uid())
          or (n.recipient_role = 'admin' and public.is_admin()));
$$;

-- 9.9  Promote a user to administrator. NOT callable from the browser (see grants below);
--      run it from the SQL Editor:   select public.grant_admin_role('admin@example.com');
create or replace function public.grant_admin_role(p_email text)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_id is null then
    raise exception 'No auth user with email %. Create the user first (Authentication -> Users).', p_email;
  end if;
  insert into public.profiles (id, email, role) values (v_id, lower(btrim(p_email)), 'admin')
  on conflict (id) do update set role = 'admin';
  perform public._audit(null, 'system', 'admin_role_granted', 'profile', v_id, null, null,
                        jsonb_build_object('email', lower(btrim(p_email))));
  return 'Administrator role granted to ' || lower(btrim(p_email));
end $$;


-- -----------------------------------------------------------------------------
-- 10. Row Level Security  (read-only for browsers; writes only via functions above)
-- -----------------------------------------------------------------------------
alter table public.profiles                enable row level security;
alter table public.applicants              enable row level security;
alter table public.sms_verification_requests enable row level security;
alter table public.sms_submissions         enable row level security;
alter table public.verification_decisions  enable row level security;
alter table public.request_events          enable row level security;
alter table public.notifications           enable row level security;
alter table public.audit_logs              enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists applicants_select on public.applicants;
create policy applicants_select on public.applicants for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists requests_select on public.sms_verification_requests;
create policy requests_select on public.sms_verification_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists submissions_select on public.sms_submissions;
create policy submissions_select on public.sms_submissions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists decisions_select on public.verification_decisions;
create policy decisions_select on public.verification_decisions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists events_select on public.request_events;
create policy events_select on public.request_events for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using ((recipient_role = 'applicant' and recipient_user_id = auth.uid())
         or (recipient_role = 'admin' and public.is_admin()));

drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select to authenticated
  using (public.is_admin());


-- -----------------------------------------------------------------------------
-- 11. Privileges (Supabase grants broad defaults; tighten them for OUR tables only)
-- -----------------------------------------------------------------------------
revoke all on public.profiles, public.applicants, public.sms_verification_requests,
              public.sms_submissions, public.verification_decisions,
              public.request_events, public.notifications, public.audit_logs
  from public, anon, authenticated;

grant select on public.profiles, public.applicants, public.sms_verification_requests,
                public.sms_submissions, public.verification_decisions,
                public.request_events, public.notifications, public.audit_logs
  to authenticated;

revoke all on sequence public.applicant_ref_seq from public, anon, authenticated;

-- Functions: nothing is executable by default; open only the browser-facing RPCs.
revoke all on function
  public.is_admin(), public.touch_updated_at(), public._status_transition_allowed(text, text, text),
  public._guard_request_status(), public._guard_applicant_status(),
  public._log_event(public.sms_verification_requests, text, text, uuid, text, text),
  public._audit(uuid, text, text, text, uuid, uuid, uuid, jsonb),
  public._notify(text, uuid, uuid, uuid, text, text, text),
  public._normalize_ug_phone(text),
  public._upsert_applicant(uuid, text, text, date, text, text, text, text),
  public.handle_new_user(),
  public.save_registration(text, date, text, text, text, text),
  public.request_sms_verification(),
  public.admin_mark_sms_sent(uuid),
  public.submit_sms_verification(uuid, text),
  public.admin_approve_verification(uuid),
  public.admin_reject_verification(uuid, text),
  public.admin_request_resubmission(uuid, text),
  public.mark_notification_read(uuid),
  public.mark_all_notifications_read(),
  public.grant_admin_role(text)
from public, anon, authenticated;

grant execute on function
  public.is_admin(),
  public.save_registration(text, date, text, text, text, text),
  public.request_sms_verification(),
  public.admin_mark_sms_sent(uuid),
  public.submit_sms_verification(uuid, text),
  public.admin_approve_verification(uuid),
  public.admin_reject_verification(uuid, text),
  public.admin_request_resubmission(uuid, text),
  public.mark_notification_read(uuid),
  public.mark_all_notifications_read()
to authenticated;
-- (grant_admin_role and every function starting with "_" stay unexecutable from the browser.)


-- -----------------------------------------------------------------------------
-- 12. Realtime (dashboard + notification updates)
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['notifications', 'sms_verification_requests', 'applicants'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;   -- already published
      end;
    end loop;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 13. Creating an administrator (no password is stored in this file)
-- -----------------------------------------------------------------------------
--   1. Dashboard -> Authentication -> Users -> "Add user" -> "Create new user".
--      Enter your admin e-mail and a strong password, tick "Auto Confirm User".
--   2. Run in the SQL Editor (replace the e-mail):
--
--        select public.grant_admin_role('your-admin@example.com');
--
--   3. Sign in at  /admin/login  in the app.
--
--   To remove admin rights:  update public.profiles set role = 'applicant' where email = '...';
-- =============================================================================
