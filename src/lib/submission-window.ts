import type { Cohort, Milestone, Task } from "@/lib/types";

/** Matches server `endOfDayIST` — 23:59:59.999 IST → 17:29:59.999 UTC. */
function endOfDayIST(date: Date) {
  const end = new Date(date);
  end.setUTCHours(17, 29, 59, 999);
  return end;
}

function isPastEnd(iso: string) {
  return Date.now() > endOfDayIST(new Date(iso)).getTime();
}

function isBeforeStart(iso: string) {
  return Date.now() < new Date(iso).getTime();
}

export type SubmitWindow = {
  /** Real (non–dry-run) submit should be blocked. */
  blocked: boolean;
  /** Short reason for tooltip / alert. */
  reason: string | null;
};

/**
 * Client-side hint that mirrors the API window checks.
 * File uploads stay allowed; only a live write should be disabled.
 */
export function getSubmitWindow(input: {
  cohort: Cohort | null;
  target:
    | { kind: "milestone"; item: Milestone }
    | { kind: "task"; item: Task }
    | null;
}): SubmitWindow {
  const { cohort, target } = input;
  if (!target) return { blocked: false, reason: null };

  if (cohort?.status === "closed") {
    return {
      blocked: true,
      reason:
        "This cohort is closed. You can still attach files and dry-run, but a real submission will be rejected.",
    };
  }

  if (target.kind === "milestone") {
    const { startDate, endDate } = target.item;
    if (startDate && isBeforeStart(startDate)) {
      return {
        blocked: true,
        reason: `Submission window opens ${formatShort(startDate)}. Uploads and dry-run still work.`,
      };
    }
    if (endDate && isPastEnd(endDate)) {
      return {
        blocked: true,
        reason: `Deadline passed on ${formatShort(endDate)}. You can still upload files and dry-run; real submit is disabled.`,
      };
    }
  }

  if (target.kind === "task") {
    const { deadline } = target.item;
    if (deadline && isPastEnd(deadline)) {
      return {
        blocked: true,
        reason: `Task deadline passed on ${formatShort(deadline)}. You can still upload files and dry-run; real submit is disabled.`,
      };
    }
  }

  return { blocked: false, reason: null };
}

function formatShort(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
