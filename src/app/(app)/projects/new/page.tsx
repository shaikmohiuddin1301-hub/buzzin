import { ButtonLink, Flash, PageHeader } from "@/components/ui";
import { ProjectWizard } from "@/components/client/project-wizard";
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
  const businesses = userBusinesses(user.id).map((row) => ({ id: row.business.id, name: row.business.name }));

  return (
    <div>
      <PageHeader
        eyebrow="Create"
        title="Start a project"
        description="Project, team and task breakdown in one flow. Save a draft at any point and publish when the work is defined."
        actions={
          <ButtonLink href="/projects" variant="ghost" size="sm">
            Cancel
          </ButtonLink>
        }
      />

      <Flash error={error} notice={notice} />

      <ProjectWizard
        categories={PROJECT_CATEGORIES.map((category) => ({ value: category, label: label(category) }))}
        visibilities={VISIBILITIES.map((visibility) => ({ value: visibility, label: label(visibility) }))}
        stages={PROJECT_STAGES.map((stage) => ({ value: stage, label: label(stage) }))}
        workModes={WORK_MODES.map((mode) => ({ value: mode, label: label(mode) }))}
        compensationTypes={COMPENSATION_TYPES.map((type) => ({ value: type, label: label(type) }))}
        businesses={businesses}
        emailVerified={Boolean(user.emailVerifiedAt)}
      />
    </div>
  );
}
