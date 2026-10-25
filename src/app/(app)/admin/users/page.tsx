import Link from "next/link";
import { setUserRoleAction } from "@/app/actions/admin";
import { SubmitButton } from "@/components/client/submit-button";
import { Alert, Badge, Card, EmptyState, Field, Flash, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { adminUserList } from "@/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "User management" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const admin = await requireAdmin();
  const q = typeof query.q === "string" ? query.q : "";
  const users = adminUserList(q);

  return (
    <div>
      <PageHeader title="User management" description="Search accounts, review status and grant moderation rights." />

      <Flash error={error} notice={notice} />

      <form className="mb-4 flex flex-wrap items-end gap-2" action="/admin/users">
        <div className="w-64">
          <Field label="Search" htmlFor="q">
            <Input id="q" name="q" defaultValue={q} placeholder="Name, username or email" />
          </Field>
        </div>
        <SubmitButton size="sm" variant="secondary" pendingLabel="…">
          Search
        </SubmitButton>
      </form>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Account</Th>
              <Th>Status</Th>
              <Th>Roles</Th>
              <Th>Joined</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <Td>
                  <Link href={`/u/${user.username}`} className="font-medium text-navy-900 hover:underline">
                    {user.displayName}
                  </Link>
                  <span className="block text-[10.5px] text-navy-500">
                    @{user.username} · {user.email}
                  </span>
                </Td>
                <Td>
                  <Badge tone={user.status === "active" ? "success" : user.status === "restricted" ? "warning" : "danger"}>
                    {user.status}
                  </Badge>
                  {user.suspendedReason ? <span className="block text-[10px] text-navy-500">{user.suspendedReason}</span> : null}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {user.isAdmin ? <Badge tone="danger">admin</Badge> : null}
                    {user.isModerator ? <Badge tone="warning">moderator</Badge> : null}
                    {!user.isAdmin && !user.isModerator ? <span className="text-[11px] text-navy-400">member</span> : null}
                  </div>
                </Td>
                <Td>
                  <span className="text-[11px] text-navy-500">{formatDate(user.createdAt)}</span>
                </Td>
                <Td>
                  {admin.isAdmin && user.id !== admin.id ? (
                    <div className="flex flex-wrap gap-1">
                      {(["moderator", "admin"] as const).map((role) => {
                        const granted = role === "admin" ? user.isAdmin : user.isModerator;
                        return (
                          <form key={role} action={setUserRoleAction}>
                            <input type="hidden" name="userId" value={user.id} />
                            <input type="hidden" name="role" value={role} />
                            <input type="hidden" name="grant" value={granted ? "false" : "true"} />
                            <SubmitButton size="sm" variant="ghost" pendingLabel="…">
                              {granted ? `Remove ${role}` : `Make ${role}`}
                            </SubmitButton>
                          </form>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-[10.5px] text-navy-400">
                      {user.id === admin.id ? "This is you" : "Administrators only"}
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {users.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No matching accounts" description="Try a different search term." />
          </div>
        ) : null}
      </Card>

      <div className="mt-4">
        <Alert tone="warning" title="Account restrictions are not on this page">
          Suspensions and restrictions are applied through a specific report so that they always carry a reason code, an internal
          justification and an audit entry. Open the relevant report in the moderation queue.
        </Alert>
      </div>
    </div>
  );
}
