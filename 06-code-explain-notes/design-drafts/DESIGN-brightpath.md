---
version: alpha
name: "Brightpath"
description: "an online course platform for schools and their students"
colors:
  background: "#fcfbff"
  surface: "#ffffff"
  border: "#dcd8e7"
  text: "#231f2b"
  muted: "#656070"
  primary: "#005ab0"
  on-primary: "#ffffff"
  accent: "#8d6dc9"
  on-accent: "#000000"
  dark-background: "#15131b"
  dark-surface: "#23202b"
  dark-border: "#393642"
  dark-text: "#f3f1f6"
  dark-muted: "#b2afbc"
  dark-primary: "#59a3ff"
  dark-on-primary: "#111111"
  dark-accent: "#c0a2ff"
  dark-on-accent: "#000000"
typography:
  h1:
    fontFamily: "Inter"
    fontSize: "3.052rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  h2:
    fontFamily: "Inter"
    fontSize: "2.441rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  h3:
    fontFamily: "Inter"
    fontSize: "1.953rem"
    fontWeight: 600
    lineHeight: 1.25
  h4:
    fontFamily: "Inter"
    fontSize: "1.563rem"
    fontWeight: 600
    lineHeight: 1.25
  body-lg:
    fontFamily: "Inter"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: "Inter"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: "Inter"
    fontSize: "0.8rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.25
  caption:
    fontFamily: "Inter"
    fontSize: "0.64rem"
    fontWeight: 600
    lineHeight: 1.4
  code:
    fontFamily: "JetBrains Mono"
    fontSize: "0.8rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "4px"
  md: "8px"
  lg: "16px"
  full: "9999px"
spacing:
  unit: "4px"
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
  gutter: "16px"
  control-height: "40px"
  control-padding: "16px"
  gap: "12px"
  section: "72px"
components:
  page:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    typography: "{typography.body-md}"
  text-muted:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted}"
    typography: "{typography.body-sm}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "16px"
  card-muted:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.body-sm}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "16px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "16px"
  divider:
    backgroundColor: "{colors.border}"
    height: "1px"
  badge:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  page-dark:
    backgroundColor: "{colors.dark-background}"
    textColor: "{colors.dark-text}"
    typography: "{typography.body-md}"
  text-muted-dark:
    backgroundColor: "{colors.dark-background}"
    textColor: "{colors.dark-muted}"
    typography: "{typography.body-sm}"
  card-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.lg}"
    padding: "16px"
  card-muted-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-muted}"
    typography: "{typography.body-sm}"
  button-primary-dark:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.dark-on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "16px"
  button-secondary-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-text}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "16px"
  input-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-text}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "16px"
  divider-dark:
    backgroundColor: "{colors.dark-border}"
    height: "1px"
  badge-dark:
    backgroundColor: "{colors.dark-accent}"
    textColor: "{colors.dark-on-accent}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
---
<!-- UI by Made Good Designs — https://madegooddesigns.com/inspiration/ui/course-dashboard-web-minimal-fe43445c7bf1 Free to use and adapt in any project, including commercial ones; no credit needed in your product. Republishing the screens themselves (a gallery, template pack, article or dataset)? Credit Made Good Designs with a link. Terms: https://madegooddesigns.com/inspiration/ui/terms -->


# DESIGN.md — Brightpath

> Design rules for Brightpath: an online course platform for schools and their students. This file is the source of truth for colour, type, spacing, shape, motion and component behaviour. People and AI coding agents should follow it exactly and should not invent new values. The YAML front matter holds the tokens in the [DESIGN.md format](https://github.com/google-labs-code/design.md) (version alpha); the sections below explain how to use them.

## 이 프로젝트(06 코드 해설 노트)에서의 적용 범위

위 규칙 중 이 사이트에 맞게 줄여서 쓴 부분이다. 아래 영어 본문과 충돌하면 이 절이 우선한다.

- 적용 대상: `index.html`(보관함), `templates/note.html`, `templates/note-text.html`, 그리고 이미 만든 `notes/*/index.html`의 `<style>`.
- 적용하지 않음: 사이드바, 진행률 원, 표 대시보드 같은 강의 플랫폼용 화면 구성. 노트 안의 `diagram.html`, `eli5.html`, `summary.html`, `templates/simulator.html`은 각자 스타일을 유지한다.
- 글자 크기는 대시보드처럼 촘촘하게 쓴다: 본문 약 15px, 보조 글자 12.8px, 보관함 제목 1.563rem (h4 단계).
- 한글은 Inter에 없으므로 `"Inter", "Noto Sans KR"` 순서로 쓴다.
- 새 노트 틀을 고칠 때는 색·모서리·글꼴을 아래 토큰에서만 가져온다.

## Overview

- **Product type:** SaaS web app
- **Personality:** Calm, Technical, Minimal
- **Themes:** light and dark (follows the system setting, overridable with `data-theme`; dark tokens are the `dark-*` colours and the `*-dark` components)
- **Accessibility target:** WCAG 2.2 AA

### Rules for AI coding agents

1. Use only the tokens in this file. If something seems to need a new colour, size or shadow, reuse the nearest token and leave a TODO comment instead of inventing one.
2. Reference colours through CSS variables (`var(--color-primary)`) or the matching Tailwind classes — never raw hex in component code.
3. Build every interactive state: default, hover, active, focus-visible, disabled and loading.
4. Keep text contrast at the ratios in the Colors section. Re-check any new colour pairing before using it.
5. Respect `prefers-reduced-motion` and the tokens in the Motion section.
6. When a rule here conflicts with a framework default, this file wins.

### Personality and voice

- **Calm:** Short, unhurried sentences. No exclamation marks or urgency language.
- **Technical:** Precise nouns and real units; show values instead of adjectives.
- **Minimal:** One idea per screen section; remove anything that does not help the task.

## Colors

| Token | Role | Light | Dark |
|---|---|---|---|
| `background` (`--color-background`) | Page background | `#FCFBFF` | `#15131B` |
| `surface` (`--color-surface`) | Cards, menus, navigation, inputs | `#FFFFFF` | `#23202B` |
| `border` (`--color-border`) | Dividers and input borders | `#DCD8E7` | `#393642` |
| `text` (`--color-text`) | Body text and headings | `#231F2B` | `#F3F1F6` |
| `muted` (`--color-muted`) | Secondary text, captions, placeholders | `#656070` | `#B2AFBC` |
| `primary` (`--color-primary`) | Primary buttons, key links, selected states | `#005AB0` | `#59A3FF` |
| `on-primary` (`--color-on-primary`) | Text and icons on primary | `#FFFFFF` | `#111111` |
| `accent` (`--color-accent`) | Highlights, tags, focus ring, charts | `#8D6DC9` | `#C0A2FF` |
| `on-accent` (`--color-on-accent`) | Text on accent-filled tags | `#000000` | `#000000` |

### Measured contrast

| Pair (light) | Colours | Ratio | Needs | Result |
|---|---|---|---|---|
| Text on background | #231F2B on #FCFBFF | 15.65:1 | 4.5:1 | Pass |
| Text on surface | #231F2B on #FFFFFF | 16.12:1 | 4.5:1 | Pass |
| Muted text on background | #656070 on #FCFBFF | 5.89:1 | 4.5:1 | Pass |
| Muted text on surface | #656070 on #FFFFFF | 6.07:1 | 4.5:1 | Pass |
| Primary on background | #005AB0 on #FCFBFF | 6.60:1 | 3:1 | Pass |
| Label on primary button | #FFFFFF on #005AB0 | 6.80:1 | 4.5:1 | Pass |
| Accent on surface | #8D6DC9 on #FFFFFF | 4.07:1 | 3:1 | Pass |

| Pair (dark) | Colours | Ratio | Needs | Result |
|---|---|---|---|---|
| Text on background | #F3F1F6 on #15131B | 16.41:1 | 4.5:1 | Pass |
| Text on surface | #F3F1F6 on #23202B | 14.26:1 | 4.5:1 | Pass |
| Muted text on background | #B2AFBC on #15131B | 8.55:1 | 4.5:1 | Pass |
| Muted text on surface | #B2AFBC on #23202B | 7.43:1 | 4.5:1 | Pass |
| Primary on background | #59A3FF on #15131B | 7.11:1 | 3:1 | Pass |
| Label on primary button | #111111 on #59A3FF | 7.29:1 | 4.5:1 | Pass |
| Accent on surface | #C0A2FF on #23202B | 7.50:1 | 3:1 | Pass |

### Colour rules

- One primary action per view uses `--color-primary` with `--color-on-primary` text.
- `--color-accent` is for small highlights (tags, focus rings, charts). Never use it for body text — it is below 4.5:1 on the surface.
- Errors, warnings and success states use text plus an icon, not colour alone.

## Typography

- **Headings:** Inter (600–700)
- **Body:** Inter (400; 600 for emphasis)
- **Code and data:** JetBrains Mono
- **Base size:** 16px, scale ratio 1.25, body line-height 1.6, headings 1.15–1.25
- Maximum line length: about 70 characters (`max-width: 68ch`).

| Token | Size | rem | Typical use |
|---|---|---|---|
| `--text-xs` | 10.2px | 0.64rem | Fine print, badges (`caption`) |
| `--text-sm` | 12.8px | 0.8rem | Captions, table cells, helper text (`body-sm`, `code`) |
| `--text-base` | 16px | 1rem | Body text, inputs, buttons (`body-md`, `label`) |
| `--text-lg` | 20px | 1.25rem | Lead paragraph, card titles (`body-lg`) |
| `--text-xl` | 25px | 1.563rem | H4 / section titles (`h4`) |
| `--text-2xl` | 31.3px | 1.953rem | H3 (`h3`) |
| `--text-3xl` | 39.1px | 2.441rem | H2 (`h2`) |
| `--text-4xl` | 48.8px | 3.052rem | H1 / hero (`h1`) |

## Layout

Base unit **4px**. Use only these steps: `2`, `4`, `6`, `8`, `12`, `16`, `24`, `32`, `48`, `64` (px).

- **Density:** comfortable — controls 40px tall, 16px inner padding, 12px gaps between related items.
- **Section spacing:** 72px between page sections on desktop, about half on mobile.
- **Layout:** 12-column grid, max content width 1200px, 16px side gutter on phones; no horizontal scrolling at 320px.

## Elevation & Depth

Depth uses three soft shadow levels; surfaces sit on the background and borders separate dense content.

| Token | Value | Use |
|---|---|---|
| `--border-width` | 1px | Inputs, dividers, outline buttons |
| `--shadow-sm` | `0 1px 2px rgb(0 0 0 / 0.06)` | Inputs, small cards |
| `--shadow-md` | `0 2px 8px rgb(0 0 0 / 0.08)` | Dropdowns, popovers |
| `--shadow-lg` | `0 12px 32px rgb(0 0 0 / 0.12)` | Dialogs |

## Shapes

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 4px | Badges, checkboxes, small chips |
| `--radius-md` | 8px | Buttons, inputs |
| `--radius-lg` | 16px | Cards, dialogs, images |
| `--radius-full` | 9999px | Avatars, pills |

## Components

The `components` tokens in the front matter give the base atoms (page, text-muted, card, button-primary, button-secondary, input, divider, badge, each with a `-dark` variant). Behaviour:

### Buttons
- Height 40px, horizontal padding 16px, radius `--radius-md`, label in `--text-base` 600.
- **Primary:** `--color-primary` background, `--color-on-primary` label. **Secondary:** transparent with a `--border-width` `--color-border` outline and `--color-text` label. **Ghost:** text only.
- Hover: darken or lighten the fill by about 8% lightness; active: a further 4%. Disabled: 50% opacity, no pointer events. Loading: keep the width, show a spinner, block repeat clicks.

### Inputs and forms
- Height 40px, `--color-surface` fill, `--border-width` `--color-border` border, radius `--radius-md`.
- Every input has a visible label above it; helper text below in `--text-sm` `--color-muted`.
- Error: message under the field with an icon, border switches to an error colour that passes 3:1, and focus moves to the first invalid field on submit.

### Cards
- `--color-surface`, radius `--radius-lg`, 16px padding, `--shadow-sm`.
- A whole-card link has one clear target and a visible focus ring.

### Navigation
- Top bar on `--color-surface` with a `--color-border` bottom edge; current page marked with weight and an underline or indicator, not colour alone.
- Below 768px, collapse to a menu button with an accessible name; the open menu traps focus and closes on Escape.

### Tables and lists
- Header row in `--text-sm` 600 `--color-muted`; rows separated by `--color-border` lines; numbers right-aligned in JetBrains Mono.
- On phones, tables scroll inside their own container or collapse to stacked cards.

### Tags and badges
- `--text-xs` 600, radius `--radius-sm`, padding 2px 8px. Accent-filled tags use `--color-on-accent` (black) text.

## Motion

Motion confirms an action or shows where something came from. Fade and short slides (4–8 px); no bounces.

| Token | Value |
|---|---|
| `--duration-fast` | 120ms (hover, press) |
| `--duration-base` | 200ms (menus, toasts) |
| `--duration-slow` | 320ms (dialogs, page sections) |
| `--ease` | `cubic-bezier(0.2, 0.8, 0.2, 1)` |

With `prefers-reduced-motion: reduce`, replace movement with an instant change or a fade of 100ms or less.

## Accessibility

- Text contrast at least 4.5:1 (3:1 for 24px+ or 18.7px+ bold); UI parts and focus rings at least 3:1.
- Visible focus on everything interactive: 2px `--color-accent` outline with a 2px offset.
- Touch targets at least 24×24px (44×44px preferred) with 8px between targets.
- Every image has alt text (empty `alt=""` if decorative); icons-only buttons have an accessible name.
- Pages work with keyboard only and at 200% zoom; headings are in order (one H1 per page).

## Tokens as CSS

Check this file with `npx @google/design.md lint DESIGN.md`; export the front-matter tokens with `npx @google/design.md export --format css-tailwind DESIGN.md` (Tailwind v4 `@theme`) or `--format dtcg` (W3C design tokens). The same tokens as plain CSS:

```css
:root {
  --color-background: #fcfbff;
  --color-surface: #ffffff;
  --color-border: #dcd8e7;
  --color-text: #231f2b;
  --color-muted: #656070;
  --color-primary: #005ab0;
  --color-on-primary: #ffffff;
  --color-accent: #8d6dc9;
  --color-on-accent: #000000;
  --font-heading: "Inter", system-ui, sans-serif;
  --font-body: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --text-xs: 0.64rem;
  --text-sm: 0.8rem;
  --text-base: 1rem;
  --text-lg: 1.25rem;
  --text-xl: 1.563rem;
  --text-2xl: 1.953rem;
  --text-3xl: 2.441rem;
  --text-4xl: 3.052rem;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --radius-full: 9999px;
  --border-width: 1px;
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.06);
  --shadow-md: 0 2px 8px rgb(0 0 0 / 0.08);
  --shadow-lg: 0 12px 32px rgb(0 0 0 / 0.12);
  --duration-fast: 120ms;
  --duration-base: 200ms;
  --duration-slow: 320ms;
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-background: #15131b;
    --color-surface: #23202b;
    --color-border: #393642;
    --color-text: #f3f1f6;
    --color-muted: #b2afbc;
    --color-primary: #59a3ff;
    --color-on-primary: #111111;
    --color-accent: #c0a2ff;
    --color-on-accent: #000000;
  }
}
:root[data-theme="dark"] {
  --color-background: #15131b;
  --color-surface: #23202b;
  --color-border: #393642;
  --color-text: #f3f1f6;
  --color-muted: #b2afbc;
  --color-primary: #59a3ff;
  --color-on-primary: #111111;
  --color-accent: #c0a2ff;
  --color-on-accent: #000000;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

<!-- Generated with the free DESIGN.md generator at madegooddesigns.com/tools/design-md-generator/ -->
