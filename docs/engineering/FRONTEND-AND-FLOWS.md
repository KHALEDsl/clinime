# Frontend map and end-to-end journeys

Snapshot: 2026-11-15. Application source: `../02-Application/clinime-live`. Plain JavaScript/CSS with hash routes; this is not a React/Next application.

## Customer application

`client/engine.js` owns state, hash navigation, authentication and asynchronous booking operations. `client/view.js` composes routes from discovery, journey, Muse, loyalty and Care Point modules. `client/api.js` is the same-origin API boundary. The build concatenates the explicit script list in `scripts/build.mjs`; changing the list/order can affect globals. Avoid importing runtime server code into this public bundle.

| Surface | Main source |
|---|---|
| Locale and product strings | `client/copy.js` |
| Catalog display and UI constants | `client/data.js`; authoritative prices remain server-side |
| Home/search/clinic/services | `client/discovery.js`, `client/muse.js`, `client/discovery.css`, `client/muse.css` |
| Professional/date/time/attendee/review | `client/journey.js`, `client/view.js`, `client/journey.css`, `client/muse-journey.css` |
| Account, email login and appointments | `client/engine.js`, `client/journey.js`, `client/api.js` |
| Rewards, referral wallet, Wallet card | `client/loyalty.js`, `client/loyalty.css` |
| Weekly Care Point entry/overlay | `client/care-point.js`, `client/care-point.css` |
| Isolated game frame | `client/care-point/*`; server round generator shared through `server/care-point-engine.cjs` |
| Loading and review-button feedback | `client/loading.*`, `client/review-motion.*` |
| Interaction motion | `client/muse-motion.js` and CSS; respect reduced motion |

### Booking

Home/search → clinic or services → service/option selection → specialist → offered date/time → email authentication if required → attendee details → booking review with authoritative promotion quote → confirmed booking or explicit pending/error recovery → appointment details.

A button click is not reservation success. Availability is not a hold. The server resolves current catalog values and reserves the interval atomically. Do not trust client totals, user IDs, payment status, reward balances or chosen role. Preserve the operation UUID and payload after an unknown network result.

### Appointment management

Account → appointments → appointment details → reschedule or cancel if the authoritative state permits → server revision check → refreshed private booking projection. Staff arrival/session changes may restrict later self-service changes. Do not maintain a separate conflicting client appointment database.

### Rewards and referrals

Rewards → stamp-card progress and earned Basic Facial → self-use or gift path; optional Add to Wallet links to the real provider only when configured. Referral code/link and referral cash wallet are a different ledger concept from membership QR and visit stamps. Five eligible visits earn a Basic Facial; a historical image mentioning a 100 SAR stamp reward is superseded. Current rules and limitations are documented in the server guide.

### Care Point

Doctor launcher → introductory screens → verified account and explicit first name → server-issued round → answer submission → server-confirmed points/rank → weekly leaderboard. The operator can select/confirm awards under the supported admin flow; awarding, crediting, email acceptance and gameplay closure are separate states. The client cannot self-assign points or cash.

## Staff application

Entry: `/admin`. Source: `client/admin/staff/`. `bootstrap.js` loads verified identity/workspace first, then the ordered scripts. `bridge.js` connects the existing UI actions to actual API state. `team.js` adds role views and navigation. `dashboard.js` preserves the accepted old dashboard. `growth-data.js` and `growth.js` add reviewed local recommendations to that composition.

| Staff route family | Task |
|---|---|
| `#home` | Daily overview + contextual forecast/alerts/actions in local review |
| `#appointments`, `#appointment/:id` | Calendar, actual booking detail, arrival, reschedule/cancel, checkout |
| `#session/:id`, `#medical/:id` | Session and required medical facts/consent through explicit human action |
| `#services`, `#service/:id`, `#service-edit/:id` | Catalog and service management |
| `#specialists` | Specialist roster; sample identities must remain identified as such |
| `#reviews` | Customer-review management |
| `#products`, `#supplies`, `#supply/:id`, `#inventory/*` | Products, material catalog, stock/count/history |
| `#marketing`, `#marketing/loyalty`, `#marketing/referrals` | Marketing overview and separate loyalty/referral sections |
| `#marketing/contest` | Care Point management |
| `#marketing/maeen` | Coming Soon; local experimental tools are not a deployed autonomous agent |
| `#admin` | Clinic management surface |

The role picker changes a UI work context. Actual access is enforced by server configuration/session checks. Do not treat hidden navigation as per-employee authorization; introduce/review real employee-level policy before broader staff use.

## Growth actions

- Historical closed-visit ranges are distinct from confirmed future bookings. Missing history produces an insufficient-data state.
- Checkout alert opens its actual booking, not a generic list or unrelated first record.
- Catalog alert targets the incomplete service. Stock alert targets relevant inventory.
- Retention suggestions identify clients with recorded completed visits and no future appointment; they are not a medical recommendation or permission to market.
- Draft → review → approval → manual execution/follow-up. Saving/approval does not send a campaign.
- Plans and manually entered competitor references persist in the browser. The handoff does not include live competitor scraping, predictive ML, ad-budget synchronization or channel publishing.

## UI acceptance

Preserve the approved old admin layout and current Muse identity; past explorations are references, not replacement instructions. Arabic RTL, mixed identifiers and English strings need actual rendered verification. Preserve text labels, focus behavior, target spacing, unknown/error recovery and reduced-motion equivalents. A design-system variant is a visual contract; it does not implement a permission or backend workflow automatically.
