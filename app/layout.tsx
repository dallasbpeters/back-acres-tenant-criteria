import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ui/theme";
import { authenticated } from "@/lib/adverse/auth";
import { themeBootstrap } from "@/lib/theme";
import "@fontsource-variable/source-serif-4/index.css";
import "@fontsource-variable/public-sans/index.css";
import "./globals.css";

export const metadata: Metadata = {
  description:
    "Review and acknowledge the tenant selection criteria for Back Acres Rental in Amarillo, Texas.",
  robots: { follow: false, index: false },
  title: "Tenant Selection Criteria | Back Acres Rental",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const signedIn = await authenticated();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: This bootstrap is a static application-owned string; no user content is interpolated. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <ThemeProvider>
          {children}
          <nav aria-label="Site information" className="site-policy-links">
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Service</a>
            <a href="/properties">Properties</a>
            <a href="/tenant">Tenant portal</a>
            {!!signedIn && <a href="/admin">Owner workspace</a>}
          </nav>
        </ThemeProvider>
      </body>
    </html>
  );
}
