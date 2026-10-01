import type { Metadata } from 'next';
import { Source_Sans_3, Fraunces } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';

const sans = Source_Sans_3({ subsets: ['latin'], variable: '--font-sans' });
const display = Fraunces({ subsets: ['latin'], variable: '--font-display' });

export const metadata: Metadata = {
  title: 'CivicFix',
  description: 'Report and resolve local civic issues with a clear, accountable workflow.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
