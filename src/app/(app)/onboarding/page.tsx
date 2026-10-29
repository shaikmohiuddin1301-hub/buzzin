import Link from "next/link";
import { onboardingAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/client/submit-button";
import { Alert, Card, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/redirects";
import { listSkills, userSkillsFor } from "@/services/users";
import { PROJECT_CATEGORIES, USER_GOALS, label } from "@/lib/types";

export const metadata = { title: "Set up your profile" };

const goalCopy: Record<string, string> = {
  build_projects: "I want to build projects and find collaborators",
  contribute: "I want to contribute to other people's projects",
  learn: "I want to learn practical skills from real work",
  teach: "I want to publish lessons and teach what I know",
  grow_audience: "I want to grow an audience for my work",
  grow_business: "I want to grow a business or organisation",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { error } = readFlash(params);
  const user = await requireUser();
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const existingSkills = userSkillsFor(user.id).map((skill) => skill.name);
  const knownSkills = listSkills().slice(0, 40);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-navy-600">Step 1 of 1</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Tell us what you want to do</h1>
        <p className="mt-2 text-sm leading-6 text-navy-600">
          This shapes your feed and the projects we recommend. You can change everything later in settings — we only ask
          for what we actually use.
        </p>
      </div>

      {error ? (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <form action={onboardingAction} encType="multipart/form-data" className="space-y-6">
        <input type="hidden" name="next" value={next} />
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-navy-950">Your profile</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Display name" htmlFor="displayName" required>
              <Input id="displayName" name="displayName" defaultValue={user.displayName} required maxLength={60} />
            </Field>
            <Field label="Username" htmlFor="username" required hint="Your profile lives at /u/username">
              <Input id="username" name="username" defaultValue={user.username} required />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Profile image" htmlFor="avatar" hint="PNG, JPEG, WebP or GIF up to the upload limit.">
              <Input id="avatar" name="avatar" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
            </Field>
            <Field label="Location" htmlFor="location" hint="Optional — helps with local and hybrid projects.">
              <Input id="location" name="location" placeholder="Manchester, UK" maxLength={80} />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Time zone" htmlFor="timezone" hint="Used to make deadlines and chat times sensible.">
              <Select id="timezone" name="timezone" defaultValue={user.timezone ?? "Europe/London"}>
                {[
                  "Europe/London",
                  "Europe/Berlin",
                  "Europe/Lisbon",
                  "America/New_York",
                  "America/Chicago",
                  "America/Los_Angeles",
                  "Asia/Kolkata",
                  "Asia/Singapore",
                  "Australia/Sydney",
                  "Africa/Lagos",
                ].map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replace("_", " ")}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Portfolio link" htmlFor="portfolioUrls" hint="Comma-separated, up to 5 http(s) links.">
              <Input id="portfolioUrls" name="portfolioUrls" placeholder="https://your-site.example" />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Short biography" htmlFor="bio" hint="What you work on and what you would like to learn. 600 characters.">
              <Textarea id="bio" name="bio" defaultValue={user.bio ?? ""} maxLength={600} rows={4} />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-navy-950">Goals</h2>
          <p className="mt-0.5 text-[13px] text-navy-500">Pick as many as apply. At least one is required.</p>
          <div className="mt-3 grid gap-1 sm:grid-cols-2">
            {USER_GOALS.map((goal) => (
              <Checkbox
                key={goal}
                name="goals"
                value={goal}
                label={label(goal)}
                description={goalCopy[goal]}
                defaultChecked={user.goals.includes(goal)}
              />
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-navy-950">What would you like to do on BuildTogether?</h2>
          <p className="mt-0.5 text-[13px] text-navy-500">Roles are additive — most people are several of these.</p>
          <div className="mt-3 grid gap-1 sm:grid-cols-2">
            {[
              { value: "creator", label: "Create and lead projects" },
              { value: "contributor", label: "Contribute to projects" },
              { value: "educator", label: "Publish learning content" },
              { value: "learner", label: "Learn from others' work" },
              { value: "business", label: "Represent a business or organisation" },
            ].map((role) => (
              <Checkbox key={role.value} name="roles" value={role.value} label={role.label} />
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-navy-950">Skills and interests</h2>
          <div className="mt-4 space-y-4">
            <Field
              label="Skills you have"
              htmlFor="skills"
              hint="Comma-separated. These appear on your profile with evidence attached as you contribute."
            >
              <Input id="skills" name="skills" defaultValue={existingSkills.join(", ")} list="skill-options" />
            </Field>
            <datalist id="skill-options">
              {knownSkills.map((skill) => (
                <option key={skill.id} value={skill.name} />
              ))}
            </datalist>

            <Field label="Interests and topics you follow" htmlFor="interests" hint="Comma-separated, e.g. accessibility, climate tech, hardware.">
              <Input id="interests" name="interests" placeholder="accessibility, climate tech" />
            </Field>

            <fieldset>
              <legend className="text-sm font-medium text-navy-800">Project categories you want to see</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROJECT_CATEGORIES.map((category) => (
                  <label
                    key={category}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-navy-200 px-3 py-1.5 text-[12px] font-medium text-navy-700 has-[:checked]:border-blue-400 has-[:checked]:bg-glass-blue has-[:checked]:text-blue-800"
                  >
                    <input type="checkbox" name="categories" value={category} className="h-3.5 w-3.5 rounded border-navy-300 text-blue-600" />
                    {label(category)}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={next} className="text-[13px] text-navy-500 hover:text-navy-800 hover:underline">
            Skip for now
          </Link>
          <SubmitButton size="lg" pendingLabel="Saving your profile…">
            Finish setup
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
