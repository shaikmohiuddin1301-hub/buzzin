"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { quickCreateProjectAction } from "@/app/actions/projects";
import { SubmitButton } from "@/components/client/submit-button";
import { Badge, Card, Field, Input, Select, Textarea } from "@/components/ui";

type Option = { value: string; label: string };

type Draft = {
  name: string;
  shortDescription: string;
  outcome: string;
  category: string;
  visibility: string;
  skills: string;
  collaborators: boolean;
};

/**
 * Four required answers, then optional details.
 *
 * Preview is client-side: no project is created until the submit button posts to the
 * server action, and the page only reports success after that action redirects.
 */
export function QuickProjectForm({ categories, visibilities }: { categories: Option[]; visibilities: Option[] }) {
  const [draft, setDraft] = useState<Draft>({
    name: "",
    shortDescription: "",
    outcome: "",
    category: "other",
    visibility: "public",
    skills: "",
    collaborators: true,
  });
  const [preview, setPreview] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const update = (key: keyof Draft) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = event.target instanceof HTMLInputElement && event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const onCover = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (coverUrl) URL.revokeObjectURL(coverUrl);
    setCoverUrl(file ? URL.createObjectURL(file) : null);
  };

  const canContinue = draft.name.trim().length >= 3 && draft.shortDescription.trim().length >= 20;

  return (
    <Card className="mb-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-navy-950">Create a project</h2>
          <p className="mt-1 text-[12.5px] leading-6 text-navy-500">
            Publishing a project is as easy as sharing an idea. Tasks are optional and can come later.
          </p>
        </div>
        <Badge tone="brand">Takes about a minute</Badge>
      </div>

      <form action={quickCreateProjectAction} encType="multipart/form-data" className="mt-4 space-y-4">
        {preview ? (
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">Preview · your project card</p>
            <article className="overflow-hidden rounded-xl border border-navy-200 bg-surface shadow-card">
              <div className="h-36 w-full bg-gradient-to-br from-navy-100 to-brand-50">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[11px] text-navy-400">
                    <ImagePlus size={18} aria-hidden="true" className="mr-1.5" /> No cover image yet
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{categories.find((entry) => entry.value === draft.category)?.label ?? "Other"}</Badge>
                  <Badge tone="neutral">{visibilities.find((entry) => entry.value === draft.visibility)?.label ?? "Public"}</Badge>
                  {draft.collaborators ? <Badge tone="success">Looking for collaborators</Badge> : null}
                </div>
                <h3 className="mt-2 text-[16px] font-semibold text-navy-950">{draft.name || "Your project title"}</h3>
                <p className="mt-1 text-[12.5px] leading-6 text-navy-600">
                  {draft.shortDescription || "Your short summary will appear here."}
                </p>
                {draft.skills.trim() ? (
                  <p className="mt-2 text-[11px] text-navy-500">Skills: {draft.skills}</p>
                ) : null}
              </div>
            </article>
            <p className="text-[10.5px] leading-4 text-navy-400">
              This preview uses what you have typed. Nothing has been saved yet.
            </p>
          </div>
        ) : null}

        {/* Fields stay mounted while previewing so their values still submit. */}
        <div className={preview ? "hidden" : "space-y-4"}>
          <>
            <Field label="Project title" htmlFor="quick-name" required>
              <Input
                id="quick-name"
                name="name"
                required
                minLength={3}
                maxLength={120}
                value={draft.name}
                onChange={update("name")}
                placeholder="River Watch"
              />
            </Field>
            <Field label="Short summary" htmlFor="quick-shortDescription" required hint="One or two sentences shown in discovery. At least 20 characters.">
              <Textarea
                id="quick-shortDescription"
                name="shortDescription"
                required
                minLength={20}
                maxLength={240}
                rows={2}
                value={draft.shortDescription}
                onChange={update("shortDescription")}
                placeholder="Volunteers build low-cost river sensors, and everything we learn is published openly."
              />
            </Field>
            <Field label="What are you building, and what does done look like?" htmlFor="quick-outcome" hint="Optional. This becomes the project description.">
              <Textarea
                id="quick-outcome"
                name="outcome"
                rows={4}
                maxLength={8000}
                value={draft.outcome}
                onChange={update("outcome")}
                placeholder="We want a sensor a volunteer can assemble in an afternoon, reading water level and temperature for a year without maintenance."
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cover image" htmlFor="quick-cover" hint="PNG, JPEG or WebP. You can change it later.">
                <Input ref={coverRef} id="quick-cover" name="cover" type="file" accept="image/png,image/jpeg,image/webp" onChange={onCover} />
              </Field>
              <Field label="Skills or expertise needed" htmlFor="quick-skills" hint="Comma-separated. Optional.">
                <Input
                  id="quick-skills"
                  name="skills"
                  maxLength={240}
                  value={draft.skills}
                  onChange={update("skills")}
                  placeholder="Electronics, field research, documentation"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" htmlFor="quick-category" hint="Optional. “Other” is a fine answer.">
                <Select id="quick-category" name="category" value={draft.category} onChange={update("category")}>
                  {categories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Who can see this project" htmlFor="quick-visibility">
                <Select id="quick-visibility" name="visibility" value={draft.visibility} onChange={update("visibility")}>
                  {visibilities.map((visibility) => (
                    <option key={visibility.value} value={visibility.value}>
                      {visibility.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <label className="flex items-start gap-2 text-[12.5px] text-navy-700">
              <input
                type="checkbox"
                name="collaborators"
                checked={draft.collaborators}
                onChange={update("collaborators")}
                className="mt-0.5 h-4 w-4 rounded border-navy-300"
              />
              <span>
                I am looking for collaborators
                <span className="block text-[11px] text-navy-500">
                  Shows “Looking for collaborators” on the project. You still decide who joins.
                </span>
              </span>
            </label>
          </>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-navy-100 pt-4">
          {preview ? (
            <>
              <button
                type="button"
                onClick={() => setPreview(false)}
                className="rounded-lg border border-navy-200 bg-surface px-3 py-2 text-[12.5px] font-medium text-navy-700 hover:bg-navy-50"
              >
                Edit details
              </button>
              <SubmitButton name="publish" value="true" pendingLabel="Publishing…">
                Publish project
              </SubmitButton>
              <SubmitButton name="publish" value="false" variant="secondary" pendingLabel="Saving…">
                Save draft
              </SubmitButton>
              <Link href="/projects" className="text-[12.5px] font-medium text-navy-500 underline">
                Cancel
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setPreview(true)}
                disabled={!canContinue}
                className="rounded-lg border border-navy-200 bg-surface px-3 py-2 text-[12.5px] font-medium text-navy-700 hover:bg-navy-50 disabled:cursor-not-allowed disabled:text-navy-400"
              >
                Preview
              </button>
              <p className="text-[11px] text-navy-500">Title and summary are the only required fields.</p>
              <Link href="/projects" className="ml-auto text-[12.5px] font-medium text-navy-500 underline">
                Cancel
              </Link>
            </>
          )}
        </div>
      </form>
    </Card>
  );
}
