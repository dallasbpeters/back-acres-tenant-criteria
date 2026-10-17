import type { Metadata } from 'next';
import '@fontsource-variable/source-serif-4/index.css';
import '@fontsource-variable/public-sans/index.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tenant Selection Criteria | Back Acres Rental',
  description: 'Review and acknowledge the tenant selection criteria for Back Acres Rental in Amarillo, Texas.',
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}<nav className="site-policy-links" aria-label="Site information"><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a><a href="/properties">Properties</a><a href="/admin">Owner workspace</a></nav></body></html>;
}
