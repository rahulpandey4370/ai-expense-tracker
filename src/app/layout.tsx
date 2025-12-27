
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { DateSelectionProvider } from '@/contexts/DateSelectionContext';
import { AuthProvider } from '@/contexts/AuthContext';
import ProtectedLayoutWrapper from '@/components/layout/protected-layout-wrapper'; // Import the new wrapper
<<<<<<< HEAD
import { AIModelProvider } from '@/contexts/AIModelContext'; // Import the new AI Model Provider
=======
import { AIModelProvider } from '@/contexts/AIModelContext';
>>>>>>> 816848e (Do not make any changes just yet. In this application I want to add the)

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: "FinWise AI - Expense Tracker",
  description: "Track your expenses intelligently with FinWise AI.",
  manifest: "/manifest.json",
  icons: {
    apple: "/logo.png", // Use the app logo for apple touch icon
  },
};

export const viewport: Viewport = {
  themeColor: '#008080',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider> {/* AuthProvider remains high */}
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          >
<<<<<<< HEAD
            <DateSelectionProvider>
              <AIModelProvider> {/* Wrap with AIModelProvider */}
                <ProtectedLayoutWrapper> {/* Use the new wrapper */}
                  {children}
                </ProtectedLayoutWrapper>
              </AIModelProvider>
            </DateSelectionProvider>
=======
            <AIModelProvider>
              <DateSelectionProvider>
                <ProtectedLayoutWrapper> {/* Use the new wrapper */}
                  {children}
                </ProtectedLayoutWrapper>
              </DateSelectionProvider>
            </AIModelProvider>
>>>>>>> 816848e (Do not make any changes just yet. In this application I want to add the)
            <Toaster />
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
