# Specimen review and scanner triage

Reviewed against the supplied Pixilated UI Designer technique index, Design Direction inputs, Brand Auditor and Anti-AI-Slop rules. The parent assignment supplied the direction; no new user direction questions were required. No Product Design Lead, Hallmark or related custom-team skill was loaded.

## Fixed

- Raised small body/control text to a readable 14 px operational primary size, 12 px metadata and 16 px mobile field values. The four initial design-hook tiny-text findings were real problems and were fixed. No hook ignores were created.
- Increased text-button padding to 20 px on desktop and 24 px on mobile; retained 44/48 px heights and 8 px corners. View selection uses the canonical 36 px compact desktop size and 44 px phone targets.
- Normalized visible icon renders from 13/14/18 px to the documented 16/20/24 px set. Geometry remains the original Lucide 24 px drawing.
- Synchronized preview colors to the canonical token file, including stronger `#757575` control boundaries and exact dark semantics. Added explicit placeholder colors, including dark mode.
- Fixed the mobile subtitle word boundary and kept the booking panel visible on tablet widths.
- Added LTR isolation to displayed hex tokens; phone/time fields retain their own direction.

## Measured results

The static anti-slop scan initially returned 0 P0, 0 P1 and 0 P2. The first rendered raw report returned 11 P0/0 P1/1 P2 desktop and 14 P0/0 P1/0 P2 phone. Real button padding and type inconsistencies were repaired. The retained final raw scan is 5 P0/0 P1/0 P2 at both widths. These five remaining flags are the four specific heuristic categories below, rather than five supported usability defects. Raw reports and annotated images remain in `after/` and `final/`.

| Raw flag | Disposition and evidence |
| --- | --- |
| O2 selected appointment row stroke | False positive. The row contains the selection button with `aria-pressed`; its enclosing row carries the resulting selection state. The pink outline is functional and is independent from the green clinical lifecycle label and separate payment text. The parent explicitly accepted this separation. |
| O4 date weekday/day padding | Pattern exception. This is a vertically stacked calendar cell, not a horizontal text action. The whole 62/64 px tall cell is selectable, the date has room on every side, and weekday labels remain visible at phone width. The full date is not squeezed into a conventional button label. |
| O4 full-width Continue padding ratio | False positive. A full-width 48 px mobile booking action intentionally has large space around a short centered label. It retains the button scale, a clear name and a large touch target. |
| O4 mixed heights on two view buttons | False positive. The heuristic compares the compact List/Day selector with the unrelated 62/64 px date cells. Each pair within the actual control family has equal height. There are two raw flags because it marks both view buttons. |

The final Brand Auditor measurement at 1440×900 reported 92.0% dominant neutral, 3.4% slate and 4.6% pink within its role classification; 0.0% off-palette pixels and 7.7% extended colors. This is a script estimate for that viewport, excluding semantic/image areas, not a product-quality percentage. Both font families were loaded. The final size scan found 16 and 20 px icons in the initial viewport; 24 px state icons appear after the booking flow progresses.

The six remaining raw brand P1 warnings are broad color-distance warnings: slate versus semantic info/success, confirmed text versus info, completed text versus info/success/warning. These are dropped as false positives because the canonical palette intentionally reuses slate for information, completed appointments remain neutral, and live care uses a distinct labeled green. No semantic state was inferred from color alone.

## Five non-negotiables

- Checked: no decorative accent stripe or nonfunctional panel ring. Selection and field outlines carry actual control state.
- Checked: no dash punctuation in visible interface copy.
- Checked: action button padding/height consistency, with the calendar/full-width exceptions documented above.
- Checked: no interface icons inside decorative background tiles.
- Checked: no dots in status chips.

## Browser evidence and limits

`interaction-results.json` records the browser checks. The first harness failures are preserved in `first-run-failure.txt`; both were corrected environment/wait assumptions. The specimen was visually inspected at 1440 px and 390 px, in light/dark and RTL. Screenshots and the browser journey support these local fixture claims only. No live clinic, real user, screen reader, full accessibility-conformance, storage/persistence or native Figma parity claim is made.

## Post-delivery padding hook

Corrected `.status` to4px block/8px inline padding. All16wide/narrow,theme,direction andlist/day checks passed for badge containment; see `hook-padding/triage.md`. No padding ignore was used. A scoped repeating-stripes-gradient exception documents the functional hourly calendar grid; the final configured detector output is clean.
