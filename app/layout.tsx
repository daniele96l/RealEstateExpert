import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "RealEstateExpert — Analizzatore investimenti immobiliari",
  description: "Analizza il flusso di cassa di un investimento immobiliare in Italia",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={dmSans.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
