import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ForgetPendingAfter } from "@/components/PendingAfterBanner";
import { PlanogramVisit } from "@/components/PlanogramVisit";
import { getSubmission } from "@/lib/data";

async function Visit({ params }: { params: PageProps<"/planogram/[id]">["params"] }) {
  const { id } = await params;
  const before = await getSubmission(id);
  if (!before || before.photoType !== "before" || !before.shelfCategory) notFound();

  if (before.afterSubmissionId) {
    return (
      <div className="flex flex-col gap-4">
        <ForgetPendingAfter beforeId={before.id} />
        <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
          Foto sesudah ditata untuk rak ini sudah dikirim.
        </p>
        <Link
          href="/"
          className="flex h-14 w-full items-center justify-center rounded-xl bg-zinc-900 text-lg font-semibold text-white active:bg-zinc-700"
        >
          Kirim Foto Lain
        </Link>
      </div>
    );
  }

  return (
    <PlanogramVisit
      beforeId={before.id}
      storeId={before.storeId}
      storeName={before.store.name}
      category={before.shelfCategory}
    />
  );
}

export default function PlanogramPage({ params }: PageProps<"/planogram/[id]">) {
  return (
    <>
      <div className="mb-5 flex items-center gap-3 rounded-xl bg-green-50 px-4 py-3 text-green-800">
        <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path d="m5 12 5 5 9-10" />
        </svg>
        <p className="text-sm font-semibold">Foto sebelum ditata terkirim</p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-zinc-200" />}>
        <Visit params={params} />
      </Suspense>
    </>
  );
}
