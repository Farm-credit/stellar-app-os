# Design tokens used by PhotoMetadataModal

This component keeps a "field verification ticket" concept - tree photo
submissions are proof-of-work for an agricultural credit, so the modal reads
like a field surveyor's log rather than a generic photo dialog: a dashed
perforated edge, monospace data rows, and a rotated ink-stamp badge that
reports GPS LOCKED / NO GPS DATA the moment extraction resolves.

## Colors: flat brand tokens + opacity modifiers, not a shade scale

Per the repo README, `stellar-blue` (`#14B6E7`), `stellar-navy` (`#0D0B21`),
and `stellar-green` (`#00B36B`) are flat single-value colors - there's no
`50`-`900` scale. So instead of guessing at shade numbers that may not exist
in `tailwind.config.js`, every tint/shade in this component is done with
Tailwind's opacity modifier syntax on the flat token, which works regardless
of what scale (if any) is configured:

| Role                                              | Class pattern used              |
|----------------------------------------------------|----------------------------------|
| Ink / text / neutral structure ("bark")             | `text-stellar-navy` (full), `text-stellar-navy/60` (secondary), `text-stellar-navy/40` (muted) |
| Ticket surface / subtle backgrounds ("paper")       | `bg-stellar-navy/5`             |
| Borders / dividers                                  | `border-stellar-navy/15` (hairline), `border-stellar-navy/30` (visible) |
| Confirmed / positive state, submit action ("canopy")| `bg-stellar-green`, `text-stellar-green`, `border-stellar-green` (full - no opacity needed, this is the one place full saturation reads as intentional rather than loud) |
| Structural accent - perforation edge, eyebrow label ("soil") | `border-stellar-blue`, `text-stellar-blue` (full) |
| Text on a solid `stellar-green` button              | `text-white` - a functional contrast color, not a brand token; opacity-modified navy can't produce "light text," only translucency |
| Error state only ("flag")                           | Tailwind's default `red-*` scale (50/300/400/600/700) - `red` **does** ship with a full shade scale out of the box, so no assumption is being made there; used only for hard failures (extraction error), never for the "missing GPS" warning, which stays on `stellar-navy` |

No `theme.extend` changes are required at all - every class above works
against the three flat colors as documented, with zero assumptions about
scale.

## Optional: typography

`font-serif` (ticket heading) and `font-mono` (data rows, stamp, eyebrow
label) currently resolve to Tailwind's default serif/mono stacks, which is a
quieter, less distinctive version of the intended look. If you want the full
"field ticket" typographic identity, add this to `theme.extend.fontFamily`
in `tailwind.config.js`:

```js
fontFamily: {
  serif: ["Roboto Slab", "ui-serif", "Georgia", "serif"],
  mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
},
```

This is a deliberate, separate call from the color mapping above - the
component works and looks reasonable without it, so treat this as a
"nice to have" a reviewer can accept or skip rather than something bundled
in silently.

## Known limitation: JPEG only

`parseJpegExif` walks JPEG's APP1/EXIF segment only. HEIC (the default
capture format on iPhone unless "Most Compatible" is enabled) isn't parsed
and falls through to the "no GPS data" warning state rather than erroring.
Flagged in the PR description as a follow-up, not an oversight.
