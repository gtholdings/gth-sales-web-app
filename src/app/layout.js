import { Inter, Noto_Sans_Sinhala } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { BottomNav } from '@/components/BottomNav';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
// Sinhala-capable font so Sinhala labels and data render correctly.
const notoSinhala = Noto_Sans_Sinhala({ subsets: ['sinhala'], variable: '--font-sinhala' });

export const metadata = {
  title: 'GTH Sales',
  description: 'Global Tech Holdings Sales Management',
  // Linking the manifest is what makes the app installable (standalone, no URL
  // bar) and gives Android a real home-screen icon instead of a grey bookmark.
  manifest: '/manifest.json',
  applicationName: 'GTH Sales',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'GTH Sales' },
  icons: {
    icon: [
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1e40af',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Apple PWA tags + manifest link are emitted from the metadata export
            above; only the generic flag (not covered there) stays here. */}
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${inter.variable} ${notoSinhala.variable} font-sans`}>
        <LanguageProvider>
          <AuthProvider>
            {children}
            <BottomNav />
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
