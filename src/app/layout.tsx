import type { Metadata } from 'next';
import './globals.css';
import AuthGate from '@/components/AuthGate';
export const metadata: Metadata = { title: 'CladCan Estimating Hub' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@500;600&display=swap" /></head><body><AuthGate>{children}</AuthGate></body></html>;
}
