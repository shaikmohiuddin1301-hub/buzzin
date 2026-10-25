import { LegalPage } from "@/components/marketing";

export const metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy notice"
      updated="October 2026"
      intro="This notice explains what a demonstration deployment of BuildTogether collects, why, and what control you have. It is written to align with UK GDPR concepts because that is the intended launch jurisdiction, but it must be reviewed and completed by a qualified adviser before any real use."
      sections={[
        {
          heading: "Who is responsible",
          paragraphs: [
            "BuildTogether (placeholder legal entity) is the data controller for account and platform data. Project owners and creators may be controllers of content they publish; joint-controller arrangements for collaborative projects should be documented in the terms before launch.",
            "Contact for privacy matters: privacy@buildtogether.example (placeholder).",
          ],
        },
        {
          heading: "What we collect",
          bullets: [
            "Account data: display name, username, email address, hashed password, email verification status, roles and preferences.",
            "Profile data you choose to add: biography, location, time zone, skills, interests, goals, portfolio links and profile image.",
            "Project and contribution data: projects, tasks, applications, assignments, submissions, documentation entries, comments, messages and reports.",
            "Learning data: saved resources, progress, feedback, and access grants (entitlements).",
            "Technical data: session identifiers, IP address and user agent for session security and rate limiting, and audit records for sensitive actions.",
            "Payment data: none. Payments are disabled in this build; no card details are collected or stored.",
          ],
        },
        {
          heading: "Why we process it",
          bullets: [
            "To provide the service (contract): accounts, projects, collaboration, learning delivery and entitlements.",
            "To keep the platform safe (legitimate interests): abuse prevention, rate limiting, moderation, audit trails and security.",
            "To meet legal obligations: responding to lawful requests and maintaining records where required.",
            "With consent: public-story use of contributor documentation, and optional marketing communications if enabled.",
          ],
        },
        {
          heading: "Visibility and sharing",
          paragraphs: [
            "Content visibility is enforced on the server. Private projects and private work-log entries are not served to people who are not authorised. Chat attachments are readable only by members of the conversation.",
            "Public content (public project pages, published learning resources, published stories, public profiles) can be seen by anyone, including search engines, unless you change your privacy settings.",
            "We do not sell personal data. If a third-party provider (for example an email or AI provider) is enabled, the categories of data shared and the safeguards used must be listed here before launch.",
          ],
        },
        {
          heading: "Retention",
          paragraphs: [
            "Account and project data are retained while your account exists. Session records expire automatically. Authentication tokens expire after use or expiry. Audit and moderation records are retained for a defined period to support appeals and legal obligations; that period must be specified before launch.",
            "Deleting your account removes personal identifiers from your user record, revokes sessions, deletes preferences and skills, and detaches you from conversations. Contribution records remain, attributed to a deleted-account actor, because other people's project histories depend on them.",
          ],
        },
        {
          heading: "Your rights",
          id: "rights",
          bullets: [
            "Access: export your data as JSON from Settings → Account.",
            "Correction: edit profile details directly; correct or dispute contribution records from your contribution history.",
            "Erasure: delete your account from Settings → Account. Some records may need to be retained where the law requires.",
            "Restriction and objection: contact the privacy address; moderation tools support account restriction.",
            "Portability: the JSON export is machine-readable.",
            "Complaints: you can complain to the Information Commissioner's Office (ICO) in the UK, or your local supervisory authority.",
          ],
        },
        {
          heading: "Security",
          paragraphs: [
            "Passwords are hashed with scrypt and never stored in plain text. Sessions use random tokens stored hashed, in HTTP-only cookies with SameSite protection. All protected operations check authorisation on the server. Uploads are validated by size, declared type and file signature.",
            "No system is perfectly secure. If a breach affects your rights, we will notify you and the regulator as required.",
          ],
        },
        {
          heading: "Cookies",
          paragraphs: [
            "This build sets one essential cookie for authentication. It is not used for advertising or cross-site tracking, so no consent banner is shown. Analytics in this build are first-party event records tied to an account where applicable, not third-party trackers.",
          ],
        },
        {
          heading: "International transfers",
          paragraphs: [
            "The demonstration runs locally. A production deployment must document hosting regions and any transfer mechanism (for example UK IDTA or Standard Contractual Clauses) before personal data leaves the UK/EEA.",
          ],
        },
        {
          heading: "Changes",
          paragraphs: ["Material changes will be notified in-product before they take effect. This draft is a starting point, not a finished notice."],
        },
      ]}
    />
  );
}
