import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 text-center">
      <p className="text-base font-semibold">Halaman tidak ditemukan</p>
      <Link
        href="/"
        className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-zinc-900 text-base font-semibold text-white"
      >
        Kembali ke Form
      </Link>
    </div>
  );
}
