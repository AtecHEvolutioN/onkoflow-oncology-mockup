import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title:
    process.env.NEXT_PUBLIC_ONKOFLOW_MODE === "department"
      ? "OnkoFlow | Offline GYN onkologický registr"
      : "OnkoFlow | GYN onkologický registr",
  description:
    process.env.NEXT_PUBLIC_ONKOFLOW_MODE === "department"
      ? "Offline provozní verze registru s ukládáním do vybrané datové složky."
      : "Provozní registr pro sledování pacientů v průběhu onkologické péče.",
  robots: {
    index: false,
    follow: false,
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/pwa-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/pwa-512.png", sizes: "512x512", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#17354e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs">
      <body>
        {children}
        <Script id="onkoflow-offline-registration" strategy="afterInteractive">
          {`
            (() => {
              if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

              const registerOfflineApp = async () => {
                try {
                  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
                  await navigator.serviceWorker.ready;
                  document.documentElement.dataset.onkoflowOfflineReady = "true";
                  console.info("OnkoFlow offline cache is ready.");
                } catch (error) {
                  console.error("OnkoFlow offline cache failed:", error);
                }
              };

              if (document.readyState === "complete") {
                void registerOfflineApp();
              } else {
                window.addEventListener("load", registerOfflineApp, { once: true });
              }
            })();
          `}
        </Script>
      </body>
    </html>
  );
}
