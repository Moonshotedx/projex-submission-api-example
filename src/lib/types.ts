export type CohortStatus = "planned" | "live" | "closed";

export interface Cohort {
  id: string;
  name: string;
  type: string | null;
  visibility: string | null;
  startDate: string | null;
  endDate: string | null;
  status: CohortStatus;
}

export interface Milestone {
  id: string;
  ref: string | null;
  publicId: number | null;
  title: string;
  description: string | null;
  order: number | null;
  startDate: string | null;
  endDate: string | null;
  submissionType: string | null;
}

export interface Task {
  id: string;
  ref: string;
  publicId: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  milestoneId: string | null;
  deadline: string | null;
}

/** Attachment already uploaded to R2 via POST /uploads + PUT. */
export interface Attachment {
  fileKey: string;
  fileName?: string;
  /** Public URL of the uploaded file — used as the submission when uploading. */
  publicUrl?: string;
}

export interface UploadSlot {
  uploadUrl: string;
  fileKey: string;
  publicUrl: string;
  expiresIn: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      requestId?: string;
      details?: unknown;
    };

/** Matches the API allowlist on POST /uploads. */
export const UPLOAD_ACCEPT =
  "image/*,application/pdf,application/zip,text/*,.pdf,.zip,.txt,.md,.png,.jpg,.jpeg,.webp";

export const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
