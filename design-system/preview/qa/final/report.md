# Rendered slop audit: index.html

## desktop (1440 px): 5 P0 · 0 P1 · 0 P2 · HEAVY

| # | ID | Sev | Where | What |
|---|---|---|---|---|
| 1 | O2 | P0 | `div#appointment-list > div.appointment-row.selected` | stroke on a non-interactive block (stroke = state): use a fill step or space |
| 2 | O4 | P0 | `div#booking-content > div.date-choices > button.date-button` | button padding: label only 7px from the edge, padding ratio 1.2 (x 7 / y 6) |
| 3 | O4 | P0 | `button#continue-booking` | button padding: padding ratio 13.1 (x 118 / y 9) |
| 4 | O4 | P0 | `div#appointments > div.day-summary > div.segmented > button.selected` | mixed heights for one button size: 36 / 62px |
| 5 | O4 | P0 | `div#appointments > div.day-summary > div.segmented > button` | mixed heights for one button size: 36 / 62px |

## mobile (390 px): 5 P0 · 0 P1 · 0 P2 · HEAVY

| # | ID | Sev | Where | What |
|---|---|---|---|---|
| 1 | O2 | P0 | `div#appointment-list > div.appointment-row.selected` | stroke on a non-interactive block (stroke = state): use a fill step or space |
| 2 | O4 | P0 | `div#booking-content > div.date-choices > button.date-button` | button padding: label only 8px from the edge, padding ratio 1.2 (x 8 / y 7) |
| 3 | O4 | P0 | `button#continue-booking` | button padding: padding ratio 13.6 (x 123 / y 9) |
| 4 | O4 | P0 | `div#appointments > div.day-summary > div.segmented > button.selected` | mixed heights for one button size: 44 / 64px |
| 5 | O4 | P0 | `div#appointments > div.day-summary > div.segmented > button` | mixed heights for one button size: 44 / 64px |

Numbers match the labels on annotated.png. Scripts produce false positives (expect 5 to 10%); drop them in your report with the reason.