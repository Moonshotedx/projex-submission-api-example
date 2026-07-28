"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  ClipboardListIcon,
  FolderOpenIcon,
  KeyRoundIcon,
  ListTodoIcon,
  RefreshCwIcon,
  SearchIcon,
  SendIcon,
  SparklesIcon,
} from "lucide-react";

import {
  getConfigStatus,
  listAllCohorts,
  listCohortMilestones,
  listCohortTasks,
  listCohorts,
  submitMilestone,
  submitTask,
} from "@/app/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  ActionResult,
  Attachment,
  Cohort,
  CohortStatus,
  Milestone,
  Task,
} from "@/lib/types";
import { getSubmitWindow } from "@/lib/submission-window";
import { cn } from "@/lib/utils";
import { FileAttachments } from "@/components/file-attachments";
import { z } from "zod";

const linkSchema = z.string().trim().url();

type Target =
  | { kind: "milestone"; item: Milestone }
  | { kind: "task"; item: Task };

type StatusFilter = "all" | CohortStatus;
type ItemTab = "milestones" | "tasks";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "planned", label: "Planned" },
  { value: "closed", label: "Closed" },
];

export function Explorer({ routeCohortId }: { routeCohortId?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const value = searchParams?.get("status");
    if (
      value === "all" ||
      value === "live" ||
      value === "planned" ||
      value === "closed"
    ) {
      return value;
    }
    return routeCohortId ? "all" : "live";
  });
  const [cohortQuery, setCohortQuery] = useState(() => searchParams?.get("q") ?? "");
  const [itemQuery, setItemQuery] = useState(() => searchParams?.get("itemQ") ?? "");
  const [taskMilestoneFilter, setTaskMilestoneFilter] = useState<string>(
    () => searchParams?.get("milestone") ?? "all",
  );
  const [assigneeScope, setAssigneeScope] = useState<"all" | "me" | "others">(
    () => {
      const value = searchParams?.get("assignee");
      return value === "me" || value === "others" ? value : "all";
    },
  );
  const [tab, setTab] = useState<ItemTab>(() => {
    const value = searchParams?.get("tab");
    return value === "tasks" ? "tasks" : "milestones";
  });
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortsCursor, setCohortsCursor] = useState<string | null>(null);
  const [selectedCohort, setSelectedCohort] = useState<Cohort | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [milestonesCursor, setMilestonesCursor] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksCursor, setTasksCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [title, setTitle] = useState("");
  const [submission, setSubmission] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitMode, setSubmitMode] = useState<"link" | "file">("link");
  const [dryRun, setDryRun] = useState(true);
  const [lastResult, setLastResult] = useState<ActionResult<unknown> | null>(
    null,
  );
  const [loadingCohorts, setLoadingCohorts] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function setUrlState(
    updates: Record<string, string | null | undefined>,
    options?: { path?: string },
  ) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    for (const [key, value] of Object.entries(updates)) {
      const shouldDelete =
        value == null ||
        value === "" ||
        (key === "status" && value === "all") ||
        (key === "milestone" && value === "all") ||
        (key === "tab" && value === "milestones");

      if (shouldDelete) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const qs = params.toString();
    const nextPath = options?.path ?? pathname;
    router.replace(qs ? `${nextPath}?${qs}` : nextPath, { scroll: false });
  }

  async function loadCohorts(
    nextStatus: StatusFilter = statusFilter,
    opts: { cursor?: string; q?: string } = {},
  ) {
    const append = Boolean(opts.cursor);
    if (append) setLoadingMore(true);
    else setLoadingCohorts(true);
    try {
      const effectiveStatus = routeCohortId ? "all" : nextStatus;
      const status = await getConfigStatus();
      setConfigured(status.configured);
      setBaseUrl(status.baseUrl);

      if (!status.configured) {
        setCohorts([]);
        setCohortsCursor(null);
        return;
      }

      const q = opts.q ?? (cohortQuery.trim() || undefined);
      const result =
        effectiveStatus === "all"
          ? await listAllCohorts({ q, cursor: opts.cursor })
          : await listCohorts(effectiveStatus, { q, cursor: opts.cursor });
      if (!result.ok) {
        toast.error(result.message, { description: result.code });
        if (!append) setCohorts([]);
        return;
      }
      setCohorts((prev) =>
        append ? [...prev, ...result.data.items] : result.data.items,
      );
      setCohortsCursor(result.data.nextCursor);
    } finally {
      setLoadingCohorts(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void loadCohorts(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // Debounced server-side search for cohorts (reloads page 1).
  useEffect(() => {
    if (routeCohortId) return;
    const handle = setTimeout(() => {
      void loadCohorts(statusFilter, { q: cohortQuery.trim() || undefined });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortQuery]);

  // Sync only the discrete controls (status / tab / milestone filter) from the
  // URL. The free-text search inputs are owned by local state — seeded from the
  // URL on mount (via the useState initializers) and written back on change.
  // Reading them back here races the async router.replace and drops keystrokes.
  useEffect(() => {
    if (!searchParams) return;
    const nextStatus = searchParams.get("status");
    const nextMilestone = searchParams.get("milestone") ?? "all";
    const nextTab = searchParams.get("tab") === "tasks" ? "tasks" : "milestones";

    const safeStatus: StatusFilter =
      nextStatus === "planned" ||
      nextStatus === "closed" ||
      nextStatus === "all" ||
      nextStatus === "live"
        ? nextStatus
        : routeCohortId
          ? "all"
          : "live";

    if (safeStatus !== statusFilter) setStatusFilter(safeStatus);
    if (nextMilestone !== taskMilestoneFilter) setTaskMilestoneFilter(nextMilestone);
    if (nextTab !== tab) setTab(nextTab);
  }, [routeCohortId, searchParams, statusFilter, tab, taskMilestoneFilter]);

  useEffect(() => {
    if (!routeCohortId) {
      if (selectedCohort) {
        setSelectedCohort(null);
        setTarget(null);
      }
      return;
    }
    if (selectedCohort?.id && selectedCohort.id !== routeCohortId) {
      setSelectedCohort(null);
      setTarget(null);
      setLastResult(null);
    }
    if (!cohorts.length || selectedCohort?.id === routeCohortId) {
      return;
    }
    const match = cohorts.find((cohort) => cohort.id === routeCohortId);
    if (match) {
      openCohort(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeCohortId, cohorts]);

  useEffect(() => {
    if (!selectedCohort || !searchParams) return;
    const targetKind = searchParams.get("targetKind");
    const targetId = searchParams.get("targetId");
    if (!targetKind || !targetId) return;
    const normalizedKind =
      targetKind === "tasks" || targetKind === "task"
        ? "task"
        : targetKind === "milestones" || targetKind === "milestone"
          ? "milestone"
          : null;
    if (!normalizedKind) return;
    if (target?.kind === normalizedKind && target.item.id === targetId) return;
    const collection = normalizedKind === "task" ? tasks : milestones;
    const found = collection.find((item) => item.id === targetId);
    if (!found) return;
    pickTarget({
      kind: normalizedKind,
      item: found as Task & Milestone,
    } as Target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCohort, tasks, milestones, searchParams]);

  // Search + milestone filtering now happen server-side (`?q`, `?milestoneId`),
  // so these are pass-throughs kept for the render's existing references.
  const filteredCohorts = cohorts;
  const filteredMilestones = milestones;
  const filteredTasks = tasks;
  const taskMilestoneFilterLabel = useMemo(() => {
    if (taskMilestoneFilter === "all") {
      return "All milestones";
    }

    return (
      milestones.find((milestone) => milestone.id === taskMilestoneFilter)?.title ??
      "Selected milestone"
    );
  }, [milestones, taskMilestoneFilter]);

  function onStatusFilterChange(values: string[]) {
    const next = (values[0] as StatusFilter | undefined) ?? statusFilter;
    if (next === statusFilter) return;
    setStatusFilter(next);
    setSelectedCohort(null);
    setTarget(null);
    setLastResult(null);
    setItemQuery("");
    setTaskMilestoneFilter("all");
    setTab("milestones");
    setUrlState(
      {
        status: next,
        itemQ: null,
        milestone: null,
        tab: null,
        targetKind: null,
        targetId: null,
      },
      { path: "/" },
    );
  }

  function openCohort(cohort: Cohort) {
    setSelectedCohort(cohort);
    setTarget(null);
    setLastResult(null);
    setItemQuery("");
    setTaskMilestoneFilter("all");
    setTab("milestones");
    setUrlState(
      {
        itemQ: null,
        milestone: null,
        tab: null,
        targetKind: null,
        targetId: null,
      },
      { path: `/cohorts/${cohort.id}` },
    );
    setAssigneeScope("all");
    setMilestonesCursor(null);
    setTasksCursor(null);
    setLoadingDetail(true);
    void (async () => {
      try {
        const [ms, ts] = await Promise.all([
          listCohortMilestones(cohort.id),
          listCohortTasks(cohort.id),
        ]);
        if (!ms.ok) {
          toast.error(ms.message);
          setMilestones([]);
          setMilestonesCursor(null);
        } else {
          setMilestones(ms.data.items);
          setMilestonesCursor(ms.data.nextCursor);
        }
        if (!ts.ok) {
          toast.error(ts.message);
          setTasks([]);
          setTasksCursor(null);
        } else {
          setTasks(ts.data.items);
          setTasksCursor(ts.data.nextCursor);
        }
      } finally {
        setLoadingDetail(false);
      }
    })();
  }

  // Reload the task list (page 1) with the current milestone + assignee + search
  // filters — all applied server-side.
  function reloadTasks(
    cohortId: string,
    over: { milestoneId?: string; assignee?: "me" | "others" } = {},
  ) {
    const milestoneId =
      "milestoneId" in over
        ? over.milestoneId
        : taskMilestoneFilter === "all"
          ? undefined
          : taskMilestoneFilter;
    const assignee =
      "assignee" in over
        ? over.assignee
        : assigneeScope === "all"
          ? undefined
          : assigneeScope;
    setLoadingTasks(true);
    void (async () => {
      try {
        const result = await listCohortTasks(cohortId, {
          milestoneId,
          assignee,
          q: itemQuery.trim() || undefined,
        });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        setTasks(result.data.items);
        setTasksCursor(result.data.nextCursor);
      } finally {
        setLoadingTasks(false);
      }
    })();
  }

  function onTaskMilestoneFilterChange(value: string | null) {
    const next = value ?? "all";
    setTaskMilestoneFilter(next);
    setUrlState({ milestone: next });
    if (!selectedCohort) return;
    reloadTasks(selectedCohort.id, {
      milestoneId: next === "all" ? undefined : next,
    });
  }

  function onAssigneeScopeChange(next: "all" | "me" | "others") {
    setAssigneeScope(next);
    setUrlState({ assignee: next === "all" ? null : next });
    if (!selectedCohort) return;
    reloadTasks(selectedCohort.id, {
      assignee: next === "all" ? undefined : next,
    });
  }

  function loadMoreCohorts() {
    if (!cohortsCursor) return;
    void loadCohorts(statusFilter, {
      cursor: cohortsCursor,
      q: cohortQuery.trim() || undefined,
    });
  }

  function loadMoreMilestones() {
    if (!selectedCohort || !milestonesCursor) return;
    setLoadingMore(true);
    const cohortId = selectedCohort.id;
    void (async () => {
      try {
        const r = await listCohortMilestones(cohortId, {
          q: itemQuery.trim() || undefined,
          cursor: milestonesCursor,
        });
        if (r.ok) {
          setMilestones((prev) => [...prev, ...r.data.items]);
          setMilestonesCursor(r.data.nextCursor);
        } else {
          toast.error(r.message);
        }
      } finally {
        setLoadingMore(false);
      }
    })();
  }

  function loadMoreTasks() {
    if (!selectedCohort || !tasksCursor) return;
    setLoadingMore(true);
    const cohortId = selectedCohort.id;
    void (async () => {
      try {
        const r = await listCohortTasks(cohortId, {
          milestoneId:
            taskMilestoneFilter === "all" ? undefined : taskMilestoneFilter,
          assignee: assigneeScope === "all" ? undefined : assigneeScope,
          q: itemQuery.trim() || undefined,
          cursor: tasksCursor,
        });
        if (r.ok) {
          setTasks((prev) => [...prev, ...r.data.items]);
          setTasksCursor(r.data.nextCursor);
        } else {
          toast.error(r.message);
        }
      } finally {
        setLoadingMore(false);
      }
    })();
  }

  // Debounced server-side search for milestones + tasks in the open cohort.
  useEffect(() => {
    if (!selectedCohort) return;
    const cohortId = selectedCohort.id;
    const handle = setTimeout(() => {
      const q = itemQuery.trim() || undefined;
      void (async () => {
        const ms = await listCohortMilestones(cohortId, { q });
        if (ms.ok) {
          setMilestones(ms.data.items);
          setMilestonesCursor(ms.data.nextCursor);
        }
      })();
      reloadTasks(cohortId);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemQuery]);

  function pickTarget(next: Target) {
    setTarget(next);
    setTitle("");
    setSubmission("");
    setAttachments([]);
    setLastResult(null);
    setTab(next.kind === "task" ? "tasks" : "milestones");
    setUrlState({
      tab: next.kind === "task" ? "tasks" : "milestones",
      targetKind: next.kind,
      targetId: next.item.id,
    });
  }

  function goHome() {
    setSelectedCohort(null);
    setTarget(null);
    setAttachments([]);
    setItemQuery("");
    setCohortQuery("");
    setTaskMilestoneFilter("all");
    setTab("milestones");
    setLastResult(null);
    setUrlState(
      {
        q: null,
        itemQ: null,
        milestone: null,
        tab: null,
        targetKind: null,
        targetId: null,
      },
      { path: "/" },
    );
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!target) return;

    const ref =
      target.kind === "milestone" ? target.item.ref : target.item.ref;

    if (!ref) {
      toast.error("This milestone has no submittable ref yet.");
      return;
    }

    // The projex API requires a single `submission` value (a URL). In "link"
    // mode that's what the user typed; in "file" mode it's the uploaded file's
    // public URL — so the user never has to paste a link and upload a file.
    let effectiveSubmission: string;
    if (submitMode === "link") {
      const parsed = linkSchema.safeParse(submission);
      if (!parsed.success) {
        toast.error("Enter a valid URL (https://…)");
        return;
      }
      effectiveSubmission = parsed.data;
    } else {
      effectiveSubmission = attachments[0]?.publicUrl ?? "";
      if (!effectiveSubmission) {
        toast.error("Upload a file to submit.");
        return;
      }
    }

    setSubmitting(true);
    void (async () => {
      try {
        if (!dryRun) {
          const window = getSubmitWindow({
            cohort: selectedCohort,
            target,
          });
          if (window.blocked) {
            toast.error("Submission window is closed", {
              description: window.reason ?? undefined,
            });
            return;
          }
        }

        const payload = {
          ref,
          title: title.trim() || `${target.kind} submission`,
          submission: effectiveSubmission,
          attachments: attachments.length ? attachments : undefined,
          dryRun,
          idempotencyKey: dryRun ? undefined : crypto.randomUUID(),
        };

        const result =
          target.kind === "milestone"
            ? await submitMilestone(payload)
            : await submitTask(payload);

        setLastResult(result);
        if (result.ok) {
          toast.success(dryRun ? "Looks good — dry-run passed" : "Submitted");
        } else {
          toast.error(result.message, { description: result.code });
        }
      } finally {
        setSubmitting(false);
      }
    })();
  }

  const isDetailRoute = Boolean(routeCohortId);
  const routeCohortMatch = routeCohortId
    ? cohorts.find((cohort) => cohort.id === routeCohortId)
    : null;
  const needsRouteSelection =
    isDetailRoute && (!selectedCohort || selectedCohort.id !== routeCohortId);
  const isHydratingRouteSelection =
    needsRouteSelection && Boolean(routeCohortMatch);
  const isResolvingRouteCohort =
    (needsRouteSelection &&
      (configured === null ||
        loadingCohorts ||
        loadingDetail ||
        cohorts.length === 0 ||
        isHydratingRouteSelection)) ||
    (isDetailRoute && selectedCohort?.id === routeCohortId && loadingDetail);
  const routeCohortMissing =
    needsRouteSelection &&
    !isResolvingRouteCohort &&
    configured === true &&
    !routeCohortMatch;
  const step = isDetailRoute ? (target ? 3 : 2) : !selectedCohort ? 1 : target ? 3 : 2;
  const host = baseUrl.replace(/^https?:\/\//, "");
  const statusHeading =
    statusFilter === "all"
      ? "Your cohorts"
      : `Your ${statusFilter} cohorts`;

  const submitWindow = useMemo(
    () => getSubmitWindow({ cohort: selectedCohort, target }),
    [selectedCohort, target],
  );
  const detailBusy = loadingDetail || loadingTasks || submitting;
  const realSubmitBlocked = submitWindow.blocked && !dryRun;
  const submitInvalid =
    submitMode === "link"
      ? !linkSchema.safeParse(submission).success
      : attachments.length === 0;
  const submitDisabled = submitting || realSubmitBlocked || submitInvalid;
  const cohortDetailQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "live") params.set("status", statusFilter);
    if (cohortQuery.trim()) params.set("q", cohortQuery.trim());
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [cohortQuery, statusFilter]);

  return (
    <div className="flex min-h-svh flex-col overflow-x-hidden bg-background">
      <header className="sticky top-0 z-20 shrink-0 border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
              <SparklesIcon className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">
                ProjeX · REST example
              </p>
              <p className="truncate text-xs text-muted-foreground">
                Try the submission API without writing a client
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {configured === true ? (
              <Badge
                variant="secondary"
                className="hidden max-w-40 min-w-0 font-normal sm:inline-flex lg:max-w-56"
                title={host}
              >
                <span className="mr-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span className="truncate">{host}</span>
              </Badge>
            ) : configured === false ? (
              <Badge variant="destructive">Key missing</Badge>
            ) : (
              <Badge variant="secondary">Checking…</Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadCohorts()}
              disabled={loadingCohorts}
            >
              {loadingCohorts ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RefreshCwIcon data-icon="inline-start" />
              )}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col gap-6 overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
        <section className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h1
              className="truncate text-2xl font-semibold tracking-tight sm:text-3xl"
              title={selectedCohort?.name}
            >
              {selectedCohort ? selectedCohort.name : statusHeading}
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">
              {selectedCohort
                ? "Pick something to submit, fill in a short note or link, then validate with dry-run before you write."
                : "Filter by run status, search by name, then open a cohort. Refs come from the API — no string building."}
            </p>
          </div>
          <div className="min-w-0 overflow-x-auto pb-0.5 sm:shrink-0">
            <StepPills step={step} />
          </div>
        </section>

        {configured === false ? (
          <Alert className="min-w-0 overflow-hidden border-amber-500/30 bg-amber-500/5">
            <KeyRoundIcon />
            <AlertTitle>Add your API key to continue</AlertTitle>
            <AlertDescription className="break-words">
              Copy{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                .env.example
              </code>{" "}
              to{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                .env.local
              </code>
              , paste{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                PROJEX_API_KEY
              </code>{" "}
              from Account → API keys, then restart{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                pnpm dev
              </code>
              .
            </AlertDescription>
          </Alert>
        ) : null}

        {!isDetailRoute && !selectedCohort ? (
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <ToggleGroup
                value={[statusFilter]}
                onValueChange={onStatusFilterChange}
                variant="outline"
                size="sm"
                className="flex-wrap"
                aria-label="Cohort status filter"
              >
                {STATUS_FILTERS.map((opt) => (
                  <ToggleGroupItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div className="relative min-w-0 w-full sm:max-w-xs">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={cohortQuery}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCohortQuery(value);
                    setUrlState({ q: value || null });
                  }}
                  placeholder="Search cohorts…"
                  className="pl-8"
                  aria-label="Search cohorts"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {cohorts.length} loaded
              {cohortsCursor ? "+" : ""}
              {statusFilter === "all"
                ? " (all statuses)"
                : ` · status=${statusFilter}`}
              {cohortQuery.trim() ? " · searching server-side" : ""}
            </p>
            <CohortList
              cohorts={filteredCohorts}
              loading={loadingCohorts && cohorts.length === 0 && configured !== false}
              emptyTitle={
                cohortQuery.trim()
                  ? "No cohorts match your search"
                  : statusFilter === "all"
                    ? "No cohorts found"
                    : `No ${statusFilter} cohorts found`
              }
              emptyDescription={
                cohortQuery.trim()
                  ? "Try a different name or clear the search."
                  : "Your key’s user may not be enrolled, or the key is missing cohorts:read."
              }
              getHref={(cohort) => `/cohorts/${cohort.id}${cohortDetailQuery}`}
            />
            {cohortsCursor ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={loadingMore}
                onClick={loadMoreCohorts}
              >
                {loadingMore ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <ArrowRightIcon data-icon="inline-start" />
                )}
                Load more
              </Button>
            ) : null}
          </div>
        ) : isResolvingRouteCohort ? (
          <div className="flex min-w-0 flex-col gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={goHome}
            >
              <ArrowLeftIcon data-icon="inline-start" />
              Back to cohorts
            </Button>
            <Card className="shadow-sm">
              <CardContent className="flex min-h-56 flex-col gap-3 pt-6">
                <Skeleton className="h-8 w-56" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          </div>
        ) : routeCohortMissing ? (
          <div className="flex min-w-0 flex-col gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={goHome}
            >
              <ArrowLeftIcon data-icon="inline-start" />
              Back to cohorts
            </Button>
            <Empty className="border bg-card py-16 shadow-sm">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CircleAlertIcon />
                </EmptyMedia>
                <EmptyTitle>Couldn&apos;t open this cohort</EmptyTitle>
                <EmptyDescription>
                  It may be unavailable for this API key, or the link may be out
                  of date.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={goHome}
            >
              <ArrowLeftIcon data-icon="inline-start" />
              Back to cohorts
            </Button>

            <div className="grid min-w-0 items-stretch gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start">
              <Card className="flex h-[min(720px,calc(100svh-11rem))] min-h-0 min-w-0 flex-col overflow-hidden shadow-sm">
                <CardHeader className="shrink-0 overflow-hidden border-b bg-card">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
                      <CardTitle className="truncate">
                        What do you want to submit?
                      </CardTitle>
                      <CardDescription className="line-clamp-2 text-pretty">
                        Choose a milestone or task. Refs come from the API.
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {selectedCohort!.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card pt-5">
                  {loadingDetail ? (
                    <div className="flex flex-col gap-3">
                      <Skeleton className="h-9 w-full max-w-64" />
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : (
                    <Tabs
                      value={tab}
                      onValueChange={(value) => {
                        if (detailBusy) return;
                        const next = value === "tasks" ? "tasks" : "milestones";
                        setTab(next);
                        setUrlState({ tab: next });
                      }}
                      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                    >
                      <div className="flex min-w-0 shrink-0 flex-col gap-3">
                        <div className="min-w-0 overflow-x-auto">
                          <TabsList className="h-auto w-max max-w-full">
                            <TabsTrigger value="milestones" disabled={detailBusy}>
                              <ClipboardListIcon data-icon="inline-start" />
                              Milestones
                              <Badge variant="outline" className="ml-1 shrink-0">
                                {filteredMilestones.length}
                              </Badge>
                            </TabsTrigger>
                            <TabsTrigger value="tasks" disabled={detailBusy}>
                              <ListTodoIcon data-icon="inline-start" />
                              Tasks
                              <Badge variant="outline" className="ml-1 shrink-0">
                                {filteredTasks.length}
                              </Badge>
                            </TabsTrigger>
                          </TabsList>
                        </div>
                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                          <div className="relative min-w-0 flex-1">
                            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              value={itemQuery}
                              onChange={(e) => {
                                const value = e.target.value;
                                setItemQuery(value);
                                setUrlState({ itemQ: value || null });
                              }}
                              disabled={detailBusy}
                              placeholder="Filter by title or ref…"
                              className="pl-8"
                              aria-label="Filter items"
                            />
                          </div>
                          {tab === "tasks" ? (
                            <Select
                              value={taskMilestoneFilter}
                              onValueChange={onTaskMilestoneFilterChange}
                              disabled={detailBusy}
                            >
                              <SelectTrigger className="w-full min-w-0 sm:w-52">
                                <span className="min-w-0 flex-1 truncate text-left">
                                  {taskMilestoneFilterLabel}
                                </span>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="all">
                                    All milestones
                                  </SelectItem>
                                  {milestones.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                      {m.title}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          ) : null}
                        </div>
                        {tab === "tasks" ? (
                          <ToggleGroup
                            value={[assigneeScope]}
                            onValueChange={(values: string[]) => {
                              const next = values[0];
                              if (
                                next === "all" ||
                                next === "me" ||
                                next === "others"
                              ) {
                                onAssigneeScopeChange(next);
                              }
                            }}
                            variant="outline"
                            size="sm"
                            disabled={detailBusy}
                            className="flex-wrap"
                            aria-label="Task assignee"
                          >
                            <ToggleGroupItem value="all">
                              All team tasks
                            </ToggleGroupItem>
                            <ToggleGroupItem value="me">
                              Assigned to me
                            </ToggleGroupItem>
                            <ToggleGroupItem value="others">
                              Assigned to others
                            </ToggleGroupItem>
                          </ToggleGroup>
                        ) : null}
                        {tab === "tasks" && loadingTasks ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Spinner className="size-3" />
                            Updating tasks…
                          </div>
                        ) : null}
                      </div>
                      <TabsContent
                        value="milestones"
                        className="mt-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pt-4 data-[state=inactive]:hidden"
                      >
                        <ItemList
                          disabled={detailBusy}
                          emptyTitle="No milestones match"
                          emptyDescription="Try clearing the search, or this cohort has no milestones for your key."
                          items={filteredMilestones.map((m) => ({
                            key: m.id,
                            title: m.title,
                            ref: m.ref,
                            meta: m.endDate
                              ? `Due ${formatDate(m.endDate)}`
                              : "No deadline",
                            active:
                              target?.kind === "milestone" &&
                              target.item.id === m.id,
                            onClick: () =>
                              pickTarget({ kind: "milestone", item: m }),
                          }))}
                        />
                        {milestonesCursor ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 w-full shrink-0"
                            disabled={loadingMore}
                            onClick={loadMoreMilestones}
                          >
                            {loadingMore ? (
                              <Spinner data-icon="inline-start" />
                            ) : null}
                            Load more
                          </Button>
                        ) : null}
                      </TabsContent>
                      <TabsContent
                        value="tasks"
                        className="mt-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pt-4 data-[state=inactive]:hidden"
                      >
                        <ItemList
                          disabled={detailBusy}
                          emptyTitle="No tasks match"
                          emptyDescription="Try another milestone filter or clear the search."
                          items={filteredTasks.map((t) => ({
                            key: t.id,
                            title: t.title,
                            ref: t.ref,
                            meta: t.status,
                            active:
                              target?.kind === "task" &&
                              target.item.id === t.id,
                            onClick: () =>
                              pickTarget({ kind: "task", item: t }),
                          }))}
                        />
                        {tasksCursor ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 w-full shrink-0"
                            disabled={loadingMore}
                            onClick={loadMoreTasks}
                          >
                            {loadingMore ? (
                              <Spinner data-icon="inline-start" />
                            ) : null}
                            Load more
                          </Button>
                        ) : null}
                      </TabsContent>
                    </Tabs>
                  )}
                </CardContent>
              </Card>

              <Card className="flex max-h-[min(720px,calc(100svh-11rem))] min-h-0 min-w-0 flex-col overflow-hidden shadow-sm lg:sticky lg:top-20">
                <CardHeader className="shrink-0 overflow-hidden border-b bg-card">
                  <CardTitle className="flex min-w-0 items-center gap-2">
                    <SendIcon className="size-4 shrink-0" />
                    <span className="truncate">
                      {target ? `Submit ${target.kind}` : "Almost there"}
                    </span>
                  </CardTitle>
                  <CardDescription className="line-clamp-2 text-pretty">
                    {target
                      ? dryRun
                        ? "Dry-run checks windows and permissions without saving."
                        : "This will create a real submission for the selected ref."
                      : "Select a milestone or task on the left to unlock the form."}
                  </CardDescription>
                </CardHeader>

                <CardContent className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-card pt-5">
                  {target ? (
                    <form
                      id="submit-form"
                      onSubmit={onSubmit}
                      className="min-w-0"
                    >
                      <FieldGroup>
                        <Field className="min-w-0 overflow-hidden">
                          <FieldLabel>Selected ref</FieldLabel>
                          <Input
                            readOnly
                            value={
                              target.kind === "milestone"
                                ? (target.item.ref ?? "—")
                                : target.item.ref
                            }
                            className="min-w-0 overflow-hidden font-mono text-ellipsis"
                            title={
                              target.kind === "milestone"
                                ? (target.item.ref ?? undefined)
                                : target.item.ref
                            }
                          />
                          <FieldDescription className="line-clamp-2 break-words">
                            {target.item.title}
                          </FieldDescription>
                        </Field>
                        <Field className="min-w-0 overflow-hidden">
                          <FieldLabel htmlFor="title">Title</FieldLabel>
                          <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            disabled={submitting}
                            placeholder="e.g. Sprint 2 build"
                            required
                            className="min-w-0"
                          />
                        </Field>
                        <Field className="min-w-0 overflow-hidden">
                          <FieldLabel>What are you submitting?</FieldLabel>
                          <ToggleGroup
                            value={[submitMode]}
                            onValueChange={(values: string[]) => {
                              const next = values[0];
                              if (next === "link" || next === "file") {
                                setSubmitMode(next);
                              }
                            }}
                            variant="outline"
                            size="sm"
                            disabled={submitting}
                            className="w-full"
                          >
                            <ToggleGroupItem value="link" className="flex-1">
                              Paste a link
                            </ToggleGroupItem>
                            <ToggleGroupItem value="file" className="flex-1">
                              Upload a file
                            </ToggleGroupItem>
                          </ToggleGroup>
                          <FieldDescription>
                            A submission is one URL. Paste a link, or upload a
                            file and its URL becomes the submission.
                          </FieldDescription>
                        </Field>

                        {submitMode === "link" ? (
                          <Field className="min-w-0 overflow-hidden">
                            <FieldLabel htmlFor="body">Link</FieldLabel>
                            <Input
                              id="body"
                              type="url"
                              inputMode="url"
                              value={submission}
                              onChange={(e) => setSubmission(e.target.value)}
                              disabled={submitting}
                              placeholder="https://github.com/you/repo/pull/12"
                              className="min-w-0"
                            />
                            <FieldDescription>
                              A PR, demo, or doc URL. Must be a valid link.
                            </FieldDescription>
                          </Field>
                        ) : (
                          <>
                            <FileAttachments
                              attachments={attachments}
                              onChange={setAttachments}
                              disabled={submitting}
                              required
                            />
                            {attachments.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                Upload a file — its URL becomes your submission.
                              </p>
                            ) : null}
                          </>
                        )}
                        {submitWindow.blocked ? (
                          <Alert className="border-amber-500/30 bg-amber-500/5">
                            <CircleAlertIcon />
                            <AlertTitle>Submission window closed</AlertTitle>
                            <AlertDescription>
                              {submitWindow.reason} Keep dry-run on to validate
                              against the API, or turn it off to see the
                              disabled submit control.
                            </AlertDescription>
                          </Alert>
                        ) : null}
                        <Field
                          orientation="horizontal"
                          className="min-w-0 overflow-hidden"
                        >
                          <Checkbox
                            id="dry-run"
                            checked={dryRun}
                            onCheckedChange={(v) => setDryRun(v === true)}
                            disabled={submitting}
                          />
                          <FieldLabel
                            htmlFor="dry-run"
                            className="min-w-0 flex-1 text-pretty font-normal"
                          >
                            Dry-run only (recommended while testing)
                          </FieldLabel>
                        </Field>
                      </FieldGroup>
                    </form>
                  ) : (
                    <Empty className="border border-dashed py-10">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <FolderOpenIcon />
                        </EmptyMedia>
                        <EmptyTitle>Nothing selected yet</EmptyTitle>
                        <EmptyDescription>
                          Click a milestone or task to fill this panel.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}

                  {lastResult ? <ResultPanel result={lastResult} /> : null}
                </CardContent>

                {target ? (
                  <CardFooter className="shrink-0 overflow-hidden border-t bg-card">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger
                          className="w-full"
                          render={<span className="inline-flex w-full" />}
                        >
                          <Button
                            type="submit"
                            form="submit-form"
                            className="w-full"
                            size="lg"
                            disabled={submitDisabled}
                          >
                            {submitting ? (
                              <Spinner data-icon="inline-start" />
                            ) : dryRun ? (
                              <CheckCircle2Icon data-icon="inline-start" />
                            ) : (
                              <SendIcon data-icon="inline-start" />
                            )}
                            {dryRun ? "Validate submission" : "Submit for real"}
                          </Button>
                        </TooltipTrigger>
                        {realSubmitBlocked && submitWindow.reason ? (
                          <TooltipContent className="max-w-xs text-pretty">
                            {submitWindow.reason}
                          </TooltipContent>
                        ) : null}
                      </Tooltip>
                    </TooltipProvider>
                  </CardFooter>
                ) : null}
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StepPills({ step }: { step: number }) {
  const steps = ["Cohort", "Item", "Submit"];
  return (
    <ol className="flex w-max items-center gap-1.5">
      {steps.map((label, index) => {
        const n = index + 1;
        const active = n === step;
        const done = n < step;
        return (
          <li key={label} className="flex shrink-0 items-center gap-1.5">
            {index > 0 ? (
              <ArrowRightIcon className="size-3 text-muted-foreground/60" />
            ) : null}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                active && "bg-foreground text-background",
                done &&
                  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                !active && !done && "bg-muted text-muted-foreground",
              )}
            >
              <span className="tabular-nums">{n}</span>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function CohortList({
  cohorts,
  loading,
  getHref,
  emptyTitle,
  emptyDescription,
}: {
  cohorts: Cohort[];
  loading: boolean;
  getHref: (cohort: Cohort) => string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (cohorts.length === 0) {
    return (
      <Empty className="border bg-card py-16 shadow-sm">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderOpenIcon />
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid max-h-[min(640px,calc(100svh-14rem))] min-w-0 gap-4 overflow-y-auto overscroll-contain pe-1 sm:grid-cols-2">
      {cohorts.map((cohort) => (
        <Link
          key={cohort.id}
          href={getHref(cohort)}
          className="group flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden rounded-xl border border-border bg-card p-5 text-left shadow-sm ring-1 ring-foreground/5 transition-all hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-3 overflow-hidden">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <FolderOpenIcon className="size-5 text-muted-foreground" />
            </div>
            <StatusBadge status={cohort.status} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
            <p
              className="line-clamp-2 overflow-hidden text-base font-semibold tracking-tight text-ellipsis group-hover:underline underline-offset-4"
              title={cohort.name}
            >
              {cohort.name}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {cohort.endDate
                ? `Ends ${formatDate(cohort.endDate)}`
                : "Open-ended cohort"}
            </p>
          </div>
          <div className="mt-auto flex min-w-0 items-center justify-between gap-2 overflow-hidden pt-1 text-sm text-muted-foreground">
            <span
              className="min-w-0 truncate font-mono text-xs"
              title={cohort.id}
            >
              {cohort.id}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground">
              Open
              <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: CohortStatus }) {
  return (
    <Badge
      className={cn(
        "shrink-0 hover:bg-transparent",
        status === "live" &&
          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        status === "planned" &&
          "bg-amber-500/15 text-amber-800 dark:text-amber-400",
        status === "closed" && "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </Badge>
  );
}

function ItemList({
  items,
  emptyTitle,
  emptyDescription,
  disabled = false,
}: {
  emptyTitle: string;
  emptyDescription: string;
  disabled?: boolean;
  items: {
    key: string;
    title: string;
    ref: string | null;
    meta: string | null;
    active: boolean;
    onClick: () => void;
  }[];
}) {
  if (items.length === 0) {
    return (
      <Empty className="h-full min-h-40 border border-dashed py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div className="absolute inset-0 overflow-y-auto overscroll-contain pr-1">
        <ul className="flex flex-col gap-2 pb-6">
          {items.map((item) => (
            <li key={item.key} className="min-w-0">
              <button
                type="button"
                disabled={disabled}
                onClick={item.onClick}
                className={cn(
                  "flex w-full min-w-0 items-start gap-3 overflow-hidden rounded-xl border px-3.5 py-3 text-left transition-all disabled:pointer-events-none disabled:opacity-60",
                  item.active
                    ? "border-foreground/25 bg-foreground/[0.04] ring-2 ring-foreground/10"
                    : "hover:bg-muted/60",
                )}
              >
                <span
                  className={cn(
                    "mt-1 size-2.5 shrink-0 rounded-full border",
                    item.active
                      ? "border-foreground bg-foreground"
                      : "border-muted-foreground/40",
                  )}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
                  <span
                    className="line-clamp-2 text-sm font-medium leading-snug"
                    title={item.title}
                  >
                    {item.title}
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {item.ref ? (
                      <code
                        className="max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 font-mono"
                        title={item.ref}
                      >
                        {item.ref}
                      </code>
                    ) : (
                      <span>No ref yet</span>
                    )}
                    {item.meta ? (
                      <span className="max-w-full truncate">· {item.meta}</span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {items.length > 4 ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-10 bg-gradient-to-t from-card via-card/80 to-transparent"
        />
      ) : null}
    </div>
  );
}

function ResultPanel({ result }: { result: ActionResult<unknown> }) {
  const ok = result.ok;
  return (
    <>
      <Separator className="my-5" />
      <div
        className={cn(
          "flex min-w-0 flex-col gap-2 overflow-hidden rounded-xl border p-3",
          ok
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-destructive/30 bg-destructive/5",
        )}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
          {ok ? (
            <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600" />
          ) : (
            <CircleAlertIcon className="size-4 shrink-0 text-destructive" />
          )}
          <span className="truncate">{ok ? "Response" : "Request failed"}</span>
          {!ok ? (
            <Badge
              variant="outline"
              className="max-w-full truncate font-mono text-[10px]"
              title={result.code}
            >
              {result.code}
            </Badge>
          ) : null}
        </div>
        <ScrollArea className="h-44 w-full rounded-lg border bg-muted/40">
          <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
            {JSON.stringify(result, null, 2)}
          </pre>
        </ScrollArea>
      </div>
    </>
  );
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}
