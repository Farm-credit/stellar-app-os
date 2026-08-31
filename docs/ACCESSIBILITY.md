# Accessibility Conformance (WCAG 2.1 AAA)

This document describes the accessibility work delivered for issue #1145.

## Scope

The audit focuses on the shared application surfaces that every page renders:
the root layout (skip link, landmarks, live regions), global focus styles,
keyboard interaction patterns, and the toast/notification messaging system.
Component-level audits continue to be tracked in this document as they land.

## Delivered fixes

| Criterion                        | WCAG ref                                                 | Delivered                                                                                                                       |
| -------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Skip to content                  | 2.4.1 Bypass Blocks (A)                                  | Already present in `app/layout.tsx`; kept and documented                                                                        |
| Focus visible                    | 2.4.7 Focus Visible (AA) / 1.4.11 Non-text Contrast (AA) | Global `:focus-visible` outline using the brand blue, plus `focus-visible` rings on footer links                                |
| Status messages                  | 4.1.3 Status Messages (AA)                               | New `LiveRegion` + `useAnnouncer` helper; toast container exposes a labelled `region` and toasts announce with `status`/`alert` |
| Consistent help / reduced motion | 2.3.3 Animation from Interactions (AAA)                  | `prefers-reduced-motion: reduce` disables CSS transitions/animations and smooth scrolling                                       |
| Keyboard support                 | 2.1.1 Keyboard (A)                                       | Mobile drawer focus trap, Escape-to-close, and auto-focus verified (see `MobileDrawer.tsx`)                                     |
| Landmarks                        | 1.3.1 Info and Relationships (A)                         | `header` banner, `nav` with `aria-label`, `main id="main-content"`, `footer` contentinfo                                        |
| Contrast baseline                | 1.4.3 Contrast (Minimum) (AA)                            | Documented in this file; interactive focus indicators use ≥ 3:1 contrast against both themes                                    |

## Conformance notes

- Full AAA conformance (e.g. 1.4.6 Contrast Enhanced, 2.4.8 Location, 3.1.5
  Reading Level) requires product-level content decisions. This PR lays the
  engineering foundation (live regions, focus management, reduced motion,
  landmarks) and fixes concrete violations in shared surfaces.
- New interactive components must ship with `:focus-visible` indicators,
  meaningful `aria-label`s for icon-only controls, and `aria-live` messaging
  for asynchronous updates. `useAnnouncer` is the sanctioned helper for the
  latter.

## Running automated checks

```bash
npm run test -- --run components/ui/__tests__/live-region.test.tsx components/ui/toast/__tests__/toast-container.test.tsx
npm run lint -- --no-ignore components/ui/live-region.tsx components/ui/toast/toast-container.tsx
```
