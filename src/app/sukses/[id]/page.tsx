import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSubmission } from "@/lib/data";
import { PHOTO_TYPE_LABELS, SHELF_CATEGORY_LABELS } from "@/lib/validation";

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

async function SubmissionSummary({ params }: { params: PageProps<"/sukses/[id]">["params"] }) {
  const { id } = await params;
  const submission = await getSubmission(id);
  if (!submission) notFound();

  const rows = [
    { label: "Toko", value: submission.store.name },
    {
      label: "Kategori rak",
      value: submission.shelfCategory ? SHELF_CATEGORY_LABELS[submission.shelfCategory] : "-",
    },
    { label: "Jenis foto", value: PHOTO_TYPE_LABELS[submission.photoType] },
    { label: "Waktu kirim", value: `${dateFormatter.format(new Date(submission.submittedAt))} WIB` },
  ];

  // Older Before submissions (sent before the planogram flow) can still continue.
  const canContinue =
    submission.photoType === "before" && submission.shelfCategory && !submission.afterSubmissionId;

  return (
    <>
      {canContinue && (
        <Link
          href={`/planogram/${submission.id}`}
          className="flex h-14 w-full items-center justify-center rounded-xl border border-zinc-900 text-base font-semibold text-zinc-900 active:bg-zinc-100"
        >
          Lanjut ke Planogram &amp; Foto Sesudah Ditata
        </Link>
      )}
      <dl className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
        {rows.map((row) => (
          <div key={row.label} className="px-4 py-3">
            <dt className="text-sm text-zinc-500">{row.label}</dt>
            <dd className="text-base font-semibold text-zinc-900">{row.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export default function SuccessPage({ params }: PageProps<"/sukses/[id]">) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 pt-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-700">
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="m5 12 5 5 9-10" />
          </svg>
        </div>
        <h1 className="text-xl font-bold">Foto berhasil dikirim</h1>
        <p className="text-sm text-zinc-500">Submisi kamu sudah tersimpan.</p>
      </div>

      <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-zinc-200" />}>
        <SubmissionSummary params={params} />
      </Suspense>

      <Link
        href="/"
        className="flex h-14 w-full items-center justify-center rounded-xl bg-zinc-900 text-lg font-semibold text-white active:bg-zinc-700"
      >
        Kirim Foto Lain
      </Link>
    </div>
  );
}
