import './globals.css';
import type { Metadata } from 'next';
export const metadata:Metadata={title:'TraceForge — Incident Intelligence',description:'Investigate incidents through timeline replay, evidence graph, and local-first reports.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
