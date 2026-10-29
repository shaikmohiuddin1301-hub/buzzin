# Design system

Everything visible in the app comes from four layers: colour tokens, shared components,
navigation, and motion. Change a token and the whole product follows; there is no second
palette hiding in a page.

## Colour tokens

Every colour is a CSS variable defined twice in `src/app/globals.css` — once under `:root`
(light) and once under `.dark` — and mapped onto Tailwind in `tailwind.config.ts`. There is no
second palette in a page, and there is no blue, navy, indigo, violet or purple anywhere: the
`navy` name is kept only as the graphite/silver ink ramp.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `brand-600` | `#34343A` | `#E7E7EB` | Graphite action: links, active navigation, primary buttons |
| `brand-700` | `#222226` | `#F5F5F3` | Pressed/hover action |
| `brand-50` | `#EEEEF0` | `#3A3A42` | Selected chip and active-row surface |
| `navy-900` | `#34343A` | `#F5F5F3` | Headings and primary text |
| `navy-700` | `#47474F` | `#D6D6DC` | Strong body copy |
| `navy-600` | `#56565F` | `#C4C4CD` | Body and secondary text |
| `navy-500` | `#777780` | `#B8B8C1` | Inactive navigation and metadata |
| `navy-300` | `#B8B8C1` | `#787882` | Silver dividers and disabled graphics |
| `navy-200` | `#E7E7EB` | `#484850` | Solid borders and dividers |
| `surface` | `#FFFFFF` | `#34343A` | Inputs and opaque fallbacks |
| `page-warm` | `#F5F5F3` | `#222226` | Home, profile, projects, chats list, notifications |
| `page-secondary` | `#E7E7EB` | `#26262B` | Explore, learning, creator workspace, open conversation |
| `coral-500` | `#FF785A` | `#FF785A` | Creative action, likes, unread markers |
| `coral-600` | `#EC6647` | `#EC6647` | Coral pressed state and icon stroke |
| `emerald-500` | `#169B75` | `#3FC79C` | Growth, completion, positive actions |
| `emerald-600` | `#0F7A5C` | `#7DDCBE` | Emerald text on pale emerald |
| `amber-300` | `#D9AD55` | `#D9AD55` | Opportunities, review states, "request changes" |
| `amber-700` | `#5C4310` | `#EBCA8F` | Gold text on pale gold |
| `red-600` | `#C83D4D` | `#F09EA8` | Destructive actions and errors |

`navy` is an inverted ink ramp, so `bg-navy-50` is the faint surface in both themes and
`text-navy-900` the strongest text. Content that must stay dark in both themes uses the fixed
helpers `.ink-surface`, `.ink-card`, `.ink-hero` and `.avatar-surface`; never put
`text-navy-*` on top of those. `info` replaces the old `sky` ramp so no colour name implies blue.

### Glass surfaces

| Layer | Light | Dark |
| --- | --- | --- |
| Main page | `#F5F5F3` | `#222226` |
| Secondary page | `#E7E7EB` | `#26262B` |
| Card / panel (`--glass-panel`) | `rgba(255,255,255,0.68)` | `rgba(52,52,58,0.72)` |
| Secondary panel | `rgba(231,231,235,0.58)` | `rgba(65,65,73,0.62)` |
| Glass border | `rgba(255,255,255,0.85)` | `rgba(255,255,255,0.12)` |
| Header (`--glass-header`) | `rgba(245,245,243,0.74)` | `rgba(34,34,38,0.78)` |
| Bottom bar (`--glass-bar`) | `rgba(255,255,255,0.74)` | `rgba(52,52,58,0.82)` |
| Card shadow | `0 8px 32px rgba(34,34,38,0.08)` | `0 8px 32px rgba(0,0,0,0.45)` |

Panels use `backdrop-filter: blur(18px) saturate(1.15)`; the header and bar use a slightly
stronger blur. A `@supports not (backdrop-filter: …)` block swaps every glass surface to
`--glass-fallback` (white in light, `#34343A` in dark) so the interface stays readable where
blur is unavailable. Page backgrounds add three restrained radial washes (silver, pale grey,
warm off-white, plus a 5–6% coral highlight); dark mode uses silver light on charcoal.

### Semantic status tokens

`status-todo`, `status-progress`, `status-review`, `status-approved` and `status-blocked`
(with matching `-text` tokens) carry work state. They are deliberately separate from the
decorative coral and gold accents, and every status badge prints its label next to the dot.

| State | Light background / text | Dark background / text |
| --- | --- | --- |
| To do | `#E7E7EB` / `#34343A` | `#3A3A42` / `#D6D6DC` |
| In progress | `#D5D5DC` / `#222226` | `#484850` / `#F5F5F3` |
| Needs review | `#FAF0DB` / `#5C4310` | `#403624` / `#EBCA8F` |
| Approved | `#DFF4ED` / `#0F7A5C` | `#1B3A30` / `#89DEBF` |
| Blocked | `#FBE9EC` / `#A32638` | `#3E242A` / `#F09EA8` |

### Component mapping

| Surface | Colour |
| --- | --- |
| Header | translucent warm off-white glass with a silver hairline |
| Bottom navigation | translucent white glass; active graphite, inactive steel grey, Create coral and centred |
| Primary / secondary / positive / creative / destructive buttons | graphite / grey glass + graphite / emerald / coral / `#C83D4D` |
| Feed cards, profile panel, notification cards, course cards, project cards | translucent white glass |
| Around Your Network rail | warm page, glass cards, graphite accents, coral new-activity marker |
| Unread notification card | `navy-100` (`#EEEEF0` light, `#414149` dark) with a coral dot |
| Grouped sections and task-board columns | `.glass-secondary` (secondary glass) |
| Outgoing chat bubble | graphite `#34343A` with white text in both themes |
| Incoming chat bubble | silver-white glass (light) or `#414149` (dark) with a glass border |
| Message request | glass card with a coral border; Accept is the graphite primary, Dismiss secondary |
| Inbox row | white glass row, coral unread count, muted timestamp and preview |
| Like / comment / share icons | coral stroke / graphite / emerald |
| Learning progress | emerald fill; project progress graphite |

`pageSurfaceClass()` in `src/lib/navigation.ts` owns the route-level background choice, so the
shell and the pages cannot drift apart.

### Measured contrast

WCAG 2.2 AA, computed from the token values:

| Pair | Light | Dark |
| --- | --- | --- |
| Primary text on a card | 12.37 | 11.33 |
| Secondary text on a card | 7.26 | 6.28 |
| Link on a card | 12.37 | 10.03 |
| Label on a primary button | 12.37 | 12.85 |
| Label on a coral action | 6.10 | 6.10 |
| Label on a destructive action | 4.96 | 7.67 |
| Status badge text | 4.62–10.85 | 6.82–8.30 |

Two pairs were specified with fixed text colours: white on the emerald `#169B75` measures
3.51:1, and the white Create icon on
`#FF785A` measures 2.60:1. Both are kept because they were specified; the positive action
stays identifiable by its label and the Create action by its position, shape and aria-label.
The like icon uses the darker coral stroke (`#EC6647`, 3.20:1) so the control itself clears
the 3:1 non-text target while the fill remains `#FF785A`. The inactive navigation grey
`#777780` measures 4.44:1 on white — a 0.06 shortfall that is kept rather than deviating from
the requested steel grey; it is never the only cue for a destination.

## Theming

- The choice is `light`, `dark` or `system`, stored in `localStorage` (`bt-theme`) with a
  mirror cookie (`bt_theme`).
- `THEME_SCRIPT` in `src/app/layout.tsx` runs before the first paint, so there is no flash of
  the wrong theme. It also adds `motion-ready` only when the device has not asked for reduced
  motion.
- The only control is the segmented switch in **Settings → Appearance** (`ThemeToggle`). The
  header no longer carries a theme toggle.
- `color-scheme` is set per theme so native scrollbars and form controls match.

## Navigation

- Mobile/tablet: a floating pill (`.glass-bar`, `shadow-float`) inset from the edges, respecting
  `env(safe-area-inset-bottom)`. Exactly five destinations (Home · Explore · Create · Chats ·
  Profile) in a five-column grid, so the raised Create action is geometrically centred whatever
  the label widths are. The bar hides while a text field is focused so the on-screen keyboard
  has the space, and while the Create sheet is open. Learning and Projects stay reachable from
  the sidebar and the Home workspace card instead.
- A deliberate horizontal swipe moves between the four page destinations (Home · Explore ·
  Chats · Profile). Create is an action, not a destination: it is skipped in both directions
  and the bottom bar ignores gestures. Scroll position is remembered per destination.
- The gesture is contextual, not fixed: `SwipeNavigation` keeps the screens the reader has
  actually been on (`recordSwipeVisit()` in `src/lib/navigation.ts`) with a cursor. A right
  swipe returns to the screen before this one — Home → Chats by tapping the bar makes a right
  swipe Home, not Explore — and repeated right swipes walk the visits in reverse. A left swipe
  replays a screen the reader swiped back out of, then continues the tab order. Only an
  exhausted history falls back to the adjacent tab; the ends of the order do nothing rather
  than leave the page. Re-selecting the open tab adds no entry, and the browser's own back and
  forward buttons move the cursor instead of creating a parallel record. The record lives in
  `sessionStorage` (`bt.swipe-history`), so it survives a reload in the same tab; every entry is
  re-validated as one of the four routes before it is used.
- The swipe answers immediately: once horizontal intent is clear, only `<main>` moves, as a
  single `translate3d` per frame on the compositor, capped at 30% of the viewport and held back
  to 14% at the ends of the sequence. The gap it opens reveals the destination's edge — its own
  surface, a hairline border and, once the gap can hold the word, its name; the preview layer
  is bounded by the visible content area so it never covers the header or the bar. Release
  commits after 22% of the viewport width (never less than 56px), or an 18px flick at 0.3px/ms
  — the rule lives in `swipedFarEnough()`/`swipeCommitDistance()`, not in the component.
  Anything shorter springs back in 260ms instead of jumping. The release hands its offset to the
  view transition through `--swipe-shift`, so the outgoing snapshot starts under the finger and
  the paired 300ms in/out animations share `cubic-bezier(0.22, 1, 0.36, 1)`; the old page is
  held until the incoming one is ready, so there is no blank frame. Prefetching both neighbours
  keeps the incoming page ready, so the transition is not left waiting on data.
- The transition is between the two real rendered pages, and they stay attached. The incoming
  snapshot starts at `calc(100% + var(--swipe-shift))` (mirrored for a right swipe), exactly one
  snapshot-width from where the outgoing page was released, so both pages travel the same
  distance on the same timeline and remain edge to edge for the whole 300ms — the gap between
  them never opens and then closes as it plays. `e2e/swipe-navigation.spec.ts` samples the live
  pseudo-elements and asserts that distance, the shared clock and the real destination content;
  one page is never on screen without the other until the transition finishes. Before the commit
  the destination's server-rendered DOM does not exist yet, so the drag reveals the preview edge
  described above rather than a second live page.
- One shared bar, page-specific contents (`src/components/top-bar.tsx`). Nothing appears on
  every page just because it exists elsewhere:

  | Page | Header |
  | --- | --- |
  | Home | wordmark · notification bell (`/notifications`, a link, never a pop-up) |
  | Explore | discovery search only; no bell |
  | Chats | the inbox title, its live unread count, inbox search and the new-message action |
  | An open conversation | back link to the inbox, nothing else |
  | Profile (own account) | the wordmark, and the account menu in the profile header's top-right corner |
  | Everybody else's profile, and every other page | the wordmark, no controls |

  There is no global hamburger: the only one belongs to the top-right corner of
  the signed-in account's own profile header, so no other page grows a control it
  does not use. That menu — Liked Posts & Projects, Your Comments, Settings &
  Account, Notifications, then Log out below a separator — is a `glass-popover`. It
  closes on Escape, on a press outside it, and when an entry is followed, and Log
  out is the only destructive entry. The profile header carries no banner: the
  avatar, name, username and roles sit directly on the card surface.

  The search fields are URL parameters rendered by the server, so a search is
  shareable, back/forward work, and no term is invented on the client.
- Desktop: a floating sidebar panel with the same five destinations plus Learning and
  Projects, Workspace links behind a disclosure, and the Create button as the single gradient
  action.
- `surface-gutter` on `<main>` reserves room for the bar; nothing scrolls underneath it.

## Motion

Motion is transform/opacity only and collapses under `prefers-reduced-motion: reduce`.

- `motion-page` — route change (180 ms, opacity only, so the page never shifts under
  the fixed header and never double-animates with the swipe transition).
- `motion-sheet` — Create sheet (300 ms). Floating menus and sheets use
  `glass-popover`: 95% opaque in light, 96% in dark, with a blur, a hairline border and
  a floating shadow, so live page text can never be read through their labels.
- `motion-card` — hover lift, press scale (200 ms).
- `Reveal` (`src/components/client/reveal.tsx`) — IntersectionObserver reveal, once per
  element, with a small stagger. Content is visible without JavaScript because the initial
  hidden state only applies under `.motion-ready`.
- `motion-status`, `motion-lift`, `motion-check`, `motion-file` — status changes and the
  approved-work moment. None of them play before the server confirms the change.
- `ShareButton` uses the native share sheet with a copy-link fallback and announces the
  result politely; there are no decorative interaction icons.
- Profile posts render as a square media grid; the Home feed keeps a wider reading
  column with the "Around your network" activity rail (real records only) above the composer.

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
`bg-white` or a literal hex colour for a surface: use `.card-surface`, `bg-navy-*` or one of
the `.ink-*` helpers. Use `.glass`, `.glass-bar` and `.glass-header` for chrome, and
`.bubble-incoming` / `.bubble-outgoing` for messages so both themes stay in sync.
