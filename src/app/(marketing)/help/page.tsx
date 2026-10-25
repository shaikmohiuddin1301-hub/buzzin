import Link from "next/link";
import { FaqList, SectionHeading } from "@/components/marketing";
import { Alert, ButtonLink, Card } from "@/components/ui";

export const metadata = { title: "Help centre" };

export default function HelpPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6">
      <SectionHeading
        eyebrow="Help centre"
        title="Practical answers"
        description="Everything here describes how the demonstration build behaves. Where a capability is not wired to an external service, it says so."
      />

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {[
          { title: "Getting started", body: "Register, complete onboarding, and your home feed is built from your stated goals and interests.", href: "/auth/sign-up" },
          { title: "Contributing", body: "Express interest from a project or task, then agree scope with the owner before starting.", href: "/explore" },
          { title: "Documentation rules", body: "You choose each entry's visibility. Public documentation requires the project to enable it.", href: "/community-guidelines" },
          { title: "Reporting and appeals", body: "Reports need a reason and explanation. Enforcement decisions can be appealed via a dispute.", href: "/community-guidelines#enforcement" },
        ].map((card) => (
          <Card key={card.title} className="p-5">
            <h2 className="text-[14px] font-semibold text-navy-950">{card.title}</h2>
            <p className="mt-1.5 text-[13px] leading-6 text-navy-600">{card.body}</p>
            <ButtonLink href={card.href} variant="ghost" size="sm" className="mt-3 px-0">
              Open →
            </ButtonLink>
          </Card>
        ))}
      </div>

      <div className="mt-10">
        <h2 className="text-[18px] font-semibold text-navy-950">Common questions</h2>
        <div className="mt-4">
          <FaqList
            items={[
              {
                q: "Why can't I publish my project?",
                a: "Publishing requires a verified email address and a short description of at least 20 characters. If the project is unpaid, you must also describe what contributors receive.",
              },
              {
                q: "Why can't I see a project?",
                a: "Private projects are invisible to non-members. Draft projects are visible only to the team. Invite-only projects show a limited summary and cannot be opened without an invitation.",
              },
              {
                q: "How do I get a contribution record?",
                a: "Be assigned to a task, submit deliverables, and have the project owner accept the submission. The record stores the submission it is based on and who confirmed it.",
              },
              {
                q: "I disagree with a contribution record",
                a: "Open a dispute from your contribution history in settings. You can also correct the role or summary on a record that is yours. Disputes are reviewed in the moderation queue with a recorded resolution.",
              },
              {
                q: "Why is premium content showing only a preview?",
                a: "Entitlements are enforced on the server. If you have not been granted access, the paid body and non-preview lessons are withheld before the page is rendered.",
              },
              {
                q: "Can I export or delete my data?",
                a: "Yes. Settings → Account has a JSON export and a deletion flow that requires typing your username. Deletion scrubs personal identifiers and revokes all sessions; contribution history remains attached to a deleted-account actor so other people's records stay accurate.",
              },
              {
                q: "Why do messages not appear instantly?",
                a: "There is no realtime transport configured. The chat page polls for new messages while the tab is visible, and you can pause polling.",
              },
              {
                q: "Is my verification email real?",
                a: "In development, messages are written to data/outbox.log and the link can be opened from the development outbox page. Configure an email provider before any real deployment.",
              },
            ]}
          />
        </div>
      </div>

      <div className="mt-8">
        <Alert tone="info" title="Accessibility">
          The interface targets WCAG 2.2 AA: semantic landmarks, visible focus, keyboard-operable controls, labelled form
          fields, reduced-motion support, captions and transcripts for media, and no audio autoplay. If something fails,
          please report it through the contact route so it can be fixed.
        </Alert>
      </div>

      <p className="mt-8 text-[12px] text-navy-500">
        Still stuck?{" "}
        <Link href="/contact" className="underline">
          Contact the team
        </Link>
        .
      </p>
    </div>
  );
}
