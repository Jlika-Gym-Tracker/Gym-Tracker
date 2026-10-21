import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { ActivityLoader } from "@/components/shell/activity-loader";
import { ACCENT_BOOT_SCRIPT } from "@/lib/theme/accent";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "JLIKA Gym",
  description: "Training, body and nutrition — tracked in one private place.",
  icons: { icon: { url: "/favicon.svg", type: "image/svg+xml" } },
};

export const viewport: Viewport = {
  themeColor: "#08090a",
  colorScheme: "dark",
  // Lets the page draw under the iPhone home indicator; the tab bar pads
  // itself back out with env(safe-area-inset-bottom).
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The font variables live on <html> because globals.css applies `font-sans`
    // there — on <body> the var() would be out of scope and silently fall back.
    // The bottom scroll padding keeps focused fields clear of the phone's fixed bottom bar.
    // suppressHydrationWarning: the <head> script below sets data-accent before
    // React hydrates, which React would otherwise report as a mismatch.
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark scroll-pb-[calc(88px+env(safe-area-inset-bottom))] lg:scroll-pb-0 ${archivo.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* The account's accent colour, from a cookie, before anything paints —
            so nobody sees a flash of lime. Keeps pages static: no cookies() here. */}
        <script dangerouslySetInnerHTML={{ __html: ACCENT_BOOT_SCRIPT }} />
      </head>
      <body>
        {children}
        <ActivityLoader />
      </body>
    </html>
  );
}
