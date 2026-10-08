import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { ActivityLoader } from "@/components/shell/activity-loader";
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
  appleWebApp: { capable: true, title: "JLIKA", statusBarStyle: "black" },
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
    <html
      lang="en"
      className={`dark ${archivo.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        {children}
        <ActivityLoader />
      </body>
    </html>
  );
}
