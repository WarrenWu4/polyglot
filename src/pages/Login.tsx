import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import Layout from '../components/Layout'

function Login() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { setAuthenticated } = useAuth()

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const form = new FormData(e.currentTarget)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      body: new URLSearchParams({
        username: String(form.get('username') ?? ''),
        password: String(form.get('password') ?? ''),
      }),
    })
    setLoading(false)
    if (res.ok) {
      setAuthenticated(true)
      navigate('/')
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Invalid username or password')
    }
  }

  return (
    <Layout title="Login" includeNavbar={false}>
      <div className="flex flex-col gap-4 w-full">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2 w-full max-w-sm">
          <label className="text-lg font-bold" htmlFor="username">Username</label>
          <input className="border-black border-4 px-4 py-2" id="username" name="username" type="text" autoComplete="username" required />

          <label className="text-lg font-bold" htmlFor="password">Password</label>
          <input className="border-black border-4 px-4 py-2" id="password" name="password" type="password" autoComplete="current-password" required />

          <button type="submit" className="mt-4 px-4 py-2 border-4 w-fit font-bold hover:bg-black hover:text-white transition border-black cursor-pointer text-lg" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {error && <p className="text-red-600 text-lg font-bold">{error}</p>}
      </div>
    </Layout>
  )
}

export default Login
