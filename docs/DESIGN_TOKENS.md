# Stage Glow design tokens

Stage Glow uses a warm, readable base with a vivid voice-wave palette: violet, amethyst, and magenta. Purple carries primary actions and focus; the soundwave gradient brings a brighter voice-inspired accent. The night theme keeps the same color character on deep plum surfaces.

## Light theme

| Token | Value | Usage |
| --- | --- | --- |
| `--bg` | `#FBF7F1` | App background |
| `--surface` | `#FFFFFF` | Cards and controls |
| `--surface-2` | `#F4EDE3` | Secondary surfaces |
| `--border` | `#E6DCCF` | Dividers and outlines |
| `--text` | `#21162F` | Primary text |
| `--text-muted` | `#6B5F7A` | Secondary text |
| `--primary` | `#6D28D9` | Buttons, links, and selected states |
| `--primary-bright` | `#5B21B6` | Hover and decorative states |
| `--secondary` | `#7C3AED` | Supporting voice-wave accent |
| `--success` | `#176B4A` | Success |
| `--warning` | `#80520F` | Warning |
| `--danger` | `#D92D4A` | Danger |
| `--wave` | `#6D28D9 → #B02EBD → #EF4A9B` | Brand accents and progress |

## Dark theme

| Token | Value | Usage |
| --- | --- | --- |
| `--bg` | `#130E1F` | App background |
| `--surface` | `#1D1630` | Cards and controls |
| `--surface-2` | `#271E3F` | Secondary surfaces |
| `--border` | `#3A2F57` | Dividers and outlines |
| `--text` | `#F5EEF9` | Primary text |
| `--text-muted` | `#B3A6C7` | Secondary text |
| `--primary` | `#C4A1FF` | Buttons, links, and selected states |
| `--primary-bright` | `#D2B7FF` | Hover and decorative states |
| `--secondary` | `#E2C9FF` | Supporting voice-wave accent |
| `--success` | `#3DD598` | Success |
| `--warning` | `#F5B301` | Warning |
| `--danger` | `#FF6B86` | Danger |
| `--wave` | `#A77BFF → #CB72E5 → #FF79B7` | Brand accents and progress |

## Contrast checks

Ratios use the WCAG relative-luminance formula. Body text must be at least 4.5:1; large text and meaningful UI boundaries must be at least 3:1. Ratios are for the listed foreground/background pairs; image overlays and translucent surfaces need separate visual review.

| Foreground | Background | Ratio | Result |
| --- | --- | ---: | --- |
| `#21162F` | `#FBF7F1` | 16.12:1 | Pass |
| `#6B5F7A` | `#FBF7F1` | 5.55:1 | Pass |
| `#6D28D9` | `#FBF7F1` | 6.66:1 | Pass |
| `#FFFFFF` | `#6D28D9` | 7.10:1 | Pass |
| `#FFFFFF` | `#5B21B6` | 8.98:1 | Pass |
| `#7C3AED` | `#FFFFFF` | 5.70:1 | Pass |
| `#176B4A` | `#FFFFFF` | 6.48:1 | Pass |
| `#80520F` | `#FFFFFF` | 6.71:1 | Pass |
| `#D92D4A` | `#FFFFFF` | 4.75:1 | Pass |
| `#F5EEF9` | `#130E1F` | 16.64:1 | Pass |
| `#B3A6C7` | `#130E1F` | 8.28:1 | Pass |
| `#130E1F` | `#C4A1FF` | 8.91:1 | Pass |
| `#130E1F` | `#D2B7FF` | 10.77:1 | Pass |
| `#E2C9FF` | `#1D1630` | 9.88:1 | Pass |
| `#3DD598` | `#1D1630` | 9.23:1 | Pass |
| `#F5B301` | `#1D1630` | 9.37:1 | Pass |
| `#FF6B86` | `#1D1630` | 6.36:1 | Pass |

Primary-button text is white in the light theme and dark plum in the dark theme to retain contrast. The landing page's voice-wave CTA uses a violet-to-magenta gradient with white text. Components pair color changes with labels or icons, and keyboard focus indicators use a visible outline.

The legacy `--ink`, `--muted`, `--green`, `--lime`, `--paper`, `--white`, and `--line` properties temporarily alias the new tokens. The legacy `--orange` property is retained as a compatibility alias to a muted magenta shade; new components should use semantic tokens instead.
