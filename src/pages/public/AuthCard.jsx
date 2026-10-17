// Centered card used by the sign-in, registration and confirmation screens.
export default function AuthCard({ title, subtitle, wide, children, footer }) {
  return (
    <main className="auth">
      <div className={`auth__card ${wide ? 'auth__card--wide' : ''}`}>
        <div className="card">
          <h1 className="auth__title">{title}</h1>
          {subtitle && <p className="auth__sub">{subtitle}</p>}
          {children}
        </div>
        {footer && <p className="auth__alt">{footer}</p>}
      </div>
    </main>
  )
}
