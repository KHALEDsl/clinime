# Clinime — DESIGN.md

> Implementation reference for the clinic workspace and the client booking experience. Design-system snapshot: **4.0.0-design-refinement, 26 October 2026**. Documentation revised 27 October 2026. The native Figma files below are the design authority; this document translates them into buildable rules and identifies open decisions. It is not proof of production behavior, clinical policy, accessibility conformance or library publication.

## 1. Start here

Clinime is a clinic platform with connected, but distinct, experiences: an efficient workspace for reception, practitioners and managers, and a calm, reassuring journey for women choosing and managing appointments. Use **one visual language and two densities**, not two unrelated brands. Preserve the slate-and-blush identity and the cleaner v4 system. The two supplied prototype websites are discovery references, **not visual templates to copy**.

| Read first | Source | Use |
| --- | --- | --- |
| Foundations | [Clinime Foundations](https://www.figma.com/design/v9NxSvKhuMenLZMZI837rJ) | Brand, colors, type, spacing, layout, motion, RTL and token roles. |
| Icons | [Clinime Icons](https://www.figma.com/design/9fPYn0NQQvvtDj9dwLZ8Tb) | Icon families, sizes, source geometry and direction rules. |
| Components | [Clinime Components](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9) | Editable families, variants and application patterns for clinic and client. |
| Tokens | [`tokens/clinime-v2.css`](tokens/clinime-v2.css), [`tokens/typography.css`](tokens/typography.css), [`tokens/native-variable-contract.json`](tokens/native-variable-contract.json) | Exact exported CSS syntax, font styles and Figma-variable snapshot. |
| Component inventory | [`spec/native-component-properties.json`](spec/native-component-properties.json), [`build/component-families.json`](build/component-families.json) | Exact native names, variant names, properties, IDs and planning mappings. The catalog at the end of this document is an index. |
| Behavior and evidence | [`spec/component-contract.json`](spec/component-contract.json), [`evidence/revision-4-verification.md`](evidence/revision-4-verification.md) | Existing design contracts, review coverage and what was not verified. |
| Original identity | [`source/brand/`](source/brand/) | Original logo vectors, Sora files, brand guidance, licenses and source screens. |

The recorded system has **114 component families / 407 variants**, **158 icon families / 501 variants**, and **205 variables / 44 text styles per file**. Counts describe the recorded design snapshot, not production implementation coverage. The three files are editable but **unpublished**: their variable and icon copies are independent local mirrors. Editing one file does not automatically update the others. Publish/link and verify before claiming cross-file synchronization. Native Figma is the current visual source; the old ZIP and original construction scripts do not recreate every later Figma correction.

### When references disagree

- Approved source assets govern the logo and original brand anchors. The Figma library governs the current proposed UI composition, component states and variables.
- Product policy and authoritative service/API contracts govern permissions, booking availability, consent, payment, refund and retention; no visual state can invent or override those facts.
- This document explains how to use the system. If a current design, token export and implementation disagree, record the mismatch and affected consumers; do not silently substitute an older screenshot or rebuild the library from the historical ZIP.
- **Source-backed**: supplied mark, blush/slate anchors, Sora and the original light English design. **Design-system extension**: Arabic, dark mode, client booking patterns, proposed shell dimensions, logo minimum-size/clear-space rules and the interaction contracts identified below. **Not checked**: live service outcomes, production permission enforcement, complete responsive/RTL behavior, keyboard/assistive behavior and user acceptance.

## 2. Brand and composition

**Direction:** warmth through precision. Use a white-led canvas, slate structure, restrained blush, readable typography and quiet surfaces. Be personal and discreet without gender clichés, ornamental sparkles, a pink wash or claims about treatment results. Names, prices, availability and statuses lead over decoration.

- Clinime is the product brand. A clinic such as “Nothing Major” is an example tenant, not a replacement for the Clinime identity. Sample people, phone numbers, amounts and dates in the kit are fictional.
- Use the supplied original outlined SVG lockup and mark; preserve proportions and colors. Do not retype, distort, recolor, rotate or add effects. When the tenant has its own approved identity, show it in the workspace context without replacing Clinime.
- **Proposed guidance**, not a supplied identity requirement: start at 120 px for the lockup, 24 px for the mark and 32 px for the app icon; reserve at least ¼ of the mark height around the lockup. Verify legibility in the actual placement.
- Staff screens favor aligned columns, clear labels, stable table geometry and quick access to primary tasks. Client screens favor a single clear task per step, breathing room, clear service/time/price facts and understandable next actions.
- Use flat surfaces by default. Shadows/elevation belong to genuinely layered UI such as menus and dialogs, not every card. Preserve visual hierarchy with type, spacing, boundaries and semantic color.

## 3. Tokens: the decisions behind the UI

The token chain is **primitive value → semantic meaning → component role → use**. For example, the supplied slate feeds `color/action/primary`, which feeds `component/button/background`, then a primary button. Designers choose semantic roles in Figma; engineers use the corresponding exported CSS variables. A change to a bound variable updates its uses **within that file**; the other Figma files need an explicit sync until libraries are published and linked.

Use the [native variable contract](tokens/native-variable-contract.json) for all names, values, modes and CSS syntax. The following names exist in the supplied export; examples are defaults, not a substitute for reading theme values.

| Purpose | Figma variable | CSS syntax | Rule |
| --- | --- | --- | --- |
| Screen background | `color/bg/canvas` | `var(--cl-color-bg-canvas)` | Background behind panels and content. |
| Working surface | `color/bg/surface` | `var(--cl-color-bg-surface)` | Cards, controls and content planes. |
| Subtle surface | `color/bg/subtle` | `var(--cl-color-bg-subtle)` | Secondary grouping and read-only presentation where specified. |
| Selected surface | `color/bg/selected` | `var(--cl-color-bg-selected)` | Selected context; distinguish selection from keyboard focus. |
| Main / secondary text | `color/text/primary`, `color/text/secondary` | `var(--cl-color-text-primary)`, `var(--cl-color-text-secondary)` | Keep content legible on the actual surface in each theme. |
| Primary action pair | `color/action/primary`, `color/action/on-primary` | `var(--cl-color-action-primary)`, `var(--cl-color-action-on-primary)` | Use as a paired background/foreground. |
| Input boundary | `color/border/control` | `var(--cl-color-border-control)` | Input boundary, not the weaker decorative divider. |
| Focus | `color/focus/ring`, `stroke/focus`, `focus/offset` | `var(--cl-color-focus-ring)`, `var(--cl-stroke-focus)`, `var(--cl-focus-offset)` | 2 px ring and 2 px offset; keep the ring visible. |
| Component aliases | `component/button/background`, `component/field/border`, `component/card/radius` | `var(--cl-component-button-background)`, `var(--cl-component-field-border)`, `var(--cl-component-card-radius)` | Prefer the component alias where it is defined. |

### Color and themes

- Preserve original brand **blush `#FFD8EB`** and **slate `#2D3E5B`**. The semantic layer supplies neutral surfaces, action states, status colors and dark-mode values. Avoid hard-coded one-off colors in components.
- Slate establishes hierarchy and primary actions in light mode; blush is a welcoming or selected accent. Do not set white text on the supplied blush; use a verified dark foreground.
- Confirmed appointment, active session, completed/canceled history, payment and inventory each require their own text labels and appropriate status pair. Color is additional information, never the only indication of state.
- Source light is the initial brand baseline. Dark is a **proposed extension**, not original brand approval. The export scopes dark to `[data-theme="dark"]`; do not assume one mode has been tested merely because token aliases exist.
- The recorded contrast table tested 44 supplied pairs; test the actual foreground/background, focus and control boundaries in context. A passing token pair alone does not certify the rendered task. See [W3C WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/).

### Spacing, shapes and targets

| Token | Value | Typical use |
| --- | ---: | --- |
| `space/4`, `space/8`, `space/12` | 4, 8, 12 px | Small relationships, icon/label gaps and selection-row breathing room. |
| `space/16`, `space/24`, `space/32` | 16, 24, 32 px | Between controls, panel inset and section separation. |
| `space/40` … `space/96` | 40–96 px | Larger layout and section rhythm, not arbitrary isolated gaps. |
| `radius/4`, `radius/8` | 4, 8 px | Small detail; regular controls. |
| `radius/12`, `radius/16` | 12, 16 px | Cards/popovers; dialogs and larger client surfaces. |
| `height/compact`, `height/control`, `height/comfortable` | 36, 44, 48 px | Dense visual control, standard control, comfortable touch control. A compact visual control needs an adequate separate hit area. |
| `stroke/default`, `stroke/focus` | 1, 2 px | Standard outline and visible focus. |

Use the 4 px increment consistently. Figma applies **60% corner smoothing** to rounded components for the selected continuous Apple-inspired curve. A CSS `border-radius` alone is not guaranteed to reproduce that exact Figma curve on every platform; compare the implemented shape to the actual design at its rendered size. Do not turn every control into a pill. Avatars and deliberate capsule elements can be fully round.

Checkbox/radio visuals live inside a labeled target; use 12 px horizontal inset in the illustrated selection row, keep the label/control gap clear and do not clip the external focus ring. The OTP specimen uses six **44 px** cells, **12 px** gaps and **8 px** side insets. The minimum target, focus visibility and exceptions must be tested in the real interface; these product choices are not a claim of WCAG conformance.

### Client mobile visual profile (adopted)

The native `nativeClientMobileCraft` collection records a client-mobile profile: 18 px controls, 24 px cards, 28 px sheets, 24 px page gutters, 8 px between related elements, 32 px between sections, and a 1 px `#E5E7EB` interactive control boundary where needed. This scoped profile does not alter shared operational tokens; the radius values are Clinime choices, not universal Apple HIG prescriptions. Favor one primary task and one dominant primary action per screen, preserving necessary secondary and recovery actions. Use 20/24 px icons within at least 44 × 44 px targets; maintain accessible names and visible focus. Preserve the supplied Clinime logo, slate, blush, Sora and Noto Sans Arabic. Test boundaries, focus, RTL and real content in the actual implementation.

### Typography

| Role | Size | English line height | Arabic line height | Typical use |
| --- | ---: | ---: | ---: | --- |
| Caption | 12 | 18 | 20 | Short metadata, not required consent, payment or errors. |
| Supporting | 13 | 20 | 22 | Secondary helper information. |
| Label | 14 | 22 | 24 | Buttons, fields, table labels, compact work. |
| Body | 16 | 24 | 26 | Main content, explanations, booking details. |
| Subheading | 18 | 28 | see export | Group titles. |
| Section / title | 20 / 24 | 30 / 36 | see export | Section hierarchy and page titles. |
| Page / metric / display / client display | 28 / 32 / 36 / 40 | 42 / 48 / 54 / 60 | see export | Major page hierarchy, metrics and client editorial emphasis. |

- **Sora** is the supplied Latin/English brand font. **Noto Sans Arabic** is the chosen Arabic companion, a design-system extension; do not call an Arabic fallback Sora. The native text styles use Regular 400 and SemiBold 600; the source also supplies Sora 500 and 700.
- Use the exact line heights, weights and tracking in [`tokens/typography.css`](tokens/typography.css); Arabic uses 0 tracking and taller line boxes. English sizes 28 px and above use −0.7 px tracking in this snapshot. Do not squeeze Arabic into the English line height.
- Load the actual font files and license with the implementation; CSS paths in the export are relative to `tokens/`. Allow for fallback loading and wrapping. Use tabular figures for dense times, money and counts where supported.
- Use 12 px sparingly for brief metadata, not essential consent, payment, error or recovery instructions. Never shrink text merely to preserve a desktop arrangement.

### Responsive layout and layers

The export defines `breakpoint/phone = 640`, `breakpoint/drawer = 960`, `breakpoint/rail = 1200`, `width/sidebar = 240`, `width/rail = 72`, `width/panel = 380`, `width/form = 640`, `width/container = 1440` px. These are **design-system guidance**, not proof of a specific app's responsive implementation. The original brand reference used a 232 px sidebar and 72 px header; the proposed operational shell is 240 px sidebar and 64 px header.

| Available width | Staff experience | Client experience |
| --- | --- | --- |
| ≥1200 px | Sidebar, main list/calendar and contextual panel where content fits; preserve independent scrolling and visible context. | Centered content, clear summary and optional side-by-side review when genuinely useful. |
| 960–1199 px | Collapse to a 72 px rail where appropriate; allow the main task to retain usable width. | Keep form/readable content width bounded; don't expand inputs indefinitely. |
| 640–959 px | Use a drawer or reflowed navigation; stack details as needed. | Reflow cards and step content; preserve readable labels and actions. |
| <640 px | Agenda/list first and stacked detail; navigation adapts to the actor/task. | One-column flow, sufficiently sized controls and actions, no squeezed desktop calendar. |

Use content-driven breakpoints when content requires earlier reflow; width labels do not justify overflow. Tables/calendars may scroll locally only when truly two-dimensional; the entire page should not scroll sideways. Keep sticky actions clear of focused content, software keyboards and safe areas. Test one desktop, one intermediate and one narrow width with realistic and long content.

Layer tokens: `layer/base 0`, `sticky 20`, `popover 30`, `backdrop 40`, `dialog 50`, `toast 60`, `tooltip 70`. Scope stacking contexts deliberately; do not place a toast behind a modal or make a popover escape its clipping container.

### Motion

Use motion to show feedback and spatial continuity, not as decoration or an indication of confirmed medical/payment outcomes. Tokens: `motion/fast-ms = 120`, `motion/enter-ms = 180`, `motion/exit-ms = 120`; `--cl-motion-ease = cubic-bezier(.2,0,0,1)` is the **single easing exported in CSS**. Foundations illustrates a proposed exit curve `cubic-bezier(.4,0,1,1)`, but it is **not a separate exported token**; do not silently claim parity. Resolve and synchronize a separate token before treating that proposed curve as canonical.

- Controls respond immediately; hover/focus color or border changes settle around 120 ms without moving the hit target. Panel entry can use opacity and up to 8 px movement over 180 ms; exit returns toward the origin over 120 ms.
- Interruption starts from the current visual state. A dismissible modal returns focus to its trigger. Respect reduced motion with an immediate or non-spatial equivalent that retains status, context and focus.
- The Foundation timelines and before/after examples are static specifications, not evidence that animations or reduced-motion behavior have been implemented.

## 4. Component contract

Use the native family and existing properties first. Select a variant for a meaningful state, expose text through its existing text property, and swap a semantic icon where supported. Do not assume every visual state is an executable interaction or that a component controls application authorization. Native Figma property keys are file-specific; do not use them as a guessed production API.

| Family | Use and critical rules | States / gaps |
| --- | --- | --- |
| `Button`, `IconButton`, `TextLink` | One primary action per decision area; use secondary/quiet actions for alternatives. Center content, preserve padding and action label, provide accessible name for icon-only actions. Disable only when necessary and explain recovery. Pending retains layout and blocks repeated requests only as a UI measure. | `Button`: Primary, Secondary, Quiet, Danger × Default/Hover/Pressed/Focus/Disabled/Pending. `IconButton`: Default/Focus/Disabled. `TextLink`: Default/Hover/Focus. |
| Text, phone, amount, number, date, time, search, select, combobox, textarea | Persist labels and entered values. Associate helper/error text with the control. Use exact format and validation supplied by the service; support empty, focus, invalid, disabled/read-only where the applicable family provides them. Search has distinct searching/no-results/recovery; combobox distinguishes no match and missing record. | The 12 newly added focus variants are in the native sets; an implemented field still needs combined state checks (e.g. invalid + focus) and long-value reflow. |
| `OtpInput` | Treat one code as one logical accessible field even if drawn as six cells; support paste, keyboard navigation and retained context. Focus the active cell with an unclipped ring. | Empty/Filled/Invalid/Expired/Focus exist. **Verifying, rate-limited and delivery failure are not native variants**; define them before implementing a real verification service. |
| `FileUpload` | Present file requirements before selection, expose selected/uploading/error, preserve context and announce status. Do not claim an upload is complete without a confirmed result. | Empty/Selected/Uploading/Invalid/Focus exist; transfer failure, unknown result and retry contract are not drawn. |
| `Checkbox`, `RadioGroup`, `Switch`, `SegmentedControl` | Checkbox includes an actual mixed/indeterminate mark; radio focus identifies the focused option. Use a switch for an immediately applied on/off preference, not for final consent or submitting a form. Keep focus separate from selection; state change needs a visible label. | Checkbox Unchecked/Checked/Indeterminate/Focus/Disabled/Invalid; Radio Unselected/Selected/Focus/Disabled; Switch Off/On/Focus/Disabled. SegmentedControl draws Day/Week/Month; focus and full RTL interaction need implementation verification. |
| Navigation | Use `AppSidebar`, `NavItem`, `TopBar`, `Tabs`, `Breadcrumb`, `Pagination`, `Stepper` and `BottomNavigation` by actor and width. Page titles, status and controls must remain in their surfaces. Pagination describes the actual range; first/last unavailable actions are visually disabled. | Native variants are visual examples; role permissions and destination availability must be authoritative. |
| Feedback and overlay | Use `InlineAlert` for contextual persistent issues, `Toast` for brief noncritical feedback, `ErrorState` for failed loads, `UnknownState` for an unresolved result, and `PermissionState` for a denied or expired session. Dialogs identify object and consequence; drawers and popovers stay anchored to their trigger. | Search no-results ≠ filtered no-results ≠ empty collection. A payment/booking unknown is not failure. Modal focus handling and assistive announcements require implementation. |
| Data and status | `DataTable`, `TableRow`, `DescriptionList`, `Metric`, `Chart`, `Timeline`, `StatusChip` and `Badge` display source-backed values, units, dates and status. Keep appointment, payment and clinical states separate. Use `—`, “unknown”, “not applicable” and restricted only for their actual meanings. | Month chart uses five labeled week groups; charts are sample data, not live analytics. Do not invent counts or values. |
| Scheduling and booking | Use `CalendarToolbar`, `CalendarGrid`, `AgendaRow`, `CalendarEvent`, `DatePicker`, `TimeSlot`, `AppointmentPreview`, `BookingRequest`, `BookingReview`, `RescheduleReview`, `CancellationReview` and client-facing cards. Prefer a non-drag alternative to calendar gestures. | Stale/conflict/unknown states need the real availability and operation contract. |
| Clinical and operations | `PatientSummary`, `ClinicalReview`, `MedicalRecord`, `SessionControl`, `ClinicalNote`, `ConsentSummary`, `TreatmentConsumption`, `ServiceOutcome`, `StockRow`, `WorkSchedule` and `StaffPermissions` make authority and restrictions visible. | Visual restriction does not enforce permissions. Expired stock remains unavailable even when quantity is positive; clinical review and signed consent are separate facts. |
| Commerce | `BalanceSummary`, `PaymentMethod`, `PaymentCapture`, `InvoiceSummary`, `RefundReview`, `FinancialRecordRow` and `Discount` separate payment, invoice and refund. Cash and transfer do not use a card-specific icon. Restricted or unresolved refund values are visually read-only. | `PaymentCapture` has Ready/Pending/Unknown/Failed; paid balance is represented separately. Never infer settled/refunded from a click or timeout. |
| Client booking | `ServiceCard`, `PractitionerCard`, `BookingProgress`, `AvailabilityPanel`, `BookingDetailsForm`, `PolicyDisclosure`, `BookingOutcome`, `MyAppointment`, `ClinicContact`, `ClientReceipt`, `IntakeReadiness` support the proposed client journey. | `BookingOutcome` draws RequestReceived/Confirmed/Unknown/Failed; a pending-payment outcome is not drawn. `MyAppointment` draws Upcoming/Pending/Completed; canceled/restricted examples are not native variants. |

The complete family/variant index is in §11 and [native Figma Components](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9). **A variant label is a visual example, not an API enum.** Add only justified combinations; if a required state is not in Figma, design it or compose it from shared primitives and record the decision before implementation.

## 5. Staff journeys and interaction truth

### Reception: find, book and manage

Compose `AppSidebar` + `TopBar` → `CalendarToolbar`/`CalendarGrid` or `AgendaRow` → `AppointmentPreview` → `ServicePicker`/`BookingReview`. Show patient, service, practitioner, clinic-local date/time and actual booking status before commitment. A selected time is a choice, not a reservation. The availability service owns slot freshness; recheck the selected slot before submission and after a stale/conflict response. Preserve form values if another time must be chosen.

For reschedule/cancellation, show the actual appointment and policy facts before the consequential action. `RescheduleReview` separates Ready/PolicyReview/Unknown; `CancellationReview` separates Ready/RefundReview/Unknown. In Unknown, offer Back and Check status; do not promise that the appointment was kept or canceled. A cancellation is not a confirmed refund or message. Do not invent fees, cutoff times, consent, send status or support contacts.

### Practitioner: review, perform and document

`PatientSummary`/`ClinicalReview`/`MedicalRecord` → `SessionControl` → `TreatmentConsumption`/`ServiceOutcome` → `ClinicalNote`, `ConsentSummary`, `Aftercare`. Administrative views do not expose restricted clinical records. A practitioner/authorized clinical policy owns clinical decisions; the server owns permission enforcement. Intake submitted ≠ reviewed; clinical review ≠ signed consent; a completed session ≠ signed note, fulfilled treatment or paid balance. Show partial/deferred service scope explicitly; verify expiry and availability before consumption.

### Manager: inventory, operations and financial truth

Use `ServiceEditor`, `BookingPolicies`, `WorkSchedule`, `StaffPermissions`, `SupplyCard`, `StockRow`, `VariantCount`, `StockHistory`, `BalanceSummary` and `FinancialRecordRow`. Show item identity, current and counted quantities, difference, expiry and a supplied reason. A positive quantity does not make expired stock usable. A schedule conflict should lead to **Review conflict**, not silently save or promise an override. Permission editing must reflect actual role and server enforcement; an unchecked UI control alone is not a policy.

For payment/refund: display the operation reference and amount/currency, preserve the distinction between recorded payment, amount due, payment settlement and invoice status. In Pending or Unknown, keep submitted refund details read-only and offer the supported status check; check the original transaction before any retry. `PaymentCapture` itself has no Paid variant; use the authoritative balance or invoice state once verified. There is no proven payment gateway, refund API, messaging provider or server persistence in the prototype evidence.

## 6. Client booking and appointment management

Use a clear sequence: **service → practitioner where applicable → date/time → details → policy/review → submission → truthful outcome → appointment management**. The exact number of steps and identity requirements remain product decisions; the visual `BookingProgress` is an example, not a promise that every clinic uses exactly three steps.

1. **Choose service:** `ServiceCard` shows the actual treatment name, duration, price or “from” price only if supplied. Unavailable options explain the next useful action; do not imply a medical outcome or guaranteed result.
2. **Choose practitioner and availability:** `PractitionerCard` + `AvailabilityPanel`/`TimeSlot`. Available, None and Stale are different; Stale must prompt a refresh and prevent assuming the old slot remains bookable. Display the configured clinic timezone and localizable date/time.
3. **Enter details:** `BookingDetailsForm` asks for fields supported by product policy. Show labels and optionality, retain entered values on error, and isolate phone numbers/IDs in RTL. Do not invent a verification, storage or consent requirement.
4. **Review:** Show exact service, practitioner, date, price, applicable terms and acknowledgement before confirming. `PolicyDisclosure` represents display/acknowledgement, not evidence of legally valid consent. Actual clinic policies and cancellation/refund terms must be supplied and versioned.
5. **Submit and recover:** `BookingOutcome` has RequestReceived/Confirmed/Unknown/Failed. RequestReceived means received; only the booking authority can confirm. Unknown means check the original operation before retrying; Failed requires evidence of failure. A pending-payment state and its recovery need a design/API decision.
6. **After booking:** `MyAppointment` is the starting point for an actual supported change, cancellation or receipt. Eligibility, cancellation policy, fees, notification and refund are open policy/service decisions. `IntakeReadiness` displays NotStarted/Submitted/Reviewed; submitted information is not clinical review or signed consent.

### State and recovery reference

| Trigger | Show | Action | What establishes the fact |
| --- | --- | --- | --- |
| Slot no longer current | Availability stale / conflict, selected context retained | Refresh availability or choose a different time | Current availability source; do not assume a stale slot is held. |
| Booking submitted | Pending/request received where actually supported | Wait or inspect status | Request acknowledgement establishes receipt, not confirmation. |
| Booking response unknown | Unknown with operation reference if available | Check original status; avoid duplicate submission | Booking system reconciliation or an authorized support process. |
| Payment/refund unresolved | Pending or Unknown, submitted fields read-only | Check original operation status | Payment/refund authority and reference. Timeout does not establish failure or safe retry. |
| Validation rejected | Field errors plus summary where helpful; preserve valid input | Correct named fields | Client/server validation result; keep them distinct. |
| Permission denied/session expired | Specific permitted recovery without revealing restricted data | Return, reauthenticate or contact an authorized owner where supported | Identity/authorization authority, not a hidden button. |
| Connection/load failure | Relevant error and preserved context | Retry a safe read or follow a supported recovery path | Actual result; a failed read is not evidence that a previous write failed. |

## 7. Arabic, English and content

Use natural Arabic and English with the same meaning, severity, amounts, dates, selected options and recovery. Arabic is a designed extension that needs full implementation verification, not an automatically mirrored English screenshot. Set page direction and language correctly; use logical CSS properties such as `margin-inline`, `padding-inline`, `inset-inline` and `text-align: start/end`.

- Mirror logical back/forward navigation, directional chevrons, progress order, sidebar placement and source-anchored transitions as appropriate. Keep brand logos, physical/clinical objects, clocks and culturally neutral non-directional symbols unchanged. Use the icon library's LTR/RTL variants; check the actual metaphor, not the arrow shape alone.
- Isolate mixed-direction phone numbers, record references, Latin names and currency values (`<bdi>` or equivalent). Do not reverse digits or identifiers. Format dates, numbers, plurals, timezones and currency using the user's locale plus the clinic's configured timezone. Store authoritative timestamps and monetary values without relying on visual string formatting.
- Let translated labels, patient names, error messages and policy text grow; support wrapping and ensure focus/controls remain visible. Test mixed Arabic/English content, long names, missing values and empty states.
- Keep voice warm, clear and precise. Prefer “Check booking status” / «تحققي من حالة الحجز» for a client-facing unresolved outcome. Avoid “Your appointment is confirmed” / «تم تأكيد موعدك» until the authoritative status is confirmed. These are proposed examples, not final approved strings or evidence of translation testing.
- Distinguish an empty collection, search with no match, filters with no match, restricted data, pending, failure and unknown. State what the person can do next. Do not invent provider credentials, guarantees, testimonials, clinical claims, contact information, fees or support times.

## 8. Icons, assets and accessibility

Use the supplied [Lucide source pack](source/icons/) and preserve its license. There are 158 unique names; use the library's 16/20/24 px variants and the 24-unit grid. The supplied master geometry has 2-unit source stroke with round caps/joins. Retain vector geometry and transparent fills; choose a semantic foreground. Do not redraw logos or mix unrelated icon styles in a single navigation area. Directional icons have distinct LTR/RTL variants where the meaning calls for it.

Name icon-only actions; pair unfamiliar metaphors with text; mark decorative icons appropriately in implementation. Required price, error, policy or appointment information cannot live only in an icon or tooltip. Preserve the original SVG/font licenses with exports.

Build with appropriate native semantic elements, labels, field/error associations, visible keyboard focus and predictable tab order. Modal dialogs require appropriate focus entry, containment and restoration; a docked nonmodal panel does not trap focus. Do not rely solely on color, hover, motion, drag or a disappearing toast for essential information. For exact conformance decisions use [WCAG 2.2](https://www.w3.org/TR/WCAG22/); the system's 44/48 px targets and 2 px focus ring are product rules, not proof that a particular task passes every criterion.

## 9. Implementation and quality checks

### Use the exports

```css
/* Resolve paths relative to this DESIGN.md package or adapt them to your app. */
@import url("./tokens/clinime-v2.css");
@import url("./tokens/typography.css");

.clinime-button {
  min-height: var(--cl-component-button-height);
  padding-inline: var(--cl-component-button-padding);
  color: var(--cl-component-button-foreground);
  background: var(--cl-component-button-background);
  border-radius: var(--cl-component-button-radius);
}
.clinime-button:focus-visible {
  outline: var(--cl-stroke-focus) solid var(--cl-color-focus-ring);
  outline-offset: var(--cl-focus-offset);
}
```

This example shows token use only. The consuming app must supply semantic HTML, disabled/pending behavior, focus contrast and a treatment for long labels; CSS radius is not an exact replacement for Figma corner smoothing. For JSON-based token tooling, merge [`global.tokens.json`](tokens/global.tokens.json), the applicable [`light.tokens.json`](tokens/light.tokens.json) or [`dark.tokens.json`](tokens/dark.tokens.json), and [`component.tokens.json`](tokens/component.tokens.json). These exports are DTCG-style; validate compatibility with the chosen importer rather than assuming every tool accepts them. The [DTCG format report](https://www.designtokens.org/TR/2025.10/format/) is a community report, not a W3C Recommendation.

### Before marking a screen ready

For the actual build/version, record pass/fail/not checked for:

1. **Fidelity:** correct source logos, type, semantic colors, size/spacing, component states, light/dark where in scope, and actual Figma references.
2. **Responsive:** desktop/intermediate/phone with real and long content, scroll ownership, sticky actions, visible focus, keyboard and safe-area behavior.
3. **State truth:** primary task, empty, validation, pending, explicit failure, unknown/partial, permission restriction and supported recovery; check the authoritative result rather than the click.
4. **Content and locale:** Arabic and English parity, RTL order, mixed-direction identifiers, locales/timezones, currency, long and empty values; verify text isn't clipped or misleading.
5. **Input/access:** names, semantics, tab/focus order, modal exit/restore, target sizes, error associations and announced status, including a non-drag alternative where relevant.
6. **Motion:** purpose, timing, interruption, origin and reduced-motion equivalent in the actual implementation.
7. **Data/security:** actual API contracts, server authorization, freshness/concurrency, safe retry/reconciliation, persistence and supported support path. Do not expose real patient data in screenshots/fixtures.

**Open dependencies:** clinic-approved pricing, booking/cancellation/refund/deposit policies and eligibility; privacy/retention and consent text; actual role permissions; identity and verification flows including OTP limits; authoritative availability, payment, refund and notification services; safe retry/idempotency/status checks; production storage, supported contact and support routes. Owners are the relevant product/clinic, clinical, security and service teams; named owners were not supplied. Keep these open until supplied—visual design does not decide them.

## 10. Evidence, governance and maintenance

The v4 review recorded all 407 default variant instances against their masters for text and visible nested icon identity, 501 icon variants for bounds/cross-size geometry, and 158 24 px source comparisons. Twelve Foundations pages and all component family pages received page-scale visual review with focused rechecks. See [`evidence/revision-4-verification.md`](evidence/revision-4-verification.md) and [`evidence/review-icons-v3.md`](evidence/review-icons-v3.md). These checks do **not** establish cross-platform pixel identity, production interaction, complete RTL/long-content behavior, real payment/booking outcomes, assistive operation or user testing.

When a token, component or state changes: identify actual consumers; update the native library, token source/export and relevant contract; compare local mirrors while unpublished; recheck affected themes, languages and tasks; document new/removed/breaking API and migration needs. Preserve identity assets, licenses, source evidence and user content. Do not regenerate the live library from legacy scripts expecting an exact v4 clone. Historic review artifacts and ZIP remain historical, not the current source of truth.

## 11. Native component catalog

The following index is generated from the delivered native registry. A family links to its editable Figma component set. State names describe **what is drawn**, not all supported runtime combinations. Consult [`spec/native-component-properties.json`](spec/native-component-properties.json) for exact exposed properties and IDs. The explicit gaps in §4 and §6 remain open even when a neighboring state exists.

### 01 Actions

| Native family | Drawn states |
| --- | --- |
| [Button](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=14-4637) | `Default`, `Hover`, `Pressed`, `Focus`, `Disabled`, `Pending` |
| [IconButton](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=14-4658) | `Default`, `Focus`, `Disabled` |
| [TextLink](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=14-4678) | `Default`, `Hover`, `Focus` |
| [MenuItem](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=14-4703) | `Default`, `Selected`, `Disabled` |

### 02 Forms

| Native family | Drawn states |
| --- | --- |
| [TextInput](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-4571) | `Empty`, `Filled`, `Focus`, `Invalid`, `Disabled`, `ReadOnly` |
| [TextArea](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-4588) | `Empty`, `Filled`, `Invalid`, `Focus` |
| [SearchField](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-4658) | `Empty`, `Query`, `Searching`, `NoResults`, `Focus` |
| [Select](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-4707) | `Empty`, `Selected`, `Open`, `Invalid`, `Disabled`, `Focus` |
| [Combobox](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-4775) | `Empty`, `Selected`, `Open`, `NoResults`, `MissingRecord`, `Focus` |
| [PhoneField](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-4804) | `Empty`, `Filled`, `Invalid`, `Focus` |
| [AmountField](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-4821) | `Empty`, `Filled`, `Invalid`, `Focus` |
| [NumberField](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-4856) | `Empty`, `Filled`, `Invalid`, `Focus` |
| [DateField](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-4897) | `Empty`, `Filled`, `Invalid`, `Focus` |
| [TimeField](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-4930) | `Empty`, `Filled`, `Invalid`, `Focus` |
| [ColorInput](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-4965) | `Default`, `Custom`, `Invalid`, `Focus` |
| [FileUpload](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-5050) | `Empty`, `Selected`, `Uploading`, `Invalid`, `Focus` |
| [OtpInput](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-5127) | `Empty`, `Filled`, `Invalid`, `Expired`, `Focus` |
| [FormActions](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-5173) | `Clean`, `Dirty`, `Pending`, `Error`, `Unknown` |

### 03 Selection

| Native family | Drawn states |
| --- | --- |
| [Checkbox](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-5638) | `Unchecked`, `Checked`, `Indeterminate`, `Focus`, `Disabled`, `Invalid` |
| [RadioGroup](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-5675) | `Unselected`, `Selected`, `Focus`, `Disabled` |
| [Switch](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-5697) | `Off`, `On`, `Focus`, `Disabled` |
| [SegmentedControl](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-5722) | `Day`, `Week`, `Month` |
| [Tag](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-5740) | `Default`, `Selected`, `Removable` |
| [MultiSelect](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-5772) | `Empty`, `Selected`, `Invalid` |

### 04 Navigation

| Native family | Drawn states |
| --- | --- |
| [NavItem](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-5965) | `Default`, `Active`, `Focus` |
| [AppSidebar](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-6147) | `Doctor`, `Reception`, `Manager` |
| [TopBar](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-6188) | `Default`, `Notification`, `Search` |
| [Tabs](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-6222) | `Overview`, `History`, `Payments` |
| [Breadcrumb](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-6240) | `Default`, `Compact` |
| [Pagination](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-6262) | `First`, `Middle`, `Last` |
| [Stepper](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-6305) | `Patient`, `Service`, `Review` |
| [BottomNavigation](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-6376) | `Explore`, `Appointments`, `Account` |
| [AccountMenu](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-6446) | `Doctor`, `Reception`, `Language` |
| [NotificationMenu](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-6479) | `Unread`, `Read`, `Empty` |
| [Accordion](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-6496) | `Closed`, `Open` |
| [SectionHeader](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-6509) | `Default`, `WithAction` |

### 05 Feedback

| Native family | Drawn states |
| --- | --- |
| [InlineAlert](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-7119) | `Info`, `Success`, `Warning`, `Error` |
| [Toast](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-7151) | `Saved`, `Undo`, `Error` |
| [EmptyState](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-7199) | `Calendar`, `History`, `Services` |
| [NoResults](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-7222) | `Search`, `Filters` |
| [Skeleton](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-7281) | `List`, `Card`, `Calendar` |
| [Progress](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-7294) | `Indeterminate`, `Determinate`, `Complete` |
| [ErrorState](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-7325) | `Load`, `Save`, `Offline` |
| [UnknownState](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-7353) | `Booking`, `Payment`, `Stock` |
| [PermissionState](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-7385) | `Restricted`, `Denied`, `SessionExpired` |
| [FormErrorSummary](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-7405) | `OneError`, `SeveralErrors` |

### 06 Overlays

| Native family | Drawn states |
| --- | --- |
| [Dialog](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-7746) | `Confirmation`, `Destructive`, `Form` |
| [Drawer](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-7794) | `Appointment`, `Messages` |
| [DropdownMenu](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-7859) | `Actions`, `Filters` |
| [Tooltip](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-7864) | `Action`, `Explanation` |
| [Popover](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-7898) | `Filter`, `Date` |

### 07 Data Display

| Native family | Drawn states |
| --- | --- |
| [Avatar](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-8160) | `Initials`, `Fallback`, `Group` |
| [Badge](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-8170) | `Count`, `Unread`, `Neutral` |
| [StatusChip](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-8207) | `Confirmed`, `InSession`, `Completed`, `Pending`, `CheckedIn`, `Unpaid`, `Paid`, `LowStock`, `Expired`, `Unknown`, `Canceled`, `NoShow` |
| [TableRow](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-8260) | `Default`, `Selected`, `Editable` |
| [DataTable](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-8307) | `Ready`, `Empty`, `Loading` |
| [Metric](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-8324) | `Revenue`, `Collected`, `Balance`, `Missing` |
| [Chart](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-8384) | `Week`, `Month`, `Empty` |
| [Timeline](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-8441) | `Activity`, `History`, `Empty` |
| [DescriptionList](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-8472) | `Appointment`, `Payment`, `Patient` |

### 08 Scheduling

| Native family | Drawn states |
| --- | --- |
| [CalendarToolbar](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-8832) | `Day`, `Week`, `Month` |
| [CalendarEvent](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-8859) | `Confirmed`, `InSession`, `Completed`, `Pending`, `Conflict`, `Compact`, `PastReview`, `Canceled`, `NoShow` |
| [CalendarGrid](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-9005) | `Day`, `Week`, `Month` |
| [AgendaRow](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-9036) | `Upcoming`, `InSession`, `Completed` |
| [DatePicker](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-9349) | `Default`, `Selected`, `Unavailable` |
| [TimeSlot](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-9359) | `Available`, `Selected`, `Unavailable`, `Stale` |
| [AppointmentPreview](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-9423) | `Confirmed`, `InSession`, `Restricted` |
| [BookingRequest](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-9506) | `Pending`, `DepositDue`, `Conflict` |
| [AttendanceControl](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-9531) | `NotArrived`, `CheckedIn`, `NoShow` |
| [BlockedTime](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-9603) | `Saved`, `Draft`, `Conflict` |
| [ServicePicker](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-9660) | `Selected`, `VariantRequired`, `Conflict` |
| [BookingReview](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-9744) | `Ready`, `Conflict`, `Unknown` |
| [RescheduleReview](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-9804) | `Ready`, `PolicyReview`, `Unknown` |
| [CancellationReview](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-9867) | `Ready`, `RefundReview`, `Unknown` |

### 09 Clinical Care

| Native family | Drawn states |
| --- | --- |
| [PatientSummary](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-10640) | `Administrative`, `Clinical`, `Restricted` |
| [ClinicalReview](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-10734) | `NeedsReview`, `Reviewed`, `Blocked` |
| [MedicalRecord](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-10794) | `Summary`, `History`, `Restricted` |
| [SessionControl](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-10845) | `Ready`, `Active`, `Blocked`, `Complete` |
| [ClinicalNote](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-10894) | `Draft`, `Saved`, `Signed` |
| [ConsentSummary](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-10941) | `Requested`, `Signed`, `Expired` |
| [TreatmentConsumption](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-11048) | `Expected`, `Adjusted`, `Insufficient`, `Expired` |
| [ServiceOutcome](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-11093) | `Delivered`, `Partial`, `Deferred` |
| [Aftercare](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-11131) | `Instructions`, `FollowUp`, `NotRequired` |
| [MessageComposer](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-11204) | `Draft`, `Sending`, `SentDemo`, `Failed` |

### 10 Commerce

| Native family | Drawn states |
| --- | --- |
| [PriceLine](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-11659) | `Fixed`, `From`, `Total` |
| [BalanceSummary](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-11719) | `Unpaid`, `PartPaid`, `Paid` |
| [PaymentMethod](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-11750) | `Card`, `Cash`, `Transfer` |
| [PaymentCapture](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-11879) | `Ready`, `Pending`, `Unknown`, `Failed` |
| [InvoiceSummary](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-11965) | `Issued`, `PartPaid`, `Paid` |
| [RefundReview](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-12093) | `Eligible`, `Pending`, `Unknown`, `Restricted` |
| [FinancialRecordRow](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-12131) | `Earned`, `Deposit`, `Refund` |
| [Discount](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-12178) | `None`, `Applied`, `Restricted` |

### 11 Inventory & Admin

| Native family | Drawn states |
| --- | --- |
| [SupplyCard](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-12604) | `Consumable`, `Equipment` |
| [StockRow](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-12658) | `InStock`, `Low`, `Expiring`, `Expired` |
| [VariantCount](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-12757) | `Empty`, `Counted`, `Variance` |
| [StockHistory](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-12822) | `Recorded`, `Undoable`, `Reversed` |
| [WorkSchedule](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-12940) | `Working`, `Closed`, `Conflict` |
| [StaffPermissions](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-13051) | `Allowed`, `Restricted`, `Dirty` |
| [ProfileForm](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-13115) | `Doctor`, `Clinic` |
| [BookingPolicies](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-13184) | `Deposit`, `Cancellation`, `Schedule` |
| [DataBackup](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-13252) | `Local`, `Exporting`, `Ready`, `Error` |
| [ServiceEditor](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-13390) | `Details`, `Variants`, `Prerequisites`, `Category`, `Package` |
| [NotificationPreferences](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-13449) | `On`, `Off`, `Unsupported` |

### 12 Client Booking

| Native family | Drawn states |
| --- | --- |
| [ServiceCard](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-14091) | `Default`, `Selected`, `Unavailable` |
| [PractitionerCard](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-14124) | `Available`, `Selected`, `Unavailable` |
| [BookingProgress](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-14155) | `Service`, `Time`, `Review` |
| [AvailabilityPanel](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-14229) | `Available`, `None`, `Stale` |
| [BookingDetailsForm](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-14313) | `Empty`, `Filled`, `Invalid` |
| [PolicyDisclosure](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-14381) | `Collapsed`, `Expanded`, `Acknowledged` |
| [BookingOutcome](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-14460) | `RequestReceived`, `Confirmed`, `Unknown`, `Failed` |
| [MyAppointment](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-14503) | `Upcoming`, `Pending`, `Completed` |
| [ClinicContact](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-14521) | `Details`, `Support` |
| [ClientReceipt](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-14574) | `Payment`, `History` |
| [IntakeReadiness](https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9?node-id=15-14656) | `NotStarted`, `Submitted`, `Reviewed` |

The `Button` set also has four intents: `Primary`, `Secondary`, `Quiet`, and `Danger`. The above state list is not a claim that every combination is suitable for every task.
