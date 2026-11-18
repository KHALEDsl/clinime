# Clinime API reference

Source inspection: 2026-11-15. Application paths refer to [`../../`](../../). This is a source-derived reference, not generated OpenAPI and not a current live-service test. Routing authority: [`server/api.mjs`](../../server/api.mjs).

## Common contract

The public prefix is `/api`. The handler also normalizes the Netlify function path. Responses are JSON except successful public media bytes/304. JSON responses use private/no-store caching, nosniff and no-referrer. Errors have `{error:{code,message}}`; unrecognized exceptions are deliberately hidden as `503 STORE_UNAVAILABLE`.

Send `Content-Type: application/json` for bodies. The normal body limit is 16 KiB; service-image upload has a larger envelope limit and a one-MiB decoded image limit. Mutations require the exact configured Origin; authenticated mutations also require the current `X-CSRF-Token` and same-origin cookie. Do not put a session cookie or CSRF token into saved examples, logs, query strings or shared documents.

In tables: **session** means a valid verified-email session; **staff** means general `admin.authorize`; **competition owner** means the separately configured allowlist. A staff UI role is not a server authorization claim.

## Public and authentication endpoints

| Method/path | Access | Request | Principal response / behavior |
|---|---|---|---|
| `GET /config` | Public | None | `emailEnabled`; when enabled: public catalog, `catalogVersion`, configured public team; optional Wallet enrollment presentation. May initialize enabled Wallet program state. |
| `POST /auth/request` | Origin, rate limit | `requestId`, `email`, `locale`, `mode:'code'|'link'` | `challengeId`, `expiresAt`, `resendAfter`; no OTP/token returned. Request UUID preserves the same challenge/mail intent. |
| `POST /auth/verify` | Origin, rate limit | `challengeId` and exactly one of `code` / `token` | `user`, `csrfToken`, secure session cookie. Challenge is single-use. |
| `GET /me` | Optional session | None | Anonymous: `{user:null}`. Authenticated: user, CSRF token, owned booking/payment summaries, preferences and favorite; optional Wallet sync projection. |
| `POST /auth/logout` | Session + CSRF | Optional JSON object | Revokes the server session and expires cookie. |
| `GET /availability` | Public, or owner for edit exclusion | `date`, comma-separated `services` using `serviceId:optionId`; optional `professional`; optional `bookingId` / `excludeBookingId` | `{date,slots,dates}`. No booking/customer details. Owned edit exclusion uses booked effective duration. |
| `GET /media/:sha256` | Public | Optional `If-None-Match` | Image bytes with public one-day cache and ETag, `304`, or `404`. |
| `GET /care-point/public` | Public, rate limit | Optional `offset`, `limit` | Safe current week/leaderboard projection; pagination limit capped at 50. |

## Customer account, bookings and rewards

| Method/path | Request | Response / constraints |
|---|---|---|
| `PATCH /profile` | `name` | Safe user; email/owner identity cannot be changed here. |
| `PATCH /preferences` | `email` boolean | Reminder preference; does not disable transactional confirmations. |
| `PATCH /favorite` | `favorite` boolean | Favorite state. |
| `POST /bookings` | UUID `requestId`, `items:[{serviceId,optionId?}]`, Gregorian `date`, `time`, `professional`, `contactName`, `attendee:{kind:'self'|'other',name?,relationship?}`, optional `locale`, `catalogVersion`, `promotionCode`, `expectedWalletPricing` | `{booking,emailStatus}` with server-owned snapshots/pricing; body prices/ownership/payment claims are ignored. At most 14 unique services. Optional `walletSync`. |
| `PATCH /bookings/:id` | `requestId`, current booking `revision`, new `date`,`time` | Atomic move preserving ID/owner/snapshots. Customer changes are locked after recorded arrival. |
| `DELETE /bookings/:id` | `requestId`, current `revision` | Cancellation, preserved history and released eligible reservations/benefits. No gateway refund is performed. |
| `POST /bookings/:id/confirmation` | Optional object | Owner-only retry; `{emailStatus}`; same revision mail key/content. |
| `POST /bookings/:id/gift-email` | Optional object | Owner-only configured gift email; booking/gift eligibility enforced. Does not grant a payment status. |
| `GET /loyalty` | None | Own loyalty snapshot, revision, point entries/coupons/rules; when present, separate stamp card and referral-credit wallet. May initialize the account's loyalty state. |
| `POST /loyalty/quote` | `items`, `code` | Safe pricing quotation from current server catalog and account-owned benefit. A quote is not a reservation or debit. |
| `POST /loyalty/redeem` | `requestId`, loyalty `revision`, `rewardId` | Point debit and one account-owned discount coupon in one CAS; wallet/coupon response. |
| `POST /loyalty/gift` | `requestId`, `rewardId`, `recipientEmail` | Transfers one available facial reward to the recipient account; separate gifting rules apply. No cross-account body owner is trusted. |
| `GET /wallet/campaign` | None | Configured external campaign presentation and account-bound enrollment receipt; read-only provider reconciliation may update the local binding. |
| `POST /wallet/enroll` | `requestId`, `name`, `acceptTerms:true`, current `campaignVersion` | Durable enrollment result with status/validated install URL when issued. Existing/unknown enrollment is recovered, not blindly duplicated. |

`WALLET` booking promotion requires an expected discount/total snapshot after quoting; a changed current credit balance yields `WALLET_QUOTE_CHANGED`. Facial and wallet benefits are spent by their verified owner, not by a general staff manual-create request. The server performs final promotion reservation/debit atomically with booking creation. A stale catalog version yields `CATALOG_CHANGED`.

## Staff endpoints

| Method/path | Access | Request / response |
|---|---|---|
| `GET /admin/me` | Staff | Safe staff identity, current CSRF token, role presentation, `asOf`. |
| `GET /admin/bookings` | Staff | Optional exact `date`, `status:'confirmed'|'cancelled'`; safe bookings, total, `asOf`; bounded at existing ledger capacity. |
| `POST /admin/bookings` | Staff + CSRF | Customer booking payload plus `customerEmail`. Actual customer owns the result; actual staff actor is privately audited. Manual-create UUID namespace is actor-scoped across customer changes. |
| `PATCH /admin/bookings/:id` | Staff + CSRF | `requestId`, current booking revision, date/time. Active/checkout/closed visits are locked. Same-date move preserves arrival; cross-date move clears active arrival and retains private history. |
| `DELETE /admin/bookings/:id` | Staff + CSRF | `requestId`, current booking revision. May cancel an arrived waiting visit; active/checkout/closed visits remain locked. |
| `POST /admin/bookings/:id/arrival` | Staff + CSRF | `requestId`, current booking revision. Records actual arrival once; leaves booking revision/mail key unchanged; can earn an eligible arrival stamp. No current scheduled-day restriction. |
| `GET /admin/bookings/:id/availability` | Staff | `date`; uses the booked effective duration, excluding that booking. |
| `GET /admin/workspace` | Staff | Current staff revision, catalog/version, safe bookings, visits, medical, stock, products, receipts, stock log, team, reference-import marker and `asOf`. |
| `POST /admin/workspace` | Staff + CSRF | Action envelope below; returns updated workspace and catalog version. |
| `POST /admin/assets` | Staff + CSRF | `{dataUrl}` for PNG/JPEG/WebP; returns public content-addressed media URL. No SVG. |
| `GET /admin/loyalty` | Staff | Administrative loyalty, customers, referral status, audit and separate visit-program credit setting. |
| `POST /admin/loyalty` | Staff + CSRF | `requestId`, loyalty revision, action: `adjust`, `rules-save`, or `referral-credit-save`. Adjustments require target account, signed nonzero points and reason. |

Workspace envelope: `{requestId,revision,action,...fields}`. `revision` is the **workspace** revision, not booking revision. Booking actions additionally require `bookingId` and `bookingRevision`; stock may additionally carry item revision/version and product stock revision. Main implementation: [`server/staff.mjs`](../../server/staff.mjs).

| Workspace action | Action fields / effects |
|---|---|
| `medical-save` | `fields` bounded scalar map, `flags:{consultation,assessment,consent}` booleans; patient identity derived server-side from owner and attendee. |
| `decision-save` | `decision:'proceed'|'hold'|'cancel-requested'|'reschedule-requested'`, optional `note`; does not mutate reservation status. |
| `attendance-save` | `answer` from the four supported Arabic contact-response labels; does not imply arrival. |
| `session-start` | Optional literal boolean `confirmProceed`; when no decision exists, `true` records proceed. Existing hold/reschedule/cancel decision must be explicitly resolved first. Confirmed booking, arrival, all three reviews and a free active-session resource remain required. |
| `session-notes` | Bounded multiline `notes`; session stage required. |
| `session-finish` | Multiline `aftercare`, `followup` boolean or bounded legacy string normalized to boolean; moves session to checkout, not paid. |
| `session-add-service` | `serviceId`, optional `optionId`; server resolves a current catalog snapshot; strict interval checks. |
| `session-extend` | `minutes:15|30|45`, aggregate extension at most 180; strict interval checks. |
| `payment-record` | Positive SAR `amount`, `method:'cash'|'card'|'bank'`; creates manual receipt, allows partial payment, rejects overpayment, closes on exact zero balance. |
| `visit-close` | Checkout with exact zero balance; no fabricated receipt for a complimentary visit. |
| `note-save` | Internal multiline `note`; private staff state. |
| `stock-save` | Either `item` or atomic `items` array, up to 100; ID/name/count/threshold/variants and bounded metadata. Explicit numeric count verifies count; omission preserves unknown state. |
| `product-save` | Product ID/name/description/category/active; optional price; existing `stockId` or `null` for new deterministic stock; optional quantity, stock SKU, stock revision and reason. Linked stock is authoritative. |
| `service-save` | Raw validated catalog service, options, bilingual names, category, prices, duration, active/availability, description, image URL, prep/buffer, aftercare and integer follow-up days. Nullable sale price applies only to optionless services. |
| `catalog-import-reference` | No booking ID. Insert-only reference material/product metadata with unknown count/price flags; repeat preserves edited records. |

The current server validates `confirmTimeConflict` as a compatibility boolean but does not use it to gate session start. It no longer emits the previous session-start time-conflict warning from `assertSpace`. Do not implement new clients from the older warning flow alone.

## Care Point

| Method/path | Access | Request / behavior |
|---|---|---|
| `GET /care-point` | Session | Optional pagination; own alias/points/rank/round plus safe leaderboard. |
| `POST /care-point/name` | Session + CSRF | `requestId`, `firstName`; Unicode-letter validation and first-name-only public alias. |
| `POST /care-point/start` | Session + CSRF | `requestId`; issues/reuses a bounded active round with seed and expiry. |
| `POST /care-point/complete` | Session + CSRF | `requestId`, `roundId`, exactly 16 integer rotations in `[0,3]`; server reconstructs and validates puzzle, adds 100 points once. Client score is not accepted. |
| `GET /admin/care-point` | Competition owner | Settings/revision, participants and weekly award records. |
| `POST /admin/care-point` | Competition owner + CSRF | `requestId`, competition revision, action and conditional fields below. |

Competition actions are `settings-save` (`enabled`), `select-winner` (`weekKey`,`winnerId`), `finalize` (`weekKey`), `resolve-tie` (`weekKey`), `approve-prize` (`weekKey`, optional supported winner ID), and `retry-prize-email` (`weekKey`, optional supported winner ID). Current-week manual selection is supported and may create an additional distinct participant award after a primary selection; old “exactly one prize per week” descriptions are incomplete for current code. See [`server/care-point.mjs`](../../server/care-point.mjs) for winner/award recovery guards.

## Errors, retries and limits

| Status / code family | Client handling |
|---|---|
| `400 INVALID_REQUEST`, invalid email/option/media | Correct input; a changed intentional operation receives a new request UUID. |
| `401 AUTH_REQUIRED` | Clear sensitive view state, verify session/login; do not show another user's stale workspace. |
| `403 ORIGIN_INVALID`, `CSRF_INVALID`, `ADMIN_REQUIRED` | Enforce same-origin/session/token/policy; never infer permission from selected UI role. |
| `409 REVISION_CONFLICT`, `BOOKING_REVISION_CONFLICT`, `WORKSPACE_CONFLICT`, `LOYALTY_CONFLICT` | Refresh authoritative state and review retained draft before a new explicit attempt. |
| `409 IDEMPOTENCY_CONFLICT`, competition `REQUEST_CONFLICT` | Accepted UUID was used with different intent; do not silently transform/replay it. |
| `409 ARRIVAL_LOCKED`, `VISIT_LOCKED`, `SESSION_IN_PROGRESS`, `MEDICAL_REVIEW_REQUIRED`, `DECISION_REQUIRED` | Show the actual prerequisite/state and a supported recovery action. |
| `409 SLOT_UNAVAILABLE`, `CATALOG_CHANGED`, `WALLET_QUOTE_CHANGED` | Re-query/review booking selection and authoritative pricing. |
| `429 RATE_LIMITED` / auth lock | Respect the configured limiter; do not create parallel retry storms. |
| `503 STORE_UNAVAILABLE`, `STORE_BUSY`, uncertain mutation response | Outcome may already be committed. Retry the same UUID and identical payload. |
| Capacity error families | Do not delete historical records to make a request pass; operator migration/retention work is required. |
| Provider `unknown` / unconfirmed | Read-only reconciliation/manual review; no blind second enrollment/stamp/redeem mutation. |

Rates differ by route; exact source values are in `server/api.mjs` and `server/auth.mjs`. Examples: availability 90/minute, staff workspace writes 180/hour, manual staff creates 60/hour, media uploads 12/hour, game play requests 180/hour, Wallet enrollment 10/hour. These are in-store per-route buckets, not a global abuse-control service.
