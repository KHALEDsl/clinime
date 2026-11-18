# Integrations and operations

Source snapshot: 2026-11-15. No live provider state was reverified for this document. Application root: `../02-Application/clinime-live`. Secrets and actual customer/provider records are deliberately absent.

## Deployment shape

Netlify serves generated `dist/` static files, same-origin `/api/*` through `netlify/functions/api.mjs`, and private `@netlify/blobs` storage. `/admin` and `/game` have their own generated entries. `netlify.toml` records routing, CSP/security headers and Node version. A frontend-only host cannot replace Functions/Blobs without an equivalent API/data adapter. Render is not required by this implementation.

The customer canonical URL in existing configuration is `https://clinime.online`. The package does not change its DNS, Netlify site registration or current live deployment. Domain/Resend account ownership is a separate operator handoff.

## Environment contract

Use `.env.example` for names only. Set real values privately at the server runtime, not in `client`, generated assets, documentation or source control.

| Variable | Purpose |
|---|---|
| `PUBLIC_ORIGIN` | Exact configured HTTPS origin; Origin/CSRF and email links depend on it |
| `APP_SECRET` | Stable strong secret for HMAC identities, sessions, challenges and encryption; preserve when retaining existing records |
| `RESEND_API_KEY`, `EMAIL_FROM` | Server mail adapter credentials and verified sender |
| `CLINIC_SCHEDULE_JSON` | Explicit offered schedule; verify real clinic hours/resource settings |
| `CLINIME_ADMIN_ACCESS`, `CLINIME_ADMIN_EMAILS` | General staff policy: default allowlist, or explicitly broad `verified-email`; competition ownership still uses configured owner emails |
| `CLINIME_SPECIALISTS_JSON`, `CLINIME_ROSTER_SAMPLE` | Roster configuration/sample disclosure; names/photos in sample roster are not verified employment facts |
| `CLINIME_GIFT_JSON` | Optional configured booking thank-you reward; absent configuration must not invent a benefit |
| `CLINIME_WALLET_ENABLED` | Explicit Wallet feature flag; requires complete provider config too |
| `LOOPY_API_KEY`, `LOOPY_API_SECRET`, `LOOPY_USERNAME`, `LOOPY_CAMPAIGN_ID` | Private Loopy account/campaign configuration |
| `LOOPY_VERIFIED_BINDINGS_JSON` | Operator-reconciled private member bindings; never accept arbitrary customer-body member IDs |

## Email / Resend

`server/mail.mjs`, `email-templates.mjs`, `gifts.mjs` and `care-prize-mail.mjs` own email acceptance/templates. HTML/text remain readable without images; Bloom/gift/victory art is served from included email assets. Email clients do not execute the website's JavaScript; GIF support and inbox rendering vary.

Authentication request succeeds only after provider acceptance; code/link are sent together and consume one challenge. Booking persistence and notification delivery are separate: a saved booking remains saved if mail is pending/failed. Preserve idempotency UUIDs and frozen provider keys/payloads on uncertain retries. Existing server rules bound retries within the provider idempotency period; do not create a new mail key after an unknown outcome without reconciliation.

`sent` means provider acceptance, not proven inbox arrival. A prize can be credited while email remains pending/failed. Handle those statuses separately and use supported retry endpoints. Domain verification/sending permissions, provider limits, DNS and actual delivery need authorized live checks after setup; they are not transferred by uploading source.

## Loopy / Wallet

`server/loopy.mjs` validates the configured campaign, exact collection fields and five-stamp complimentary Basic Facial reward. Default campaign identifiers in code are existing non-secret configuration; do not silently enroll customers into a replacement campaign.

- Verified server identity supplies account email; the request body cannot select another member.
- Enrollment needs current terms/name, supported campaign shape, durable intent and recovery. An uncertain enrollment cannot be blindly recreated.
- Booking confirmation/movement/cancellation enqueue single-card update messages; this is not an arbitrary update of every provider field.
- Eligible personal arrival creates one internal stamp before payment, then queues provider delivery. The fifth earns a Basic Facial for self-use or a supported email gift.
- Provider acceptance is not a physical-device lock-screen observation. Missing card, pending, processing, unknown and failed delivery remain distinct from earned internal rewards.
- API capability/rate-limit/plan changes can break assumptions. Read current official provider documentation before changing adapter contracts. No live credentials or actual installed member-card captures are supplied.

`netlify/functions/api.mjs` may dispatch bounded queued work after relevant successful requests using `context.waitUntil` when available. `wallet-sweep.mjs` schedules hourly (`0 * * * *`) bounded safe recovery. Unknown writes remain protected from blind replay; scheduled execution is not permission to issue twice.

## Care Point administration

`care-point-sweep.mjs` schedules `0 21 * * 6` UTC, corresponding to Sunday midnight in Riyadh. It freezes ended-week financial selection data; it does not automatically pay a winner or prove message delivery. Owner actions manage selection, approval, deterministic 100 SAR wallet credit and email retry. Preserve multiple supported award identities and duplicate-request recovery. Continued gameplay, weekly scoring boundaries and award state must remain independent.

## Payments

Staff checkout records manual receipts and balance reconciliation. Method labels such as card/cash are entered operational facts, not a card-processing gateway. The source does not establish online acquiring, Apple Pay authorization, PSP webhooks or settled refunds. Adding those integrations requires verified payment callbacks and idempotent accounting; never mark paid from a customer-side submit or animation.

## Marketing / Maeen / recommendations

Maeen is Coming Soon in the accepted staff UI. The package retains local experimental dialogue/draft/visual tooling for future work; it is not a deployed autonomous marketing agent or free image-generation guarantee. No Meta/Instagram account integration, ad-budget sync or automatic publishing is established here.

Growth forecasts are descriptive ranges from recorded matching closed-visit days. Draft/approval/manual start and browser-local follow-up are available; they do not send a campaign. Manual competitor references are not live competitor intelligence. Keep evidence, date, sample/missing-data state and action targets explicit.

## Operational runbook

1. Read current source/config privately and identify the existing provider projects before deployment.
2. Take an authorized backup and verify restore off production; preserve account secret and linked replay/outbox records.
3. Run fresh install/build/tests/check, then local customer/staff/loyalty/game journeys.
4. Confirm real schedules, staff access, catalog/stock facts and reward policies. Do not seed demo records into production.
5. Get product acceptance, then batch one intended deployment; this handoff performed none.
6. Verify anonymous public entry and denied private reads; separately verify an authorized harmless persisted operation and the intended notifications with an approved test account.
7. For unknown commits/delivery, reread authoritative receipts before retrying the same request. Never infer failure from timeout alone.
8. Rollback static/function code only after understanding data compatibility. A rollback does not undo already-issued emails, receipts, stamps, gifts or prizes. Preserve immutable histories; reconcile side effects explicitly.

## Separate review Site

The Worker/D1 review under `../03-Admin-Review` is isolated: per-visitor synthetic seed, fake mail, disabled Wallet, no production credentials. Its copied API can diverge from the Netlify source. New Site registration is deliberate; no live project ID is included. See `LOCAL-DEVELOPMENT-AND-TESTING.md` for build/migrations/preview commands.
