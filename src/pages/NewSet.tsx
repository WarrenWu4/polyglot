import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'

function NewSet() {
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget.elements as HTMLFormControlsCollection & {
      name: HTMLInputElement
      description: HTMLTextAreaElement
    }
    const res = await fetch('/api/sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.value,
        description: form.description.value,
      }),
    })
    if (res.ok) {
      navigate('/')
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Failed to create set')
    }
  }

  return (
    <Layout title="Flashcard Set Creation">
      {error && <p className="login-error">{error}</p>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 w-full mt-4">
        <label htmlFor="name" className="text-lg font-bold">Name</label>
        <input id="name" name="name" type="text" className="px-4 py-2 border-4 border-black" required />
        <label htmlFor="description" className="text-lg font-bold">Description</label>
        <textarea id="description" name="description" rows={3} className="px-4 py-2 border-4 border-black"></textarea>
        <div className="flex gap-4 mt-4">
          <button type="submit" className="cursor-pointer px-4 py-2 border-4 border-green-700 text-green-700 text-lg font-bold hover:text-white hover:bg-green-700 transition">Create Set</button>
          <Link className="px-4 py-2 border-4 border-red-600 text-lg font-bold text-red-600 hover:text-white hover:bg-red-600 transition" to="/">Cancel</Link>
        </div>
      </form>
    </Layout>
  )
}

export default NewSet
