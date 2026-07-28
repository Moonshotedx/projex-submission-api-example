import "server-only";

import { getProjexConfig } from "@/lib/env";
import type { ApiErrorBody } from "@/lib/types";

export class ProjexHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    requestId?: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ProjexHttpError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

type RequestOpts = {
  query?: Record<string, string | undefined>;
  body?: unknown;
  idempotencyKey?: string;
};

/**
 * Minimal fetch wrapper over `/api/v1`. Same contract the SDK uses —
 * Bearer key, JSON bodies, Idempotency-Key, dryRun query.
 */
export async function projexFetch<T>(
  method: string,
  path: string,
  opts: RequestOpts = {},
): Promise<T> {
  const { apiKey, baseUrl } = getProjexConfig();
  if (!apiKey) {
    throw new ProjexHttpError(
      401,
      "missing_api_key",
      "Set PROJEX_API_KEY in .env.local (Account → API keys).",
    );
  }

  const url = new URL(`${baseUrl}/api/v1${path}`);
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
      ...(opts.idempotencyKey
        ? { "idempotency-key": opts.idempotencyKey }
        : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : {};

  if (!res.ok) {
    const err = (json as ApiErrorBody)?.error ?? {};
    throw new ProjexHttpError(
      res.status,
      err.code ?? "error",
      err.message ?? res.statusText,
      err.requestId,
      err.details,
    );
  }

  return json as T;
}
