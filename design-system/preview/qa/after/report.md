# Rendered slop audit: index.html

## desktop (1440 px): 11 P0 · 0 P1 · 1 P2 · HEAVY

| # | ID | Sev | Where | What |
|---|---|---|---|---|
| 1 | O2 | P0 | `div#appointment-list > div.appointment-row.selected` | stroke on a non-interactive block (stroke = state): use a fill step or space |
| 2 | O4 | P0 | `button#add-appointment` | button padding: padding ratio 1.3 (x 15 / y 12) |
| 3 | O4 | P0 | `div#booking-content > div.date-choices > button.date-button` | button padding: label only 7px from the edge, padding ratio 1.2 (x 7 / y 6) |
| 4 | O4 | P0 | `button#continue-booking` | button padding: padding ratio 13.1 (x 118 / y 9) |
| 5 | O4 | P0 | `button#save-demo` | button padding: padding ratio 1.3 (x 15 / y 12) |
| 6 | O4 | P0 | `button#reset-demo` | button padding: padding ratio 1.2 (x 15 / y 13) |
| 7 | O4 | P0 | `button#details-demo` | button padding: padding ratio 1.3 (x 15 / y 12) |
| 8 | O4 | P0 | `button#cancel-demo` | button padding: padding ratio 1.2 (x 15 / y 13) |
| 9 | O4 | P0 | `div.component-grid > article.component-group > div.control-row > button.button.primary` | button padding: padding ratio 1.2 (x 15 / y 13) |
| 10 | O4 | P0 | `div#appointments > div.day-summary > div.segmented > button.selected` | mixed heights for one button size: 34 / 62px |
| 11 | O4 | P0 | `div#appointments > div.day-summary > div.segmented > button` | mixed heights for one button size: 34 / 62px |
| 12 | T5 | P2 | `html > body` | 8 font sizes (12, 13, 14, 16, 23, 24, 26, 36) |

## mobile (390 px): 14 P0 · 0 P1 · 0 P2 · HEAVY

| # | ID | Sev | Where | What |
|---|---|---|---|---|
| 1 | O2 | P0 | `div#appointment-list > div.appointment-row.selected` | stroke on a non-interactive block (stroke = state): use a fill step or space |
| 2 | O4 | P0 | `button#locale-toggle` | button padding: padding ratio 1.1 (x 13 / y 12) |
| 3 | O4 | P0 | `button#add-appointment` | button padding: padding ratio 1.3 (x 15 / y 12) |
| 4 | O4 | P0 | `div#appointments > div.day-summary > div.segmented > button.selected` | button padding: label only 8px from the edge, padding ratio 0.6 (x 8 / y 13) |
| 5 | O4 | P0 | `div#appointments > div.day-summary > div.segmented > button` | button padding: label only 8px from the edge, padding ratio 0.6 (x 8 / y 13) |
| 6 | O4 | P0 | `div#booking-content > div.date-choices > button.date-button` | button padding: label only 8px from the edge, padding ratio 1.2 (x 8 / y 7) |
| 7 | O4 | P0 | `button#continue-booking` | button padding: padding ratio 13.6 (x 123 / y 9) |
| 8 | O4 | P0 | `button#save-demo` | button padding: padding ratio 1.2 (x 17 / y 14) |
| 9 | O4 | P0 | `button#reset-demo` | button padding: padding ratio 1.1 (x 17 / y 15) |
| 10 | O4 | P0 | `button#details-demo` | button padding: padding ratio 1.2 (x 17 / y 14) |
| 11 | O4 | P0 | `button#cancel-demo` | button padding: padding ratio 1.1 (x 17 / y 15) |
| 12 | O4 | P0 | `div.component-grid > article.component-group > div.control-row > button.button.primary` | button padding: padding ratio 1.1 (x 17 / y 15) |
| 13 | O4 | P0 | `div#appointments > div.day-summary > div.segmented > button.selected` | mixed heights for one button size: 44 / 64px |
| 14 | O4 | P0 | `div#appointments > div.day-summary > div.segmented > button` | mixed heights for one button size: 44 / 64px |

Numbers match the labels on annotated.png. Scripts produce false positives (expect 5 to 10%); drop them in your report with the reason.