"use client";

import { useEffect, useRef, useState } from "react";
import type { PlanStatus } from "@/lib/plan-status";

const POLL_MS = 5_000;
// After this the SPG gets the standard order instead of waiting longer.
const GIVE_UP_MS = 4 * 60 * 1000;

export type PlanState =
  | { phase: "waiting" }
  | { phase: "ready"; data: Extract<PlanStatus, { status: "ready" }> }
  // Analysis failed, timed out or was skipped: show the standard order.
  | { phase: "fallback" };

// Polls the Before photo's analysis until its planogram suggestion is ready.
// "ready" and "fallback" are final: once the SPG sees a plan it never changes,
// so the shelf they arrange matches the plan the After photo is scored against.
export function usePlanStatus(beforeId: string) {
  const [state, setState] = useState<PlanState>({ phase: "waiting" });
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    function finish(next: PlanState) {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      setState(next);
    }
    stopRef.current = () => finish({ phase: "fallback" });

    async function poll() {
      try {
        const res = await fetch(`/api/plan/${beforeId}`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as PlanStatus;
          if (data.status === "ready") return finish({ phase: "ready", data });
          if (data.status === "failed") return finish({ phase: "fallback" });
        }
      } catch {
        // Weak signal: keep polling until the deadline.
      }
      if (stopped) return;
      if (Date.now() - startedAt > GIVE_UP_MS) return finish({ phase: "fallback" });
      timer = setTimeout(poll, POLL_MS);
    }

    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [beforeId]);

  return { state, skip: () => stopRef.current() };
}
