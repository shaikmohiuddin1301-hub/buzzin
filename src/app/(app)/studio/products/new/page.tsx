import Link from "next/link";
import { createProductAction } from "@/app/actions/commerce";
import { SubmitButton } from "@/components/client/submit-button";
import { Alert, ButtonLink, Card, Field, Flash, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { resourcesForCreator } from "@/services/learning";
import { RESOURCE_FORMATS, label } from "@/lib/types";

export const metadata = { title: "New product" };

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();
  const resources = resourcesForCreator(user.id);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Creator studio"
        title="New premium product"
        description="A product wraps a published resource. It needs a price, a refund policy and a free preview on the resource itself."
        actions={
          <ButtonLink href="/studio/products" variant="ghost" size="sm">
            Cancel
          </ButtonLink>
        }
      />

      <Flash error={error} notice={notice} />

      <div className="mb-4">
        <Alert tone="warning" title="Payments are disabled">
          This form creates a listing and an access-grant workflow, not a charge. No card details are collected and no payment
          provider is contacted.
        </Alert>
      </div>

      <form action={createProductAction} className="space-y-5">
        <Card className="p-5">
          <h2 className="text-[14px] font-semibold text-navy-950">Product details</h2>
          <div className="mt-3 space-y-3">
            <Field label="Title" htmlFor="title" required>
              <Input id="title" name="title" required maxLength={160} />
            </Field>
            <Field label="Description" htmlFor="description">
              <Textarea id="description" name="description" rows={4} maxLength={4000} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Linked resource" htmlFor="resourceId" required hint="Must already be published.">
                <Select id="resourceId" name="resourceId" required defaultValue="">
                  <option value="">Choose a resource…</option>
                  {resources.map((resource) => (
                    <option key={resource.id} value={resource.id} disabled={resource.status !== "published"}>
                      {resource.title} {resource.status !== "published" ? "(draft)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Format" htmlFor="format">
                <Select id="format" name="format" defaultValue="course">
                  {RESOURCE_FORMATS.map((format) => (
                    <option key={format} value={format}>
                      {label(format)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Price (£)" htmlFor="price" required hint="Listing price only. Nothing is charged.">
                <Input id="price" name="price" type="number" min={1} step="0.01" defaultValue="24" required />
              </Field>
              <Field label="Refund policy" htmlFor="refundPolicy" required>
                <Textarea id="refundPolicy" name="refundPolicy" rows={2} maxLength={2000} defaultValue="Refunds within 14 days if less than half the course is completed." />
              </Field>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-[14px] font-semibold text-navy-950">Curriculum summary</h2>
          <p className="mt-0.5 text-[12px] text-navy-500">Shown on the product listing. Lesson content lives on the resource.</p>
          <div className="mt-3 space-y-2">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_120px]">
                <Field label={`Item ${index + 1}`} htmlFor={`itemTitle${index}`}>
                  <Input id={`itemTitle${index}`} name={`itemTitle${index}`} placeholder="Module or section title" />
                </Field>
                <Field label="Minutes" htmlFor={`itemMinutes${index}`}>
                  <Input id={`itemMinutes${index}`} name={`itemMinutes${index}`} type="number" min={0} />
                </Field>
              </div>
            ))}
          </div>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pendingLabel="Creating…">Create product</SubmitButton>
          <SubmitButton variant="secondary" name="publish" value="on" pendingLabel="Publishing…">
            Create and publish
          </SubmitButton>
          <p className="text-[11px] text-navy-500">
            Need a resource first?{" "}
            <Link href="/studio" className="underline">
              Create one in the studio
            </Link>
            .
          </p>
        </div>
      </form>
    </div>
  );
}
