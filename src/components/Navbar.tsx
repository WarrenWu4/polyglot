import { useState } from "react";
import { FaGear } from "react-icons/fa6";
import { FaHome } from "react-icons/fa";
import Modal from "./Modal";
import { useNavigate, Link } from "react-router-dom";

interface NavbarProps {
    title: string;
}

export default function Navbar({ title }: NavbarProps) {
    const [openModal, setOpenModal] = useState<boolean>(false);
    const navigate = useNavigate();

    const handleOpenModal = () => {
        setOpenModal(true);
    }

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        navigate('/login');
    }

    return (
        <>
            <nav className="w-full flex justify-between items-center">
                <h1 className="text-2xl font-bold">{title}</h1>
                <div className="flex gap-2 sm:gap-4">
                    <Link to="/">
                        <FaHome className="text-xl"/>
                    </Link>
                    <button className="cursor-pointer" onClick={handleOpenModal}>
                        <FaGear className="text-xl"/>
                    </button>
                </div>
            </nav>
            <Modal open={openModal} setOpen={setOpenModal}>
                <h1 className="font-bold text-xl text-left">Settings</h1>
                <div className="flex w-full justify-end">
                  <button className="px-4 py-2 border-4 w-fit font-bold hover:bg-red-600 hover:text-white transition border-red-600 text-red-600 cursor-pointer text-lg" onClick={handleLogout}>
                    <p>Logout</p>
                  </button>
                </div>
            </Modal>
        </>
    )
}
