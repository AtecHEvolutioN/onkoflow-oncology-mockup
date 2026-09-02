import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:
    process.env.NEXT_PUBLIC_ONKOFLOW_MODE === "department"
      ? "OnkoFlow | Diagnostika lokálního úložiště"
      : "OnkoFlow | Demo registr onkologické péče",
  description:
    process.env.NEXT_PUBLIC_ONKOFLOW_MODE === "department"
      ? "Diagnostická verze lokálního úložiště OnkoFlow bez ukládání klinických dat."
      : "Interaktivní mockup pro sledování pacientů v průběhu onkologické péče.",
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
