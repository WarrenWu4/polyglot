interface ModalProps {
    open: boolean;
    setOpen: (open: boolean) => void;
    children: string | React.ReactNode | React.ReactNode[] | null | undefined;
}

export default function Modal({ open, setOpen, children }: ModalProps) {

    const handleClose = () => {
        setOpen(false);
    }

    return (open === true ? (
        <div role="dialog" aria-modal="true" className="absolute top-0 left-0 w-full h-full flex justify-center items-center bg-black/20 backdrop-blur-md z-2" onClick={handleClose}>
            <div className="bg-white p-4 border-4 max-w-xl w-full max-h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                {children}
            </div>
        </div>
    ) : (<></>))
}
