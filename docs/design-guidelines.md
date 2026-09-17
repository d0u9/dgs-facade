# Design guidelines

This site uses a modern interpretation of a 1990s terminal: dark, direct, and
slightly luminous, without sacrificing clarity or accessibility for nostalgia.
New pages and components should feel as though they belong to the same system.

## Principles

1. **Terminal-inspired, not terminal-limited.** Use compact mono labels,
   command-like language, grids, fine rules, and restrained glow. Keep modern
   spacing, responsive layouts, readable type, and familiar controls.
2. **Darkness creates focus.** Near-black surfaces dominate. Bright color is
   reserved for hierarchy, interaction, and status rather than decoration.
3. **Quiet by default.** Prefer subtle depth, sparse animation, and one clear
   focal point. Avoid dense CRT noise, heavy scanlines, flicker, and gratuitous
   glitch effects.
4. **Meaning survives without color.** Color reinforces information but never
   carries it alone.

## Homepage as the reference

The homepage is the canonical expression of this system. New work should feel
related to it without cloning its exact composition. Preserve these qualities:

- a calm near-black canvas with extremely low-contrast green and cyan light;
- a centered content column capped at `1180px`, with clear page edges;
- hairline separators that establish the header, content, and footer rhythm;
- a large editorial headline balanced by a smaller stack of actionable cards;
- compact mono metadata paired with spacious sans-serif content;
- translucent panels whose depth comes from borders, blur, and restrained
  gradients rather than heavy shadows; and
- small, deliberate signals of activity: the diamond brand mark, status dot,
  directional arrow, and ambient pointer trail.

Treat the homepage as a hierarchy reference, not a template to copy verbatim.
Detail screens may be denser, but should retain its contrast, restraint, and
clear division between orientation, content, and action.

## Page composition

The homepage establishes a three-part vertical frame: top bar, flexible main
content, and footer. Full-height landing screens should follow this rhythm when
appropriate so that navigation stays stable while the main area breathes.

- Use `min(1180px, calc(100% - 40px))` as the default desktop content width.
- Keep major page gutters at `20px` per side on desktop and approximately
  `13px` per side on narrow phones.
- Separate structural regions with `1px` rules using `--line`.
- Prefer asymmetric desktop layouts. The homepage hero uses an approximately
  `56 / 44` split: narrative on the left, actions on the right.
- Give primary landing content generous vertical space. The homepage hero uses
  roughly `90px` above and `76px` below, then tightens progressively on smaller
  screens.
- Align content optically rather than forcing every element onto a dense grid.
  Large type and card stacks should feel balanced, not mechanically equal.

## Visual hierarchy

Use the homepage hierarchy as the default order of emphasis:

1. **Display heading:** the dominant visual anchor, large but short.
2. **Primary destinations or action:** visible as a small card stack or one
   clear control group.
3. **Supporting copy:** muted, readable, and width constrained.
4. **Context labels:** mono, compact, uppercase, and lightly tracked.
5. **Status and footer metadata:** useful but intentionally quiet.

Display headings may use `clamp()` and tight tracking. The homepage range of
`54px` to `104px`, line-height near `.94`, and negative tracking around
`-.065em` is the reference for short landing-page statements. Do not apply
that treatment to long headings or body content.

## Core palette

Use the existing CSS custom properties instead of introducing close variants.

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| Canvas | `--bg` | `#050610` | Page background |
| Soft surface | `--bg-soft` | `#09100c` | Recessed regions |
| Panel | `--panel` | `rgba(10, 18, 13, 0.66)` | Cards and overlays |
| Strong panel | `--panel-strong` | `rgba(11, 22, 16, 0.88)` | Elevated content |
| Primary text | `--text` | `#edf7f1` | Headings and body copy |
| Secondary text | `--muted` | `#8da499` | Supporting copy |
| Primary accent | `--accent` | `#8df3b9` | Focus, active states, key actions |
| Secondary accent | `--accent-2` | `#7ed7ff` | Secondary data and differentiation |
| Danger | `--danger` | `#ff9b9b` | Destructive and error states |

Black and fluorescent green are the visual signature. Cyan and warm status
colors are supporting colors, not competing brand colors. Prefer transparent
tints of these tokens for fills and the solid tokens for text, borders, and
icons. On a bright accent fill, use near-black text such as `#07100b`; do not
put white text on fluorescent green.

## Typography

- Use the system sans-serif stack for headings, body copy, and longer reading.
- Use the mono stack for labels, status, metadata, controls, scores, and short
  technical strings.
- Do not set paragraphs or long instructions entirely in monospace or all caps.
- Terminal character comes from labels and rhythm, not from making all content
  look like a command prompt.

## Shape, layout, and effects

- Build layouts on a visible but subtle grid with generous negative space.
- Use one-pixel low-contrast borders to define structure before adding shadows.
- Keep corners compact on technical controls and moderately rounded on panels.
- Reserve pill shapes for statuses, tags, and short actions.
- Glow should confirm focus or activity. It must remain localized and must not
  reduce text sharpness.
- Motion should be brief and functional. Respect `prefers-reduced-motion`, and
  never use flicker as a persistent effect.

### Background treatment

The background should read as black first and atmospheric second. Use one or
two large radial gradients at about `6%` opacity and a `42px` square grid made
from very faint one-pixel lines. Fade the grid before the bottom of the page so
it never becomes wallpaper. Texture must remain `aria-hidden` and ignore
pointer input.

Do not add photographic textures, strong vignettes, opaque neon clouds, or
high-contrast scanlines. New background effects should be quieter than the
content placed over them.

### Cards and panels

Homepage launch cards are the reference for destination cards:

- `24px` corner radius and roughly `26px` internal padding on desktop;
- translucent `--panel` fill with a subtle diagonal highlight;
- a one-pixel `--line` border and soft, low-opacity shadow;
- mono eyebrow and arrow in the top row, followed by a concise sans-serif title
  and one short muted description;
- hover lift of no more than `4px`, paired with a stronger border and localized
  green highlight; and
- the entire surface acts as one link, with a clear destination cue.

Functional panels may use smaller radii and denser spacing. They should still
share the same border, surface, typography, and focus language.

### Brand and status signals

The small outlined diamond is the preferred brand mark in compact chrome. It
should appear beside a text label rather than as an unexplained icon. A glowing
dot may represent live or ready status only when an adjacent text label also
states the status. On narrow screens the label may be visually hidden when the
meaning is nonessential, but accessible text should remain available.

### Ambient pointer effect

The cyan-to-violet pointer trail is optional atmosphere, not a primary brand
color or interaction requirement. Keep it behind content, noninteractive,
partly transparent, and quick to fade when idle. It must never obscure text or
replace hover/focus feedback. Disable the canvas for `prefers-reduced-motion`
and ensure the complete experience works without pointer input.

## Responsive behavior

Use content-driven breakpoints; the homepage currently provides two useful
reference points:

- At `820px` and below, collapse the hero to one column. Destination cards may
  remain in two columns while their content still fits comfortably.
- At `600px` and below, reduce gutters, stack cards in one column, shorten card
  height, and stack footer content. Preserve the headline's importance rather
  than shrinking it to ordinary body scale.

Responsive changes should alter composition, not merely scale everything down.
Controls must retain a minimum `44px` touch target. Decorative status copy may
be reduced, but navigation, labels, and recovery actions must remain explicit.

## Color-blind and low-vision accessibility

- Meet WCAG AA contrast: at least `4.5:1` for normal text and `3:1` for large
  text, icons, focus indicators, and meaningful component boundaries.
- Never distinguish success, warning, error, player turns, chart series, or
  game state by hue alone. Pair color with text, an icon, a pattern, a border
  style, position, or shape.
- Keep links visibly identifiable through an underline, arrow, or other
  non-color cue when they appear inside body copy.
- Every interactive element needs a persistent hover treatment and a clearly
  visible `:focus-visible` outline. Focus must not rely on glow alone.
- Disabled controls need both reduced emphasis and a behavioral cue such as a
  disabled cursor or label; reduced opacity alone is insufficient.
- Test new palettes in grayscale and with common protanopia, deuteranopia, and
  tritanopia simulations before merging.

## Component language

- Write labels in short, direct phrases: `new game`, `copy address`, `back home`.
- Use eyebrow labels and status text sparingly to establish context.
- Primary actions use the green accent; secondary actions stay neutral. A view
  should normally contain only one primary action per decision point.
- Destination cards use an arrow such as `↗` as a redundant directional cue;
  do not rely on hover motion alone to communicate clickability.
- Errors state what happened and how to recover. Do not show only a red border.
- Game-specific colors may extend the palette when values genuinely need
  differentiation, but the value must also remain readable as text or shape.

## Review checklist

Before adding or changing a screen, confirm that:

- it uses the shared palette and typography roles;
- it remains understandable in grayscale;
- keyboard focus is always visible;
- text and controls meet the contrast targets;
- reduced-motion users lose no information; and
- the terminal influence supports the content instead of obscuring it.
