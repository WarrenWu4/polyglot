import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaFire, FaBookOpen } from "react-icons/fa6";
import { TbCardsFilled } from "react-icons/tb";
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import type { DashboardData } from '../types';

function Dashboard() {
    const [openModal, setOpenModal] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load dashboard')
        return res.json()
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <div className="container"><p className="login-error">{error}</p></div>
  if (!data) return <div className="container"><p>Loading…</p></div>

  return (
    <Layout title="Dashboard">
    <div className="mt-2 flex flex-col gap-4 w-full">

        <div className="text-xl font-bold flex items-center gap-1">
            <p>{data.streak}</p>
            <FaFire />
        </div>

      <div className="px-4 py-2 border-4 w-fit font-bold hover:bg-black hover:text-white transition border-black cursor-pointer text-lg">
        <Link to="/sets/new" className="flex gap-1 items-baseline">
            <p>New Flashcards</p>
        </Link>
      </div>

      <div className={`p-4 border-4 border-black flex flex-col gap-2 font-bold ${data.sets.length === 0 ? "border-dashed opacity-40" : ""}`}>
        {data.sets.map((set, idx) => (
          <Link className={`w-full border-gray-400 flex items-center justify-between text-base ${(idx == data.sets.length - 1) ? "" : "border-b-2 pb-4"}`} key={set.id} to={`/sets/${set.id}`}>
            {/* TODO: insert modifiable icon */}
            <div>
                <p>{set.name}</p>
            </div>
            <div className="flex gap-2">
              <div className="flex gap-1 items-center">
                <p>{set.flashcardCount}</p>
                <TbCardsFilled className="text-lg" />
              </div>
              <div className="flex gap-1 items-center">
                <p>{set.studyCount}</p>
                <FaBookOpen className="text-lg" />
              </div>
            </div>
            {/*
            <div className="progress">
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${set.progress}%` }}></div>
              </div>
              <span className="progress-label">{set.progress}% mastered</span>
            </div>
            */}
          </Link>
        ))}
          {data.sets.length === 0 && (
            <p>No flashcard sets yet. Create your first one to get started.</p>
          )}
      </div>

    </div>

    <Modal open={openModal} setOpen={setOpenModal}>
        <h1>Test</h1> 
    </Modal>
    </Layout>
  )
}

export default Dashboard
