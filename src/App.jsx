import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { isSupabaseConfigured, portalFor } from './lib/supabase'
import AdminLayout from './components/AdminLayout'
import ApplicantLayout from './components/ApplicantLayout'
import ConfigMissing from './components/ConfigMissing'
import { GuestOnly, RequireAdmin, RequireApplicant } from './components/Guards'
import PublicLayout from './components/PublicLayout'
import Activity from './pages/admin/Activity'
import ApplicationDetail from './pages/admin/ApplicationDetail'
import Applications from './pages/admin/Applications'
import Account from './pages/admin/Account'
import Overview from './pages/admin/Overview'
import Application from './pages/applicant/Application'
import Dashboard from './pages/applicant/Dashboard'
import History from './pages/applicant/History'
import Profile from './pages/applicant/Profile'
import AdminLogin from './pages/public/AdminLogin'
import Landing from './pages/public/Landing'
import Login from './pages/public/Login'
import Register from './pages/public/Register'

// The session provider is keyed by portal, so it reconnects to the right login whenever the address moves
// between the applicant portal and /admin.
function PortalAuth({ children }) {
  const { pathname } = useLocation()
  const portal = portalFor(pathname)
  return <AuthProvider key={portal}>{children}</AuthProvider>
}

export default function App() {
  if (!isSupabaseConfigured) return <ConfigMissing />
  return (
    <BrowserRouter>
      <PortalAuth>
        <ToastProvider>
          <Routes>
            {/* Public area: applicants only */}
            <Route element={<PublicLayout />}>
              {/* The landing page is always public: it is never redirected, whoever is signed in. */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
              <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
            </Route>

            {/* Applicant portal */}
            <Route element={<RequireApplicant><ApplicantLayout /></RequireApplicant>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/application" element={<Application />} />
              <Route path="/history" element={<History />} />
              <Route path="/profile" element={<Profile />} />
            </Route>

            {/* Administrator portal: dedicated sign-in route, not linked from the public pages */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
              <Route index element={<Overview />} />
              <Route path="applications" element={<Applications />} />
              <Route path="applications/:id" element={<ApplicationDetail />} />
              <Route path="activity" element={<Activity />} />
              <Route path="account" element={<Account />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </PortalAuth>
    </BrowserRouter>
  )
}
