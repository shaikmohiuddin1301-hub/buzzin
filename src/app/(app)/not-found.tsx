import { ButtonLink, EmptyState } from "@/components/ui";

/**
 * Shown for a deleted project, a removed collaborator following an old
 * notification link, or any other destination the viewer cannot see.
 *
 * It deliberately says the page is unavailable rather than whether the content
 * exists: "not found" and "not yours" must look identical.
 */
export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-xl py-10">
      <EmptyState
        title="That page is not available"
        description="It may have been deleted, made private, or you may no longer have access. If you followed an old notification, the work it referred to has changed."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <ButtonLink href="/home" size="sm">
              Go home
            </ButtonLink>
            <ButtonLink href="/notifications" size="sm" variant="secondary">
              Notifications
            </ButtonLink>
          </div>
        }
      />
    </div>
  );
}
