import Link from "next/link";
import { createProjectAction } from "@/app/actions/projects";
import { SubmitButton } from "@/components/client/submit-button";
import {
  Alert,
  ButtonLink,
  Card,
  Checkbox,
  Field,
  Flash,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { userBusinesses } from "@/services/business";
import {
  COMPENSATION_TYPES,
  PROJECT_CATEGORIES,
  PROJECT_STAGES,
  VISIBILITIES,
  WORK_MODES,
  label,
} from "@/lib/types";

export const metadata = { title: "Start a project" };

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { error, notice } = readFlash(params);
  const user = await requireUser();
  const businesses = userBusinesses(user.id);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Create"
        title="Start a project"
        description="Six short sections. Save it as a draft at any point — nothing is public until you publish."
        actions={
          <ButtonLink href="/explore" variant="ghost" size="sm">
            Cancel
          </ButtonLink>
        }
      />

      <Flash error={error} notice={notice} />

      {!user.emailVerifiedAt ? (
        <div className="mb-4">
          <Alert tone="warning" title="Verify your email to publish">
            You can save a draft now. Publishing requires a verified email address.{" "}
            <Link href="/settings?tab=security" className="underline">
              Verify email
            </Link>
          </Alert>
        </div>
      ) : null}

      <form action={createProjectAction} className="space-y-5">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-navy-950">
            <span className="mr-2 text-brand-600">01</span>The basics
          </h2>
          <div className="mt-4 space-y-4">
            <Field label="Project name" htmlFor="name" required hint="Concrete beats clever. “River Watch” not “Project Phoenix”.">
              <Input id="name" name="name" required maxLength={120} placeholder="River Watch" />
            </Field>
            <Field
              label="Short description"
              htmlFor="shortDescription"
              required
              hint="One or two sentences shown in discovery. At least 20 characters."
            >
              <Textarea id="shortDescription" name="shortDescription" required minLength={20} maxLength={240} rows={2} />
            </Field>
            <FlowFields />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-navy-950">
            <span className="mr-2 text-brand-600">02</span>The work itself
          </h2>
          <div className="mt-4 space-y-4">
            <Field label="Detailed overview" htmlFor="overview" hint="What exists today, what you are trying to build, how far along you are.">
              <Textarea id="overview" name="overview" rows={6} maxLength={8000} />
            </Field>
            <Field label="Problem being solved" htmlFor="problem" hint="Be specific. If it is not a real problem for a real group, say so honestly.">
              <Textarea id="problem" name="problem" rows={3} maxLength={2000} />
            </Field>
            <Field label="Intended users or audience" htmlFor="audience" hint="Who benefits, and who is involved day to day?">
              <Input id="audience" name="audience" maxLength={400} />
            </Field>
            <Field label="Skills involved" htmlFor="skills" hint="Comma-separated. These power discovery and matching.">
              <Input id="skills" name="skills" placeholder="UX research, React, accessibility" />
            </Field>
            <ContentFields />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-navy-950">
            <span className="mr-2 text-brand-600">03</span>Goals and milestones
          </h2>
          <p className="mt-1 text-[13px] text-navy-500">Optional. Milestones make progress visible and give the story something to cite.</p>
          <div className="mt-4 space-y-3">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1.4fr_1.4fr_140px]">
                <Field label={`Milestone ${index + 1}`} htmlFor={`milestoneTitle${index}`}>
                  <Input id={`milestoneTitle${index}`} name={`milestoneTitle${index}`} placeholder="Working prototype" />
                </Field>
                <Field label="What done looks like" htmlFor={`milestoneDescription${index}`}>
                  <Input id={`milestoneDescription${index}`} name={`milestoneDescription${index}`} placeholder="Tested for a week without failure" />
                </Field>
                <Field label="Target date" htmlFor={`milestoneDue${index}`}>
                  <Input id={`milestoneDue${index}`} name={`milestoneDue${index}`} type="date" />
                </Field>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-navy-950">
            <span className="mr-2 text-brand-600">04</span>Visibility and documentation
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Who can see this project" htmlFor="visibility" hint="Private and invite-only projects are excluded from public discovery.">
              <Select id="visibility" name="visibility" defaultValue="public">
                {VISIBILITIES.map((visibility) => (
                  <option key={visibility} value={visibility}>
                    {label(visibility)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Compensation arrangement" htmlFor="compensationType">
              <Select id="compensationType" name="compensationType" defaultValue="unpaid">
                {COMPENSATION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {label(type)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-4 space-y-2">
            <Checkbox
              name="allowPublicDocs"
              label="Allow contributors to publish documentation publicly"
              description="Required before any work-log entry or learning journey can be made public. You still approve each entry."
            />
          </div>
          <div className="mt-4 space-y-4">
            <Field
              label="What contributors receive"
              htmlFor="compensationDetails"
              hint="Required for unpaid projects. Credit, references, learning, expenses, equity — say it plainly. A project listing does not make unpaid work lawful."
            >
              <Textarea id="compensationDetails" name="compensationDetails" rows={3} maxLength={2000} />
            </Field>
            <Field label="Confidentiality notes" htmlFor="confidentialityNotes" hint="What must stay private, and from whom?">
              <Textarea id="confidentialityNotes" name="confidentialityNotes" rows={2} maxLength={2000} />
            </Field>
            <Field label="Intellectual property and licensing" htmlFor="ipNotes" hint="Who owns what, and under which licence?">
              <Textarea id="ipNotes" name="ipNotes" rows={2} maxLength={2000} />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-navy-950">
            <span className="mr-2 text-brand-600">05</span>Links, team and business
          </h2>
          <div className="mt-4 space-y-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                <Field label={`Link label ${index + 1}`} htmlFor={`linkLabel${index}`}>
                  <Input id={`linkLabel${index}`} name={`linkLabel${index}`} placeholder="Design notes" />
                </Field>
                <Field label={`URL ${index + 1}`} htmlFor={`linkUrl${index}`}>
                  <Input id={`linkUrl${index}`} name={`linkUrl${index}`} type="url" placeholder="https://…" />
                </Field>
              </div>
            ))}
            {businesses.length > 0 ? (
              <Field label="Publish as a business" htmlFor="businessId" hint="Optional. Links the project to your organisation's portfolio.">
                <Select id="businessId" name="businessId" defaultValue="">
                  <option value="">Personal project</option>
                  {businesses.map((row) => (
                    <option key={row.business.id} value={row.business.id}>
                      {row.business.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-navy-950">
            <span className="mr-2 text-brand-600">06</span>Before you publish
          </h2>
          <ul className="mt-3 space-y-2 text-[12.5px] leading-6 text-navy-600">
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              Tasks you add later must include acceptance criteria before they can be published.
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              You are responsible for the accuracy of this listing and for complying with employment and tax law in your
              jurisdiction.
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              Private projects stay invisible to non-members. Work logs are private to the team until you both agree
              otherwise.
            </li>
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <SubmitButton pendingLabel="Saving…" name="publish" value="on" size="lg">
              Publish project
            </SubmitButton>
            <SubmitButton pendingLabel="Saving…" variant="secondary" size="lg">
              Save as draft
            </SubmitButton>
          </div>
        </Card>
      </form>
    </div>
  );
}

function FlowFields() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="Category" htmlFor="category" required>
        <Select id="category" name="category" defaultValue="software" required>
          {PROJECT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {label(category)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Stage" htmlFor="stage" required>
        <Select id="stage" name="stage" defaultValue="idea" required>
          {PROJECT_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {label(stage)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Ways of working" htmlFor="workMode" required>
        <Select id="workMode" name="workMode" defaultValue="remote" required>
          {WORK_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {label(mode)}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

function ContentFields() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="Estimated effort" htmlFor="effort" hint="e.g. 4 hours per week">
        <Input id="effort" name="effort" maxLength={80} />
      </Field>
      <Field label="Target date" htmlFor="deadline">
        <Input id="deadline" name="deadline" type="date" />
      </Field>
      <Field label="Cover image" htmlFor="cover" hint="Add the cover after publishing from the project page.">
        <Input id="cover" name="cover" disabled placeholder="Upload in project settings" />
      </Field>
    </div>
  );
}
