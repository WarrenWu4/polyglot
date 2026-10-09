import { useCallback, useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { SetCard, SetFace, SetPageData } from '../types'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import { FaTimes, FaPlus, FaPen, FaTrashAlt } from "react-icons/fa";

type CardFields = Record<number, string>

const actionButton = 'px-4 py-2 border-4 w-fit font-bold hover:bg-black hover:text-white transition border-black cursor-pointer text-lg flex gap-2 items-center'
const dangerButton = 'px-4 py-2 border-4 w-fit font-bold hover:bg-red-600 hover:text-white transition border-red-600 text-red-600 cursor-pointer text-lg flex gap-2 items-center'
const submitButton = 'px-4 py-2 border-4 border-black font-bold hover:bg-black hover:text-white transition cursor-pointer disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-black'
const cancelButton = 'px-4 py-2 border-4 border-black font-bold hover:bg-black hover:text-white transition cursor-pointer'
const dangerSubmitButton = 'px-4 py-2 border-4 border-red-600 text-red-600 font-bold hover:bg-red-600 hover:text-white transition cursor-pointer disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-red-600'
const iconButton = 'cursor-pointer p-2 border-4 border-black hover:bg-black hover:text-white transition flex items-center'
const dangerIconButton = 'cursor-pointer p-2 border-4 border-red-600 text-red-600 hover:bg-red-600 hover:text-white transition flex items-center'

const cardLabel = (card: SetCard) => card.fields[0]?.value.trim() || 'flashcard'

interface CardFormProps {
    formId: string
    faces: SetFace[]
    card?: SetCard
    title: string
    submitLabel: string
    busy: boolean
    onSubmit: (fields: CardFields) => void
    onCancel: () => void
}

function CardForm({ formId, faces, card, title, submitLabel, busy, onSubmit, onCancel }: CardFormProps) {
    const [formError, setFormError] = useState<string | null>(null)

    const handleSubmit = (e: SubmitEvent<HTMLFormElement>) => {
        e.preventDefault()
        const form = new FormData(e.currentTarget)
        const fields: CardFields = {}
        let missing: string | null = null
        faces.forEach((face, idx) => {
            const value = String(form.get(`face-${face.id}`) ?? '').trim()
            if (idx === 0 && value === '') missing = `${face.name} is required`
            fields[face.id] = value
        })
        if (missing) {
            setFormError(missing)
            return
        }
        setFormError(null)
        onSubmit(fields)
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <h1 className="font-bold text-lg text-left">{title}</h1>
            <div className="flex flex-col gap-2 text-left">
                {faces.map((face, idx) => (
                    <div key={face.id} className="flex flex-col gap-1">
                        <label className="font-medium" htmlFor={`${formId}-f-${face.id}`}>{face.name}</label>
                        <textarea
                            id={`${formId}-f-${face.id}`}
                            name={`face-${face.id}`}
                            rows={2}
                            required={idx === 0}
                            defaultValue={card?.fields.find((f) => f.faceId === face.id)?.value ?? ''}
                            placeholder={idx === 0 ? `e.g. ${face.name}` : 'optional'}
                            className="border-2 border-black p-2 w-full bg-white"
                        />
                    </div>
                ))}
            </div>
            {formError && <p role="alert" className="text-left font-bold text-red-600">{formError}</p>}
            <div className="w-full flex justify-end gap-4">
                <button type="submit" disabled={busy} className={submitButton}>{busy ? 'Saving…' : submitLabel}</button>
                <button type="button" onClick={onCancel} className={cancelButton}>Cancel</button>
            </div>
        </form>
    )
}

function SetPage() {
    const { id } = useParams()
    const [set, setSet] = useState<SetPageData['set'] | null>(null)
    const [faces, setFaces] = useState<SetFace[]>([])
    const [cards, setCards] = useState<SetCard[]>([])
    const [error, setError] = useState<string | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [selected, setSelected] = useState<Record<number, boolean>>({})
    const [openNewFlashcardModal, setOpenNewFlashcardModal] = useState<boolean>(false)
    const [editingCard, setEditingCard] = useState<SetCard | null>(null)
    const [deletingCard, setDeletingCard] = useState<SetCard | null>(null)
    const [openBatchDeleteModal, setOpenBatchDeleteModal] = useState<boolean>(false)
    const [openAddFaceModal, setOpenAddFaceModal] = useState<boolean>(false)
    const [removingFace, setRemovingFace] = useState<SetFace | null>(null)

    const loadSet = useCallback(async () => {
        const res = await fetch(`/api/sets/${id}`)
        if (!res.ok) throw new Error('Failed to load set')
        const data: SetPageData = await res.json()
        setSet(data.set)
        setFaces(data.faces)
        setCards(data.cards)
    }, [id])

    useEffect(() => {
        loadSet().catch((e: Error) => setError(e.message))
    }, [loadSet])

    const request = async (url: string, body?: unknown) => {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
        if (!res.ok) {
            const data = await res.json().catch(() => ({}) as { error?: string })
            throw new Error(data.error || 'Request failed')
        }
    }

    const runAction = async (action: () => Promise<void>) => {
        setSaving(true)
        setActionError(null)
        try {
            await action()
        } catch (e) {
            setActionError(e instanceof Error ? e.message : 'Something went wrong')
        } finally {
            setSaving(false)
        }
    }

    const addCard = (fields: CardFields) => runAction(async () => {
        await request(`/api/sets/${id}/cards`, fields)
        await loadSet()
        setOpenNewFlashcardModal(false)
    })

    const updateCard = (cardId: number, fields: CardFields) => runAction(async () => {
        await request(`/api/sets/${id}/cards/${cardId}`, fields)
        await loadSet()
        setEditingCard(null)
    })

    const deleteCard = (cardId: number) => runAction(async () => {
        await request(`/api/sets/${id}/cards/${cardId}/delete`)
        await loadSet()
        setSelected((prev) => {
            const next = { ...prev }
            delete next[cardId]
            return next
        })
        setDeletingCard(null)
    })

    const deleteSelected = (ids: number[]) => runAction(async () => {
        if (ids.length === 0) return
        await request(`/api/sets/${id}/cards/delete`, { ids })
        await loadSet()
        setSelected({})
        setOpenBatchDeleteModal(false)
    })

    const addFace = (name: string) => runAction(async () => {
        await request(`/api/sets/${id}/faces`, { name })
        await loadSet()
        setOpenAddFaceModal(false)
    })

    const deleteFace = (faceId: number) => runAction(async () => {
        await request(`/api/sets/${id}/faces/${faceId}/delete`)
        await loadSet()
        setRemovingFace(null)
    })

    const handleAddFaceSubmit = (e: SubmitEvent<HTMLFormElement>) => {
        e.preventDefault()
        const form = new FormData(e.currentTarget)
        addFace(String(form.get('name') ?? '').trim())
    }

    const selectedIds = Object.entries(selected).filter(([, on]) => on).map(([cardId]) => Number(cardId))
    const allSelected = cards.length > 0 && selectedIds.length === cards.length
    const canRemoveFaces = faces.length > 2

    const toggleCard = (cardId: number) => setSelected((prev) => ({ ...prev, [cardId]: !prev[cardId] }))
    const toggleAll = () => setSelected(allSelected ? {} : Object.fromEntries(cards.map((c) => [c.id, true])))

    if (error) return <div className="w-full"><p className="border-4 border-red-600 text-red-600 p-4 font-bold">{error}</p></div>
    if (!set) return <div className="w-full"><p className="font-medium">Loading…</p></div>

    return (
        <Layout title={set.name}>
            <div className="mt-2 flex flex-col gap-4 w-full">
                {actionError && (
                    <div role="alert" className="border-4 border-red-600 text-red-600 px-4 py-2 font-bold flex justify-between items-center gap-4">
                        <p>{actionError}</p>
                        <button type="button" className="cursor-pointer" aria-label="Dismiss error" onClick={() => setActionError(null)}>
                            <FaTimes />
                        </button>
                    </div>
                )}

                <div className="flex flex-wrap gap-2 items-center">
                    <div className="px-4 py-2 border-4 w-fit font-bold hover:bg-black hover:text-white transition border-black cursor-pointer text-lg">
                        <Link to={`/sets/${id}/study`} className="flex gap-1 items-baseline">Study</Link>
                    </div>
                    <button type="button" className={actionButton} onClick={() => setOpenNewFlashcardModal(true)}>
                        <FaPlus />
                        <p>Add flashcard</p>
                    </button>
                    {selectedIds.length > 0 && (
                        <button type="button" className={dangerButton} onClick={() => setOpenBatchDeleteModal(true)}>
                            <FaTrashAlt />
                            <p>Delete selected ({selectedIds.length})</p>
                        </button>
                    )}
                </div>

                <div className="px-2 py-2 border-4 border-black font-medium">
                    <p>{set.description}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button type="button" className="cursor-pointer px-2 py-1 border-4 border-black flex gap-1 items-center" onClick={() => setOpenAddFaceModal(true)} aria-label="Add a face to every card" title="Add a face to every card">
                        <FaPlus />
                    </button>
                    {faces.map((face) => (
                        <button key={face.id} type="button" className="cursor-pointer px-2 py-1 border-4 font-bold border-black flex gap-1 items-center" onClick={() => setRemovingFace(face)} title={`Remove the "${face.name}" face`}>
                            <p>
                                {face.name}
                            </p>
                           <FaTimes /> 
                        </button>
                    ))}
                </div>

                <section className="flex flex-col gap-4 mt-4">
                    {cards.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="flex gap-2 items-center font-bold cursor-pointer">
                                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 accent-black cursor-pointer" />
                                <span>Select all</span>
                            </label>
                            <p className="font-medium">{selectedIds.length} of {cards.length} selected</p>
                        </div>
                    )}

                    {cards.length === 0 && <p className="border-4 border-dashed border-black p-4 font-medium opacity-60">No flashcards yet. Add your first one above.</p>}

                    {cards.map((card) => (
                        <div key={card.id} className="border-4 border-black p-4 flex items-start gap-4">
                            <input
                                type="checkbox"
                                checked={!!selected[card.id]}
                                onChange={() => toggleCard(card.id)}
                                className="mt-1 w-4 h-4 accent-black cursor-pointer shrink-0"
                                aria-label={`Select ${cardLabel(card)}`}
                            />
                            <div className="flex-1 flex flex-col gap-3 sm:flex-row sm:gap-6 min-w-0">
                                {card.fields.map((field) => (
                                    <div className="flex flex-col gap-1 flex-1 min-w-0" key={field.faceId}>
                                        <p className="font-bold">{field.name}</p>
                                        {field.value
                                            ? <p className="whitespace-pre-wrap break-words">{field.value}</p>
                                            : <p className="opacity-40">(empty)</p>}
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <button type="button" className={iconButton} onClick={() => setEditingCard(card)} aria-label={`Edit ${cardLabel(card)}`} title="Edit">
                                    <FaPen />
                                </button>
                                <button type="button" className={dangerIconButton} onClick={() => setDeletingCard(card)} aria-label={`Delete ${cardLabel(card)}`} title="Delete">
                                    <FaTrashAlt />
                                </button>
                            </div>
                        </div>
                    ))}
                </section>

                <Modal open={openNewFlashcardModal} setOpen={setOpenNewFlashcardModal}>
                    <CardForm
                        formId="add"
                        faces={faces}
                        title="Add Flashcard"
                        submitLabel="Add"
                        busy={saving}
                        onSubmit={addCard}
                        onCancel={() => setOpenNewFlashcardModal(false)}
                    />
                </Modal>

                <Modal open={editingCard !== null} setOpen={(open) => { if (!open) setEditingCard(null) }}>
                    {editingCard && (
                        <CardForm
                            formId={`edit-${editingCard.id}`}
                            faces={faces}
                            card={editingCard}
                            title="Edit Flashcard"
                            submitLabel="Save"
                            busy={saving}
                            onSubmit={(fields) => updateCard(editingCard.id, fields)}
                            onCancel={() => setEditingCard(null)}
                        />
                    )}
                </Modal>

                <Modal open={deletingCard !== null} setOpen={(open) => { if (!open) setDeletingCard(null) }}>
                    <div className="flex flex-col gap-4">
                        <h1 className="font-bold text-lg text-left">Delete flashcard</h1>
                        <p className="text-left">
                            This removes <span className="font-bold">{deletingCard && cardLabel(deletingCard)}</span> from this set. This cannot be undone.
                        </p>
                        <div className="w-full flex justify-end gap-4">
                            <button type="button" disabled={saving} onClick={() => deletingCard && deleteCard(deletingCard.id)} className={dangerSubmitButton}>
                                {saving ? 'Deleting…' : 'Delete'}
                            </button>
                            <button type="button" onClick={() => setDeletingCard(null)} className={cancelButton}>Cancel</button>
                        </div>
                    </div>
                </Modal>

                <Modal open={openBatchDeleteModal} setOpen={setOpenBatchDeleteModal}>
                    <div className="flex flex-col gap-4">
                        <h1 className="font-bold text-lg text-left">Delete selected flashcards?</h1>
                        <p className="text-left">This deletes {selectedIds.length} flashcard{selectedIds.length === 1 ? '' : 's'} from this set. This cannot be undone.</p>
                        <div className="w-full flex justify-end gap-4">
                            <button type="button" disabled={saving || selectedIds.length === 0} onClick={() => deleteSelected(selectedIds)} className={dangerSubmitButton}>
                                {saving ? 'Deleting…' : `Delete ${selectedIds.length}`}
                            </button>
                            <button type="button" onClick={() => setOpenBatchDeleteModal(false)} className={cancelButton}>Cancel</button>
                        </div>
                    </div>
                </Modal>

                <Modal open={openAddFaceModal} setOpen={setOpenAddFaceModal}>
                    <form onSubmit={handleAddFaceSubmit} className="flex flex-col gap-4">
                        <h1 className="font-bold text-lg text-left">Add face</h1>
                        <p className="text-left">Adds a new field to every card in this set.</p>
                        <div className="flex flex-col gap-1 text-left">
                            <label className="font-medium" htmlFor="new-face-name">Face name</label>
                            <input id="new-face-name" name="name" type="text" required placeholder="e.g. pinyin" className="border-2 border-black p-2 w-full bg-white" />
                        </div>
                        <div className="w-full flex justify-end gap-4">
                            <button type="submit" disabled={saving} className={submitButton}>{saving ? 'Saving…' : 'Add face'}</button>
                            <button type="button" onClick={() => setOpenAddFaceModal(false)} className={cancelButton}>Cancel</button>
                        </div>
                    </form>
                </Modal>

                <Modal open={removingFace !== null} setOpen={(open) => { if (!open) setRemovingFace(null) }}>
                    <div className="flex flex-col gap-4">
                        <h1 className="font-bold text-lg text-left">Remove face</h1>
                        <p className="text-left">
                            This removes the <span className="font-bold">{removingFace?.name}</span> face and its values from all {cards.length} card{cards.length === 1 ? '' : 's'} in this set.
                        </p>
                        {!canRemoveFaces && <p className="text-left border-4 border-black p-2 font-medium">A set must keep at least 2 faces.</p>}
                        <div className="w-full flex justify-end gap-4">
                            <button type="button" disabled={saving || !canRemoveFaces} onClick={() => removingFace && deleteFace(removingFace.id)} className={dangerSubmitButton}>
                                {saving ? 'Removing…' : 'Remove face'}
                            </button>
                            <button type="button" onClick={() => setRemovingFace(null)} className={cancelButton}>Cancel</button>
                        </div>
                    </div>
                </Modal>
            </div>
        </Layout>
    )
}

export default SetPage