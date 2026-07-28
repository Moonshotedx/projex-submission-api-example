"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileIcon, PaperclipIcon, Trash2Icon } from "lucide-react";

import { createUploadUrl } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import type { Attachment } from "@/lib/types";
import { UPLOAD_ACCEPT, UPLOAD_MAX_BYTES } from "@/lib/types";

type Props = {
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  disabled?: boolean;
  required?: boolean;
};

export function FileAttachments({
  attachments,
  onChange,
  disabled,
  required,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onPick(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const next = [...attachments];
      for (const file of Array.from(files)) {
        if (file.size > UPLOAD_MAX_BYTES) {
          toast.error(`${file.name} is over 50 MB`);
          continue;
        }
        const contentType = file.type || "application/octet-stream";
        const slot = await createUploadUrl({
          fileName: file.name,
          contentType,
          size: file.size,
        });
        if (!slot.ok) {
          toast.error(slot.message, { description: slot.code });
          continue;
        }

        const put = await fetch(slot.data.uploadUrl, {
          method: "PUT",
          headers: { "content-type": contentType },
          body: file,
        });
        if (!put.ok) {
          toast.error(`Upload failed for ${file.name} (${put.status})`);
          continue;
        }

        next.push({
          fileKey: slot.data.fileKey,
          fileName: file.name,
          publicUrl: slot.data.publicUrl,
        });
        toast.success(`Uploaded ${file.name}`);
      }
      onChange(next);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeAt(index: number) {
    onChange(attachments.filter((_, i) => i !== index));
  }

  return (
    <Field className="min-w-0 overflow-hidden">
      <FieldLabel>
        Attachments
        {required ? (
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </FieldLabel>
      <div className="flex min-w-0 flex-col gap-3">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={UPLOAD_ACCEPT}
          className="sr-only"
          disabled={disabled || uploading}
          onChange={(e) => void onPick(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="w-full"
        >
          {uploading ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <PaperclipIcon data-icon="inline-start" />
          )}
          {uploading ? "Uploading…" : "Add files"}
        </Button>

        {attachments.length > 0 ? (
          <ul className="flex min-w-0 flex-col gap-2 overflow-hidden">
            {attachments.map((file, index) => (
              <li
                key={file.fileKey}
                className="flex min-w-0 items-center gap-2 overflow-hidden rounded-lg border bg-muted/40 px-2.5 py-2"
              >
                <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p
                    className="truncate text-sm font-medium"
                    title={file.fileName ?? file.fileKey}
                  >
                    {file.fileName ?? file.fileKey.split("/").pop()}
                  </p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    {file.fileKey}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  ready
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled || uploading}
                  onClick={() => removeAt(index)}
                  aria-label={`Remove ${file.fileName ?? "file"}`}
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <FieldDescription>
        Presign → PUT to storage → submit with <code>fileKey</code>. Images,
        PDF, zip, or text · max 50 MB each.
      </FieldDescription>
    </Field>
  );
}
