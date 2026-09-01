import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OnkoFlow | Demo registr onkologické péče",
  description:
    "Interaktivní mockup pro sledování pacientů v průběhu onkologické péče.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
