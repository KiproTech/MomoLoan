"""Database tests for the MoMo Loan workflow (RLS, privileges, state machine, manual SMS flow).

Needs a PostgreSQL server. By default an embedded one is started with `pip install pgserver psycopg2-binary`.
Set DATABASE_URL to use your own throw-away database instead. NEVER point this at a real project:
it truncates auth.users.

    python tests/db/run.py                 # fresh install, then re-run (idempotency)
    python tests/db/run.py --legacy FILE   # install FILE first, then upgrade with the current schema
"""
import json, os, pathlib, sys, tempfile, uuid
import psycopg2, psycopg2.errors

HERE = pathlib.Path(__file__).parent
SCHEMA = HERE.parent.parent / 'supabase' / 'momo_loan_supabase.sql'

if os.environ.get('DATABASE_URL'):
    URI = os.environ['DATABASE_URL']
else:
    import pgserver
    URI = pgserver.get_server(tempfile.mkdtemp(prefix='momo_pg_')).get_uri()

conn = psycopg2.connect(URI); conn.autocommit = True
cur = conn.cursor()
passed = failed = 0

def check(name, cond, extra=''):
    global passed, failed
    if cond: passed += 1; print(f'  PASS  {name}')
    else: failed += 1; print(f'  FAIL  {name} {extra}')

def as_user(uid, role='authenticated'):
    cur.execute('reset role'); cur.execute("select set_config('request.jwt.claim.sub', %s, false)", (str(uid) if uid else '',))
    cur.execute(f'set role {role}')
def as_pg(): cur.execute('reset role')
def q(sql, args=None):
    cur.execute(sql, args)
    try: return cur.fetchall()
    except psycopg2.ProgrammingError: return None
def fails(sql, args=None, contains=None):
    try:
        cur.execute(sql, args)
        try: cur.fetchall()
        except psycopg2.ProgrammingError: pass
        return False
    except psycopg2.Error as e:
        return contains is None or contains.lower() in str(e).lower()

# ---- environment stub that mimics Supabase (auth schema, roles) + schema install -------------------------------
cur.execute((HERE / 'setup.sql').read_text())
if '--legacy' in sys.argv:
    print('Installing the legacy schema first, then upgrading'); cur.execute(pathlib.Path(sys.argv[sys.argv.index('--legacy') + 1]).read_text())
print('Applying supabase/momo_loan_supabase.sql'); cur.execute(SCHEMA.read_text())
print('Applying it a second time (idempotency)'); cur.execute(SCHEMA.read_text())

meta = lambda name, phone: json.dumps({'full_name': name, 'date_of_birth': '1995-04-12', 'phone_number': phone, 'district': 'Kampala', 'address': 'Plot 5 Ntinda Road'})
q('truncate auth.users cascade')
A, B, ADM, ADM2 = (uuid.uuid4() for _ in range(4))
q("insert into auth.users(id,email,raw_user_meta_data) values (%s,'amina@example.com',%s)", (str(A), meta('Amina Nakato', '0772 123 456')))
q("insert into auth.users(id,email,raw_user_meta_data) values (%s,'bob@example.com',%s)", (str(B), meta('Bob Okello', '+256 782 111 222')))
q("insert into auth.users(id,email) values (%s,'admin@example.com')", (str(ADM),))
q("insert into auth.users(id,email) values (%s,'admin2@example.com')", (str(ADM2),))
q("select public.grant_admin_role('admin@example.com')"); q("select public.grant_admin_role('admin2@example.com')")

print('Sign-up and roles')
check('profiles created', q('select count(*) from public.profiles')[0][0] == 4)
check('draft application created from sign-up details', q('select status from public.applicants where user_id=%s', (str(A),))[0][0] == 'pending_registration')
check('phone normalised', q('select phone_number from public.applicants where user_id=%s', (str(A),))[0][0] == '+256772123456')
C = uuid.uuid4(); q("insert into auth.users(id,email,raw_user_meta_data) values (%s,'evil@example.com','{\"role\":\"admin\"}')", (str(C),))
check('role in sign-up metadata is ignored', q('select role from public.profiles where id=%s', (str(C),))[0][0] == 'applicant')
as_user(A)
check('applicant cannot change own role', fails("update public.profiles set role='admin'", contains='permission denied'))
check('applicant cannot call grant_admin_role', fails("select public.grant_admin_role('amina@example.com')", contains='permission denied'))
check('applicant sees only own profile', q('select count(*) from public.profiles')[0][0] == 1)
as_user(ADM)
check('administrator cannot create an application', fails("select public.save_registration('Ad Min','1990-01-01','0772000111','Kampala','Somewhere')", contains='Administrator accounts'))

print('Applicant submits the application')
as_user(A)
check('invalid phone rejected', fails("select public.save_registration('Amina N','1995-04-12','+254700000000','Kampala','Ntinda')", contains='Ugandan phone'))
check('under-18 rejected', fails("select public.save_registration('Amina N','2015-01-01','0772123456','Kampala','Ntinda')", contains='18'))
REQ = q('select id from public.request_sms_verification()')[0][0]
check('applicant status is pending_admin_action', q('select status from public.applicants')[0][0] == 'pending_admin_action')
check('duplicate submit blocked', fails('select public.request_sms_verification()', contains='already exists'))
check('details locked while in review', fails("select public.save_registration('Amina N','1995-04-12','0772123456','Kampala','New')", contains='no longer be edited'))
as_pg()
check('administrators notified', q("select count(*) from public.notifications where recipient_role='admin' and type='verification_requested'")[0][0] == 1)

print('Authorization before the SMS is marked as sent')
as_user(B)
check('B cannot see A application', q('select count(*) from public.sms_verification_requests')[0][0] == 0)
check('B cannot mark A SMS as sent', fails('select public.admin_mark_sms_sent(%s)', (REQ,), contains='Administrator access'))
check('B cannot submit for A', fails("select public.submit_sms_verification(%s,'x')", (REQ,), contains='not found'))
as_user(A)
check('A cannot mark own SMS as sent', fails('select public.admin_mark_sms_sent(%s)', (REQ,), contains='Administrator access'))
check('A cannot submit before the SMS is marked as sent', fails("select public.submit_sms_verification(%s,'MoMo: hello')", (REQ,), contains='awaiting SMS verification'))
check('A cannot approve', fails('select public.admin_approve_verification(%s)', (REQ,), contains='Administrator access'))
check('A cannot write requests directly', fails("update public.sms_verification_requests set status='approved'", contains='permission denied'))
check('A cannot write applicants directly', fails("update public.applicants set status='approved'", contains='permission denied'))
as_user(None, 'anon')
check('anon cannot read applicants', fails('select * from public.applicants', contains='permission denied'))
check('anon cannot call mark RPC', fails('select public.admin_mark_sms_sent(%s)', (REQ,), contains='permission denied'))

print('Administrator marks the SMS as sent')
as_user(ADM)
check('admin sees the request', q('select count(*) from public.sms_verification_requests')[0][0] == 1)
r = q('select status, sms_sent_at, sms_sent_by from public.admin_mark_sms_sent(%s)', (REQ,))[0]
check('request is now sms_sent with timestamp and admin recorded', r[0] == 'sms_sent' and r[1] is not None and str(r[2]) == str(ADM))
check('applicant status is sms_sent', q('select status from public.applicants where user_id=%s', (str(A),))[0][0] == 'sms_sent')
check('second click blocked (no duplicate)', fails('select public.admin_mark_sms_sent(%s)', (REQ,), contains='already'))
check('no SMS text was generated or stored', q("select count(*) from information_schema.tables where table_schema='public' and table_name='simulated_sms_messages'")[0][0] == 0)
as_user(A)
n = q("select title, body from public.notifications where type='sms_sent'")
check('applicant notified with last 4 digits', len(n) == 1 and '3456' in n[0][1] and n[0][0] == 'SMS verification required', n)
as_user(B)
check('B receives no notification', q('select count(*) from public.notifications')[0][0] == 0)

print('Applicant submits the message')
as_user(A)
check('empty message rejected', fails("select public.submit_sms_verification(%s,'   ')", (REQ,), contains='Paste'))
check('oversized message rejected', fails("select public.submit_sms_verification(%s,%s)", (REQ, 'x' * 2001), contains='too long'))
SMS1 = 'MoMo Loan: code 482913. Reply with this complete message.'
s = q('select submission_no, submitted_message from public.submit_sms_verification(%s,%s)', (REQ, SMS1))[0]
check('submission stored exactly as pasted', s == (1, SMS1))
check('status is pending_admin_validation', q('select status from public.applicants')[0][0] == 'pending_admin_validation')
check('duplicate submission blocked', fails("select public.submit_sms_verification(%s,'again')", (REQ,), contains='awaiting SMS verification'))
as_user(B)
check('B cannot read A submissions', q('select count(*) from public.sms_submissions')[0][0] == 0)
as_user(ADM)
check('admin reads the submission', q('select submitted_message from public.sms_submissions')[0][0] == SMS1)
check('admin notified of the submission', q("select count(*) from public.notifications where type='sms_submitted'")[0][0] == 1)

print('Resubmission requested by the administrator')
check('reason required', fails("select public.admin_request_resubmission(%s,'no')", (REQ,), contains='at least 5'))
as_user(A)
check('applicant cannot request resubmission', fails("select public.admin_request_resubmission(%s,'please redo it')", (REQ,), contains='Administrator access'))
as_user(ADM)
check('resubmission requested', q("select status from public.admin_request_resubmission(%s,'The pasted text was cut off.')", (REQ,))[0][0] == 'sms_sent')
as_user(A)
check('applicant back to sms_sent and notified', q('select status from public.applicants')[0][0] == 'sms_sent' and q("select count(*) from public.notifications where type='resubmission_requested'")[0][0] == 1)
check('reason visible in applicant history', q("select count(*) from public.request_events where note like '%cut off%'")[0][0] == 1)
check('notification text has no doubled full stop', '..' not in q("select body from public.notifications where type='resubmission_requested'")[0][0])
s = q('select submission_no from public.submit_sms_verification(%s,%s)', (REQ, SMS1 + ' Full.'))[0]
check('second submission is #2 and first one is kept', s[0] == 2 and q('select count(*) from public.sms_submissions')[0][0] == 2)

print('Decision')
as_user(ADM)
check('rejection needs a reason', fails("select public.admin_reject_verification(%s,'  ')", (REQ,), contains='at least 5'))
check('approve works', q('select decision from public.admin_approve_verification(%s)', (REQ,))[0][0] == 'approved')
check('repeat approval blocked', fails('select public.admin_approve_verification(%s)', (REQ,), contains='cannot be approved'))
check('reject after approval blocked', fails("select public.admin_reject_verification(%s,'changed my mind')", (REQ,), contains='cannot be rejected'))
as_user(A)
check('applicant approved and notified', q('select status from public.applicants')[0][0] == 'approved' and q("select count(*) from public.notifications where type='verification_approved'")[0][0] == 1)
check('applicant cannot edit after approval', fails("select public.save_registration('Amina N','1995-04-12','0772123456','Kampala','New')", contains='no longer be edited'))

print('Rejection and a new attempt (applicant B)')
as_user(B)
RB = q('select id from public.request_sms_verification()')[0][0]
as_user(ADM2); q('select public.admin_mark_sms_sent(%s)', (RB,))
as_user(B); q("select public.submit_sms_verification(%s,'MoMo Loan: wrong text')", (RB,))
as_user(ADM2)
check('reject with reason', q("select decision from public.admin_reject_verification(%s,'Message does not match what was sent')", (RB,))[0][0] == 'rejected')
as_user(B)
check('applicant sees the reason', q('select reason from public.verification_decisions')[0][0].startswith('Message does not match'))
RB2 = q('select id from public.request_sms_verification()')[0][0]
check('new attempt is attempt 2', q('select attempt_no from public.sms_verification_requests where id=%s', (RB2,))[0][0] == 2)

print('Administrators cannot review their own application')
# make admin2 an applicant by inserting data as postgres, then try to review it as that admin
as_pg()
X = uuid.uuid4(); q("insert into auth.users(id,email,raw_user_meta_data) values (%s,'both@example.com',%s)", (str(X), meta('Both Roles', '0772000333')))
as_user(X); RX = q('select id from public.request_sms_verification()')[0][0]
as_pg(); q("select public.grant_admin_role('both@example.com')")
as_user(X)
check('self mark-as-sent blocked', fails('select public.admin_mark_sms_sent(%s)', (RX,), contains='own application'))

print('Audit log and history')
as_user(A)
check('applicant cannot read the audit log', q('select count(*) from public.audit_logs')[0][0] == 0)
as_user(ADM)
acts = {r[0] for r in q('select action from public.audit_logs')}
check('audit log has the new actions', {'verification_requested', 'sms_marked_sent', 'sms_submitted', 'resubmission_requested', 'verification_approved', 'verification_rejected'} <= acts, acts)
check('history has timestamps for each change', q('select count(*) from public.request_events where request_id=%s', (REQ,))[0][0] == 6)
check('admin cannot write audit log directly', fails("insert into public.audit_logs(actor_role,action,entity_type) values ('admin','x','y')", contains='permission denied'))

as_pg()
print(f'\n{passed} passed, {failed} failed')
sys.exit(1 if failed else 0)
