import type { AccountKind } from "@/lib/account";
import type { SessionUser } from "@/lib/session";
import type { UserRole } from "@/lib/types";
import { getUserRolesList } from "@/services/users";
import { userBusinesses } from "@/services/business";
import { resourcesForCreator } from "@/services/learning";

/**
 * Account presentation context.
 *
 * This is derived only from records the server owns: declared roles, business
 * memberships and published teaching. It drives which workspace surfaces are
 * emphasised; it never grants a permission. Every action still checks its own
 * authorisation on the server.
 */
export type AccountBusiness = {
  id: string;
  name: string;
  role: string;
  visibility: string;
};

export type AccountContext = {
  kind: AccountKind;
  roles: UserRole[];
  businesses: AccountBusiness[];
  isCreator: boolean;
  isBusiness: boolean;
  publishedTeaching: number;
  draftTeaching: number;
};

export function accountContext(user: Pick<SessionUser, "id">): AccountContext {
  const roles = getUserRolesList(user.id);
  const businesses = userBusinesses(user.id).map(({ business, role }) => ({
    id: business.id,
    name: business.name,
    role,
    visibility: business.visibility,
  }));
  const resources = resourcesForCreator(user.id);
  const publishedTeaching = resources.filter((resource) => resource.status === "published").length;
  const draftTeaching = resources.filter((resource) => resource.status === "draft").length;

  const isCreator =
    roles.includes("creator") || roles.includes("educator") || publishedTeaching > 0;
  const isBusiness = businesses.length > 0;

  return {
    kind: isBusiness ? "business" : isCreator ? "creator" : "individual",
    roles,
    businesses,
    isCreator,
    isBusiness,
    publishedTeaching,
    draftTeaching,
  };
}

