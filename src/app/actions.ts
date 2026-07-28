"use server";

import { getProjexConfig } from "@/lib/env";
import { ProjexHttpError, projexFetch } from "@/lib/projex-api";
import type {
  ActionResult,
  Attachment,
  Cohort,
  CohortStatus,
  Milestone,
  Task,
  UploadSlot,
} from "@/lib/types";

function fail(error: unknown): ActionResult<never> {
  if (error instanceof ProjexHttpError) {
    return {
      ok: false,
      status: error.status,
      code: error.code,
      message: error.message,
      requestId: error.requestId,
      details: error.details,
    };
  }
  return {
    ok: false,
    status: 500,
    code: "internal_error",
    message: error instanceof Error ? error.message : "Unknown error",
  };
}

export async function getConfigStatus() {
  const { configured, baseUrl } = getProjexConfig();
  return { configured, baseUrl };
}

const PAGE_LIMIT = 25;

/** One page of results from a list endpoint. */
export type Page<T> = { items: T[]; nextCursor: string | null };

/**
 * Fetch a single page. The public API pages every list with `?limit&cursor`
 * and searches with `?q`; the UI drives that directly (server-side search +
 * cursor "Load more") instead of fetching everything up front.
 */
async function fetchPage<T>(
  path: string,
  key: "cohorts" | "milestones" | "tasks",
  query: Record<string, string | undefined> = {},
): Promise<Page<T>> {
  const page = await projexFetch<
    Record<string, T[]> & { nextCursor: string | null }
  >("GET", path, { query: { ...query, limit: String(PAGE_LIMIT) } });
  return {
    items: (page[key] as T[] | undefined) ?? [],
    nextCursor: page.nextCursor ?? null,
  };
}

type ListOpts = { q?: string; cursor?: string };

/** Omit status (or pass undefined) to list every enrollment. */
export async function listCohorts(
  status?: CohortStatus,
  opts: ListOpts = {},
): Promise<ActionResult<Page<Cohort>>> {
  try {
    const data = await fetchPage<Cohort>("/cohorts", "cohorts", {
      status,
      q: opts.q,
      cursor: opts.cursor,
    });
    return { ok: true, data };
  } catch (error) {
    return fail(error);
  }
}

export async function listAllCohorts(
  opts: ListOpts = {},
): Promise<ActionResult<Page<Cohort>>> {
  return listCohorts(undefined, opts);
}

export async function listCohortMilestones(
  cohortId: string,
  opts: ListOpts = {},
): Promise<ActionResult<Page<Milestone>>> {
  try {
    const data = await fetchPage<Milestone>(
      `/cohorts/${encodeURIComponent(cohortId)}/milestones`,
      "milestones",
      { q: opts.q, cursor: opts.cursor },
    );
    return { ok: true, data };
  } catch (error) {
    return fail(error);
  }
}

export async function listCohortTasks(
  cohortId: string,
  opts: { milestoneId?: string; assignee?: "me" | "others" } & ListOpts = {},
): Promise<ActionResult<Page<Task>>> {
  try {
    const data = await fetchPage<Task>(
      `/cohorts/${encodeURIComponent(cohortId)}/tasks`,
      "tasks",
      {
        milestoneId: opts.milestoneId,
        assignee: opts.assignee,
        q: opts.q,
        cursor: opts.cursor,
      },
    );
    return { ok: true, data };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Step 1 of file attach: ask ProjeX for a presigned PUT URL.
 * The browser then PUTs bytes straight to R2 (step 2).
 */
export async function createUploadUrl(input: {
  fileName: string;
  contentType: string;
  size?: number;
}): Promise<ActionResult<UploadSlot>> {
  try {
    const data = await projexFetch<UploadSlot>("POST", "/uploads", {
      body: input,
    });
    return { ok: true, data };
  } catch (error) {
    return fail(error);
  }
}

export async function submitMilestone(input: {
  ref: string;
  title: string;
  submission: string;
  attachments?: Attachment[];
  dryRun?: boolean;
  idempotencyKey?: string;
}): Promise<ActionResult<unknown>> {
  try {
    const data = await projexFetch(
      "POST",
      `/milestones/${encodeURIComponent(input.ref)}/submissions`,
      {
        body: {
          title: input.title,
          submission: input.submission,
          ...(input.attachments?.length
            ? { attachments: input.attachments }
            : {}),
        },
        idempotencyKey: input.idempotencyKey,
        query: input.dryRun ? { dryRun: "true" } : undefined,
      },
    );
    return { ok: true, data };
  } catch (error) {
    return fail(error);
  }
}

export async function submitTask(input: {
  ref: string;
  title: string;
  submission: string;
  attachments?: Attachment[];
  dryRun?: boolean;
  idempotencyKey?: string;
}): Promise<ActionResult<unknown>> {
  try {
    const data = await projexFetch(
      "POST",
      `/tasks/${encodeURIComponent(input.ref)}/submissions`,
      {
        body: {
          title: input.title,
          submission: input.submission,
          ...(input.attachments?.length
            ? { attachments: input.attachments }
            : {}),
        },
        idempotencyKey: input.idempotencyKey,
        query: input.dryRun ? { dryRun: "true" } : undefined,
      },
    );
    return { ok: true, data };
  } catch (error) {
    return fail(error);
  }
}
