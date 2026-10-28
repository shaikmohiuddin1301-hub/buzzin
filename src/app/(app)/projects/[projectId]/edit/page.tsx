import { notFound, redirect } from "next/navigation";
import { Flash, PageHeader } from "@/components/ui";
import { ProjectWizard, type WizardInitial } from "@/components/client/project-wizard";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { COMPENSATION_TYPES, PROJECT_CATEGORIES, PROJECT_STAGES, VISIBILITIES, WORK_MODES, label } from "@/lib/types";
import { userBusinesses } from "@/services/business";
import { projectDetail } from "@/services/projects";
import { listTasks } from "@/services/tasks";
import { listWorkAreas } from "@/services/workAreas";

export const metadata = { title: "Edit project" };
export const dynamic = "force-dynamic";

/**
 * Reopen a saved project in the same four-step flow that created it.
 *
 * The owner sees the values that are actually stored — including work areas and the
 * task breakdown — instead of an empty second form. Tasks that are already on the
 * board are shown read-only: they have a status, assignees and review history that
 * the creation wizard does not model, so the task board remains their editor.
 */
export default async function EditProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();

  const detail = projectDetail(projectId, user);
  if (!detail) notFound();
  if (!detail.access.canEdit) redirect(`/projects/${projectId}`);

  const { project } = detail;
  const areas = listWorkAreas(projectId, user);
  const tasks = listTasks(projectId, user);
  const areaNames = new Map(areas.map((area) => [area.id, area.name]));
  const businesses = userBusinesses(user.id).map((row) => ({ id: row.business.id, name: row.business.name }));

  const initial: WizardInitial = {
    basics: {
      name: project.name,
      shortDescription: project.shortDescription,
      overview: project.overview ?? "",
      problem: project.problem ?? "",
      audience: project.audience ?? "",
      category: project.category,
      stage: project.stage,
      workMode: project.workMode,
      visibility: project.visibility,
      businessId: project.businessId ?? "",
      effort: project.effort ?? "",
      deadline: project.deadline ?? "",
      allowPublicDocs: project.allowPublicDocs,
      collaborators: project.openToCollaborators,
    },
    team: {
      skills: detail.skills.map((skill) => skill.name).join(", "),
      compensationType: project.compensationType,
      compensationDetails: project.compensationDetails ?? "",
      confidentialityNotes: project.confidentialityNotes ?? "",
      ipNotes: project.ipNotes ?? "",
    },
    links: (project.links ?? []).map((link) => ({ label: link.label, url: link.url })),
    milestones: detail.milestones.map((milestone) => ({
      title: milestone.title,
      description: milestone.description ?? "",
      dueDate: milestone.dueDate ?? "",
    })),
    workAreas: areas.map((area) => area.name),
    persistedAreas: areas.map((area) => area.name),
    tasks: tasks.map((task) => ({
      key: task.id,
      id: task.id,
      title: task.title,
      description: task.description ?? "",
      objective: task.objective ?? "",
      deliverablesSpec: task.deliverablesSpec ?? "",
      acceptanceCriteria: task.acceptanceCriteria ?? "",
      effort: task.effort ?? "",
      deadline: task.deadline ?? "",
      skills: "",
      workArea: task.workAreaId ? areaNames.get(task.workAreaId) ?? "" : "",
      assignee: task.assigneeUsername ?? "",
      visibility: task.visibility,
      priority: task.priority,
      referenceLinks: "",
      dependsOn: [],
    })),
    coverUrl: project.coverImageId ? `/api/files/${project.coverImageId}` : null,
    status: project.status === "published" ? "published" : "draft",
  };

  return (
    <div>
      <PageHeader
        eyebrow={project.status === "published" ? "Edit" : "Continue draft"}
        title={project.name}
        description="Change the details you already saved. Work areas and tasks already on the board are kept."
      />

      <Flash error={error} notice={notice} />

      <ProjectWizard
        mode="edit"
        projectId={projectId}
        initial={initial}
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
