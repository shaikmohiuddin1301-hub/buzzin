/**
 * A template (not a layout) remounts on navigation, so this plays one short enter transition
 * per route change. It is a single transform/opacity pass, disabled by the global
 * prefers-reduced-motion rule, and it never delays interaction.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="motion-page">{children}</div>;
}
