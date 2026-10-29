"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, ImagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { createProjectAction, updateProjectSetupAction } from "@/app/actions/projects";
import { SubmitButton } from "@/components/client/submit-button";
import { Alert, Badge, Card, Field, Input, Select, Textarea, cn } from "@/components/ui";

type Option = { value: string; label: string };
type Business = { id: string; name: string };

type DraftTask = {
  key: string;
  title: string;
  description: string;
  objective: string;
  deliverablesSpec: string;
  acceptanceCriteria: string;
  effort: string;
  deadline: string;
  skills: string;
  workArea: string;
  assignee: string;
  visibility: string;
  priority: string;
  referenceLinks: string;
  dependsOn: string[];
};

const MAX_TASKS = 25;
const MAX_AREAS = 10;

/** Unfinished creation is kept in the tab until it is saved or discarded. */
const STORAGE_KEY = "bt:project-wizard";

type WizardBasics = {
  name: string;
  shortDescription: string;
  overview: string;
  problem: string;
  audience: string;
  category: string;
  stage: string;
  workMode: string;
  visibility: string;
  businessId: string;
  effort: string;
  deadline: string;
  allowPublicDocs: boolean;
  collaborators: boolean;
};

type WizardTeam = {
  skills: string;
  compensationType: string;
  compensationDetails: string;
  confidentialityNotes: string;
  ipNotes: string;
};

type WizardLink = { label: string; url: string };
type WizardMilestone = { title: string; description: string; dueDate: string };

export type WizardInitial = {
  basics: WizardBasics;
  team: WizardTeam;
  links: WizardLink[];
  milestones: WizardMilestone[];
  workAreas: string[];
  /** Areas that already exist on the project and must not be deleted from here. */
  persistedAreas?: string[];
  tasks: (DraftTask & { id?: string })[];
  coverUrl?: string | null;
  status?: "draft" | "published";
};

/** Only http(s) links are accepted; an empty value is simply an unused field. */
function isWebUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const STEPS = [
  { id: 1, label: "Project basics", hint: "What it is and who can see it" },
  { id: 2, label: "Team and contributions", hint: "Skills, work areas, what contributors get" },
  { id: 3, label: "Task breakdown", hint: "The individual pieces of work" },
  { id: 4, label: "Review and publish", hint: "Check everything, then publish or save" },
] as const;

/** The four steps are numbered, so navigation is arithmetic rather than a flag. */
type StepId = (typeof STEPS)[number]["id"];

const FIRST_STEP: StepId = 1;
const LAST_STEP: StepId = 4;

function emptyTask(): DraftTask {
  return {
    key: Math.random().toString(36).slice(2),
    title: "",
    description: "",
    objective: "",
    deliverablesSpec: "",
    acceptanceCriteria: "",
    effort: "",
    deadline: "",
    skills: "",
    workArea: "",
    assignee: "",
    visibility: "public",
    priority: "normal",
    referenceLinks: "",
    dependsOn: [],
  };
}

/**
 * Project creation, in four steps, with the task breakdown inside the flow.
 *
 * Required information is asked for and validated in the step where it belongs —
 * it is never hidden under a vague "optional detail" heading. Publishing is
 * blocked with an explicit list until that information exists; saving a draft is
 * always possible, and a draft keeps its tasks rather than dropping them.
 */
export function ProjectWizard({
  categories,
  visibilities,
  stages,
  workModes,
  compensationTypes,
  businesses,
  emailVerified,
  mode = "create",
  projectId,
  initial,
  saved = false,
}: {
  categories: Option[];
  visibilities: Option[];
  stages: Option[];
  workModes: Option[];
  compensationTypes: Option[];
  businesses: Business[];
  emailVerified: boolean;
  /** Edit mode reopens an existing draft; create mode starts a new project. */
  mode?: "create" | "edit";
  projectId?: string;
  initial?: WizardInitial;
  /** A success flash: the stored unfinished draft has served its purpose. */
  saved?: boolean;
}) {
  const isEdit = mode === "edit";

  function defaultBasics(): WizardBasics {
    return {
      name: "",
      shortDescription: "",
      overview: "",
      problem: "",
      audience: "",
      category: categories[0]?.value ?? "other",
      stage: stages[0]?.value ?? "idea",
      workMode: workModes[0]?.value ?? "remote",
      visibility: "public",
      businessId: "",
      effort: "",
      deadline: "",
      allowPublicDocs: true,
      collaborators: true,
    };
  }

  function defaultTeam(): WizardTeam {
    return {
      skills: "",
      compensationType: compensationTypes[0]?.value ?? "unpaid",
      compensationDetails: "",
      confidentialityNotes: "",
      ipNotes: "",
    };
  }

  const blankLinks = (): WizardLink[] =>
    Array.from({ length: 3 }, (_, index) => initial?.links[index] ?? { label: "", url: "" });
  const blankMilestones = (): WizardMilestone[] =>
    Array.from({ length: 2 }, (_, index) => initial?.milestones[index] ?? { title: "", description: "", dueDate: "" });

  const [step, setStep] = useState<StepId>(FIRST_STEP);
  // Validation is state, not a disabled button: pressing Continue always answers,
  // naming the field that is missing and why.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [basics, setBasics] = useState<WizardBasics>(() => initial?.basics ?? defaultBasics());
  const [coverUrl, setCoverUrl] = useState<string | null>(initial?.coverUrl ?? null);
  const coverRef = useRef<HTMLInputElement>(null);
  const [links, setLinks] = useState<WizardLink[]>(blankLinks);
  const [milestones, setMilestones] = useState<WizardMilestone[]>(blankMilestones);
  // Additional Details start collapsed. A malformed reference URL opens the
  // section so its own error can be seen rather than hidden behind the summary.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [team, setTeam] = useState<WizardTeam>(() => initial?.team ?? defaultTeam());
  const [workAreaInput, setWorkAreaInput] = useState("");
  const [workAreas, setWorkAreas] = useState<string[]>(initial?.workAreas ?? []);
  const [persistedAreas] = useState<string[]>(initial?.persistedAreas ?? initial?.workAreas ?? []);
  const [tasks, setTasks] = useState<(DraftTask & { id?: string })[]>(initial?.tasks ?? []);
  const [editingTask, setEditingTask] = useState<DraftTask | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [hydrated, setHydrated] = useState(mode === "edit");

  /**
   * Reopen unfinished creation in this tab.
   *
   * A failed save redirects back here, and a reload or an accidental back button
   * should not cost the caption, task list or links that were typed. A success
   * flash means the draft reached the database, so the stored copy is discarded
   * rather than reappearing on a later, empty form.
   */
  useEffect(() => {
    if (isEdit) return;
    if (saved) {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // Private modes can refuse storage; that is not an error worth showing.
      }
      return;
    }
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as Partial<{
          basics: WizardBasics;
          team: WizardTeam;
          links: WizardLink[];
          milestones: WizardMilestone[];
          workAreas: string[];
          tasks: (DraftTask & { id?: string })[];
        }>;
        if (data.basics) setBasics((current) => ({ ...current, ...data.basics }));
        if (data.team) setTeam((current) => ({ ...current, ...data.team }));
        if (Array.isArray(data.links)) setLinks(data.links.slice(0, 3));
        if (Array.isArray(data.milestones)) setMilestones(data.milestones);
        if (Array.isArray(data.workAreas)) setWorkAreas(data.workAreas);
        if (Array.isArray(data.tasks)) setTasks(data.tasks);
        setRestored(true);
      }
    } catch {
      // Corrupt or unavailable storage is ignored; the form still works.
    }
    setHydrated(true);
    // Runs once: this is hydration from the tab's own storage, not a prop sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isEdit || !hydrated) return;
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ basics, team, links, milestones, workAreas, tasks }));
      } catch {
        // Ignore quota and privacy-mode failures.
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [isEdit, hydrated, basics, team, links, milestones, workAreas, tasks]);

  const startOver = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clear.
    }
    setBasics(defaultBasics());
    setTeam(defaultTeam());
    setLinks(blankLinks());
    setMilestones(blankMilestones());
    setWorkAreas([]);
    setTasks([]);
    setEditingTask(null);
    setErrors({});
    setStep(FIRST_STEP);
    setRestored(false);
    setCoverUrl(null);
    if (coverRef.current) coverRef.current.value = "";
  };

  const clearError = (key: string) =>
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });

  const updateBasics = (key: keyof typeof basics) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const target = event.target;
    const value = target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value;
    setBasics((current) => ({ ...current, [key]: value }));
    // A correction is acknowledged as it is typed, not only on the next attempt.
    clearError(key);
  };

  const updateTeam = (key: keyof typeof team) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setTeam((current) => ({ ...current, [key]: event.target.value }));
    clearError(key);
  };

  /** The minimum for this step to be worth moving on from. Nothing else is gated. */
  const validateStep = (id: StepId): Record<string, string> => {
    const found: Record<string, string> = {};
    if (id === 1) {
      if (basics.name.trim().length < 3) found.name = "Enter a project title of at least 3 characters.";
      const summaryLength = basics.shortDescription.trim().length;
      if (summaryLength < 20) {
        found.shortDescription = `Add a summary of at least 20 characters so people know what they are joining (${summaryLength} so far).`;
      }
      // Reference links are optional; one that is supplied must be a real address.
      links.forEach((link, index) => {
        if (!link.url.trim()) return;
        if (!isWebUrl(link.url)) {
          found[`linkUrl${index}`] = "Enter a full address starting with http:// or https://, or leave this blank.";
        }
      });
    }
    if (id === 2 && team.compensationType === "unpaid" && !team.compensationDetails.trim()) {
      found.compensationDetails = "Say what unpaid contributors receive: credit, references, learning or expenses.";
    }
    return found;
  };

  const focusFirstError = (found: Record<string, string>) => {
    const first = Object.keys(found)[0];
    if (!first) return;
    window.requestAnimationFrame(() => document.getElementById(first)?.focus());
  };

  /**
   * Move to a step, checking every step between here and there.
   *
   * Going back is always allowed. Going forward is the same gate as Continue, so the
   * step rail can never skip validation and land on Review with an unfinished
   * project. A blocked jump stays on the step that needs attention.
   */
  const goToStep = (target: StepId) => {
    if (target === step) return;
    if (target > step) {
      for (let id = step; id < target; id = (id + 1) as StepId) {
        const found = validateStep(id);
        if (Object.keys(found).length > 0) {
          setErrors(found);
          setStep(id);
          focusFirstError(found);
          return;
        }
      }
    }
    setErrors({});
    setStep(target);
  };

  const goNext = () => {
    if (step === LAST_STEP) return;
    const found = validateStep(step);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      focusFirstError(found);
      return;
    }
    setErrors({});
    setStep((step + 1) as StepId);
  };

  const goBack = () => {
    if (step === FIRST_STEP) return;
    setErrors({});
    setStep((step - 1) as StepId);
  };

  const onCover = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (coverUrl) URL.revokeObjectURL(coverUrl);
    setCoverUrl(selected ? URL.createObjectURL(selected) : null);
  };

  const addWorkArea = () => {
    const name = workAreaInput.trim();
    if (!name) return;
    if (name.length < 2) {
      setTaskError("Work area names need at least 2 characters.");
      return;
    }
    if (name.length > 40) {
      setTaskError("Work area names are limited to 40 characters.");
      return;
    }
    if (workAreas.length >= MAX_AREAS) {
      setTaskError(`A project can start with at most ${MAX_AREAS} work areas.`);
      return;
    }
    if (workAreas.some((area) => area.toLowerCase() === name.toLowerCase())) {
      setTaskError("That work area already exists on this project.");
      return;
    }
    setWorkAreas((current) => [...current, name]);
    setWorkAreaInput("");
    setTaskError(null);
  };

  const removeWorkArea = (name: string) => {
    setWorkAreas((current) => current.filter((area) => area !== name));
    setTasks((current) => current.map((task) => (task.workArea === name ? { ...task, workArea: "" } : task)));
  };

  const saveTask = (task: DraftTask) => {
    if (task.title.trim().length < 4) {
      setTaskError("A task needs a title of at least 4 characters.");
      return;
    }
    setTasks((current) => {
      const index = current.findIndex((entry) => entry.key === task.key);
      if (index === -1) return [...current, task];
      const next = [...current];
      next[index] = task;
      return next;
    });
    setEditingTask(null);
    setTaskError(null);
  };

  const moveTask = (index: number, direction: -1 | 1) => {
    setTasks((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return next;
    });
  };

  // Publishing needs the information a contributor cannot do without. A draft can
  // be saved at any point, with its tasks, even while this list is not empty. Each
  // entry names the step that owns the missing information, so the review screen
  // can send the author straight back to it.
  const blockers = useMemo(() => {
    const list: { message: string; step: StepId }[] = [];
    if (basics.name.trim().length < 3) {
      list.push({ message: "Add a project title (at least 3 characters).", step: 1 });
    }
    if (basics.shortDescription.trim().length < 20) {
      list.push({ message: "Add a summary of at least 20 characters.", step: 1 });
    }
    if (basics.overview.trim().length < 40) {
      list.push({ message: "Describe the project in at least 40 characters.", step: 1 });
    }
    if (team.compensationType === "unpaid" && !team.compensationDetails.trim()) {
      list.push({ message: "State what unpaid contributors receive (credit, learning, references).", step: 2 });
    }
    for (const task of tasks) {
      if (!task.acceptanceCriteria.trim()) {
        list.push({ message: `“${task.title}” — add review requirements (acceptance criteria).`, step: 3 });
      }
    }
    return list;
  }, [basics, team, tasks]);

  const stepLabel = (id: StepId) => STEPS.find((entry) => entry.id === id)?.label ?? `Step ${id}`;

  const tasksPayload = useMemo(
    () =>
      JSON.stringify(
        tasks.map((task) => ({
          title: task.title,
          description: task.description,
          objective: task.objective,
          deliverablesSpec: task.deliverablesSpec,
          acceptanceCriteria: task.acceptanceCriteria,
          effort: task.effort,
          deadline: task.deadline,
          skills: task.skills.split(",").map((value) => value.trim()).filter(Boolean),
          workArea: task.workArea,
          assignee: task.assignee,
          visibility: task.visibility,
          priority: task.priority,
          referenceLinks: task.referenceLinks,
          dependsOn: task.dependsOn
            .map((key) => tasks.findIndex((entry) => entry.key === key))
            .filter((index) => index >= 0),
        })),
      ),
    [tasks],
  );

  return (
    <div className="mx-auto max-w-4xl">
      <nav aria-label="Project creation steps" className="mb-4">
        <ol className="grid gap-2 sm:grid-cols-4">
          {STEPS.map((entry) => {
            const active = step === entry.id;
            const done = step > entry.id;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => goToStep(entry.id)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-xl border p-3 text-left transition",
                    active
                      ? "border-blue-400 bg-glass-blue text-navy-900 shadow-sm"
                      : "border-navy-200 bg-surface text-navy-600 hover:border-navy-300",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                      active ? "bg-blue-600 text-on-blue" : done ? "bg-emerald-50 text-emerald-700" : "bg-navy-100 text-navy-600",
                    )}
                    aria-hidden="true"
                  >
                    {done ? <Check size={13} /> : entry.id}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-semibold">{entry.label}</span>
                    <span className="mt-0.5 block text-[10.5px] leading-4 text-navy-500">{entry.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {!emailVerified && !isEdit ? (
        <div className="mb-4">
          <Alert tone="warning" title="Verify your email to publish">
            You can build the whole project and save it as a draft now. Publishing needs a verified address.{" "}
            <Link href="/settings?tab=security" className="underline">
              Verify email
            </Link>
          </Alert>
        </div>
      ) : null}

      <form
        action={isEdit ? updateProjectSetupAction : createProjectAction}
        className="space-y-4"
        noValidate
        // A draft is always allowed, but it still needs the two fields the server
        // requires for any project. Checking them here avoids a round trip that would
        // drop everything typed into the rest of the wizard.
        onSubmit={(event) => {
          const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          // Create: only the draft button needs the basics checked here. Edit: the
          // one save button does, because it replaces the stored record.
          if (!isEdit && submitter?.value !== "false") return;
          const found = validateStep(FIRST_STEP);
          if (Object.keys(found).length === 0) return;
          event.preventDefault();
          setErrors(found);
          setStep(FIRST_STEP);
          focusFirstError(found);
        }}
        // Enter in a single-line field would implicitly submit the whole wizard,
        // and the first submit button is "Save as draft" — which would save and
        // leave the flow mid-step. Newlines in a textarea still work.
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          const target = event.target as HTMLElement;
          if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return;
          event.preventDefault();
        }}
      >
        <p aria-live="polite" className="sr-only">
          Step {step} of {STEPS.length}: {stepLabel(step)}
        </p>
        {isEdit && projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
        {restored ? (
          <div className="mb-1">
            <Alert tone="info" title="Unfinished project restored">
              Everything you typed before the last save attempt is still here.{" "}
              <button type="button" onClick={startOver} className="font-medium text-blue-600 underline">
                Start over
              </button>
            </Alert>
          </div>
        ) : null}
        <input type="hidden" name="tasksJson" value={tasksPayload} />
        <input type="hidden" name="workAreasJson" value={JSON.stringify(workAreas)} />

        {/* Step 1 — project basics */}
        <div className={cn("space-y-4", step === 1 ? "" : "hidden")}>
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold text-navy-950">What are you building?</h2>
            <p className="mt-1 text-[12.5px] leading-6 text-navy-500">
              These four answers are the minimum for a project anyone can understand.
            </p>
            <div className="mt-4 space-y-4">
              <Field
                label="Project title"
                htmlFor="name"
                required
                hint="Concrete beats clever. “River Watch” not “Project Phoenix”."
                error={errors.name}
              >
                <Input
                  id="name"
                  name="name"
                  maxLength={120}
                  value={basics.name}
                  onChange={updateBasics("name")}
                  aria-invalid={errors.name ? true : undefined}
                  placeholder="River Watch"
                />
              </Field>
              <Field
                label="Summary"
                htmlFor="shortDescription"
                required
                hint="One or two sentences, at least 20 characters. Shown in discovery."
                error={errors.shortDescription}
              >
                <Textarea
                  id="shortDescription"
                  name="shortDescription"
                  rows={2}
                  maxLength={240}
                  value={basics.shortDescription}
                  onChange={updateBasics("shortDescription")}
                  aria-invalid={errors.shortDescription ? true : undefined}
                  placeholder="Volunteers build low-cost river sensors, and everything we learn is published openly."
                />
              </Field>
              <Field
                label="Project description"
                htmlFor="overview"
                required
                hint="What exists today, what you are building and how far along you are. Required before publishing."
              >
                <Textarea id="overview" name="overview" rows={6} maxLength={8000} value={basics.overview} onChange={updateBasics("overview")} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Goals and intended outcome" htmlFor="audience" hint="Who this is for, and what changes if it works.">
                  <Textarea id="audience" name="audience" rows={3} maxLength={400} value={basics.audience} onChange={updateBasics("audience")} />
                </Field>
                <Field label="Problem being solved" htmlFor="problem" hint="Be specific. If it is not a real problem for a real group, say so.">
                  <Textarea id="problem" name="problem" rows={3} maxLength={2000} value={basics.problem} onChange={updateBasics("problem")} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Cover image" htmlFor="cover" hint="PNG, JPEG or WebP. Optional.">
                  <Input ref={coverRef} id="cover" name="cover" type="file" accept="image/png,image/jpeg,image/webp" onChange={onCover} />
                </Field>
                <div>
                  {coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverUrl} alt="" className="h-[104px] w-full rounded-lg border border-navy-200 object-cover" />
                  ) : (
                    <span className="flex h-[104px] w-full items-center justify-center rounded-lg border border-dashed border-navy-300 text-[11.5px] text-navy-400">
                      <ImagePlus size={16} aria-hidden="true" className="mr-1.5" /> No cover chosen yet
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-[15px] font-semibold text-navy-950">Category, stage and publication</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Category" htmlFor="category" required>
                <Select id="category" name="category" value={basics.category} onChange={updateBasics("category")}>
                  {categories.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Stage" htmlFor="stage" required>
                <Select id="stage" name="stage" value={basics.stage} onChange={updateBasics("stage")}>
                  {stages.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Ways of working" htmlFor="workMode" required>
                <Select id="workMode" name="workMode" value={basics.workMode} onChange={updateBasics("workMode")}>
                  {workModes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Who can see this project" htmlFor="visibility" required hint="Private and invite-only projects stay out of public discovery.">
                <Select id="visibility" name="visibility" value={basics.visibility} onChange={updateBasics("visibility")}>
                  {visibilities.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Estimated effort" htmlFor="effort" hint="e.g. 4 hours per week">
                <Input id="effort" name="effort" maxLength={80} value={basics.effort} onChange={updateBasics("effort")} />
              </Field>
              <Field label="Target date" htmlFor="deadline">
                <Input id="deadline" name="deadline" type="date" value={basics.deadline} onChange={updateBasics("deadline")} />
              </Field>
            </div>
            <div className="mt-4 space-y-2">
              <label className="flex items-start gap-2 text-[12.5px] text-navy-700">
                <input
                  type="checkbox"
                  name="collaborators"
                  checked={basics.collaborators}
                  onChange={updateBasics("collaborators")}
                  className="mt-0.5 h-4 w-4 rounded border-navy-300"
                />
                <span>
                  I am looking for contributors
                  <span className="block text-[11px] text-navy-500">Shows “Looking for collaborators” on the project. You still decide who joins.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-[12.5px] text-navy-700">
                <input
                  type="checkbox"
                  name="allowPublicDocs"
                  checked={basics.allowPublicDocs}
                  onChange={updateBasics("allowPublicDocs")}
                  className="mt-0.5 h-4 w-4 rounded border-navy-300"
                />
                <span>
                  Allow contributors to publish documentation publicly
                  <span className="block text-[11px] text-navy-500">You still approve each entry.</span>
                </span>
              </label>
            </div>

            <details
              open={detailsOpen || [0, 1, 2].some((index) => Boolean(errors[`linkUrl${index}`]))}
              onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
              className="mt-4 rounded-xl border border-navy-200 bg-navy-50/40 px-4 py-3"
            >
              <summary className="cursor-pointer text-[12.5px] font-semibold text-navy-800">Additional Details</summary>
              <p className="mt-2 text-[11.5px] leading-5 text-navy-500">
                Optional: reference links, milestones and organisational publishing. Nothing here blocks continuing,
                saving a draft or publishing.
              </p>
              <div className="mt-3 space-y-3">
                {links.map((link, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                    <Field label={`Link label ${index + 1}`} htmlFor={`linkLabel${index}`}>
                      <Input
                        id={`linkLabel${index}`}
                        name={`linkLabel${index}`}
                        placeholder="Design notes"
                        value={link.label}
                        onChange={(event) =>
                          setLinks((current) => current.map((entry, i) => (i === index ? { ...entry, label: event.target.value } : entry)))
                        }
                      />
                    </Field>
                    <Field
                      label={`URL ${index + 1}`}
                      htmlFor={`linkUrl${index}`}
                      error={errors[`linkUrl${index}`]}
                    >
                      <Input
                        id={`linkUrl${index}`}
                        name={`linkUrl${index}`}
                        type="url"
                        inputMode="url"
                        placeholder="https://…"
                        value={link.url}
                        onChange={(event) => {
                          setLinks((current) => current.map((entry, i) => (i === index ? { ...entry, url: event.target.value } : entry)));
                          clearError(`linkUrl${index}`);
                        }}
                        aria-invalid={errors[`linkUrl${index}`] ? true : undefined}
                      />
                    </Field>
                  </div>
                ))}
                {milestones.map((milestone, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1.4fr_1.4fr_140px]">
                    <Field label={`Milestone ${index + 1}`} htmlFor={`milestoneTitle${index}`}>
                      <Input
                        id={`milestoneTitle${index}`}
                        name={`milestoneTitle${index}`}
                        placeholder="Working prototype"
                        value={milestone.title}
                        onChange={(event) =>
                          setMilestones((current) => current.map((entry, i) => (i === index ? { ...entry, title: event.target.value } : entry)))
                        }
                      />
                    </Field>
                    <Field label="What done looks like" htmlFor={`milestoneDescription${index}`}>
                      <Input
                        id={`milestoneDescription${index}`}
                        name={`milestoneDescription${index}`}
                        placeholder="Tested for a week without failure"
                        value={milestone.description}
                        onChange={(event) =>
                          setMilestones((current) =>
                            current.map((entry, i) => (i === index ? { ...entry, description: event.target.value } : entry)),
                          )
                        }
                      />
                    </Field>
                    <Field label="Target date" htmlFor={`milestoneDue${index}`}>
                      <Input
                        id={`milestoneDue${index}`}
                        name={`milestoneDue${index}`}
                        type="date"
                        value={milestone.dueDate}
                        onChange={(event) =>
                          setMilestones((current) => current.map((entry, i) => (i === index ? { ...entry, dueDate: event.target.value } : entry)))
                        }
                      />
                    </Field>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setMilestones((current) => [...current, { title: "", description: "", dueDate: "" }])}
                    className="rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-[12px] font-medium text-navy-700 hover:bg-navy-50"
                  >
                    Add another milestone
                  </button>
                </div>
                {businesses.length > 0 ? (
                  <Field label="Publish as a business" htmlFor="businessId" hint="Links the project to your organisation's portfolio.">
                    <Select id="businessId" name="businessId" value={basics.businessId} onChange={updateBasics("businessId")}>
                      <option value="">Personal project</option>
                      {businesses.map((business) => (
                        <option key={business.id} value={business.id}>
                          {business.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
              </div>
            </details>
          </Card>
        </div>

        {/* Step 2 — team and contribution requirements */}
        <div className={cn("space-y-4", step === 2 ? "" : "hidden")}>
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold text-navy-950">Who is needed, and for what</h2>
            <p className="mt-1 text-[12.5px] leading-6 text-navy-500">
              Skills power discovery and matching. Work areas are the named parts of the project — each one gets its own
              area on the project page and its own chat, and tasks are filed into them.
            </p>
            <div className="mt-4 space-y-4">
              <Field label="Skills or expertise needed" htmlFor="skills" hint="Comma-separated, up to twelve. e.g. UX research, React, accessibility.">
                <Input
                  id="skills"
                  name="skills"
                  maxLength={240}
                  value={team.skills}
                  onChange={(event) => setTeam((current) => ({ ...current, skills: event.target.value }))}
                  placeholder="Electronics, field research, documentation"
                />
              </Field>

              <div>
                <p className="field-label">Work areas</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {workAreas.map((area) => (
                    <span key={area} className="inline-flex items-center gap-1.5 rounded-full border border-navy-200 bg-surface px-2.5 py-1 text-[12px] text-navy-700">
                      {area}
                      <button
                        type="button"
                        onClick={() => removeWorkArea(area)}
                        aria-label={`Remove work area ${area}`}
                        title={persistedAreas.includes(area) ? "Existing areas are managed on the project page" : undefined}
                        disabled={persistedAreas.includes(area)}
                        className="text-navy-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Trash2 size={12} aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                  {workAreas.length === 0 ? (
                    <span className="text-[11.5px] text-navy-500">
                      No work areas yet. Tasks without an area sit in the project inbox.
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex gap-2">
                  <Input
                    aria-label="New work area name"
                    placeholder="Design"
                    maxLength={40}
                    value={workAreaInput}
                    onChange={(event) => setWorkAreaInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addWorkArea();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={addWorkArea}
                    className="shrink-0 rounded-lg border border-navy-200 bg-surface px-3 text-[12.5px] font-medium text-navy-700 hover:bg-navy-50"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-[15px] font-semibold text-navy-950">Contribution expectations</h2>
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Arrangement" htmlFor="compensationType" required>
                  <Select
                    id="compensationType"
                    name="compensationType"
                    value={team.compensationType}
                    onChange={(event) => {
                      const compensationType = event.target.value;
                      setTeam((current) => ({ ...current, compensationType }));
                      // A detail only required for unpaid work stops being an error
                      // the moment the arrangement changes.
                      if (compensationType !== "unpaid") clearError("compensationDetails");
                    }}
                  >
                    {compensationTypes.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="What contributors receive"
                  htmlFor="compensationDetails"
                  required={team.compensationType === "unpaid"}
                  hint="Required for unpaid projects: credit, references, learning, expenses, equity — say it plainly."
                  error={errors.compensationDetails}
                >
                  <Textarea
                    id="compensationDetails"
                    name="compensationDetails"
                    rows={2}
                    maxLength={2000}
                    value={team.compensationDetails}
                    onChange={updateTeam("compensationDetails")}
                    aria-invalid={errors.compensationDetails ? true : undefined}
                  />
                </Field>
              </div>
              <Field label="Confidentiality notes" htmlFor="confidentialityNotes" hint="What must stay private, and from whom?">
                <Textarea
                  id="confidentialityNotes"
                  name="confidentialityNotes"
                  rows={2}
                  maxLength={2000}
                  value={team.confidentialityNotes}
                  onChange={(event) => setTeam((current) => ({ ...current, confidentialityNotes: event.target.value }))}
                />
              </Field>
              <Field label="Intellectual property and licensing" htmlFor="ipNotes" hint="Who owns what, and under which licence?">
                <Textarea
                  id="ipNotes"
                  name="ipNotes"
                  rows={2}
                  maxLength={2000}
                  value={team.ipNotes}
                  onChange={(event) => setTeam((current) => ({ ...current, ipNotes: event.target.value }))}
                />
              </Field>
            </div>
          </Card>
        </div>

        {/* Step 3 — task breakdown */}
        <div className={cn("space-y-4", step === 3 ? "" : "hidden")}>
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-semibold text-navy-950">Task breakdown</h2>
                <p className="mt-1 text-[12.5px] leading-6 text-navy-500">
                  {isEdit
                    ? "Tasks already on the board stay there and are managed from the task board. Anything you add here is created when you save."
                    : "Break the project into individual pieces of work now, or add them later. A task is not required to have an assignee — leave it open and it stays available for contributors to apply for."}
                </p>
              </div>
              <Badge tone={tasks.length > 0 ? "brand" : "neutral"}>
                {tasks.length} task{tasks.length === 1 ? "" : "s"}
              </Badge>
            </div>

            {taskError ? (
              <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-600">
                {taskError}
              </p>
            ) : null}

            <ul className="mt-4 space-y-2">
              {tasks.map((task, index) => (
                <li key={task.key} className="rounded-xl border border-navy-200 bg-surface p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-navy-950">{task.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-navy-500">
                        <span>{task.workArea || "Project inbox"}</span>
                        <span aria-hidden="true">·</span>
                        <span>{task.acceptanceCriteria ? "Review requirements set" : "No review requirements yet"}</span>
                        <span aria-hidden="true">·</span>
                        <span>{task.assignee ? `Assigned to @${task.assignee}` : "Open for contributors"}</span>
                        {task.dependsOn.length > 0 ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Depends on {task.dependsOn.length} task{task.dependsOn.length === 1 ? "" : "s"}</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    {task.id ? (
                      <span className="rounded-full bg-navy-100 px-2 py-0.5 text-[10px] font-medium text-navy-600">
                        On the task board
                      </span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveTask(index, -1)}
                          disabled={index === 0}
                          aria-label={`Move ${task.title} up`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-navy-500 hover:bg-navy-100 disabled:opacity-40"
                        >
                          <ChevronUp size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveTask(index, 1)}
                          disabled={index === tasks.length - 1}
                          aria-label={`Move ${task.title} down`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-navy-500 hover:bg-navy-100 disabled:opacity-40"
                        >
                          <ChevronDown size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTask(task)}
                          aria-label={`Edit ${task.title}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-navy-500 hover:bg-navy-100"
                        >
                          <Pencil size={13} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setTasks((current) => current.filter((entry) => entry.key !== task.key))}
                          aria-label={`Remove ${task.title}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-navy-500 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={13} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
              {tasks.length === 0 ? (
                <li className="rounded-xl border border-dashed border-navy-300 p-4 text-center text-[12px] text-navy-500">
                  No tasks yet. You can publish and recruit first, then add tasks — or add them now so contributors know exactly
                  what the work is.
                </li>
              ) : null}
            </ul>

            {!editingTask ? (
              <button
                type="button"
                onClick={() => {
                  if (tasks.length >= MAX_TASKS) {
                    setTaskError(`A project can start with at most ${MAX_TASKS} tasks.`);
                    return;
                  }
                  setEditingTask(emptyTask());
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-surface px-3 py-2 text-[12.5px] font-medium text-navy-700 hover:bg-navy-50"
              >
                <Plus size={14} aria-hidden="true" /> Add a task
              </button>
            ) : (
              <TaskEditor
                task={editingTask}
                workAreas={workAreas}
                visibilities={visibilities}
                others={tasks.filter((entry) => entry.key !== editingTask.key)}
                onSave={saveTask}
                onCancel={() => {
                  setEditingTask(null);
                  setTaskError(null);
                }}
              />
            )}
          </Card>
        </div>

        {/* Step 4 — review and publish */}
        <div className={cn("space-y-4", step === 4 ? "" : "hidden")}>
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold text-navy-950">Review</h2>
            <p className="mt-1 text-[12.5px] leading-6 text-navy-500">
              This is what a contributor will see. Go back to any step to change something.
            </p>

            <div className="mt-4 overflow-hidden rounded-xl border border-navy-200">
              <div className="h-32 w-full bg-gradient-to-br from-navy-100 to-blue-50">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{categories.find((entry) => entry.value === basics.category)?.label ?? basics.category}</Badge>
                  <Badge tone="neutral">{stages.find((entry) => entry.value === basics.stage)?.label ?? basics.stage}</Badge>
                  <Badge tone="neutral">{visibilities.find((entry) => entry.value === basics.visibility)?.label ?? basics.visibility}</Badge>
                  {basics.collaborators ? <Badge tone="success">Looking for contributors</Badge> : null}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-navy-200 pt-3 text-[11.5px] sm:grid-cols-4">
                  <div>
                    <dt className="font-semibold text-navy-500">Ways of working</dt>
                    <dd className="text-navy-800">{workModes.find((entry) => entry.value === basics.workMode)?.label ?? basics.workMode}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-navy-500">Estimated effort</dt>
                    <dd className="text-navy-800">{basics.effort || "Not set"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-navy-500">Target date</dt>
                    <dd className="text-navy-800">{basics.deadline || "Not set"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-navy-500">Public docs</dt>
                    <dd className="text-navy-800">{basics.allowPublicDocs ? "Contributors may publish" : "Approval only"}</dd>
                  </div>
                </dl>
                <h3 className="mt-2 text-[16px] font-semibold text-navy-950">{basics.name}</h3>
                <p className="mt-1 text-[12.5px] leading-6 text-navy-600">{basics.shortDescription}</p>
                {basics.overview.trim() ? (
                  <p className="mt-2 whitespace-pre-line text-[12.5px] leading-6 text-navy-700">{basics.overview}</p>
                ) : null}
                {basics.audience.trim() ? (
                  <p className="mt-2 text-[12px] leading-6 text-navy-700">
                    <span className="font-semibold text-navy-900">Goals and outcome: </span>
                    {basics.audience}
                  </p>
                ) : null}
                {basics.problem.trim() ? (
                  <p className="mt-1 text-[12px] leading-6 text-navy-700">
                    <span className="font-semibold text-navy-900">Problem being solved: </span>
                    {basics.problem}
                  </p>
                ) : null}
                {team.skills.trim() ? <p className="mt-2 text-[11.5px] text-navy-500">Skills needed: {team.skills}</p> : null}
                <p className="mt-1 text-[11.5px] text-navy-500">
                  {team.compensationType === "unpaid" ? "Unpaid" : team.compensationType}
                  {team.compensationDetails ? ` — ${team.compensationDetails}` : ""}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-navy-200 p-4">
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Work areas</h3>
                <ul className="mt-2 space-y-1 text-[12px] text-navy-700">
                  {workAreas.map((area) => (
                    <li key={area}>{area}</li>
                  ))}
                  {workAreas.length === 0 ? <li className="text-navy-400">None — tasks sit in the project inbox.</li> : null}
                </ul>
              </div>
              <div className="rounded-xl border border-navy-200 p-4">
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Task breakdown</h3>
                <ol className="mt-2 space-y-1.5 text-[12px] text-navy-700">
                  {tasks.map((task) => (
                    <li key={task.key}>
                      <span className="font-medium">{task.title}</span>
                      <span className="block text-[10.5px] text-navy-500">
                        {task.workArea || "Project inbox"} ·{" "}
                        {task.assignee ? `@${task.assignee}` : "open for contributors"} ·{" "}
                        {task.acceptanceCriteria ? "review requirements set" : "review requirements missing"}
                        {task.effort ? ` · ${task.effort}` : ""}
                        {task.deadline ? ` · due ${task.deadline}` : ""}
                        {task.priority !== "normal" ? ` · ${task.priority} priority` : ""}
                      </span>
                    </li>
                  ))}
                  {tasks.length === 0 ? <li className="text-navy-400">No tasks. You can recruit first and add them later.</li> : null}
                </ol>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-navy-200 p-4">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Additional Details</h3>
              {links.some((link) => link.url.trim()) || milestones.some((milestone) => milestone.title.trim()) ? (
                <div className="mt-2 space-y-2 text-[12px] text-navy-700">
                  {links.filter((link) => link.url.trim()).length > 0 ? (
                    <ul className="space-y-1">
                      {links
                        .filter((link) => link.url.trim())
                        .map((link, index) => (
                          <li key={`${link.url}-${index}`}>
                            <span className="font-medium">{link.label.trim() || "Reference link"}: </span>
                            <span className="break-all text-navy-500">{link.url}</span>
                          </li>
                        ))}
                    </ul>
                  ) : null}
                  {milestones.filter((milestone) => milestone.title.trim()).length > 0 ? (
                    <ul className="space-y-1">
                      {milestones
                        .filter((milestone) => milestone.title.trim())
                        .map((milestone, index) => (
                          <li key={`${milestone.title}-${index}`}>
                            <span className="font-medium">{milestone.title}</span>
                            {milestone.description ? ` — ${milestone.description}` : ""}
                            {milestone.dueDate ? ` · ${milestone.dueDate}` : ""}
                          </li>
                        ))}
                    </ul>
                  ) : null}
                  {basics.businessId ? (
                    <p>
                      Publishing as {businesses.find((business) => business.id === basics.businessId)?.name ?? "your organisation"}.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-[12px] text-navy-400">
                  None added. These fields are optional and can be filled in later.
                </p>
              )}
              {team.confidentialityNotes.trim() ? (
                <p className="mt-2 text-[12px] leading-6 text-navy-700">
                  <span className="font-semibold text-navy-900">Confidentiality: </span>
                  {team.confidentialityNotes}
                </p>
              ) : null}
              {team.ipNotes.trim() ? (
                <p className="mt-1 text-[12px] leading-6 text-navy-700">
                  <span className="font-semibold text-navy-900">Intellectual property: </span>
                  {team.ipNotes}
                </p>
              ) : null}
            </div>

            {blockers.length > 0 ? (
              <div className="mt-4">
                <Alert tone="warning" title="Complete these before publishing">
                  <ul className="mt-1 space-y-1.5">
                    {blockers.map((blocker) => (
                      <li key={blocker.message} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span>{blocker.message}</span>
                        <button
                          type="button"
                          onClick={() => goToStep(blocker.step)}
                          className="text-[11.5px] font-medium text-blue-600 underline"
                        >
                          Go to {stepLabel(blocker.step)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </Alert>
              </div>
            ) : null}
          </Card>
        </div>

        {/* Step controls, plus the two real outcomes. Both buttons stay in the DOM
            on every step: saving a draft never depends on walking the wizard, and
            publishing is gated by the same blocker list the review step shows. */}
        <div className="rounded-xl border border-navy-200 bg-surface p-4 shadow-card">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={step === FIRST_STEP}
              className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-surface px-3 py-2 text-[12.5px] font-medium text-navy-700 hover:bg-navy-50 disabled:opacity-40"
            >
              <ArrowLeft size={14} aria-hidden="true" /> Back
            </button>

            {step < LAST_STEP ? (
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-navy-800 hover:bg-navy-50"
              >
                Continue <ArrowRight size={14} aria-hidden="true" />
              </button>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {isEdit ? (
                <SubmitButton name="save" value="on" size="lg" pendingLabel="Saving…">
                  Save changes
                </SubmitButton>
              ) : (
                <>
                  <SubmitButton name="publish" value="false" variant="secondary" size="lg" pendingLabel="Saving…">
                    Save as draft
                  </SubmitButton>
                  <SubmitButton name="publish" value="true" size="lg" disabled={blockers.length > 0} pendingLabel="Publishing…">
                    Publish project
                  </SubmitButton>
                </>
              )}
            </div>

            <Link
              href={isEdit && projectId ? `/projects/${projectId}` : "/projects"}
              className="text-[12.5px] font-medium text-navy-500 underline"
            >
              Cancel
            </Link>
          </div>

          {Object.keys(errors).length > 0 ? (
            <p role="status" className="mt-2 text-[11.5px] leading-5 text-red-600">
              Fix the highlighted {Object.keys(errors).length === 1 ? "field" : "fields"} above to continue to the next step.
            </p>
          ) : null}
          {!isEdit && blockers.length > 0 ? (
            <p className="mt-2 text-[11.5px] leading-5 text-navy-500">
              {blockers.length} thing{blockers.length === 1 ? "" : "s"} still needed before publishing. "Save as draft" works at any
              point and keeps everything you have entered.{" "}
              <button type="button" onClick={() => goToStep(LAST_STEP)} className="font-medium text-blue-600 underline">
                See what is missing
              </button>
            </p>
          ) : null}
          {isEdit ? (
            <p className="mt-2 text-[11.5px] leading-5 text-navy-500">
              Saving keeps this project&apos;s current status. Any publishing or joining request stays on the project page.
            </p>
          ) : null}
          {!isEdit && step === 4 && blockers.length === 0 ? (
            <p className="mt-2 text-[11.5px] text-navy-500">Everything a contributor needs is present. Publish when you are ready.</p>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function TaskEditor({
  task,
  workAreas,
  visibilities,
  others,
  onSave,
  onCancel,
}: {
  task: DraftTask;
  workAreas: string[];
  visibilities: Option[];
  others: DraftTask[];
  onSave: (task: DraftTask) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(task);
  const update = (key: keyof DraftTask) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }));

  const required = draft.title.trim().length >= 4;

  return (
    <div className="mt-3 rounded-xl border border-blue-300 bg-glass-blue p-4">
      <h3 className="text-[13px] font-semibold text-navy-950">{others.some((entry) => entry.key === task.key) ? "Edit task" : "New task"}</h3>
      <div className="mt-3 space-y-3">
        <Field label="Task title" htmlFor="task-title" required>
          <Input id="task-title" value={draft.title} onChange={update("title")} maxLength={160} placeholder="Build the readings dashboard" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What does done look like?" htmlFor="task-objective">
            <Textarea id="task-objective" rows={2} maxLength={2000} value={draft.objective} onChange={update("objective")} />
          </Field>
          <Field label="Review requirements" htmlFor="task-acceptance" required hint="How you and the reviewer will decide it is done. Required before the project can be published.">
            <Textarea id="task-acceptance" rows={2} maxLength={4000} value={draft.acceptanceCriteria} onChange={update("acceptanceCriteria")} />
          </Field>
        </div>
        <Field label="Detailed description" htmlFor="task-description">
          <Textarea id="task-description" rows={3} maxLength={6000} value={draft.description} onChange={update("description")} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Work area or role" htmlFor="task-area" hint="Its home inside the project.">
            <Select id="task-area" value={draft.workArea} onChange={update("workArea")}>
              <option value="">Project inbox</option>
              {workAreas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Required skills" htmlFor="task-skills" hint="Comma-separated.">
            <Input id="task-skills" value={draft.skills} onChange={update("skills")} maxLength={240} />
          </Field>
          <Field label="Expected deliverable" htmlFor="task-deliverable">
            <Input id="task-deliverable" value={draft.deliverablesSpec} onChange={update("deliverablesSpec")} maxLength={4000} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Assignee" htmlFor="task-assignee" hint="Username. Leave empty to recruit.">
            <Input id="task-assignee" value={draft.assignee} onChange={update("assignee")} placeholder="riverwatch" maxLength={40} />
          </Field>
          <Field label="Estimated effort" htmlFor="task-effort">
            <Input id="task-effort" value={draft.effort} onChange={update("effort")} maxLength={80} placeholder="12 hours" />
          </Field>
          <Field label="Due date" htmlFor="task-deadline">
            <Input id="task-deadline" type="date" value={draft.deadline} onChange={update("deadline")} />
          </Field>
          <Field label="Priority" htmlFor="task-priority">
            <Select id="task-priority" value={draft.priority} onChange={update("priority")}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Task visibility" htmlFor="task-visibility" hint="Private tasks stay inside the project team.">
            <Select id="task-visibility" value={draft.visibility} onChange={update("visibility")}>
              {visibilities.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Supporting documents or reference links" htmlFor="task-links" hint="One per line. Saved with the task description.">
            <Textarea id="task-links" rows={2} value={draft.referenceLinks} onChange={update("referenceLinks")} placeholder="https://…" />
          </Field>
        </div>
        {others.length > 0 ? (
          <fieldset>
            <legend className="field-label">Depends on</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {others.map((entry) => (
                <label key={entry.key} className="flex items-center gap-2 text-[12px] text-navy-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-navy-300"
                    checked={draft.dependsOn.includes(entry.key)}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        dependsOn: event.target.checked
                          ? [...current.dependsOn, entry.key]
                          : current.dependsOn.filter((key) => key !== entry.key),
                      }))
                    }
                  />
                  {entry.title || "Untitled task"}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSave({ ...draft, title: draft.title.trim() })}
          disabled={!required}
          className="rounded-lg bg-brand-600 px-3.5 py-2 text-[12.5px] font-semibold text-on-brand hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save task
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-navy-200 bg-surface px-3 py-2 text-[12.5px] font-medium text-navy-700 hover:bg-navy-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
