import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { StudyData, StudyField } from '../types'
import Layout from '../components/Layout'
import { FaEye, FaEyeSlash } from 'react-icons/fa'

const baseButton = 'px-4 py-2 border-4 font-bold text-lg cursor-pointer transition disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-black'
const controlButton = `${baseButton} border-black hover:bg-black hover:text-white md:flex-1`
const dangerControlButton = `${baseButton} border-red-600 text-red-600 hover:bg-red-600 hover:text-white disabled:hover:text-red-600 md:flex-1`
const linkButton = `${baseButton} w-fit border-black hover:bg-black hover:text-white`

const SKIPPED_FACE_NAMES = new Set(['pinyin', 'example pinyin'])
const visibleFields = (fields: StudyField[]) => fields.filter((f) => !SKIPPED_FACE_NAMES.has(f.name))

interface HistoryEntry {
  idx: number
  faceIndex: number
}

interface StudyRef {
  idx: number
  faceIndex: number
  history: HistoryEntry[]
  rated: Record<string, boolean>
  busy: boolean
}

function Study() {
  const { id } = useParams()
  const [data, setData] = useState<StudyData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  const [faceIndex, setFaceIndex] = useState(0)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [rated, setRated] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [showPinyin, setShowPinyin] = useState(true)
  const keyToPos = useRef<Record<string, number>>({})
  const sessionIdRef = useRef<number | null>(null)
  const stateRef = useRef<StudyRef>({ idx: 0, faceIndex: 0, history: [], rated: {}, busy: false })
  const sectionRef = useRef<HTMLElement | null>(null)
  const lastWheelRef = useRef(0)

  useEffect(() => {
    fetch(`/api/sets/${id}/study`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load study session')
        return res.json()
      })
      .then((d: StudyData) => {
        setData(d)
        sessionIdRef.current = d.sessionId
        const map: Record<string, number> = {}
        Object.entries(d.hotkeys || {}).forEach(([pos, key]) => { map[key] = parseInt(pos, 10) })
        keyToPos.current = map
      })
      .catch((e: Error) => setError(e.message))
  }, [id])

  const cards = data?.cards || []
  const card = cards[idx]
  const fields = card?.fields || []
  const done = cards.length > 0 && idx >= cards.length
  const alreadyRated = card ? !!rated[card.id] : false

  const cycle = useCallback(() => {
    if (stateRef.current.busy) return
    const cs = data?.cards || []
    const cur = cs[stateRef.current.idx]
    const fs = visibleFields(cur?.fields || [])
    if (fs.length === 0) return
    const ni = (stateRef.current.faceIndex + 1) % fs.length
    stateRef.current.faceIndex = ni
    setFaceIndex(ni)
  }, [data])

  const advanceAfterRate = useCallback((_know: boolean, cardId: number) => {
    const st = stateRef.current
    st.history = [...st.history, { idx: st.idx, faceIndex: st.faceIndex }]
    st.idx = st.idx + 1
    st.faceIndex = 0
    st.rated = { ...st.rated, [cardId]: true }
    setHistory(st.history)
    setRated(st.rated)
    setIdx(st.idx)
    setFaceIndex(0)
  }, [])

  const rate = useCallback(
    async (know: boolean) => {
      if (!data || data.cards.length === 0 || stateRef.current.busy) return
      const st = stateRef.current
      const cur = data.cards[st.idx]
      if (!cur) return
      if (st.rated[cur.id]) {
        advanceAfterRate(know, cur.id)
        return
      }
      st.busy = true
      setBusy(true)
      try {
        const res = await fetch(`/api/sets/${id}/study/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current, cardId: cur.id, know }),
        })
        if (!res.ok) throw new Error('review request failed')
        const result = (await res.json().catch(() => null)) as { sessionId?: number } | null
        if (result && typeof result.sessionId === 'number') sessionIdRef.current = result.sessionId
        st.busy = false
        setBusy(false)
        advanceAfterRate(know, cur.id)
      } catch {
        st.busy = false
        setBusy(false)
        setError('Could not record your answer. Please try again.')
      }
    },
    [data, id, advanceAfterRate],
  )

  useEffect(() => {
    stateRef.current.idx = idx
    stateRef.current.faceIndex = faceIndex
    stateRef.current.history = history
    stateRef.current.rated = rated
    stateRef.current.busy = busy
  }, [idx, faceIndex, history, rated, busy])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const key = e.key
      if ((key >= '1' && key <= '9') || keyToPos.current[key]) {
        const pos = keyToPos.current[key] || parseInt(key, 10)
        const di = pos - 1
        const cur = (data?.cards || [])[idx]
        const fs = visibleFields(cur?.fields || [])
        if (di >= 0 && di < fs.length) {
          setFaceIndex(di)
          e.preventDefault()
        }
      } else if (key === ' ') {
        cycle()
        e.preventDefault()
      } else if (key === 'ArrowRight') {
        rate(true)
        e.preventDefault()
      } else if (key === 'ArrowLeft') {
        rate(false)
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [cycle, rate, data, idx])

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const now = Date.now()
      if (now - lastWheelRef.current < 150) return
      lastWheelRef.current = now
      cycle()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [cycle])

  if (error && !data) return <div className="w-full"><p className="border-4 border-red-600 text-red-600 p-4 font-bold">{error}</p></div>
  if (!data) return <div className="w-full"><p className="font-medium">Loading…</p></div>

  const total = cards.length
  const displayFields = visibleFields(fields)
  const current = displayFields.length > 0 ? displayFields[faceIndex % displayFields.length] : undefined
  const faceName = current?.name ?? ''
  const faceValue = current?.value ?? '(empty card)'
  const auxPinyin =
    faceName === 'word'
      ? fields.find((f) => f.name === 'pinyin')?.value
      : faceName === 'example sentence'
        ? fields.find((f) => f.name === 'example pinyin')?.value
        : undefined
  const progress = done ? 100 : total === 0 ? 0 : Math.round((idx / total) * 100)

  return (
    <Layout title={`Study: ${data.setName}`}>
      <div className="mt-2 flex flex-col gap-4 w-full">
        <div className="flex flex-col gap-2">
          <p aria-live="polite" className="font-medium">
            {done ? 'Done' : `Card ${idx + 1} / ${total}`}
          </p>
          <div role="progressbar" aria-label="Study progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done ? total : idx} className="w-full h-4 border-4 border-black">
            <div className="h-full bg-black" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <section
          ref={sectionRef}
          onClick={cycle}
          className="relative select-none border-4 border-black min-h-55 p-6 sm:p-10 flex flex-col items-center justify-center gap-3 text-center cursor-pointer"
        >
          {!done && cards.length > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowPinyin((v) => !v) }}
              aria-label={showPinyin ? 'Hide pinyin' : 'Show pinyin'}
              aria-pressed={showPinyin}
              title={showPinyin ? 'Hide pinyin' : 'Show pinyin'}
              className="absolute top-2 right-2 p-2 border-4 border-black bg-white text-lg cursor-pointer transition hover:bg-black hover:text-white"
            >
              {showPinyin ? <FaEye /> : <FaEyeSlash />}
            </button>
          )}
          {error && <p className="text-lg font-bold text-red-600">{error}</p>}
          {!error && cards.length === 0 && <p className="text-xl font-medium">No cards in this set.</p>}
          {done && <p className="text-2xl font-semibold">Session complete! Nice work.</p>}
          {!done && cards.length > 0 && (
            <>
              <p className="text-sm font-bold uppercase tracking-widest">{faceName}</p>
              {showPinyin && auxPinyin && <p className="text-lg sm:text-2xl text-black/60 whitespace-pre-wrap break-words max-w-full">{auxPinyin}</p>}
              <p className="text-2xl sm:text-3xl font-semibold whitespace-pre-wrap break-words max-w-full">{faceValue}</p>
            </>
          )}
        </section>

        {done ? (
          <div className="flex flex-wrap gap-2">
            <Link to={`/sets/${id}`} className={linkButton}>Back to set</Link>
            <Link reloadDocument to={`/sets/${id}/study`} className={linkButton}>Study again</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <button type="button" className={dangerControlButton} onClick={() => rate(false)} disabled={alreadyRated || busy || done || cards.length === 0}>Don't know</button>
            <button type="button" className={controlButton} onClick={() => rate(true)} disabled={alreadyRated || busy || done || cards.length === 0}>Know</button>
          </div>
        )}
      </div>
    </Layout>
  )
}

export default Study
