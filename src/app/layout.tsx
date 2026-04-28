import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Outplex Employee Hub',
    template: '%s | Outplex',
  },
  description:
    'Internal OT management and company portal for Outplex employees. Claim overtime slots, participate in raffles, and redeem company points — all in one place.',
  keywords: ['outplex', 'overtime', 'OT', 'slack', 'NYT', 'internal tool'],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
