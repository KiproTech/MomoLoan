import Logo from './Logo'

export default function ConfigMissing() {
  return (
    <main className="auth">
      <div className="auth__card auth__card--wide">
        <div className="auth__brand"><Logo height={48} /><strong>MoMo Loan</strong></div>
        <div className="card card--highlight">
          <h1 className="auth__title">Connect your Supabase project</h1>
          <p className="auth__sub">The application needs your Supabase project URL and public key before it can start.</p>
          <ol className="checklist">
            <li>Copy <code>.env.example</code> to <code>.env</code> in the project folder.</li>
            <li>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> from Supabase, Project Settings, API.</li>
            <li>Run <code>supabase/momo_loan_supabase.sql</code> in the Supabase SQL Editor.</li>
            <li>Restart <code>npm run dev</code>. Vite reads <code>.env</code> only at start-up.</li>
          </ol>
          <p className="muted small" style={{ margin: 0 }}>Full instructions are in README.md.</p>
        </div>
      </div>
    </main>
  )
}
