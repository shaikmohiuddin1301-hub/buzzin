import { revokeAccessAction } from "@/app/actions/commerce";
import { SubmitButton } from "@/components/client/submit-button";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  Flash,
  PageHeader,
  Stat,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Th,
  Input,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatDate, money } from "@/lib/format";
import { entitlementsForProduct, productsForCreator, salesSummary } from "@/services/commerce";

export const metadata = { title: "Sales and access" };

export default async function StudioSalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();
  const sales = salesSummary(user.id);
  const products = productsForCreator(user.id);
  const grants = products.flatMap((row) =>
    entitlementsForProduct(row.product.id).map((grant) => ({ ...grant, productTitle: row.product.title })),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Creator studio"
        title="Sales and access"
        description="Every row here is an access grant, not a payment. Nothing has been charged and no payout is owed."
        actions={
          <ButtonLink href="/studio/products" variant="secondary" size="sm">
            Products
          </ButtonLink>
        }
      />

      <Flash error={error} notice={notice} />

      <Tabs
        current="sales"
        items={[
          { id: "overview", label: "Overview", href: "/studio" },
          { id: "products", label: "Products", href: "/studio/products" },
          { id: "sales", label: "Sales & access", href: "/studio/sales" },
        ]}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Access grants" value={sales.grantedCount} hint="Manual grants only" />
        <Stat label="List value" value={money(sales.listValueCents)} hint="What it would be worth if charged" />
        <Stat label="Collected" value={money(0)} hint="Payments disabled in this build" />
        <Stat label="Revoked" value={sales.rows.filter((row) => row.order.status === "revoked").length} />
      </div>

      <div className="mb-4">
        <Alert tone="warning" title="This is not revenue">
          The list value above is a hypothetical. No money has moved, no invoice exists, and no tax has been accounted for. Do
          not present these figures as earnings.
        </Alert>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <div className="border-b border-navy-100 px-5 py-4">
            <h2 className="text-[14px] font-semibold text-navy-950">Access grants</h2>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Learner</Th>
                <Th>Product</Th>
                <Th>Granted</Th>
                <Th>Status</Th>
                <Th>Revoke</Th>
              </tr>
            </thead>
            <tbody>
              {grants.map((row) => (
                <tr key={row.entitlement.id}>
                  <Td>
                    <p className="font-medium text-navy-900">{row.userName}</p>
                    <p className="text-[11px] text-navy-500">@{row.username}</p>
                  </Td>
                  <Td>{row.productTitle}</Td>
                  <Td>{formatDate(row.entitlement.grantedAt)}</Td>
                  <Td>
                    {row.entitlement.revokedAt ? (
                      <Badge tone="danger">Revoked</Badge>
                    ) : (
                      <Badge tone="success">Active</Badge>
                    )}
                  </Td>
                  <Td>
                    {!row.entitlement.revokedAt ? (
                      <form action={revokeAccessAction} className="flex items-center gap-1">
                        <input type="hidden" name="entitlementId" value={row.entitlement.id} />
                        <Input name="reason" required minLength={5} placeholder="Reason" className="h-7 w-28 text-[11px]" aria-label="Revocation reason" />
                        <SubmitButton size="sm" variant="ghost" confirmMessage="Revoke this access? The learner immediately loses the paid content.">
                          Revoke
                        </SubmitButton>
                      </form>
                    ) : (
                      <span className="text-[11px] text-navy-500">{row.entitlement.revokedReason}</span>
                    )}
                  </Td>
                </tr>
              ))}
              {grants.length === 0 ? (
                <tr>
                  <Td colSpan={5}>No access grants yet.</Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </Card>

        <aside className="space-y-4">
          <Card>
            <div className="border-b border-navy-100 px-4 py-3">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Access requests</h2>
            </div>
            <ul className="divide-y divide-navy-100">
              {sales.rows
                .filter((row) => row.order.status === "pending")
                .map((row) => (
                  <li key={row.order.id} className="px-4 py-3">
                    <p className="text-[12px] font-medium text-navy-900">{row.buyerName}</p>
                    <p className="text-[11px] text-navy-500">{row.productTitle}</p>
                    <p className="mt-0.5 text-[10.5px] text-navy-400">{formatDate(row.order.createdAt)}</p>
                    {row.order.note ? <p className="mt-1 text-[11px] text-navy-600">“{row.order.note}”</p> : null}
                  </li>
                ))}
              {sales.rows.every((row) => row.order.status !== "pending") ? (
                <li className="px-4 py-4 text-[11.5px] text-navy-500">No pending requests.</li>
              ) : null}
            </ul>
          </Card>

          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Grant workflow</h2>
            <p className="mt-1.5 text-[11px] leading-5 text-navy-600">
              Use the grant form on the products page. Each grant creates an order, an order item, an entitlement and an audit
              record, and notifies the learner.
            </p>
            <ButtonLink href="/studio/products" size="sm" variant="secondary" className="mt-2">
              Grant access
            </ButtonLink>
          </Card>

          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Before enabling payments</h2>
            <ul className="mt-1.5 space-y-1 text-[10.5px] leading-4 text-navy-600">
              <li>Marketplace eligibility and KYC</li>
              <li>Consumer cancellation and refund rights</li>
              <li>Tax treatment and invoicing</li>
              <li>Webhook signature validation and idempotency</li>
              <li>Commission disclosure and payout terms</li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
