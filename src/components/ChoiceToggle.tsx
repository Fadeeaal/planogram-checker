"use client";

export type Choice<T extends string> = { value: T; label: string; hint?: string };

type Props<T extends string> = {
  label: string;
  options: readonly Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string;
  disabled?: boolean;
};

// Large two-up segmented buttons, easy to hit with one thumb.
export function ChoiceToggle<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  disabled,
}: Props<T>) {
  return (
    <div>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-3">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={`flex h-16 flex-col items-center justify-center rounded-xl border text-base font-semibold transition-colors disabled:opacity-50 ${
                selected
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : `bg-white text-zinc-900 active:bg-zinc-100 ${error ? "border-red-500" : "border-zinc-300"}`
              }`}
            >
              {option.label}
              {option.hint && (
                <span className={`text-xs font-normal ${selected ? "text-zinc-300" : "text-zinc-500"}`}>
                  {option.hint}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
