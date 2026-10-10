import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tenant Selection Criteria | Back Acres Rental',
  description: 'Review and acknowledge the tenant selection criteria for Back Acres Rental in Amarillo, Texas.',
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
