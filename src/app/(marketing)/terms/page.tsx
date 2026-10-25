import { LegalPage } from "@/components/marketing";

export const metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated="October 2026"
      intro="These terms govern use of the BuildTogether demonstration platform. They are an initial draft for review. They do not constitute legal advice and must be completed by a qualified lawyer before launch, particularly the sections on paid work, marketplace sales, consumer rights and liability."
      sections={[
        {
          heading: "The service",
          paragraphs: [
            "BuildTogether provides tools for discovering projects, collaborating on tasks, documenting work, publishing learning material and displaying contribution records.",
            "This is a demonstration environment. It is not open to the public, payments are disabled, and data may be reset. Do not rely on it for real commercial arrangements.",
          ],
        },
        {
          heading: "Accounts",
          bullets: [
            "You must provide accurate registration details and keep your credentials secure.",
            "You are responsible for activity under your account. Tell us immediately if you suspect compromise.",
            "You may hold multiple roles (creator, contributor, learner, educator, business) but a single person may not operate multiple accounts to manipulate reputation, reviews or moderation.",
            "We may restrict or suspend accounts for breaches, with reasons recorded and an appeal route.",
          ],
        },
        {
          heading: "Projects and collaboration",
          bullets: [
            "Project owners are responsible for the accuracy of project listings, task scope, acceptance criteria and any compensation information.",
            "Listing unpaid work does not make it lawful and does not create an employment relationship. Owners must comply with applicable employment, tax and volunteer law.",
            "Contributors are responsible for the work they submit and for having the right to share it.",
            "Acceptance of a submission creates an owner-confirmed contribution record. It is not a guarantee of quality, nor independent verification.",
          ],
        },
        {
          heading: "Content and intellectual property",
          paragraphs: [
            "You keep ownership of content you create. You grant the platform a non-exclusive licence to host, display and process that content to operate the service, including generating a storyboard or learning journey where you have requested it.",
            "Rights in collaborative project outputs must be agreed between the parties. Projects should record IP and licensing notes; the platform is not a party to those agreements.",
            "Do not upload material you do not have the right to share, or personal data about other people without a lawful basis.",
          ],
        },
        {
          heading: "Learning content and premium access",
          bullets: [
            "Creators are responsible for the accuracy of their teaching material and for stating its limitations.",
            "Paid products must include a free preview and a stated refund policy.",
            "Payments are disabled in this build: no charge is made and access is granted directly by the creator.",
            "When payments are enabled, the provider terms, consumer cancellation rights, tax treatment and platform commission must be disclosed before purchase.",
          ],
        },
        {
          heading: "AI-generated media",
          bullets: [
            "Story generation is limited to material the requesting user is authorised to use, and to contributors who have granted consent for public use.",
            "Generated narration must be reviewed and approved before publication. Scenes may be flagged as unsupported; these must be resolved, not published.",
            "You must not use generated media to impersonate a person, misrepresent a result, or reproduce protected material. Likeness or voice generation requires explicit permission and is not enabled in this build.",
          ],
        },
        {
          heading: "Prohibited conduct",
          bullets: [
            "Harassment, threats, hate speech, sexual content involving minors, and targeted abuse.",
            "Impersonation, fake accounts, fake engagement, paid reviews, and reciprocal rating manipulation.",
            "Spam, scraping at scale, malware, or attempts to bypass access controls.",
            "Publishing confidential information, or another person's private documentation, without permission.",
            "Misrepresenting credentials, results, funding or commercial outcomes.",
          ],
        },
        {
          heading: "Moderation and enforcement",
          paragraphs: [
            "Reports require a reason code and an explanation. Moderators may dismiss a report, warn an account, hide content, restrict an account, suspend an account or reinstate it. Every decision records a reason and writes an audit entry.",
            "You can appeal a decision through the dispute route. Retaliation against someone who reports in good faith is itself a breach.",
          ],
        },
        {
          heading: "Disclaimers and liability",
          paragraphs: [
            "The service is provided as-is for evaluation. We do not warrant that projects will succeed, that contributions will be accepted, that content is accurate, or that creators will earn income.",
            "Nothing in these terms limits liability for death or personal injury caused by negligence, fraud, or any liability that cannot lawfully be excluded. Consumer rights are unaffected where they apply.",
            "The remaining liability position, indemnities and insurance requirements must be drafted with professional advice.",
          ],
        },
        {
          heading: "Changes and governing law",
          paragraphs: [
            "We may update these terms; material changes will be notified in-product. Continued use after the effective date constitutes acceptance.",
            "Governing law and jurisdiction are to be confirmed (intended: England and Wales).",
          ],
        },
      ]}
    />
  );
}
