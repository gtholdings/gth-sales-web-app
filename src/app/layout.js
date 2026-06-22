import { Inter, Noto_Sans_Sinhala } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
// Sinhala-capable font so Sinhala labels and data render correctly.
const notoSinhala = Noto_Sans_Sinhala({ subsets: ['sinhala'], variable: '--font-sinhala' });

export const metadata = {
  title: 'GTH Sales',
  description: 'Global Tech Holdings Sales Management',
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
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="GTH Sales" />
      </head>
      <body className={`${inter.variable} ${notoSinhala.variable} font-sans`}>
        <LanguageProvider>
          <AuthProvider>{children}</AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
