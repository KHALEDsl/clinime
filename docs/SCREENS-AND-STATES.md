# Screen and state inventory

These are the implemented current Clinime surfaces, retained from `client/`. State coverage refers to the included implementation, not every imaginable future variant. Start from `/demo`; all paths below are on the local demo origin.

## Customer

Hash routes follow `/customer#/ROUTE`.

| Area | Routes / entry | Implemented states or interactions |
| --- | --- | --- |
| Discovery | `home`, `search`, `venue` | Home hooks/motion, search results/no match, clinic/gallery/favorite |
| Service selection | `services` | Categories, selected/unselected, option/detail modal, image loading/fallback |
| Specialist | `professional` through booking | Any specialist, seven sample specialists, selection |
| Schedule | `availability` through booking | Dates/calendar, loading, selected time, no slots, read error/retry |
| Account access | `auth` with `actor=guest` | Email request, code verification, validation, pending/error, local mailbox |
| Attendee/review | Booking continuation | Self/other, required fields, authoritative price/promotion quote, busy/retry |
| Confirmation | Successful booking | Saved reference, email state, Wallet invitation, confirmation motion |
| Appointments | `appointments`, record details | Upcoming/past/cancelled, empty, reschedule/cancel, revision/conflict recovery |
| Profile | `account`, `settings`, `preferences`, `help`, `favorites` | Profile edit, mail preference, language, sign-out, empty saved places |
| Loyalty | `loyalty`, `visit-card`, `loyalty-history`, `loyalty-terms` | Current stamps, five-visit facial reward, history, loading/error/empty |
| Rewards | `reward`, `loyalty-coupon` through rewards | Available/redeemed/gifted, self-use/gifting, recipient validation |
| Card enrollment | `wallet-start` | Name/terms, creating/ready/error states; local card preview in this demo |
| Referrals | `referrals` | Code/link, pending/credited referral, balance and local reward history |
| Care Point | `care-point` or doctor launcher | Intro, first name, weekly round, answers, accepted points, rank/leaderboard, recovery |

Some booking/detail/reward routes require selected records or draft context. Use the actual flow or a seeded list entry rather than entering a nonexistent record ID.

## Admin / Staff

Hash routes follow `/admin#ROUTE`. The UI role picker changes work context; the source API remains the permission authority.

| Area | Routes | Implemented states or interactions |
| --- | --- | --- |
| Dashboard | `home` | Accepted composition, metrics/charts, today's visits, recommendations/actions, sparse history and read failure |
| Calendar | `appointments` | Day/week/month, selected date, expected/waiting/session/checkout/closed/cancelled |
| Booking detail | `appointment/:id` | Attendance, reschedule/cancel, contact, balance/receipts, session decision |
| Clinical/session | `medical/:id`, `session/:id` | Required flags, explicit proceed/hold, session start/finish, additions/follow-up |
| Services | `services`, `service/:id`, `service-edit/:id` | Search/category, options/prices, active/availability, edits and validation |
| Team | `specialists` | Seven sample specialists; clinic manager/reception work contexts |
| Reviews | `reviews` | All/published/archived, search/rating/sort, selection/bulk actions, pagination and empty result |
| Marketing | `marketing` | Existing illustrative budget/campaign overview; no live ad-account data |
| Loyalty | `marketing/loyalty` and existing `loyalty/*` aliases | Customer search/pagination, visits/rewards, detail and configuration |
| Referrals | `marketing/referrals` and aliases | Referrers/referrals, statuses, balances and settings |
| Weekly contest | `marketing/contest` | Participants/rank, selection/approval, award/mail state and retry |
| Maeen | `marketing/maeen` | Accepted disabled Coming Soon surface |
| Retail products | `products` | Catalog, linked stock/price and edit states |
| Material catalog | `supplies`, `supply/:id` | Search/list/detail and material management |
| Inventory | `inventory/stock`, `inventory/count`, `inventory/history` | Low stock, counts, adjustments/history, validation and revision conflicts |
| Clinic management | `admin` | Existing configuration/management surface |

## Reproduce cross-cutting states

- **Populated:** `scenario=ready`; Customer and Admin share that synthetic clinic.
- **Empty:** `scenario=empty`; inspect list/reward/dashboard empties.
- **Loading:** `scenario=slow`; existing API loaders remain visible during delay.
- **Failure:** `scenario=error`; use the demo recovery control to return to ready.
- **Insufficient history:** `scenario=insufficient`; inspect forecast explanations.
- **Validation/conflict:** submit an incomplete original form or change a record in another Admin tab; the API retains its original rules/revisions.
- **Arabic/English:** Customer's language control; the separate design-system specimen also exposes RTL/LTR and light/dark.
- **Motion/reduced motion:** accepted CSS/JS motion is retained; use the operating system's reduced-motion setting to inspect alternatives.

## Design-system states

`design-system/spec/component-contract.json` and the interactive `design-system/preview/` preserve component contracts and planning/state examples. They supplement the current application; historical Figma/page counts and old screenshots do not establish current runtime coverage.

## Limits

This inventory records source coverage and repeatable demo entry points. It does not claim exhaustive manual verification of every record/combination, real provider delivery, real payment settlement, medical appropriateness or full accessibility conformance. See the release verification record for checks actually executed for this publication.
