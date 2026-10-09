import type { ReactNode } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';

interface LayoutProps {
    title: string;
    children: ReactNode;
    includeNavbar?: boolean;
    includeFooter?: boolean;
}

export default function Layout({ title, children, includeNavbar = true, includeFooter = true }: LayoutProps) {
    return (
        <div className="p-4 md:p-8 lg:p-16 max-w-4xl w-full min-h-screen flex flex-col items-center">
            {includeNavbar ? <Navbar title={title}/> : <></>}
            <main className="w-full">{children}</main>
            {includeFooter ? <Footer /> : <></>}
        </div>
    )
}

