import { redirect } from "next/navigation";
import { AppError, isNextControlFlowError } from "@/lib/errors";

/** Append a flash message to a path without clobbering existing query params. */
export function withFlash(
  path: string,
  flash: { error?: string; notice?: string },
): string {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  if (flash.error) params.set("error", flash.error);
  if (flash.notice) params.set("notice", flash.notice);
  const search = params.toString();
  return search ? `${base}?${search}` : (base ?? "/");
}

export type ActionOutcome = { path: string; revalidate?: string[] } | void;

/**
 * Wrap a server action body.
 *
 * - Success: revalidates the affected paths and redirects.
 * - Failure: redirects back with a readable `?error=` flash instead of leaking a
 *   stack trace. Next.js control-flow errors are re-thrown untouched.
 *
 * The return type is `Promise<never>` because the action always ends in a redirect.
 */
export async function runServerAction(
  fallbackPath: string,
  fn: () => Promise<ActionOutcome>,
): Promise<never> {
  let outcome: ActionOutcome;
  try {
    outcome = await fn();
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    const message =
      error instanceof AppError
        ? error.message
        : "Something went wrong. Please try again.";
    if (!(error instanceof AppError)) console.error("[action]", error);
    redirect(withFlash(fallbackPath, { error: message }));
  }

  const { revalidatePath } = await import("next/cache");
  const target = outcome?.path ?? fallbackPath;
  const paths = outcome?.revalidate?.length ? outcome.revalidate : [target.split("?")[0] ?? "/"];
  for (const path of paths) revalidatePath(path);
  redirect(target);
}

/** Read a flash message out of page search params. */
export function readFlash(searchParams: Record<string, string | string[] | undefined>) {
  return {
    error: typeof searchParams.error === "string" ? searchParams.error : undefined,
    notice: typeof searchParams.notice === "string" ? searchParams.notice : undefined,
  };
}
