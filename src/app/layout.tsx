
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Patrick_Hand, Caveat } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { DateSelectionProvider } from '@/contexts/DateSelectionContext';
import { AuthProvider } from '@/contexts/AuthContext';
import ProtectedLayoutWrapper from '@/components/layout/protected-layout-wrapper';
import { AIModelProvider } from '@/contexts/AIModelContext';
import { getPublicModels } from '@/lib/model-registry';
import { QueryProvider } from '@/components/providers/query-provider';
import { getSessionUser } from '@/lib/auth/supabase-server';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const patrickHand = Patrick_Hand({
  variable: '--font-patrick-hand',
  weight: '400',
  subsets: ['latin'],
});

const caveat = Caveat({
  variable: '--font-caveat',
  weight: ['400', '600', '700'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: "FinWise AI - Expense Tracker",
  description: "Track your expenses intelligently with FinWise AI.",
  manifest: "/manifest.json",
  icons: {
    apple: "/logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: '#008080',
  // Draw edge to edge; the header, bottom nav, buttons and toasts pad themselves
  // with env(safe-area-inset-*) so nothing tappable sits under the notch or home bar.
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Credential-stripped: this array is serialized into the client payload.
  const availableModels = getPublicModels();
  const user = await getSessionUser();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${patrickHand.variable} ${caveat.variable} antialiased`}>
        <QueryProvider>
          <AuthProvider initialUser={user}>
            <ThemeProvider
              attribute="class"
              defaultTheme="light"
              enableSystem
              disableTransitionOnChange
            >
              <AIModelProvider availableModels={availableModels}>
                <DateSelectionProvider>
                  <ProtectedLayoutWrapper>
                    {children}
                  </ProtectedLayoutWrapper>
                </DateSelectionProvider>
              </AIModelProvider>
              <Toaster />
            </ThemeProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
