import Link from "next/link";
import { grantAccessAction, publishProductAction, updateProductAction } from "@/app/actions/commerce";
import { SubmitButton } from "@/components/client/submit-button";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  Field,
  Flash,
  Input,
  PageHeader,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatDate, money } from "@/lib/format";
import { label } from "@/lib/types";
import { entitlementsForProduct, productsForCreator } from "@/services/commerce";
import { resourcesForCreator } from "@/services/learning";

export const metadata = { title: "Products" };

export default async function StudioProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();
  const products = productsForCreator(user.id);
  const resources = resourcesForCreator(user.id).filter((resource) => resource.status === "published");

  return (
    <div>
      <PageHeader
        eyebrow="Creator studio"
        title="Premium learning products"
        description="Products wrap a published learning resource. Payments are disabled: access is granted directly and entitlements are enforced on the server."
        actions={
          <>
            <ButtonLink href="/studio" variant="ghost" size="sm">
              Studio
            </ButtonLink>
            <ButtonLink href="/studio/products/new" size="sm">
              New product
            </ButtonLink>
          </>
        }
      />

      <Flash error={error} notice={notice} />

      <Tabs
        current="products"
        items={[
          { id: "overview", label: "Overview", href: "/studio" },
          { id: "products", label: "Products", href: "/studio/products" },
          { id: "sales", label: "Sales & access", href: "/studio/sales" },
        ]}
      />

      <div className="mb-4">
        <Alert tone="warning" title="No payment processing">
          This build collects no card data, starts no charge, and does not pay out. Price is a listing price for when a
          payment rail is added after eligibility, KYC and consumer-law review.
        </Alert>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <Card>
          <div className="border-b border-navy-100 px-5 py-4">
            <h2 className="text-[14px] font-semibold text-navy-950">Your products</h2>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Price</Th>
                <Th>Status</Th>
                <Th>Access</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {products.map((row) => {
                const grants = entitlementsForProduct(row.product.id).filter((grant) => !grant.entitlement.revokedAt);
                return (
                  <tr key={row.product.id}>
                    <Td>
                      <p className="font-medium text-navy-900">{row.product.title}</p>
                      <p className="text-[11px] text-navy-500">
                        {row.resourceTitle ? `Linked: ${row.resourceTitle}` : "No linked resource"}
                      </p>
                    </Td>
                    <Td>{money(row.product.priceCents, row.product.currency)}</Td>
                    <Td>
                      <StatusBadge status={row.product.status} />
                    </Td>
                    <Td>{grants.length}</Td>
                    <Td>
                      {row.product.status === "draft" ? (
                        <form action={publishProductAction}>
                          <input type="hidden" name="productId" value={row.product.id} />
                          <SubmitButton size="sm" pendingLabel="…">
                            Publish
                          </SubmitButton>
                        </form>
                      ) : (
                        <Badge tone="success">Live</Badge>
                      )}
                    </Td>
                  </tr>
                );
              })}
              {products.length === 0 ? (
                <tr>
                  <Td colSpan={5}>
                    No products yet.{" "}
                    <Link href="/studio/products/new" className="underline">
                      Create one
                    </Link>{" "}
                    from a published resource.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </Card>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Grant access</h2>
            <p className="mt-1 text-[11px] leading-5 text-navy-600">
              Since no payment is taken, you grant access manually. The grant is audited and the learner is notified.
            </p>
            <form action={grantAccessAction} className="mt-2 space-y-2">
              <Field label="Product" htmlFor="grant-product">
                <select id="grant-product" name="productId" required className="field-input text-[12px]">
                  <option value="">Choose…</option>
                  {products.map((row) => (
                    <option key={row.product.id} value={row.product.id}>
                      {row.product.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Learner email or username" htmlFor="buyer">
                <Input id="buyer" name="buyer" required placeholder="leo_chen" />
              </Field>
              <Field label="Note (optional)" htmlFor="grant-note">
                <Textarea id="grant-note" name="note" rows={2} maxLength={600} />
              </Field>
              <SubmitButton size="sm" className="w-full" pendingLabel="Granting…">
                Grant access
              </SubmitButton>
            </form>
          </Card>

          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Published resources</h2>
            <ul className="mt-2 space-y-1.5">
              {resources.map((resource) => (
                <li key={resource.id} className="flex items-center justify-between gap-2">
                  <Link href={`/learn/${resource.id}`} className="truncate text-[11.5px] text-navy-700 hover:underline">
                    {resource.title}
                  </Link>
                  <Badge tone={resource.priceCents > 0 ? "warning" : "success"}>
                    {resource.priceCents > 0 ? money(resource.priceCents) : "Free"}
                  </Badge>
                </li>
              ))}
              {resources.length === 0 ? <li className="text-[11.5px] text-navy-500">No published resources yet.</li> : null}
            </ul>
          </Card>

          {products.length > 0 ? (
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Quick edit</h2>
              <form action={updateProductAction} className="mt-2 space-y-2">
                <Field label="Product" htmlFor="edit-product">
                  <select id="edit-product" name="productId" required className="field-input text-[12px]">
                    {products.map((row) => (
                      <option key={row.product.id} value={row.product.id}>
                        {row.product.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="New price (£)" htmlFor="price">
                  <Input id="price" name="price" type="number" min={1} step="0.01" />
                </Field>
                <Field label="Refund policy" htmlFor="refundPolicy">
                  <Textarea id="refundPolicy" name="refundPolicy" rows={2} />
                </Field>
                <SubmitButton size="sm" variant="secondary" className="w-full" pendingLabel="…">
                  Save changes
                </SubmitButton>
              </form>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
