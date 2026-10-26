/**
 * Presentation metadata for the three account experiences.
 *
 * The account kind itself is decided on the server from roles, business
 * memberships and published teaching (`src/services/account.ts`). This module is
 * pure so the client Create sheet and server pages order their real options the
 * same way without importing service code.
 */
export type AccountKind = "individual" | "creator" | "business";

export function accountKindLabel(kind: AccountKind): string {
  if (kind === "business") return "Business";
  if (kind === "creator") return "Creator";
  return "Individual";
}

/**
 * Ordering only. Every option stays available because the server permits every
 * account to use it; the most likely actions simply appear first.
 */
export const CREATE_PRIORITY: Record<AccountKind, string[]> = {
  creator: ["New teaching", "New course", "New post", "Share a learning", "Share an update", "New project", "New task"],
  business: ["New project", "Share an update", "New post", "New task", "New teaching", "New course", "Share a learning"],
  individual: ["New post", "Share a learning", "New project", "Share an update", "New task", "New teaching", "New course"],
};

export function orderByAccountPriority<T extends { label: string }>(items: T[], kind: AccountKind): T[] {
  const priority = CREATE_PRIORITY[kind];
  const rank = (label: string) => {
    const index = priority.indexOf(label);
    return index === -1 ? priority.length : index;
  };
  return [...items].sort((a, b) => rank(a.label) - rank(b.label));
}
