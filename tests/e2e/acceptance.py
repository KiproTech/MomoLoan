"""Browser acceptance test: applicant and administrator in two tabs of ONE browser, plus guards, expiry, CSP.

It drives the real production build with the real supabase-js client in Chromium. Only the network to Supabase is
faked (no project or credentials needed), so it proves the front-end session handling, NOT your database. The
database rules are covered by `npm run test:db`.

    pip install playwright && python -m playwright install chromium
    VITE_SUPABASE_URL=https://fake.supabase.co VITE_SUPABASE_ANON_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa npm run build
    npm run preview &            # serves http://localhost:4173
    python tests/e2e/acceptance.py

Rebuild without those two variables afterwards (or delete dist/) before deploying.
"""
import base64, json, re, time
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
import os, pathlib
B=os.environ.get('BASE_URL','http://localhost:4173')   # `npm run preview` default
CSP=json.load(open(pathlib.Path(__file__).resolve().parents[2]/'vercel.json'))['headers'][0]['headers'][0]['value']
b64=lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b'=').decode()
def jwt(sub,email,exp=None): return f"{b64({'alg':'HS256','typ':'JWT'})}.{b64({'sub':sub,'email':email,'role':'authenticated','aud':'authenticated','exp':exp or int(time.time())+3600})}.sig"
def sub_of(tok):
    p=tok.split('.')[1]; return json.loads(base64.urlsafe_b64decode(p+'='*(-len(p)%4)))
user_obj=lambda sub,email:{'id':sub,'aud':'authenticated','role':'authenticated','email':email,'app_metadata':{},'user_metadata':{},'created_at':'2026-01-01T00:00:00Z'}
logouts=[]; refresh_fails={'on':False}
ROLE={'admin-id':'admin','user-id':'applicant'}
def api(route):
    r=route.request; u=urlparse(r.url); path=u.path; auth=(r.headers.get('authorization') or '').replace('Bearer ','')
    J=lambda body,status=200: route.fulfill(status=status,content_type='application/json',body=json.dumps(body))
    if path=='/auth/v1/token':
        q=parse_qs(u.query)
        if q.get('grant_type')==['refresh_token']:
            if refresh_fails['on']: return J({'code':400,'error_code':'refresh_token_not_found','msg':'Invalid Refresh Token: Refresh Token Not Found'},400)
        body=json.loads(r.post_data or '{}'); email=body.get('email','user@example.com')
        sub='admin-id' if email.startswith('admin') else 'user-id'; t=jwt(sub,email)
        return J({'access_token':t,'token_type':'bearer','expires_in':3600,'expires_at':int(time.time())+3600,'refresh_token':'r-'+sub,'user':user_obj(sub,email)})
    if path=='/auth/v1/user': c=sub_of(auth); return J(user_obj(c['sub'],c['email']))
    if path=='/auth/v1/logout': logouts.append(u.query); return route.fulfill(status=204,body='')
    if path=='/rest/v1/profiles':
        c=sub_of(auth); row={'id':c['sub'],'email':c['email'],'full_name':None,'role':ROLE.get(c['sub'],'applicant')}
        return J(row if 'vnd.pgrst.object' in (r.headers.get('accept') or '') else [row])
    if path.startswith('/rest/v1/'): return J([] if r.method=='GET' else {})
    return J({})
def page_with_csp(route):
    resp=route.fetch(); h=dict(resp.headers)
    if route.request.resource_type=='document': h['content-security-policy']=CSP
    route.fulfill(response=resp,headers=h)
def sign_in(pg,path,email_sel,pw_sel,email):
    pg.goto(B+path); pg.fill(email_sel,email); pg.fill(pw_sel,'Password1!'); pg.get_by_role('button',name='Sign in').click()
with sync_playwright() as p:
    br=p.chromium.launch(); ctx=br.new_context(); ctx.route('https://fake.supabase.co/**',api); ctx.route(B+'/**',page_with_csp)
    problems=[]
    def watch(pg):
        pg.on('pageerror',lambda e: problems.append(('pageerror',str(e))))
        pg.on('console',lambda m: problems.append(('console',m.text)) if m.type=='error' and 'fake.supabase.co' not in m.text else None)
    t1=ctx.new_page(); t2=ctx.new_page(); watch(t1); watch(t2)
    # 1. landing
    t1.goto(B+'/'); expect(t1.get_by_role('heading',name='Apply for a MoMo Loan')).to_be_visible(); print('1. "/" shows the public landing page (signed out) OK')
    t1.goto(B+'/admin'); t1.wait_for_url('**/admin/login'); print('2. signed-out visitor cannot open /admin, is sent to admin sign-in OK')
    # 3. Tab 1 applicant
    sign_in(t1,'/login','#email','#password','user@example.com'); t1.wait_for_url('**/dashboard'); expect(t1.get_by_role('heading',name='Welcome')).to_be_visible(); print('3. applicant signs in -> applicant dashboard OK')
    # 4. Tab 2 administrator, same browser, without touching tab 1
    sign_in(t2,'/admin/login','#admin-email','#admin-password','admin@example.com'); expect(t2.get_by_role('heading',name='Overview')).to_be_visible(); print('4. administrator signs in in a second tab -> admin dashboard OK')
    keys=t2.evaluate('Object.keys(localStorage)'); assert 'momo-loan-admin-auth' in keys and 'momo-loan-applicant-auth' in keys, keys; print('   separate stored sessions:',sorted(keys))
    # 5. both still themselves, after reloads and nested-route refreshes
    t1.goto(B+'/profile'); t1.reload(); expect(t1.get_by_role('heading',name='Profile',exact=True)).to_be_visible()
    t2.goto(B+'/admin/applications'); t2.reload(); expect(t2.get_by_role('heading',name='Applications',exact=True)).to_be_visible(); print('5. both tabs keep their own account; refresh on nested routes works OK')
    t1.goto(B+'/'); expect(t1.get_by_role('link',name='Go to my dashboard').first).to_be_visible()
    t2.goto(B+'/'); expect(t2.get_by_role('heading',name='Apply for a MoMo Loan')).to_be_visible(); assert t2.url.rstrip('/')==B; print('6. "/" stays the landing page for a signed-in applicant AND while an administrator session exists OK')
    # 7. logging out of one does not log out the other (and uses local scope)
    t1.goto(B+'/profile'); t1.get_by_role('button',name='Sign out').last.click(); t1.wait_for_url('**/login')
    assert logouts and all('scope=local' in q for q in logouts), logouts; print('7a. sign-out request used scope=local (does not revoke other sessions) OK')
    t2.goto(B+'/admin'); expect(t2.get_by_role('heading',name='Overview')).to_be_visible(); print('7b. applicant sign-out left the administrator signed in OK')
    sign_in(t1,'/login','#email','#password','user@example.com'); t1.wait_for_url('**/dashboard')
    t2.goto(B+'/admin/account'); t2.get_by_role('button',name='Sign out').last.click(); t2.wait_for_url('**/admin/login')
    t1.reload(); expect(t1.get_by_role('heading',name='Welcome')).to_be_visible(); print('7c. administrator sign-out left the applicant signed in OK')
    # 8. wrong portal (start with no applicant session in the browser)
    t1.goto(B+'/profile'); t1.get_by_role('button',name='Sign out').last.click(); t1.wait_for_url('**/login')
    t2.goto(B+'/login'); t2.fill('#email','admin@example.com'); t2.fill('#password','Password1!'); t2.get_by_role('button',name='Sign in').click()
    expect(t2.get_by_text('These credentials cannot be used on this page.')).to_be_visible()
    stored=t2.evaluate("localStorage.getItem('momo-loan-applicant-auth')"); sess=json.loads(stored) if stored else None
    assert not sess or not sess.get('access_token') or sub_of(sess['access_token'])['sub']!='admin-id', 'admin session left in applicant store'; print('8. administrator credentials on the applicant sign-in are refused and leave no session OK')
    # 9. tampering with browser storage does not grant admin
    sign_in(t1,'/login','#email','#password','user@example.com'); t1.wait_for_url('**/dashboard')
    t1.goto(B+'/dashboard'); raw=t1.evaluate("localStorage.getItem('momo-loan-applicant-auth')"); s=json.loads(raw)
    s['user']['app_metadata']['role']='admin'; s['user']['user_metadata']['role']='admin'
    t1.evaluate("([k,v])=>{localStorage.setItem(k,v);localStorage.setItem('momo-loan-admin-auth',v)}",['momo-loan-applicant-auth',json.dumps(s)])
    t1.goto(B+'/admin'); t1.wait_for_url('**/admin/login'); assert t1.get_by_role('heading',name='Administrator sign in').is_visible(); print('9. an applicant who edits browser storage (copies their session to the admin store, adds role=admin) still gets no admin access OK')
    t1.goto(B+'/dashboard'); expect(t1.get_by_role('heading',name='Welcome')).to_be_visible()
    # 10. expired session
    t1.evaluate("()=>{const k='momo-loan-applicant-auth';const s=JSON.parse(localStorage.getItem(k));s.expires_at=1;localStorage.setItem(k,JSON.stringify(s))}"); refresh_fails['on']=True
    t1.goto(B+'/dashboard'); t1.wait_for_url('**/login'); expect(t1.get_by_text('Your session has ended. Sign in again to continue.')).to_be_visible(); print('10. an expired, un-refreshable session redirects to sign-in with an explanation OK')
    refresh_fails['on']=False
    # 11. validation
    t1.goto(B+'/register'); t1.get_by_role('button',name='Continue').click(); expect(t1.get_by_text('Enter your full name',exact=False).first).to_be_visible(); print('11. invalid registration shows validation messages OK')
    csp=[x for x in problems if 'Content Security Policy' in x[1] or 'Refused to' in x[1]]
    print('CSP violations:',csp or 'none'); print('other console/page errors:',[x for x in problems if x not in csp] or 'none')
    br.close()
