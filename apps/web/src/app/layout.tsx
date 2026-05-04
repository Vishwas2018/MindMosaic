import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'
import { DM_Sans, DM_Serif_Display } from 'next/font/google'
import { ErrorBoundary } from '@mm/ui'
import { createClient } from '../lib/supabase/server'
import { Providers } from '../providers/Providers'
import { RootErrorFallback } from '../components/RootErrorFallback'
import '@mm/ui/tokens.css'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const dmSerifDisplay = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'MindMosaic',
  description: 'Turning practice into Mastery!',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
  },
}

export const viewport: Viewport = {
  themeColor: '#5D3FD3',
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  return (
    <html lang="en" className={`${dmSans.variable} ${dmSerifDisplay.variable}`}>
      <body className="font-sans antialiased bg-white text-slate-900">
        <Providers initialSession={session}>
          <ErrorBoundary fallback={<RootErrorFallback />}>
            {children}
          </ErrorBoundary>
        </Providers>
      </body>
    </html>
  )
}
