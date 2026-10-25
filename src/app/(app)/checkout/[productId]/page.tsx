import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, ShieldAlert } from "lucide-react";
import { grantAccessAction, requestAccessFromProductAction, revokeAccessAction } from "@/app/actions/commerce";
import { SubmitButton } from "@/components/client/submit-button";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  DefinitionList,
  Field,
  Flash,
  Input,
  PageHeader,
  Textarea,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatDate, money } from "@/lib/format";
import { label } from "@/lib/types";
import { entitlementsForProduct, productDetail, salesSummary } from "@/services/commerce";
import { hasEntitlement } from "@/lib/authz";

export const metadata = { title: "Access" };

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { productId } = await params;
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();

  const detail = productDetail(productId, user.id);
  if (!detail) notFound();

  const { product, resource, creatorName, creatorUsername, isOwner, entitled, grantCount } = detail;
  const resourceEntitled = resource ? hasEntitlement(user.id, resource.id) : false;
  const grants = isOwner ? entitlementsForProduct(productId) : [];
  const sales = isOwner ? salesSummary(user.id) : null;

  return (
    <div>
      <PageHeader
        title={product.title}
        description={`By ${creatorName} · @${creatorUsername}`}
        actions={
          <ButtonLink href={`/u/${creatorUsername}`} size="sm" variant="secondary">
            View creator
          </ButtonLink>
        }
      />

      <Flash error={error} notice={notice} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Alert tone="warning" title="Payments are not enabled in this build">
            There is no checkout, no card form and no payment provider connected. Access is granted manually by the creator or an
            administrator, and every grant is recorded with the method used. Nothing here charges money.
          </Alert>

          <Card className="p-5">
            <h2 className="text-[14px] font-semibold text-navy-950">What you get</h2>
            <p className="mt-1 text-[13px] leading-6 text-navy-700">{product.description ?? "No description provided."}</p>
            <DefinitionList
              items={[
                { term: "Format", value: label(product.format) },
                { term: "Price (list)", value: product.priceCents === 0 ? "Free" : money(product.priceCents, product.currency) },
                { term: "Refund policy", value: product.refundPolicy ?? "Not stated" },
                { term: "Access grants", value: String(grantCount) },
                {
                  term: "Linked resource",
                  value: resource ? (
                    <Link href={`/learn/${resource.id}`} className="text-brand-700 underline">
                      {resource.title}
                    </Link>
                  ) : (
                    "No resource attached yet"
                  ),
                },
              ]}
            />

            {product.curriculum && product.curriculum.length > 0 ? (
              <>
                <h3 className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-navy-500">Contents</h3>
                <ol className="mt-1.5 space-y-1 text-[12.5px] text-navy-700">
                  {product.curriculum.map((item, index) => (
                    <li key={`${item.title}-${index}`}>
                      <span className="tabular-nums text-navy-400">{index + 1}.</span> {item.title}
                      {item.minutes ? <span className="text-navy-400"> · {item.minutes} min</span> : null}
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-navy-950">
              <Lock size={14} aria-hidden="true" /> Your access
            </h2>
            {resourceEntitled ? (
              <div className="mt-2">
                <Badge tone="success">Access granted</Badge>
                <p className="mt-1 text-[12.5px] text-navy-700">
                  {resource ? (
                    <>
                      You can open{" "}
                      <Link href={`/learn/${resource.id}`} className="text-brand-700 underline">
                        {resource.title}
                      </Link>{" "}
                      in full. Entitlement is checked on the server for every request.
                    </>
                  ) : (
                    "Your access is recorded, but the creator has not attached content yet."
                  )}
                </p>
              </div>
            ) : isOwner ? (
              <p className="mt-1 text-[12.5px] text-navy-600">
                This is your product. Use the form on the right to grant a learner access by email or username.
              </p>
            ) : (
              <>
                <p className="mt-1 text-[12.5px] leading-6 text-navy-700">
                  You do not have access yet. Send a request and the creator will grant or decline it. If they grant access,
                  you will be notified and the full content unlocks.
                </p>
                <form action={requestAccessFromProductAction} className="mt-3 space-y-2">
                  <input type="hidden" name="productId" value={productId} />
                  <Field label="Message to the creator (optional)" htmlFor="note">
                    <Textarea id="note" name="note" rows={2} maxLength={500} placeholder="Why you would like access…" />
                  </Field>
                  <SubmitButton pendingLabel="Sending…">Request access</SubmitButton>
                </form>
              </>
            )}
            {entitled && !isOwner ? <p className="mt-2 text-[11px] text-navy-500">Your access was granted manually; no payment was taken.</p> : null}
          </Card>

          {isOwner ? (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-navy-950">Grant access</h2>
              <p className="mt-0.5 text-[11.5px] text-navy-500">
                This is the only mechanism that creates access in this build. No card data is accepted or stored.
              </p>
              <form action={grantAccessAction} className="mt-3 space-y-2">
                <input type="hidden" name="productId" value={productId} />
                <Field label="Learner email or username" htmlFor="buyer">
                  <Input id="buyer" name="buyer" required placeholder="learner@example.com" />
                </Field>
                <Field label="Internal note" htmlFor="grantNote">
                  <Input id="grantNote" name="note" placeholder="e.g. agreed via project chat" />
                </Field>
                <SubmitButton pendingLabel="Granting…">Grant access</SubmitButton>
              </form>

              <h3 className="mt-5 text-[12px] font-semibold uppercase tracking-wide text-navy-500">Current grants</h3>
              <ul className="mt-1.5 divide-y divide-navy-100">
                {grants.map((row) => (
                  <li key={row.entitlement.id} className="flex items-center justify-between gap-2 py-2">
                    <div>
                      <p className="text-[12px] text-navy-800">
                        {row.userName} <span className="text-navy-400">@{row.username}</span>
                      </p>
                      <p className="text-[10.5px] text-navy-500">
                        {formatDate(row.entitlement.grantedAt)}
                        {row.entitlement.revokedAt ? ` · revoked ${formatDate(row.entitlement.revokedAt)}` : ""}
                      </p>
                    </div>
                    {!row.entitlement.revokedAt ? (
                      <form action={revokeAccessAction} className="flex items-center gap-1">
                        <input type="hidden" name="entitlementId" value={row.entitlement.id} />
                        <input type="hidden" name="reason" value="Creator revoked access" />
                        <SubmitButton
                          size="sm"
                          variant="ghost"
                          pendingLabel="…"
                          confirmMessage="Revoke this learner's access to the content?"
                        >
                          Revoke
                        </SubmitButton>
                      </form>
                    ) : (
                      <Badge tone="neutral">revoked</Badge>
                    )}
                  </li>
                ))}
                {grants.length === 0 ? <li className="py-3 text-[11.5px] text-navy-500">No grants yet.</li> : null}
              </ul>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Access model</h2>
            <ul className="mt-1.5 space-y-1 text-[11px] leading-5 text-navy-600">
              <li>Entitlements are rows in the database, checked server-side.</li>
              <li>Content is never shipped to users who lack an entitlement — the page and files refuse.</li>
              <li>Revoking an entitlement takes effect immediately.</li>
              <li>No raw card details are ever collected or stored.</li>
            </ul>
          </Card>

          {isOwner && sales ? (
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Access summary</h2>
              <p className="mt-1 text-[12px] text-navy-700">{sales.summaryLabel}</p>
              <p className="mt-1 text-[10.5px] text-navy-400">List value assumes the sticker price; it is not revenue.</p>
            </Card>
          ) : null}

          <Alert tone="info" title="Why no payment form?">
            Card payments require a regulated provider, eligibility checks and legal review of consumer rights and refunds. This
            build deliberately leaves that out rather than simulating a charge.
          </Alert>

          <p className="flex items-start gap-1.5 text-[10.5px] leading-4 text-navy-400">
            <ShieldAlert size={12} aria-hidden="true" /> Prices are illustrative. Nothing on this page forms an offer to sell.
          </p>
        </aside>
      </div>
    </div>
  );
}
