import type { SubmitPhase } from "./usePhotoSubmission";

type Props = {
  label: string;
  phase: SubmitPhase;
  progress: number;
  error: string | null;
  disabled: boolean;
};

// Fixed bottom bar with the submit button, upload progress and error message.
export function SubmitBar({ label, phase, progress, error, disabled }: Props) {
  const busy = phase === "uploading" || phase === "saving";

  let buttonLabel = label;
  if (phase === "uploading") buttonLabel = `Mengunggah… ${progress}%`;
  else if (phase === "saving") buttonLabel = "Menyimpan…";
  else if (phase === "failed") buttonLabel = "Coba Lagi";

  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
      <div className="mx-auto max-w-md">
        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {busy && (
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-zinc-200" aria-hidden>
            <div
              className="h-full bg-zinc-900 transition-[width] duration-200"
              style={{ width: `${phase === "saving" ? 100 : progress}%` }}
            />
          </div>
        )}
        <button
          type="submit"
          disabled={busy || disabled}
          aria-live="polite"
          className="h-14 w-full rounded-xl bg-zinc-900 text-lg font-semibold text-white active:bg-zinc-700 disabled:bg-zinc-500"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
