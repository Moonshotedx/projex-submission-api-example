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

/** Omit status (or pass undefined) to list every enrollment. */
export async function listCohorts(
  status?: CohortStatus,
): Promise<ActionResult<Cohort[]>> {
  try {
    const data = await projexFetch<{ cohorts: Cohort[] }>("GET", "/cohorts", {
      query: status ? { status } : undefined,
    });
    return { ok: true, data: data.cohorts };
  } catch (error) {
    return fail(error);
  }
}

export async function listCohortMilestones(
  cohortId: string,
): Promise<ActionResult<Milestone[]>> {
  try {
    const data = await projexFetch<{ milestones: Milestone[] }>(
      "GET",
      `/cohorts/${encodeURIComponent(cohortId)}/milestones`,
    );
    return { ok: true, data: data.milestones };
  } catch (error) {
    return fail(error);
  }
}

export async function listCohortTasks(
  cohortId: string,
  opts: { milestoneId?: string } = {},
): Promise<ActionResult<Task[]>> {
  try {
    const data = await projexFetch<{ tasks: Task[] }>(
      "GET",
      `/cohorts/${encodeURIComponent(cohortId)}/tasks`,
      { query: { milestoneId: opts.milestoneId } },
    );
    return { ok: true, data: data.tasks };
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
