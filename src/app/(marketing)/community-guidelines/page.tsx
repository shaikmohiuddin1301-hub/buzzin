import { LegalPage } from "@/components/marketing";

export const metadata = { title: "Community guidelines" };

export default function CommunityGuidelinesPage() {
  return (
    <LegalPage
      title="Community guidelines"
      updated="October 2026"
      needsReview={false}
      intro="These guidelines describe how people are expected to behave here, and what happens when they do not. They are operational rules for the platform, not legal terms."
      sections={[
        {
          heading: "What we are trying to protect",
          bullets: [
            "People doing real work and getting accurate credit for it.",
            "Learners who need to trust that material reflects reality, including its limits.",
            "Contributors who share documentation without losing control of it.",
            "A moderation process that is consistent, explainable and appealable.",
          ],
        },
        {
          heading: "Working with other people",
          bullets: [
            "Agree scope in writing before starting: deliverables, acceptance criteria, deadline, responsibilities and any compensation.",
            "Say what you mean about what you can do. Overstating availability or skills wastes other people's time.",
            "If you cannot continue, say so early. Abandoning an accepted task without notice is a moderation matter if it becomes a pattern.",
            "Give critical feedback about the work, not the person, and give it with a specific reason.",
          ],
        },
        {
          heading: "Documentation and consent",
          bullets: [
            "Only the contributor decides whether their own documentation is shared publicly, and only when the project permits public documentation.",
            "Do not copy another contributor's private notes into a public resource, story or comment.",
            "Do not remove someone's attribution from work they did, even if you later rewrote it.",
            "Withdrawing consent pulls public entries back to team scope; it does not delete the contribution record.",
          ],
        },
        {
          heading: "Honesty about results",
          bullets: [
            "Do not invent metrics, customers, funding, partnerships or outcomes.",
            "Distinguish documented facts from estimates. If a number came from a small test, say so.",
            "Failure is welcome here. Presenting a failure honestly is more valuable than a fabricated success.",
            "AI-generated narration must be reviewed against its sources before publication.",
          ],
        },
        {
          heading: "Reputation and reviews",
          bullets: [
            "Do not agree with someone to exchange positive reviews or ratings.",
            "Do not create extra accounts, or use friends, to inflate follow counts, likes or ratings.",
            "Do not ask for a review in exchange for access, payment or a favour.",
            "Do not dispute an accurate record to pressure another person. Disputes need a specific inaccuracy.",
          ],
        },
        {
          heading: "Not allowed",
          bullets: [
            "Harassment, threats, stalking, doxxing, or targeted abuse of any kind.",
            "Hate speech or discrimination on the basis of protected characteristics.",
            "Sexual content, or any content involving the sexualisation of minors.",
            "Impersonation of a person, organisation or the platform.",
            "Malware, phishing, credential requests, or attempts to access another person's account.",
            "Spam, repetitive promotional posting, or scraping other people's data.",
            "Publishing confidential client information or trade secrets.",
          ],
        },
        {
          heading: "Enforcement",
          id: "enforcement",
          bullets: [
            "Reports require a reason code and a written explanation. Frivolous or retaliatory reports can themselves be actioned.",
            "Possible outcomes: no action, a warning, content hidden or removed, account restricted, account suspended, or reinstatement.",
            "Every moderation action records the moderator, the reason code, internal notes and an audit entry.",
            "You can appeal by opening a dispute. Appeals are reviewed by a moderator who did not make the original decision where staffing allows.",
            "Serious harm involving immediate risk to a person may be escalated outside the platform where legally required.",
          ],
        },
        {
          heading: "If you are not sure",
          paragraphs: [
            "If you are unsure whether something is appropriate, ask before publishing. If you have been harmed or see something that looks unsafe, report it rather than engaging. If you are the person who made a mistake, saying so plainly is almost always the fastest way to repair it.",
          ],
        },
      ]}
    />
  );
}
