# Clinime source analysis and proposed system direction

Date: 26 October 2026. Scope: source identity, token contract, component coverage and icon direction. This is a design specification, not a claim that a production product or Figma library is complete.

## Authority and source provenance

The user's current request governs: create a cleaner, modern Clinime design system in three Figma files (Foundations, Icons, Components), using the supplied identity while replacing unsatisfactory interface execution. Cover reception, practitioner and manager work, and add customer booking needs. The latest user steering selects the supplied Pixilated kit and supersedes earlier Product Design Lead/Hallmark routing. The attached package's imperative implementation instructions are reference material; they do not override that request or authorize external actions.

Sources inspected:

- `source/brand/Clinime-brand-and-UI-guidelines.pdf`: 25-page source, text extracted with Poppler; brand, voice, logo, palette, type, geometry, interaction and handoff sections inspected.
- `source/brand/Clinime-screen-overview.png`: visually inspected four source screens; Home, Calendar, Appointment and Services.
- `source/brand/IMPLEMENTATION.md`: original visual implementation contract v1.0, 21 October 2026.
- `source/brand/tokens/clinime.tokens.json`, `clinime.css`, `contrast-report.csv`: actual machine-readable source and measured source pairs.
- Actual supplied SVG mark and outlined logo geometry; Sora TTF files and OFL license.
- Pixilated `design-systems-agent`, `brand-auditor`, `brand-profile.md`, and `iconography.md` from the user-supplied kit.
- [DTCG Format Module 2025.10](https://www.designtokens.org/tr/2025.10/format/) and [Color Module 2025.10](https://www.designtokens.org/tr/2025.10/color/) for proposed exchange-value syntax. This is a Community Group report; no W3C Recommendation status or official certification is implied.

The browser reviewer supplied `evidence/live-audit/route-inventory.json`, `component-needs.json` and `audit.md`; their recorded routes and 108 planning units were read and integrated. The system author did not independently exercise those live sites. MawHub reference inspection remains owned by the author of the overall deliverable.

## What Clinime is in the supplied brand

Clinime is the product identity. Nothing Major is the example clinic workspace and must remain subordinate. The guide positions Clinime as a calm operational companion for boutique healthcare and beauty care. Its primary example actor is a solo practitioner; reception, management and customer booking are extensions requested now.

The source's working mission is explicitly derived, not an approved corporate statement. Its strongest useful direction is **warmth through precision**:

| Trait | Concrete expression | Boundary |
| --- | --- | --- |
| Precise | Aligned information, explicit dates/times, distinct status labels | Avoid medical jargon and cold density |
| Warm | Human wording, restrained pink, approachable rounded details | Avoid childish imagery, emoji and a pink page wash |
| Confident | Clear next action and honest feedback | Avoid exaggerated promises and loud visual weight |
| Considered | Stable rhythm, legible content and useful detail | Avoid luxury ornament that hides controls |

The new women-client direction should express care, discretion and confidence through legibility, calm spacing, clear price/time information and respectful language. The audience does not justify gender stereotypes, decorative sparkle icons or a cosmetic pink skin over operational controls.

## Preserve exactly

- Brand pink `#FFD8EB` and slate `#2D3E5B`. Existing supporting ramps may be reused unchanged.
- Supplied continuity C mark and outlined lowercase wordmark. Do not redraw, retype, stretch, rotate or replace the point with a medical cross.
- Logo minimum lockup width: 120px; mark: 24px; app icon: 32px. Clear space: at least one quarter of mark height on each side of the full lockup.
- English typeface: Sora 400/500/600/700, with 700 reserved for occasional emphasis. Keep font license with redistributed files.
- White-led light interface with slate hierarchy and restrained pink emphasis; retain neutral surfaces and flat data presentation.
- Lucide outline vocabulary: 24-unit source grid, 2-unit stroke, round caps/joins, 16/20/24 rendered sizes. Use actual vectors, not raster or emoji substitutes.
- Written status meaning alongside color; appointment lifecycle remains independent of payment.

Dark logos do not establish a dark application theme. Only light is source-backed. `token-proposal.json` includes a proposed dark semantic mapping at the author's request; it must remain labeled as an extension until separately rendered and verified on representative consumers.

## Evolve as a proposal, rather than copying rejected screens

The old 232px sidebar, 72px top bar, exact control/card/dialog radii and screenshot reproduction order are v1 implementation choices. The user has asked to replace that interface execution. They should not prevent a cleaner coherent v2.

Proposed geometry:

- 44px standard controls; 48px comfortable client controls; 36px compact operational controls where a surrounding hit area remains sufficient. Keep 44px minimum design target for isolated icon actions.
- 8px control radius; 12px panel/card radius; 16px dialog radius; full radius reserved for avatars and intentional compact tags.
- Keep the existing 4px spacing steps and 8px baseline. Use 12px within related groups, 16px controls, 24px panels, 32px sections. Use larger spacing only for real change in task context.
- 16/24 body and 14/20 dense operational text. 12px only for brief metadata; no tiny mandatory payment, consent or error information.
- A quiet 240px sidebar at desktop, 72px rail at intermediate widths and navigation drawer on narrow screens. Exact breakpoints depend on measured content, not device names.
- Desktop may use list/calendar plus detail pane. Narrow view becomes agenda/list plus full-page or modal detail; never scale the full desktop calendar down to phone text sizes.
- Preserve flat page/data surfaces. Elevation belongs to menus, popovers, dialogs and temporary sheets. Avoid every KPI and record being a separate heavy rounded tile.

The purpose of these changes is a more comfortable touch rhythm and clearer component family, not a claim that larger radii inherently improve usability.

## Typography and Arabic extension

The source English UI is Sora only. The bundled Sora regular TTF cmap was inspected directly: 378 encoded codepoints; Latin A present; Arabic Alef and Seen absent. Arabic cannot be truthfully represented by claiming Sora support.

For bilingual components, the author selected `Noto Sans Arabic` Regular/SemiBold as an explicit companion family and verified those styles are available in Figma, while retaining Sora for Latin. This is a proposed extension, not a font supplied in the brand package. Rendered Arabic and bidi must still be inspected. Do not silently fall back, replace all English type, or stretch Arabic glyphs to mimic Sora.

Arabic uses zero tracking and expanded line height (at least 1.5, typically 1.6 for body). Mirror semantic reading order, navigation location and directional arrows; preserve logo, money/code identifiers, clock/calendar numerals and nondirectional medical/object icons. Isolate Latin patient IDs, phone numbers and currency/code sequences. The product configuration, rather than the font or component, controls locale digits, currency and clinic timezone.

## Color relationships and source contradictions

Source approved pair examples: white/slate primary action 10.76:1; slate/pink 8.338:1; gray.600/white 6.193:1; error text/error surface 5.892:1. Source prohibits white on pink at 1.29:1. These are source measurements, not full interface conformance.

The PDF says roughly 90% neutrals for operating screens. Pixilated's generic 70/20/10 ratio is a heuristic, not authority over supplied identity or semantic needs. Do not expand pink or dark surfaces to satisfy it. Mark a narrow brand-specific adaptation: neutral-dominant operational canvas, slate hierarchy/actions, pink selection/warmth, independent status colors. Client composition can use more breathing room while sharing these tokens.

The source aliases destructive hover to `color.pink.800`, a dark plum, although destructive rest is muted red. Preserve the source values for provenance; proposed v2 destructive hover/pressed use a dedicated darker error ramp so the meaning remains stable. This proposal must be reflected in both visual specimens and export, not silently renamed.

The source calls gray.200 decorative and gray.500 the control boundary. Keep this distinction in components. A prettier light hairline must not become the sole cue to a field, selected item or focus state. Focus and selection are independent visual states.

## Independent state model

The system must be able to present these facts separately. State lists are a design model, not a newly asserted clinic policy.

| Object | States / values | Separation rule |
| --- | --- | --- |
| Appointment | Draft, request pending, confirmed, in session, completed, canceled | Paid does not complete the appointment; past does not prove completion |
| Attendance | Not arrived, checked in, no-show | Check-in does not start care or confirm payment |
| Booking availability | Loading, available, unavailable, stale, conflict | Selecting a slot is not a verified reservation |
| Booking operation | Idle, submitting, result unknown, confirmed, failed | Timeout does not mean failure or safe resubmission |
| Balance | No charge, unpaid, part paid, paid | Balance is computed from authoritative invoice/payment facts |
| Payment transaction | Pending, succeeded, failed, result unknown | Failed transaction does not erase an existing successful payment |
| Refund | None, requested, pending, partial, refunded, failed, result unknown | Cancellation does not prove a refund or amount owed |
| Intake | Not started, in progress, submitted, needs review | Submission does not imply clinical review |
| Consent | Not requested, requested, signed, withdrawn, expired | Visibility/signature validity follows approved policy; do not infer consent |
| Clinical note | Draft, signed, amended | Appointment completion does not sign a note |
| Record access | Loading, allowed, denied, expired session | Do not reveal sensitive content under an inaccessible overlay |

State chips carry object-specific labels; a generic green `Done` chip is insufficient for appointment, payment and consent at once. Only allowed actions appear enabled; a visible explanation supports restricted actions. The shared component must not invent the role policy.

## Component architecture

Use semantic names and composable layers: Foundations → Controls → Navigation → Data/Feedback → Domain patterns → Role examples. Do not build one giant `Card` variant that tries to cover every task.

`component-contract.json` defines a complete proposed inventory, each component's purpose, variant/state coverage, content slots and interaction/accessibility responsibilities. Its `deliveryStatus` now records native build evidence separately from pending final visual acceptance. All 109 contract families and 108 browser-audit planning units maps to an actual native set or explicit composition in `build/component-families.json`. Required core/observed-source families are distinguished from proposed client/operational extensions.

Important compositions:

1. Reception: scheduler, appointment preview, patient search, new/rescheduled appointment, check-in, balance and payment capture/review. Appointment conflicts need an explicit alternative time; cancellation must preserve history and describe verified consequences.
2. Practitioner: today's agenda, patient context, intake/consent readiness, session controls, clinical note and follow-up. Keep finance details contextual, and distinguish clinical review from mere submission.
3. Manager: appointment/activity overview, service/pricing/duration management, practitioner availability, inventory alerts, team/permissions and reporting. Metrics require units, timeframe and denominator; no fabricated totals or claims.
4. Customer: service discovery, service and practitioner selection, date/time availability, guest/account details, booking review, pending/unknown/failure recovery, verified confirmation, appointment management and policy disclosure. Show known price, duration and clinic time; never use fabricated scarcity, testimonials or medical guarantees.

## Icon architecture

The proposed icon manifest is grouped by Navigation, Actions, Calendar/Booking, People/Care, Payments, Services/Inventory, Communication, Status/Security and Client comfort. Prefer one unambiguous metaphor per action. Icon-only actions receive text alternatives and keyboard-discoverable labels; decorative icons do not repeat the label to assistive technology.

Only navigation arrows, previous/next, undo/redo and logical-direction enter/exit mirror in RTL. Search, calendar, clock, user, stethoscope, card and logo do not. Tooltips do not contain essential booking, price or error information.

## Interaction requirements to carry into implementation

- Inputs retain values across failed saves and Back navigation; labels stay visible. Errors identify the field and correction.
- Loading preserves layout/action label and prevents duplicate submits. Result unknown offers authoritative status checking, not blind retry.
- Modal dialogs/sheets need initial focus, keyboard containment, Escape where cancellation is safe, and focus return; nonmodal docked panes do not trap focus.
- Search/filter feedback must announce zero/one/many results without moving focus. No-results offers clear filters, distinct from an empty database.
- Calendar event height represents duration; overlapping events split horizontally. A compact event still exposes full details on activation/focus.
- Multi-step booking validates before advancement, preserves previous entries, names the final action, and differentiates request receipt from confirmed booking.
- Sensitive attachments, reminders, refunds, medical claims, retention and cancellation rules remain consumer/policy responsibilities. The library provides truthful states, not invented policies.
- Motion uses source 120ms feedback, 180ms enter and 120ms exit, with reduced-motion equivalent. No dashboard entrance choreography or decorative motion.

## Checks performed and limits

Performed: source PDF extraction and section inspection; source overview visual inspection; actual SVG/source token inspection; Sora cmap inspection; token-source alias and contrast analysis; primary DTCG syntax inspection. Token aliases and mode parity were checked; all 32 component aliases resolve in both modes. Canonical 44 text styles were reconciled to the executed native v2 style definitions; original v1 roles remain in provenance. Actual native page ledgers report 114 component sets / 395 variants, each linked to the planning contract.

Not established by this analysis: current live-site behavior, actual Figma build/parity, Arabic font installation/rendering, browser/keyboard/screen-reader behavior of delivered components, regulatory/medical/privacy compliance, trademark clearance or user satisfaction. The live audit and final artifact review remain separate evidence.

The old PDF's example names, prices, counts, clinic timezone and currency are fictional fixtures. Preserve that label in any reference surfaces and never promote them into real patient data or hard-coded clinic defaults.

Current build reconciliation: all 12 rebuilt page ledgers were read after the semantic-icon/calendar corrections. All 114 native sets, 395 variants, 109 contract mappings and 108 audit mappings now reference the new set/default-variant IDs and component keys. Prior 391-variant records remain under `evidence/pre-rebuild`. Independent final visual acceptance is still pending; no runtime pass is inferred.
