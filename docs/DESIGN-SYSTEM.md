# Design system

Everything visible in the app comes from four layers: colour tokens, shared components,
navigation, and motion. Change a token and the whole product follows; there is no second
palette hiding in a page.

## Colour tokens

All colours are CSS variables defined twice in `src/app/globals.css` — once under `:root`
(light) and once under `.dark` (dark). `tailwind.config.ts` maps the Tailwind scales onto
those variables, so `text-navy-900`, `bg-surface`, `border-navy-200` and `bg-brand-600` mean
the same thing in both themes.

| Ramp | Meaning |
| --- | --- |
| `navy` | Ink/indigo neutral. `50` is the quietest surface, `950` the strongest text. |
| `brand` | Electric violet. Navigation, links, primary actions, selected states. |
| `coral` | Warm human accent. Reserved for emphasis (progress highlight, warm cues), never a large fill. |
| `emerald` / `amber` / `red` / `sky` | State colours. Re-tinted per theme (not inverted) so success stays green and danger stays red. |
| `surface` | Page (`-muted`), card (`DEFAULT`) and raised (`-subtle`) surfaces. |

`navy` is **inverted** in dark mode rather than duplicated. That is why one class set works
everywhere: `bg-navy-50` is a faint surface in light mode and a faint surface in dark mode.

Fixed-colour helpers exist for content that must stay dark in both themes: `.ink-surface`
(panels), `.ink-card` (story cards), `.ink-hero` (project/profile covers), `.avatar-surface`
(initials), `.create-glow` (the Create action). Do not put `text-navy-*` on top of these.

Measured contrast (WCAG 2.1, from the compiled stylesheet):

| Pair | Light | Dark |
| --- | --- | --- |
| Body text on card | 10.53 | 12.71 |
| Muted meta text | 4.85 | 8.09 |
| Faint meta text | 4.20 | 5.08 |
| Link text | 7.09 | 5.43 |
| White on primary button | 5.51 | 5.71 |
| Badge text on badge tint | 4.4–8.2 | 6.9–13.1 |

## Theming

- The choice is `light`, `dark` or `system`, stored in `localStorage` (`bt-theme`) with a
  mirror cookie (`bt_theme`).
- `THEME_SCRIPT` in `src/app/layout.tsx` runs before the first paint, so there is no flash of
  the wrong theme. It also adds `motion-ready` only when the device has not asked for reduced
  motion.
- Controls: segmented switch in **Settings → Appearance** (`ThemeToggle`), quick toggle in
  the header (`QuickThemeToggle`).
- `color-scheme` is set per theme so native scrollbars and form controls match.

## Navigation

- Mobile/tablet: a floating pill (`.glass`, `shadow-float`) inset from the edges, respecting
  `env(safe-area-inset-bottom)`. Seven destinations in a fixed order; the Create action is the
  only raised element. The active destination becomes an icon+label pill. The bar hides while
  a text field is focused so the on-screen keyboard has the space, and while the Create sheet
  is open.
- Desktop: a floating sidebar panel with the same destinations, Workspace links behind a
  disclosure, and the Create button as the single gradient action.
- `surface-gutter` on `<main>` reserves room for the bar; nothing scrolls underneath it.

## Motion

Motion is transform/opacity only and collapses under `prefers-reduced-motion: reduce`.

- `motion-page` — route change (240 ms).
- `motion-sheet` — Create sheet and menus (300 ms).
- `motion-card` — hover lift, press scale (200 ms).
- `Reveal` (`src/components/client/reveal.tsx`) — IntersectionObserver reveal, once per
  element, with a small stagger. Content is visible without JavaScript because the initial
  hidden state only applies under `.motion-ready`.
- `motion-status`, `motion-lift`, `motion-check`, `motion-file` — status changes and the
  approved-work moment. None of them play before the server confirms the change.
- `ShareButton` uses the native share sheet with a copy-link fallback and announces the
  result politely; there are no decorative interaction icons.
- Profile posts render as a square media grid; the Home feed keeps a wider reading
  column with a followed-projects rail (real covers only) above the composer.

## Account kinds

One shell, three emphases. `accountContext()` (`src/services/account.ts`) derives the
kind from real records — declared roles, business memberships and published teaching —
and never from a client flag:

| Kind | Derived from | Interface emphasis |
| --- | --- | --- |
| Individual | No creator role, no teaching, no business | Personal feed, posts, learning, projects |
| Creator | `creator`/`educator` role or published teaching | Creator studio in the workspace nav, teaching counts on Home, teaching first in Create |
| Business | A `business_members` row | Business workspace and organisation projects on Home, business profile links, projects first in Create |

A business account can also be a creator; the workspace navigation shows both. Create
options are reordered with `orderByAccountPriority()` rather than hidden, because the
server permits every authenticated account to use them. Server-side authorisation is
still the only boundary.

## Adding a page

Use `Card`, `PageHeader`, `Tabs`, `Badge`, `Field`, `Alert`, `EmptyState` from
`src/components/ui.tsx`, and `Reveal` around cards that appear below the fold. Never use
`bg-white` or a literal hex colour for a surface: use `bg-surface`, `bg-navy-*` or one of the
`.ink-*` helpers.
