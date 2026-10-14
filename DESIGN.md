# StudyBase design and consistency rules

This is the shared design guide for new pages and changes to existing pages. It is based on the current working versions of `index.html`, `subject/subject.html`, and `subject/class.html`, including their shared CSS and topic navigation. Preserve the familiar StudyBase appearance while adapting the layout to the task.

**Core rule: a page may omit a component it does not need; when it includes that component, it must use the shared visual language and interaction conventions.** A standalone tool can omit the site header or navigation sidebar. This does not give its buttons, typography, or navigation a separate design system.

## Reference and scope

| Reference | Use it for |
| --- | --- |
| `index.html` | Home/dashboard composition, subject and class cards, utility panels, hub header |
| `subject/subject.html` | Subject workspace, breadcrumbs, filters, topic navigation, reading/editing content |
| `subject/class.html` | Class workspace using the same header, sidebar, and topic components |
| `fonts.css` | Locally served font families |
| `mainstyle.css` | Shared tokens, components, page layouts, dark mode, responsive rules |
| `qol.css` | Later shared refinements, including solid tree connectors, intermediate sidebar sizing, and hub header alignment |
| `subject/topicapp.js`, `subject/topic-qol.js`, `qol.js` | Topic hierarchy, selection, expansion, filtering, and supplementary controls |
| `profile-store.js`, `qol.js`, `qol.css` | Profile/account actions, notifications, settings, and their final header behavior |

Load `fonts.css`, `mainstyle.css`, then `qol.css` when using the existing site shell. Inspect later overrides and page-specific selectors before copying a value: the first declaration is not necessarily the effective style.

The baseline values below describe the existing implementation. Rules labelled as requirements for new or changed UI are design targets, not a claim that every existing page already satisfies them. This document does not change runtime behavior.

## 1. Overall style

StudyBase uses warm neutral backgrounds, white or softly tinted surfaces, fine borders, restrained shadows, serif headings, and compact sans-serif controls. Accent colour communicates context and interaction; content remains the most prominent part of the page.

### Colour and surfaces

Use semantic CSS variables instead of repeating raw colours in component styles.

| Token | Light baseline | Dark baseline | Purpose |
| --- | --- | --- | --- |
| `--bg` | `#f5f2ed` | `#141210` | Page canvas |
| `--card` | `#ffffff` | `#1e1c19` | Main surfaces and navigation |
| `--card2` | `#faf8f5` | `#252220` | Inset surfaces, inputs, subtle hover states |
| `--border` | `#e2ddd7` | `#302d29` | Default separators and outlines |
| `--border2` | `#d4cec7` | `#3d3935` | Stronger outlines and tree connectors |
| `--text` | `#1c1917` | `#e8e3dc` | Primary text |
| `--muted` | `#78716c` | `#9e9890` | Supporting text |
| `--muted2` | `#a8a29e` | `#6b6560` | Low-emphasis decoration and metadata; check legibility |
| `--accent` | `#0f4c81` | `#7fb0e0` | Shared default interaction accent |

Subject context can override the accent. The index's amber accent strip is an existing contextual exception, not a second default button palette. Use the same contextual colour consistently across selection, primary actions, and contextual decoration.

Shared accent tints use `--accent-l` and `--accent-b`; subject components also use `--ac-l` and `--ac-b`. Keep the tint and border paired with their actual accent. Do not create additional names for the same roles or assume the two existing families are automatically aliases.

Use a 1px border and `--shadow` for ordinary cards. Reserve stronger shadows for floating menus, dialogs, and drawers. Avoid gradients, heavy shadows, and decorative colour blocks in ordinary navigation. Status colours must have an accompanying label or icon; selection, unsynced changes, warnings, and errors are different states.

### Typography, spacing, and shape

| Element | Convention |
| --- | --- |
| UI, navigation, body text | Inter / `--font-sans` with sans-serif fallback; 14px body baseline |
| Brand and editorial headings | Source Serif 4 / `--font-serif` with serif fallback |
| Code or literal technical notation | JetBrains Mono or an appropriate monospace fallback |
| Shared type scale | `--fs-2xs` 11px, `--fs-xs` 12px, `--fs-sm` 13px, `--fs-base` 14px, `--fs-md` 16px, `--fs-lg` 20px, `--fs-xl` 24px, `--fs-2xl` 30px |
| Existing heading references | Brand 13px; hub section title 20px; topic title 22px; definition text 16px |
| Small controls | Usually 5–8px radius; compact but clearly actionable |
| Cards and content sections | Usually 8–10px radius; larger dialogs may use 12–14px |
| Spacing | Prefer 4, 8, 12, 16, 20, 24, 32, and 40px; retain established component-specific alignment |

Use weight and spacing before adding extra font sizes. Uppercase and letter spacing belong to short metadata labels, not paragraphs or navigation titles. Keep readable line spacing for content even when controls are dense. Reuse existing icon treatment within a component family; do not mix unrelated icon sizes and styles for equivalent actions.

## 2. Page composition

| Page type | Shared structure | Permitted variation |
| --- | --- | --- |
| Index/dashboard | Header, centred content, subject/class cards, supporting utility panels | Date/time in header; dashboard panels instead of topic navigation |
| Subject/class workspace | Header, left navigation sidebar, main detail area | Subject/class context, available actions, tabs, class selector, optional teacher notes |
| Focused tool | Shared surfaces, type, controls, feedback | May omit header and/or sidebar; may use a canvas or specialised working area |

The hub's `.wrap` has a 1060px maximum width and 24px desktop side padding. Subject/class pages use an application layout with independent navigation and content scrolling. Do not force a tool canvas into the hub's reading width, or give a simple content page unnecessary application chrome.

The dashboard's supporting right-hand panels are utility cards, not a second version of the subject navigation sidebar. Match their surfaces and headings while preserving their different purpose.

## 3. Headers

Reuse `.hdr-outer`, `.accent-bar`, `.hdr-main`, `.hdr-top`, `.logo-block`, and `.hdr-right-row` for the site header.

1. Keep identity on the left, page context in the middle, and actions/account controls on the right. The desktop header row baseline is 52px high with 20px horizontal padding and a 14px gap. The accent strip is 6px wide at rest.
2. Keep the StudyBase wordmark, icon treatment, subtitle, and separator consistent. A subject icon may replace the generic site icon without changing the brand typography.
3. The hub may centre date/time instead of breadcrumbs. Subject/class pages show the current scope and topic ancestry. A count/status strip below the header is optional and uses the same borders and compact typography.
4. Breadcrumbs follow the actual hierarchy: Index → subject or class context → parent topic(s) → current topic. Ancestors are navigable; the current item is visually distinct. Do not flatten nested topics into an unrelated trail.
5. Use `.hdr-ghost` for compact utility actions and `.hdr-action` for the page's main action. Preserve the final subject/class action order: page utilities first, then profile/notifications, then the settings gear. Omitted actions leave no empty placeholder.
6. Use the circular profile button and adjacent settings gear from subject/class pages. Notifications belong inside the profile popover in the current shared implementation; do not copy the separate notification button from the initial HTML without accounting for `qol.js`. Popovers use shared surfaces, borders, radius, and layering.
7. Allow the header to wrap on narrow screens. Preserve identity, navigation, and essential actions before optional metadata. Long breadcrumbs and status messages must not overlap actions.

For new or changed UI, give every icon-only control an accessible name and keyboard focus state. Back navigation must be discoverable beyond a narrow hover-only accent strip. A tool with its own visible header must still follow these identity, spacing, action, and surface conventions; specialised controls can sit in a separate toolbar.

### Accent-bar back navigation

The subject/class convention is a narrow contextual accent bar that expands on hover to reveal a back arrow. Preserve this interaction wherever the accent bar provides back navigation: use a real link with `.accent-bar.is-back`, a meaningful destination, and an accessible name such as “Back to Index”. The shared CSS defines a 6px resting width, a 36px revealed width, and a centred arrow that fades in as the bar expands. Do not replace this with a permanently decorative strip on a page that uses the shared back-navigation header.

For new or changed implementations, reveal the same affordance on keyboard focus, retain a visible breadcrumb/back link for touch users, and respect reduced-motion preferences. The link should navigate to the named parent/context rather than relying on unpredictable browser history. The hub's developer-panel accent-bar action is a separate role-specific exception, not the back-navigation pattern.

### Profile and notifications

Use the final subject/class profile component, including the enhancements from `profile-store.js` and `qol.js`, as the reference. The initial HTML alone does not describe its behavior.

- Keep `.hdr-profile-wrap`, `.hdr-profile`, `.hdr-profile-face`, and `.hdr-profile-tip`: a 28px circular avatar/button, with a right-aligned popover below it. Use the account avatar or the shared fallback, without changing the surrounding header geometry.
- Hover reveals the popover; click/tap toggles it so account controls are usable without hover. Activating the avatar opens the popover rather than navigating directly to the profile page. Provide the explicit “View profile” link inside it.
- Show the available account name, role, and email, with the shared dark-mode and sign-out actions. Use the existing account/guest state and handlers; do not fabricate an identity or duplicate authentication logic for a tool.
- Keep notifications in the same popover under their own heading, including unread indication, empty state, and supported notification actions. Reuse the existing notification behavior instead of introducing a second independent notification menu.
- Match the shared card surface, `--border2` outline, 8px corners, compact text, and restrained floating shadow. Keep long account details and notification content inside the viewport.

For new or changed popovers, support keyboard activation, accurate expanded state, Escape dismissal with focus returned to the trigger, and outside-click dismissal. Hidden popover controls must not remain in the tab order. Preserve access when moving the pointer from the avatar into the popover.

### Settings

Place the settings gear immediately after the profile component, using `.hdr-ghost.qol-settings-button` within `.qol-settings-wrap`. Its accessible name is “Settings”. Use `.qol-settings-menu` for the right-aligned popover: 250px wide, capped to the viewport, shared card surface, stronger border, 8px radius, and a serif “Reading settings” heading.

Use the existing preferences and labels: **Content width** (Comfortable / Wide — tables and diagrams), **Spacing** (Comfortable / Compact), and **Animations**. Apply changes immediately through the shared preference system and preserve its account/guest scope. Dark mode remains the shared profile action and uses the site's theme preference; it is not a replacement for the settings menu.

Support hover and click/tap opening, labelled controls, Escape and outside-click dismissal, and focus return to the gear. Reuse `SBQoL.preferences()` when opening reading settings from another entry point; it already supports a dialog fallback when no header settings component exists.

A tool with the full shared header should include the same profile and settings entry points when those capabilities are available. A focused or embedded tool may omit the account shell as a documented exception. Tool-specific controls such as angle mode, notation, and graph bounds belong in the tool toolbar; do not replace account/settings controls with them. Only expose preferences that actually affect the tool, and document any intentional omission or adaptation.

## 4. Sidebars

Subject and class navigation are one component family. Reuse `.sidebar`, `.sidebar-top`, `.search-wrap`, `.search-input`, `.filter-btn`, `.units-panel`, and the topic list components.

1. Put search and filtering at the top, optional scope tabs/selectors next, and the scrollable hierarchy below. Label search for its actual scope; class navigation should not misleadingly describe a subject-wide search.
2. Use `--card` for the surface and a single `--border` divider toward the content. Avoid wrapping every navigation row in a separate card.
3. The desktop width is 272px. The later `qol.css` rule uses 220px from 701–1100px. Keep the edge toggle aligned with the effective width.
4. Preserve desktop collapse state across subject/class pages using the shared behavior. Collapsing must leave a clear way to reopen navigation and let the content use the freed space.
5. At 700px and below, use the existing mobile drawer pattern: 88vw, maximum 320px, a scrim, and a visible opening control. Preserve the selected topic when opening or closing it.
6. Keep navigation scrolling independent of reading content on workspace layouts. Provide a visible scroll affordance for long lists; do not inherit global scrollbar hiding into new scrolling regions.
7. Filters need visible active state, selected count where useful, and a clear/reset action. Empty results should explain the state and offer recovery.

For new or changed drawers, support Escape, keyboard focus management, and return focus to the opener. Controls hidden by collapse must not remain keyboard-focusable.

A tool may use a sidebar for expressions, settings, or files. It can adapt width and contents to that task, but must retain the site's surface, border, control, selection, and collapse conventions. A settings list does not need tree connectors unless it represents a real hierarchy.

## 5. Topic trees and subtopics

The parent/child topic navigation is the reference for any hierarchical navigation elsewhere on the site. The visual hierarchy must represent actual parent relationships, not just indentation applied to a flat list.

```text
▾ Parent topic
  ├─ ▾ Child topic
  │    ├─ • Grandchild topic
  │    └─ • Grandchild topic
  └─ • Child topic
▸ Another parent topic
```

### Appearance

- Reuse `.topic-item-wrap` and `.topic-item` for root groups, then `.subtopic-sidebar-list`, `.tree-node`, and `.subtopic-sidebar-item` recursively for descendants.
- Root rows use 10px × 12px padding, 7px corners, and a reserved 3px left selection edge. Child rows are more compact: 12px text, at least 32px height, 20px line height, and 6px corners.
- Keep one marker column for both branch chevrons and leaf dots. The current child marker slot is 18px wide and 20px high, so leaf labels align with branch labels.
- Use the solid 1px connector treatment in `qol.css`, which supersedes the older dashed border in `mainstyle.css`. Vertical lines join siblings; the final sibling's vertical line ends at its row connector, rather than continuing below the branch.
- Preserve the shared indentation geometry: root child groups currently have a 30px left margin; nested groups use 21px margin plus 12px padding. Change this centrally if needed, not independently per page or depth.
- Use neutral hover treatment and a contextual accent tint for selection. Keep selection distinct from hover and keyboard focus. Unsynced or warning text must remain identifiable within a selected row.
- Long labels must remain usable without pushing markers or controls out of alignment. Provide access to the full label if truncating it. Deep trees must retain a readable label area and an accessible overflow strategy.

### Interaction rules

1. Row/label activation selects or opens the topic. The chevron independently expands or collapses descendants without also selecting the topic. Leaves have a dot and no misleading disclosure button.
2. Selecting a nested topic reveals its ancestor path. Breadcrumbs, active row, and detail title must agree. Expansion and selection are separate state: opening a branch does not imply selecting it.
3. Preserve meaningful expansion state during normal rerenders. Filtering should retain ancestors needed to explain matching descendants. For new or changed filtering, reveal matching paths while preserving the user's expansion choices when the filter is cleared.
4. Keep sibling order deterministic. Honour explicit ordering where supported, with name ordering as a fallback; use the same policy for equivalent lists. Never rearrange a hierarchy merely to place the selected row first.
5. Empty branches and no-result states should not look like loading. Distinguish loading, empty, filtered-out, and failed states with concise text and appropriate recovery.
6. For new or changed trees, expose selection and disclosure state accessibly. Use native buttons/links in nested lists, or implement a complete ARIA tree with its keyboard navigation. Do not add `role="tree"` without the corresponding focus and arrow-key behavior. Disclosure buttons need `aria-expanded` and a topic-specific accessible name.

The source has separate subject/class render paths and additional behavior in `topic-qol.js`. Treat the rules above as the consistency contract when changing them; do not assume every path already handles ordering, filtering, or keyboard access identically.

## 6. Controls, content, and feedback

Use shared button families for primary, secondary, ghost, and destructive actions. Keep labels short and action-based. Reserve destructive colour for destructive actions; a subject accent must not imply an error. Use existing form and dialog components rather than creating a page-specific set.

Reading content uses a clear title followed by grouped sections, with restrained borders and optional tinted section headers. Reuse topic section and detail-header patterns when a tool is embedded in a topic. Specialised content such as a graph can control its own interior layout while its surrounding actions and panels stay consistent.

For new or changed UI, preserve visible focus rings (the shared baseline is a 2px accent outline with 2px offset), keyboard access, readable contrast in both themes, and usable touch targets. Compact icon artwork can stay small while its interactive area grows on touch screens. Tooltips must not be the only source of essential information. Honour reduced-motion preferences when adding transitions.

## 7. Exceptions and maintenance

An exception is justified by the task or available space, not by a page having a different author. Examples include a full-screen graph with no site header, a quiz without a navigation sidebar, a wider expression editor, or an embedded topic tool that inherits its parent's header.

For a deliberate exception, record a short comment near the component or in its documentation stating the component affected, the reason, and the shared conventions retained. Do not require a separate approval process for ordinary layout adaptations. If the same exception recurs, consider making it a shared variant.

When implementing changes, prefer shared selectors and existing tokens. Scope genuinely specialised styles to their component or page. Avoid duplicate shell CSS, new hard-coded theme palettes, and accumulating `!important` overrides. Update this guide when intentionally changing a shared convention.

## Review checklist

- Does the page use the shared fonts, surfaces, borders, accent roles, and control families?
- If it has a header, are identity, context, action order, and responsive behavior consistent, including the accent-bar back reveal where applicable?
- Do profile/notifications and the adjacent settings gear follow the final subject/class behavior, with usable hover, touch, and keyboard access?
- If it has a sidebar, are search/filter placement, selection, scrolling, and collapse behavior familiar?
- If it has a tree, do connectors, marker alignment, ancestry, selection, and expansion follow the same rules at every depth?
- Are long titles, deep nesting, empty/filter/loading states, and dark mode usable?
- Can keyboard and touch users reach the same actions, including opening and closing mobile navigation?
- Is each deviation justified by the page's task and documented where it is implemented?

For UI changes, inspect wide desktop, the 701–1100px intermediate layout, and mobile at 700px and below. Include a narrow phone width and both themes. These are review expectations for implementation work; this documentation-only change does not assert that a rendered UI audit has been completed.
