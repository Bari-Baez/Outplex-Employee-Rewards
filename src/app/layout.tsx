import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import { AppSWRProvider } from '@/components/providers/SWRProvider';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

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
    <html
      lang="en"
      className={`${inter.variable} ${jetBrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <AppSWRProvider>
          <div id="main-content" tabIndex={-1}>
            {children}
          </div>
          <Toaster position="top-right" richColors />
        </AppSWRProvider>
      </body>
    </html>
  );
}
