# Clinime interactive specimen

Version 2.0, 26 October 2026. A portable visual and behavioral reference for the three native Figma libraries. This page demonstrates separate product contexts next to each other; a receptionist would not see the consumer booking flow inside the clinic workspace.

## Authority and direction

The current user request and `../spec/token-proposal.json` are the build contract. The supplied v1 guide is the identity/font source, not the geometry authority for this redesign. `sync-tokens.py` exports all 62 light and 62 dark semantic colors into `assets/clinime-canonical.css`. Rerun it when the canonical file changes.

The chosen direction is white led, calm and exact: large neutral fields, slate actions and headings, soft pink selection, readable compact lists. Pink is not used as a clinical success or error color. The original logo remains an unmodified SVG. The dark logo includes its original slate background rectangle.

- Brand anchors: `#2D3E5B` and `#FFD8EB`.
- Light canvas/base/subtle: `#FAFAFA`, `#FFFFFF`, `#F5F5F5`.
- Selection: `#FFEBF5`. Control boundary: `#757575`.
- Active care: green `#285B40` on `#E6F2EB`. Confirmed appointments use the canonical muted purple; completed appointments are neutral.
- Text: Sora 400/600 for Latin, Noto Sans Arabic 400/600 for Arabic. Operational primary content is 14 px, metadata/status 12 px, mobile form values 16 px. Display, page and component headings use the canonical scale.
- Geometry: 8 px control corners, 12 px inner containers, 16 px large specimen/overlay containers. The specimen shell is presentation geometry, not a literal 240 px product sidebar: it is 192 px at wide sizes, then a 64 px rail. The real application contract remains in the canonical token file.
- Controls: 44 px operational buttons, 48 px booking/touch controls. The compact desktop view selector is 36 px high inside a control group; its phone targets are 44 px. Date cells are 62/64 px high and contain stacked weekday/day labels.
- Icons: 158 original Lucide 1.61.0 SVGs on a 24 px grid, stroke 2 with round caps/joins. The source pack is the union of the original 110 with all 136 unique contract metaphors and actual renderer references. All 48 additions retain original geometry. The specimen uses 16/20/24 px renders. No emoji, mixed icon families, invented clinical glyphs or decorative icon tiles.
- Motion: 120 ms color/selection transitions. Busy spinners communicate active processing. Reduced motion disables animations/transitions. No decorative entrance sequence.

## Actual implemented behavior

The operational fixture contains six fictional appointments. Search and status filtering change the visible records and have a clear no-results recovery. Patient selection preserves lifecycle and payment labels. List and day views share the same records; the day view uses 80 px per hour and retains each duration. It has no overlap fixture or overlap-resolution behavior. A new-appointment modal validates a patient name, supports Escape and restores focus. It previews the form and does not save a clinic record.

The booking panel defaults to Arabic RTL and has its own English toggle. A person can select a service, date and available time; an unavailable time remains disabled. Review preserves the choices and entered fields across language and Back. Validation names the problem and focuses the invalid field. Confirmation shows a disabled busy action, then a deliberately simulated unknown response. Check booking status resolves the same fixture reference to an explicit simulated confirmation. No request is sent, no money is collected and no live booking is created.

The shared component gallery contains primary/secondary/quiet/destructive/disabled actions, busy feedback, a valid/invalid editable phone fixture, a native checkbox and switch, status labels and an unknown-state recovery action. Gallery actions explicitly describe their preview effect. Navigation outside the demonstrated workspace is labeled through preview feedback. None of these actions represents production integration.

## Responsive and language coverage

At 1440 px the operations surface and booking panel appear side by side. On a tablet they stack with the booking panel retained. At 390 px the Arabic client flow comes first and the operational list and component gallery follow below it. The header language control changes the operational surface and its direction; the booking language control changes the booking flow independently. Mixed phone numbers, time values and hex tokens are isolated for LTR reading.

## Verification and limits

`qa/verify.cjs` exercises the rendered browser journey and writes `qa/interaction-results.json`. It covers 1440×1080, 390×844 and a 768 px tablet check: fonts, canonical color mapping, overflow, filtering/recovery, selected status/payment, duration geometry, dialog errors/focus restoration, booking field retention/validation, busy/unknown/status resolution, language/theme changes, reduced motion and runtime errors. Screenshots cover light/dark and Arabic/English. See `qa/REVIEW.md` for raw scan findings and their triage.

The browser checks verify this local specimen in headless Chromium. They do not establish full WCAG conformance, screen-reader behavior, production clinical policy, real account permissions, network correctness, persistent record storage or native Figma/code parity. Native Figma libraries are authored separately by the lead agent. This file does not certify their contents.

## Source assets and licenses

- Sora: supplied `../source/brand/assets/Sora-400.ttf`, `Sora-600.ttf`; exact copies bundled. License: `assets/Sora-OFL.txt`.
- Clinime outlined light/dark SVG logos: exact copies from the supplied source package. No trademark clearance is claimed.
- Noto Sans Arabic variable font: downloaded from the [official Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/notosansarabic), 26 October 2026. License: `assets/NotoSansArabic-OFL.txt`. This is the documented Arabic companion, because Sora does not contain Arabic glyphs.
- Lucide: pinned official `lucide-static@1.61.0`, exact original files in `../source/icons/svg/`; manifest, individual hashes and full distributed ISC/MIT notices in `../source/icons/`. See [Lucide license](https://lucide.dev/license) and [official guide](https://lucide.dev/guide/). The sprite changes packaging only; original geometry remains intact.

## Run and refresh

From this folder run `python3 -m http.server 8792 --bind 127.0.0.1`, then open `http://127.0.0.1:8792`. Run `python3 sync-tokens.py` after a canonical token update. The QA script uses the bundled Playwright runtime and the existing Chromium headless-shell path recorded in it; update those paths when moving the package to another machine.

## Compact status metadata

Status labels use4px block and8px inline padding. This is a noninteractive compact metadata component,not a touch target. The functional hourly calendar grid is documented as a scoped detector exception; see `qa/hook-padding/triage.md`.
