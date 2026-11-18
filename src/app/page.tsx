import { Suspense } from "react";
import { PendingAfterBanner } from "@/components/PendingAfterBanner";
import { SubmissionForm } from "@/components/SubmissionForm";
import { getStores } from "@/lib/data";

async function FormWithStores() {
  const stores = await getStores();
  return <SubmissionForm stores={stores} />;
}

function FormSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-label="Memuat daftar toko">
      <div className="h-14 rounded-xl bg-zinc-200" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-16 rounded-xl bg-zinc-200" />
        <div className="h-16 rounded-xl bg-zinc-200" />
      </div>
      <div className="h-28 rounded-xl bg-zinc-200" />
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <h1 className="mb-5 text-xl font-bold">Kirim Foto Rak</h1>
      <PendingAfterBanner />
      <Suspense fallback={<FormSkeleton />}>
        <FormWithStores />
      </Suspense>
    </>
  );
}
