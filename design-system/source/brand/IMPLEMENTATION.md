# Clinime visual implementation contract

Version 1.0 · 21 October 2026

## Attach to the app-building prompt

> Implement Clinime using the attached brand and UI guide as the visual source of truth. Import `tokens/clinime.css` and use the bundled Sora fonts. Reproduce the four screen references at 1440 × 900 before extending the system. Reuse the same shell, typography, controls, and spacing across all pages. Use semantic and component tokens rather than inventing colors. The light theme is authoritative. These are visual references, not a functioning application. Implement the interaction and accessibility requirements below using real semantic controls.

## Package map

- `Clinime-brand-and-UI-guidelines.pdf`: 25-page visual guide, embedded Sora, selectable text and vector graphics.
- `screens/`: four 1440 × 900 PNGs and matching vector PDFs.
- `assets/`: outlined light, dark and monochrome SVG logos; mark; app icon; Sora weights 400, 500, 600, 700; SIL Open Font License.
- `tokens/clinime.css`: directly usable CSS custom properties and local font-face declarations.
- `tokens/clinime.tokens.json`: custom, readable token interchange format with alias keys.
- `tokens/contrast-report.csv`: measured text pairs, including one explicitly prohibited pairing.

PDF: foundation 3–4; logo 5–6; colors/contrast 7–10; typography/layout 11–12; components 13–18; four screens 19–22; token contract and handoff 23–25.

## Binding design decisions

- Primary reference colors remain exactly `#FFD8EB` and `#2D3E5B`.
- Application UI is English and uses Sora exclusively. `sans-serif` is an emergency loading fallback, not an alternate design font.
- Canvas gray.50, cards/base white, primary text gray.900, secondary text gray.600.
- Sidebar 232px; top bar 72px; content origin x=264; right inset 32px. Use 24–32px column gaps. Main content max-width 1440px outside the sidebar.
- Navigation items 40px tall, separated on a 48px pitch. Active item: pink.100 surface plus 3px slate vertical indicator and slate text.
- Standard controls 40px high, radius 6px, type 14/20 600 for buttons and 400 for input values. Keep actionable hit regions at least 44px where space allows without overlapping adjacent targets.
- Input outlines use gray.500. Gray.200 is a decorative separator, not the sole cue identifying a control.
- Cards: radius 10px, 24px padding, 1px subtle border, no shadow. Popovers: radius 10px, 16px padding, layered shadow. Dialogs: radius 14px, 24px padding.
- 8px rhythm with 4px increments: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96px. Layout dimensions are separate from the spacing scale.
- One filled primary button per workspace. A confirmation dialog is a new action scope: its destructive confirmation may be filled red.
- Type roles come from the JSON typography block; sizes and line-height values are CSS px. Letter spacing is in em. Use tabular lining numerals for dates, times, durations, and monetary data. Right-align amount columns.
- Use Lucide icons at 20px normally and 16px for metadata, 2-unit source stroke on a 24-unit grid. References illustrate outline geometry; use the actual library in the app.
- Dark logo variants are for dark brand surfaces. No dark application theme is approved in v1.0.

## Token resolution

JSON groups are `primitive`, `semantic`, `foundation`, `typography`, and `component`. Semantic and component values are aliases to keys, not literal CSS values. Resolve recursively until a primitive or foundation value is reached. Example:

`button.primary.bg → action.primary → color.slate.700 → #2D3E5B`

CSS uses `--cl-` plus the dot key with dots replaced by hyphens. Example: `var(--cl-button-primary-bg)`. JSON typography role `page` maps to `--cl-type-page-size`, `--cl-type-page-line-height`, `--cl-type-page-weight`, and `--cl-type-page-tracking`. `--cl-font-family` provides the font family.

This JSON is not claimed to be a native Figma/DTCG import. In Figma, create Primitive and Semantic variable collections, convert dot names to slash names, and preserve alias relationships. Create Sora text styles and shadow effect styles from the respective values. Use light mode only. Do not duplicate raw values in every component.

## Calendar rules

- The calendar example is the day view for a solo practitioner. The date popover is a compact week jump control. A complete date picker must additionally allow previous/next month and typed date entry.
- Use a 64px/hour time scale in the reference. A 45-minute appointment is 48px tall. For durations too short to fit both text lines, show the time and patient name on one line and provide full accessible details on focus/activation. Do not artificially elongate appointments, which misrepresents timing.
- In-session/active status takes precedence and uses green. Upcoming confirmed appointments use purple. Completed/past appointments use gray. Past appointments lacking a completed state retain a visible “Past · needs review” label.
- Payment is independent: paid future appointments stay purple. Display Paid/Unpaid/Part paid as separate labels. Never let payment overwrite lifecycle status.
- Canceled appointments use neutral gray and a Canceled label, hidden from the default active calendar. Preserve them in history/filterable views.
- Overlapping appointments appear in parallel columns, never on top of one another. Expose conflicts before saving. Current-time indicator must not make event text unreadable.
- Selecting an appointment adds a slate focus/selection outline while preserving status color and label. The preview panel shows details without making a second filled primary action compete with Add appointment.
- At narrow widths, use a modal detail panel with backdrop, focus trap, Escape close, and focus restoration. The desktop docked panel is nonmodal and does not trap focus.
- The full-size reference includes a transient date popover and appointment preview to specify both layered states. The popover closes after selecting a date; the docked preview may remain open.

## Screen behavior and data

All names, records, appointment details, amounts, and counts are fictional. The example uses clinic timezone Asia/Riyadh and SAR as configuration examples, not hard-coded product defaults.

- Home: 6 appointments; 2 completed; one active and three upcoming. Collected SAR 850 corresponds to the completed consultation and facial. Outstanding SAR 1,100 is an aggregate balance, not a claim that all unpaid future services have been invoiced. KPI regions should link to the relevant filtered view.
- Appointment: Start session is filled slate; Cancel appointment is outlined red. Starting a session changes lifecycle state, never payment. Cancellation opens the confirmation dialog specimen. Confirmation must follow business rules on reminders, refunds, and retained records; this guide does not prescribe financial policy.
- Services: search plus category and active filters, 64px table rows, explicit prices and durations. The example shows page 1 of 2, six of eight services. Use real pagination controls with accessible labels. Keep full service names available if truncated.
- Do not copy the static fixture values as default live data or infer hidden patient history.

## Interaction states

- Primary: slate.700 rest, slate.800 hover, slate.900 pressed, white text. Secondary/tertiary: white rest, slate.50 hover, slate.100 pressed.
- Focus: 2px slate ring outside a 2px white offset, never clipped by containers. Focus and selection are different states; support both at once.
- Destructive outline: error text and border; on hover add error surface. Final destructive solid button uses error.text; hover uses the darker destructive-hover token. Always retain the action label.
- Disabled: gray.100 surface, gray.500 text, no hover effect, native disabled state where applicable. Explain why an action is unavailable in readable nearby text.
- Invalid: error border plus linked error text. Preserve values, validate on blur/submit, focus the first error on submit. Never communicate validation only with a red border.
- Loading: preserve component size, keep action text, add spinner/status text. Avoid double submissions. Static skeletons match the eventual layout; avoid distracting shimmer.
- Hover animation 120ms; panel enter 180ms, exit 120ms. Use supplied ease. Honor reduced motion. No animated dashboard entrances or decorative floating.
- Empty search: “No services match your search.” Provide Clear filters, not Add service as an automatic assumption. General empty states can show the appropriate creation action.
- Errors retain inputs and offer a concrete retry. Critical errors stay in context, not only in a disappearing toast. Toast success: 5 seconds; errors persistent until resolved/dismissed.
- Workflow: Patient → Service & time → Review. Show completed/current/future steps using text and shape, preserve data on Back, and validate before progressing.

## Accessibility and acceptance

Measured approved text pairs meet WCAG AA 4.5:1. White on pink fails at 1.29:1 and must not be used for interface text. Non-text boundaries require separate 3:1 testing where necessary. Disabled elements are exempt, but explanatory text is not.

Use native buttons, inputs, labels, tables, and headings. Icon buttons need accessible names. Menus, tabs, date pickers, and dialogs need appropriate keyboard behavior. Provide a skip link, logical focus order, and visible focus. Return focus after closing overlays. Announce save/error/loading status. Avoid hover-only actions. At 200% zoom, content must reflow; only genuinely two-dimensional regions such as the calendar and data tables may scroll locally.

At <1200px use a 72px icon rail and overlay panels. At <960px use a navigation drawer and single-column layouts. At phone widths use day/list calendar views, full-width forms, and stacked details; do not shrink desktop typography to fit. Full responsive and keyboard verification belongs in the built application.

Before release compare all four screens at 1440 × 900, verify long names and translated-format currencies, test focus and errors, and confirm no off-system colors, typefaces, nested decorative cards, or heavy shadows were introduced.

## Sources

- Sora specimen: https://fonts.google.com/specimen/Sora
- Source font and license: https://github.com/google/fonts/tree/main/ofl/sora
- Lucide: https://lucide.dev
- WCAG text contrast: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- WCAG non-text contrast: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html

The Sora static font files were instantiated from the Google Fonts variable font. Retain `Sora-OFL.txt` when distributing them. Use Lucide under its distributed license when installing the icon package. The original Clinime logo is a proposed identity; trademark availability was not researched.
