import { useAuth } from '../../context/AuthContext'
import { Button, PageHead } from '../../components/ui'
import ChangePassword from '../../components/ChangePassword'

export default function Account() {
  const { user, profile, signOut } = useAuth()
  return (
    <>
      <PageHead title="Account">Your administrator account.</PageHead>
      <div className="stack-cards" style={{ maxWidth: 720 }}>
        <section className="card" aria-labelledby="acct-title">
          <h2 id="acct-title" style={{ marginBottom: '.5rem' }}>Details</h2>
          <dl className="kv">
            <dt>Email address</dt><dd>{user.email}</dd>
            <dt>Role</dt><dd>Administrator</dd>
            {profile?.full_name && <><dt>Name</dt><dd>{profile.full_name}</dd></>}
          </dl>
        </section>
        <section className="card" aria-labelledby="pw-title">
          <h2 id="pw-title" style={{ marginBottom: '1rem' }}>Change password</h2>
          <ChangePassword />
        </section>
        <section className="card" aria-labelledby="so-title">
          <div className="row row--between">
            <div><h2 id="so-title">Sign out</h2><p className="muted" style={{ margin: '.25rem 0 0' }}>Ends your administrator session on this browser. It does not affect any applicant who is signed in on this browser.</p></div>
            <Button tone="outline" onClick={signOut}>Sign out</Button>
          </div>
        </section>
      </div>
    </>
  )
}
