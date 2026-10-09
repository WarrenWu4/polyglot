import { useEffect, useState, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './index.css'
import AuthContext, { useAuth } from './lib/auth'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import NewSet from './pages/NewSet'
import SetPage from './pages/SetPage'
import Study from './pages/Study'
import Settings from './pages/Settings'

function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, authenticated } = useAuth()
  const location = useLocation()
  if (loading) return <div className="container"><p>Loading…</p></div>
  if (!authenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return children
}

function AuthRoutes() {
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth')
      .then((res) => {
        if (!res.ok) throw new Error('auth check failed')
        return res.json()
      })
      .then((data: { authenticated: boolean }) => setAuthenticated(!!data.authenticated))
      .catch(() => setAuthenticated(false))
      .finally(() => setLoading(false))
  }, [])

  return (
    <AuthContext.Provider value={{ loading, authenticated, setAuthenticated }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/sets/new" element={<RequireAuth><NewSet /></RequireAuth>} />
        <Route path="/sets/:id" element={<RequireAuth><SetPage /></RequireAuth>} />
        <Route path="/sets/:id/study" element={<RequireAuth><Study /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
      </Routes>
    </AuthContext.Provider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthRoutes/>
    </BrowserRouter>
  </StrictMode>,
)
