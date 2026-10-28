"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, ImagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { createProjectAction } from "@/app/actions/projects";
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

const STEPS = [
  { id: 1, label: "Project basics", hint: "What it is and who can see it" },
  { id: 2, label: "Team and contributions", hint: "Skills, work areas, what contributors get" },
  { id: 3, label: "Task breakdown", hint: "The individual pieces of work" },
  { id: 4, label: "Review and publish", hint: "Check everything, then publish or save" },
] as const;

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
}: {
  categories: Option[];
  visibilities: Option[];
  stages: Option[];
  workModes: Option[];
  compensationTypes: Option[];
  businesses: Business[];
  emailVerified: boolean;
}) {
  const [step, setStep] = useState(1);
  const [basics, setBasics] = useState({
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
  });
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const [links, setLinks] = useState([
    { label: "", url: "" },
    { label: "", url: "" },
    { label: "", url: "" },
  ]);
  const [milestones, setMilestones] = useState([
    { title: "", description: "", dueDate: "" },
    { title: "", description: "", dueDate: "" },
  ]);
  const [team, setTeam] = useState({
    skills: "",
    compensationType: compensationTypes[0]?.value ?? "unpaid",
    compensationDetails: "",
    confidentialityNotes: "",
    ipNotes: "",
  });
  const [workAreaInput, setWorkAreaInput] = useState("");
  const [workAreas, setWorkAreas] = useState<string[]>([]);
  const [tasks, setTasks] = useState<DraftTask[]>([]);
  const [editing, setEditing] = useState<DraftTask | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);

  const updateBasics = (key: keyof typeof basics) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const target = event.target;
    const value = target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value;
    setBasics((current) => ({ ...current, [key]: value }));
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
    setEditing(null);
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

  const canLeaveBasics = basics.name.trim().length >= 3 && basics.shortDescription.trim().length >= 20;

  // Publishing needs the information a contributor cannot do without. A draft can
  // be saved at any point, with its tasks, even while this list is not empty.
  const blockers = useMemo(() => {
    const list: string[] = [];
    if (basics.name.trim().length < 3) list.push("Add a project title (at least 3 characters).");
    if (basics.shortDescription.trim().length < 20) list.push("Add a summary of at least 20 characters.");
    if (basics.overview.trim().length < 40) list.push("Describe the project in at least 40 characters.");
    if (team.compensationType === "unpaid" && !team.compensationDetails.trim()) {
      list.push("State what unpaid contributors receive (credit, learning, references).");
    }
    for (const task of tasks) {
      if (!task.acceptanceCriteria.trim()) {
        list.push(`“${task.title}” — add review requirements (acceptance criteria).`);
      }
    }
    return list;
  }, [basics, team, tasks]);

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
                  onClick={() => setStep(entry.id)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-xl border p-3 text-left transition",
                    active
                      ? "border-brand-500 bg-brand-50 text-navy-900 shadow-sm"
                      : "border-navy-200 bg-surface text-navy-600 hover:border-navy-300",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                      active ? "bg-brand-600 text-on-brand" : done ? "bg-brand-100 text-brand-600" : "bg-navy-100 text-navy-600",
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

      {!emailVerified ? (
        <div className="mb-4">
          <Alert tone="warning" title="Verify your email to publish">
            You can build the whole project and save it as a draft now. Publishing needs a verified address.{" "}
            <Link href="/settings?tab=security" className="underline">
              Verify email
            </Link>
          </Alert>
        </div>
      ) : null}

      <form action={createProjectAction} className="space-y-4">
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
              <Field label="Project title" htmlFor="name" required hint="Concrete beats clever. “River Watch” not “Project Phoenix”.">
                <Input id="name" name="name" maxLength={120} value={basics.name} onChange={updateBasics("name")} placeholder="River Watch" />
              </Field>
              <Field label="Summary" htmlFor="shortDescription" required hint="One or two sentences, at least 20 characters. Shown in discovery.">
                <Textarea
                  id="shortDescription"
                  name="shortDescription"
                  rows={2}
                  maxLength={240}
                  value={basics.shortDescription}
                  onChange={updateBasics("shortDescription")}
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

            <details className="mt-4 rounded-xl border border-navy-200 bg-navy-50/40 px-4 py-3">
              <summary className="cursor-pointer text-[12.5px] font-semibold text-navy-800">Additional metadata</summary>
              <p className="mt-2 text-[11.5px] leading-5 text-navy-500">
                Genuinely optional: reference links, milestones and organisational publishing.
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
                    <Field label={`URL ${index + 1}`} htmlFor={`linkUrl${index}`}>
                      <Input
                        id={`linkUrl${index}`}
                        name={`linkUrl${index}`}
                        type="url"
                        placeholder="https://…"
                        value={link.url}
                        onChange={(event) =>
                          setLinks((current) => current.map((entry, i) => (i === index ? { ...entry, url: event.target.value } : entry)))
                        }
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
                        className="text-navy-400 hover:text-red-600"
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
                    onChange={(event) => setTeam((current) => ({ ...current, compensationType: event.target.value }))}
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
                >
                  <Textarea
                    id="compensationDetails"
                    name="compensationDetails"
                    rows={2}
                    maxLength={2000}
                    value={team.compensationDetails}
                    onChange={(event) => setTeam((current) => ({ ...current, compensationDetails: event.target.value }))}
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
                  Break the project into individual pieces of work now, or add them later. A task is not required to have an
                  assignee — leave it open and it stays available for contributors to apply for.
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
                        onClick={() => setEditing(task)}
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

            {!editing ? (
              <button
                type="button"
                onClick={() => {
                  if (tasks.length >= MAX_TASKS) {
                    setTaskError(`A project can start with at most ${MAX_TASKS} tasks.`);
                    return;
                  }
                  setEditing(emptyTask());
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-surface px-3 py-2 text-[12.5px] font-medium text-navy-700 hover:bg-navy-50"
              >
                <Plus size={14} aria-hidden="true" /> Add a task
              </button>
            ) : (
              <TaskEditor
                task={editing}
                workAreas={workAreas}
                visibilities={visibilities}
                others={tasks.filter((entry) => entry.key !== editing.key)}
                onSave={saveTask}
                onCancel={() => {
                  setEditing(null);
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
              <div className="h-32 w-full bg-gradient-to-br from-navy-100 to-brand-50">
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
                <h3 className="mt-2 text-[16px] font-semibold text-navy-950">{basics.name || "Your project title"}</h3>
                <p className="mt-1 text-[12.5px] leading-6 text-navy-600">{basics.shortDescription || "Your summary appears here."}</p>
                <p className="mt-2 whitespace-pre-line text-[12.5px] leading-6 text-navy-700">{basics.overview}</p>
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
                      </span>
                    </li>
                  ))}
                  {tasks.length === 0 ? <li className="text-navy-400">No tasks. You can recruit first and add them later.</li> : null}
                </ol>
              </div>
            </div>

            {blockers.length > 0 ? (
              <div className="mt-4">
                <Alert tone="warning" title="Complete these before publishing">
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
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
              onClick={() => setStep((current) => Math.max(1, current - 1))}
              disabled={step === 1}
              className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-surface px-3 py-2 text-[12.5px] font-medium text-navy-700 hover:bg-navy-50 disabled:opacity-40"
            >
              <ArrowLeft size={14} aria-hidden="true" /> Back
            </button>

            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep((current) => Math.min(4, current + 1))}
                disabled={step === 1 && !canLeaveBasics}
                className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-navy-800 hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue <ArrowRight size={14} aria-hidden="true" />
              </button>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <SubmitButton name="publish" value="false" variant="secondary" size="lg" pendingLabel="Saving…">
                Save as draft
              </SubmitButton>
              <SubmitButton name="publish" value="true" size="lg" disabled={blockers.length > 0} pendingLabel="Publishing…">
                Publish project
              </SubmitButton>
            </div>

            <Link href="/projects" className="text-[12.5px] font-medium text-navy-500 underline">
              Cancel
            </Link>
          </div>

          {step === 1 && !canLeaveBasics ? (
            <p className="mt-2 text-[11.5px] text-navy-500">A title and a summary are needed before you can continue.</p>
          ) : null}
          {blockers.length > 0 ? (
            <p className="mt-2 text-[11.5px] leading-5 text-navy-500">
              {blockers.length} thing{blockers.length === 1 ? "" : "s"} still needed before publishing. "Save as draft" works at any
              point and keeps everything you have entered.{" "}
              <button type="button" onClick={() => setStep(4)} className="font-medium text-brand-600 underline">
                See what is missing
              </button>
            </p>
          ) : null}
          {step === 4 && blockers.length === 0 ? (
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
    <div className="mt-3 rounded-xl border border-brand-300 bg-brand-50/40 p-4">
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
