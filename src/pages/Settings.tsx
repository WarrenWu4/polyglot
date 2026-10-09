import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { HotkeyRow, SettingsData } from '../types'

function Settings() {
  const [rows, setRows] = useState<HotkeyRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load settings')
        return res.json()
      })
      .then((data: SettingsData) => setRows(data.hotkeys.map((h) => ({ position: h.position, key: h.key }))))
      .catch((e: Error) => setError(e.message))
  }, [])

  const nextPosition = () => (rows.length ? Math.max(...rows.map((r) => r.position)) + 1 : 1)

  const addRow = () => setRows((r) => [...r, { position: nextPosition(), key: '' }])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = formRef.current
    if (!form) return
    const hotkeys: HotkeyRow[] = Array.from(form.querySelectorAll<HTMLElement>('.settings-row')).map((row) => ({
      position: parseInt(row.dataset.position ?? '', 10),
      key: (row.querySelector('input') as HTMLInputElement).value.trim(),
    }))
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hotkeys }),
    })
    if (res.ok) {
      navigate('/settings')
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Failed to save settings')
    }
  }

  return (
    <div className="container settings-page">
      <header className="set-header">
        <div>
          <Link className="back-link" to="/">← Dashboard</Link>
          <h1>Settings</h1>
        </div>
      </header>

      <section className="settings-section">
        <h2>Study keyboard shortcuts</h2>
        <p className="settings-desc">
          Assign a key to each face position for quick access during study mode.
          Leave blank and save to remove a hotkey.
        </p>

        {error && <div className="settings-error" role="alert">{error}</div>}

        <form ref={formRef} onSubmit={handleSubmit} className="settings-form" id="hotkey-form">
          <div id="hotkey-rows">
            {rows.map((row, i) => (
              <div className="settings-row" data-position={row.position} key={`${row.position}-${i}`}>
                <span className="settings-label">Face {row.position}</span>
                <input
                  type="text"
                  name={`key-${row.position}`}
                  defaultValue={row.key}
                  maxLength={1}
                  pattern="[a-zA-Z0-9]"
                  className="hotkey-input"
                  placeholder="—"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="btn btn-danger btn-sm hotkey-remove"
                  aria-label={`Remove face ${row.position} hotkey`}
                  onClick={(e) => e.currentTarget.closest('.settings-row')?.remove()}
                >×</button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-secondary" id="hotkey-add" onClick={addRow}>+ Add position</button>
          <div className="settings-actions">
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
        <p className="settings-note">
          Reserved keys: Space, ←, →.
          Only single letters (a–z, A–Z) and digits (0–9) are allowed.
        </p>
      </section>
    </div>
  )
}

export default Settings