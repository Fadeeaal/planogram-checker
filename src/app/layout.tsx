import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kirim Foto Rak · Tentang Anak",
  description: "Unggah foto rak toko (sebelum dan sesudah penataan) untuk SPG/MD Tentang Anak.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fafafa",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full">
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white">
                {/* Shelf icon */}
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M4 3v18M20 3v18M4 9h16M4 15h16" />
                  <path d="M7 9V6h3v3M13 15v-3h3v3" />
                </svg>
              </span>
              <span className="leading-tight">
                <span className="block text-[15px] font-bold tracking-tight text-zinc-900">Planogram Check</span>
                <span className="block text-[11px] text-zinc-500">Foto rak SPG/MD</span>
              </span>
            </Link>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">
              Tentang Anak
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-md px-4 py-5">{children}</main>
      </body>
    </html>
  );
}
