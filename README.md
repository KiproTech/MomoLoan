# MoMo Loan

A loan application and verification platform built with React (Vite) and Supabase. Applicants register, submit an
application and verify their phone number with an SMS; administrators review applications, confirm the SMS was sent,
and approve or reject the submitted message.

There are two separate portals:

| Portal | Address | Who |
| --- | --- | --- |
| Public site | `/` (always the landing page), `/login`, `/register` | Everyone |
| Applicant | `/dashboard`, `/application`, `/history`, `/profile` | Signed-in applicants |
| Administrator | `/admin/login`, `/admin`, `/admin/applications`, `/admin/activity`, `/admin/account` | Administrators only (not linked from any public page) |

## The SMS verification workflow

The application **never sends an SMS** and has no SMS gateway. An administrator sends the SMS by their own external
process and records that fact in the app.

1. The applicant registers, reviews their details and submits the application. Status: **Pending Review**.
2. An administrator opens the application and sends the SMS to the applicant's registered number outside the app.
3. The administrator presses **Mark SMS as Sent** (with a confirmation). The time and administrator are recorded, the
   status becomes **Awaiting SMS Verification**, and the applicant is notified.
4. The applicant copies the SMS from their phone, pastes the complete text and presses **Submit for Verification**.
   Status: **Verification Submitted**. The form exists only in the *Awaiting SMS Verification* status.
5. The administrator reviews the submitted text and chooses **Approve**, **Reject** (reason required) or
   **Request resubmission** (reason required, returns the application to *Awaiting SMS Verification*).
6. The applicant sees the outcome, any reason given, and a timeline. A rejected applicant can update their details and
   submit again.

## Requirements

* Node.js 20 or newer
* A Supabase project (the free tier is enough)

## Setup

```bash
npm install
cp .env.example .env        # then edit .env
```

Set the two values in `.env` from Supabase, **Project Settings, API**:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_PUBLIC_KEY
```

Use only the public anon / publishable key. The service-role key is never needed and must never be placed in this
project. Vite reads `.env` at start-up, so restart `npm run dev` after editing it.

### Database

1. Supabase Dashboard, **SQL Editor**, **New query**.
2. Paste the whole of `supabase/momo_loan_supabase.sql` and click **Run**.

The file is safe to run again. On a project that already has an earlier version it upgrades in place: it replaces the
workflow functions, adds the new columns and removes the old generated-message table (`simulated_sms_messages`) and
its function, which are no longer used.

Then, under **Authentication, Providers, Email**, choose whether **Confirm email** is on. Both settings work. For quick
local testing you can turn it off.

### Create an administrator

Administrators are created only from the database, never from the app:

1. Authentication, Users, **Add user** (email and password; tick *Auto Confirm User*).
2. In the SQL Editor run: `select public.grant_admin_role('your-admin@example.com');`
3. Sign in at `/admin/login`.

To remove access: `update public.profiles set role = 'applicant' where email = 'your-admin@example.com';`

### Run

```bash
npm run dev       # development server
npm run build     # production build in dist/
npm run preview   # serve the production build
npm test          # front-end tests
npm run lint
```

Deploying to Vercel or similar: set the two `VITE_` variables in the host's settings. `vercel.json` already rewrites
all routes to `index.html` so direct links such as `/admin/login` work.

## Applicant and administrator in two tabs of one browser

You can be signed in as an applicant in one tab and as an administrator in another tab of the same browser, and
signing out of one does not sign out the other.

**Why it used to fail.** Supabase keeps the login in `localStorage`, which every tab of a browser shares. One client
meant one stored session, so a second sign-in replaced the first. In addition, `signOut()` defaults to *global* scope,
which revokes every session of that account on the server.

**What it does now.**

* There are two Supabase clients, one per portal, each with its own storage key (`momo-loan-applicant-auth` and
  `momo-loan-admin-auth`). supabase-js derives its internal lock and cross-tab sync from that key, so the two clients
  share no state at all: they are genuinely independent sessions, not one session with renamed keys.
* The portal is chosen from the address: everything under `/admin` uses the administrator client, everything else the
  applicant client (`src/lib/supabase.js`). The auth provider is remounted when the address crosses between portals.
* Sign-out uses `scope: 'local'`, so it ends only this browser's session for that portal.
* An account that does not belong to a portal is refused there: an administrator account entering the applicant
  sign-in, or an applicant account entering the administrator sign-in, is signed straight back out and told why.
* A session that ends without the user asking (expired refresh token, revoked, signed out in another tab of the same
  portal) sends the user to sign in with the message "Your session has ended".
* Roles are never taken from the browser. The role is read from `public.profiles` (read-only for browsers) and every
  administrator read and action is checked again in the database (see Security model).

**Trade-offs, stated plainly.**

* Two tabs of the *same* portal share that portal's session. Signing out in one signs out the other.
* One account cannot be both: an administrator account cannot be used to look at the applicant portal. Use a second,
  applicant account for that.
* The browser profile is the unit of identity. Anyone who opens `/admin` in a browser that holds an administrator
  session is that administrator, exactly as with any website login.
* Sessions live in `localStorage` (the Supabase default), not in HttpOnly cookies. The mitigations are the
  Content-Security-Policy in `vercel.json` (scripts only from your own origin), no secrets in the front end, and
  database-side authorization, so a stolen or edited browser value cannot grant administrator rights.

## Security model

* **Row Level Security is on for every table.** Browsers have `SELECT` only, and only through RLS policies. An
  applicant can read only their own rows; administrators can read all. Anonymous users can read nothing.
* **All writes happen in `SECURITY DEFINER` functions** that check the caller (`auth.uid()`), their role and the current
  status, and lock the row. A status trigger enforces the allowed transitions, so a repeat click or a replayed request
  fails instead of acting twice.
* **Administrator roles are verified by the database**, not by the browser. The React route guards only decide what to
  render; calling the database directly as an applicant is refused (see the tests below).
* Applicants cannot approve anything. Administrators cannot review their own application or submit one.
* Roles cannot be changed from the browser, and a `role` value in sign-up metadata is ignored.
* Unexpected database errors are replaced with a generic message in the interface; internals are not shown.
* Only the public anon key is used in the front end. `vercel.json` adds a Content-Security-Policy and other security
  headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`).

## Statuses

Draft, Pending Review, Awaiting SMS Verification, Verification Submitted, Approved, Rejected (and Expired, which only
exists for rows created by an earlier version). "Additional information required" is covered by *Request resubmission*:
the application returns to Awaiting SMS Verification with the administrator's reason. There is no *Disbursed* status
because the project has no payment or disbursement workflow, and none was invented.

## Project structure

```
src/
  components/   layouts (public, applicant, admin), responsive header, route guards, shared UI, dialog, notifications
  context/      AuthContext (portal-aware session + role), ToastContext
  hooks/        data loading and realtime subscriptions
  lib/          supabase clients + error mapping, status vocabulary, validation, formatting
  pages/
    public/     Landing, Login, Register, AdminLogin
    applicant/  Dashboard, Application (status + SMS verification), History, Profile
    admin/      Overview, Applications, ApplicationDetail, Activity, Account
  test/         Vitest tests
supabase/       momo_loan_supabase.sql  (schema, RLS, functions; safe to re-run)
tests/db/       database tests (run.py)
tests/e2e/      two-tab browser acceptance test (acceptance.py)
```

## Tests

| Command | What it covers | Needs |
| --- | --- | --- |
| `npm test` | 77 front-end tests: landing is always public, guards, portal-aware auth, applicant journey per status, dashboard / history / profile, administrator actions and dialogs, validation, error mapping | nothing |
| `npm run test:db` | 60 database checks on a throw-away PostgreSQL: RLS, privileges, the manual-SMS workflow, resubmission, duplicate and out-of-order actions, self-review, upgrade from the earlier schema | `pip install pgserver psycopg2-binary` |
| `npm run test:e2e` | 11 browser scenarios with the real `supabase-js` in Chromium: applicant and administrator in two tabs, independent sign-out, local-scope logout, expired session, storage tampering, wrong-portal sign-in, CSP | `pip install playwright`, see the file header |

None of these talks to your real Supabase project. `test:db` runs against a local PostgreSQL with a stand-in for
Supabase's `auth` schema, and `test:e2e` fakes only the network. Run the manual checklist below once against your own
project.

## Manual test checklist (against your Supabase project)

1. **Landing.** Open `/` signed out: the landing page appears. Sign in as an applicant and open `/` again: still the
   landing page, with a "My dashboard" button. Do the same with an administrator session present: still the landing page.
2. **Two tabs.** Tab 1: sign in at `/login` as an applicant and open the dashboard. Tab 2 (same browser): open
   `/admin/login` and sign in as an administrator. Reload both tabs: each keeps its own account. Sign out in tab 2 and
   reload tab 1: the applicant is still signed in. Sign in as the administrator again, sign out in tab 1, reload tab 2:
   the administrator is still signed in.
3. **Wrong portal.** Enter the administrator's credentials at `/login`: refused with "These credentials cannot be used
   on this page." Enter an applicant's at `/admin/login`: refused with "This account does not have administrator access."
4. **Direct URLs.** Signed out, open `/admin`, `/admin/applications/anything`, `/dashboard`, `/profile`: each goes to
   the right sign-in. Refresh on `/history` and `/admin/applications`: the page reloads correctly.
5. **Storage tampering.** As an applicant, in dev tools copy the value of `momo-loan-applicant-auth` into
   `momo-loan-admin-auth` and open `/admin`: you are sent to the administrator sign-in.
6. **SMS workflow.** Register, submit; as administrator press *Mark SMS as Sent*; as the applicant paste a message and
   submit; as administrator approve, or reject with a reason, or request a resubmission.
7. **Expiry.** In Supabase, Authentication, Sessions (or by revoking the user's sessions), end the applicant session and
   reload: you land on sign-in with "Your session has ended".
8. **Mobile.** Open the site at phone width: the hamburger menu works, tables turn into cards, nothing scrolls sideways.

## Deployment (Vercel)

The existing `vercel.json` rewrites every path to `index.html`, so direct links and refreshes on nested routes work, and
it now also sets security headers. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (and optionally
`VITE_SUPPORT_EMAIL` / `VITE_SUPPORT_PHONE`) in the project's environment settings and redeploy. If you use a custom
Supabase domain, add it to `connect-src` in the Content-Security-Policy. On other hosts, configure the same rewrite
and headers.

## Still needs you

* Your Supabase project: run the SQL, set the two environment variables, create an administrator.
* Decide whether "Confirm email" is on (both settings work). Password change may need a recent sign-in depending on your
  Supabase Auth settings.
* Optional support email and phone for the landing page. Nothing is shown unless you set them.
* Add your Supabase domain to the CSP if you do not use the standard `*.supabase.co`.
* Run the manual checklist above, and test on real phones.

## Brand colours

Sampled from the logo file: yellow `#FCCA0A` and blue `#044669`. All other neutrals are mixed from these two (see the
top of `src/index.css`).
