# Data model and consistency

Source snapshot: 2026-11-15. This is an implementation map, not an export of clinic records. Paths start from `../../`. Production persistence is JSON records in private Netlify Blobs, not SQL tables. The current repository demo uses isolated in-memory storage. The former D1 review is historical and is not included here.

## Authoritative records

| Record/key family | Contents | Authority / consumers |
|---|---|---|
| `user/<HMAC identity>` | Verified account email, display name, preferences and favorite state | `server/auth.mjs`, profile/preferences routes; safe projection returned to its owner |
| `auth/<HMAC challenge>` | Challenge fingerprint, expiry, attempts, delivery state, encrypted temporary envelope, single-use consumption and session HMAC/revocation | Auth service only; never export codes or raw session material |
| `rate/<HMAC bucket>` | Bounded timestamped request events | Server limiters; not client-controlled identity |
| `clinic/booking-ledger-v1` | Bookings, mutation receipts, staff workspace, loyalty/visit program, Wallet integration and outbox | Single strong-CAS domain boundary |
| `clinic/care-point-v1` | Game enablement/revision, chosen-name profiles, weeks, rounds, scores, selection/award/prize/email state and replay receipts | Server competition service; public and owner projections differ |
| Media/provider enrollment records | Content-addressed public service media; private Loopy lookup/enrollment/reconciliation state | See `server/media.mjs` and `server/loopy.mjs`; do not use public media storage for clinical attachments |

`server/core.mjs` provides `getWithMetadata` strong reads and `setJSON` conditional writes. `update()` retries conflicts at most 16 times. `onlyIfNew` and `onlyIfMatch` must be real atomic store operations; a missing ETag fails closed. Each updated JSON record also has `_version` metadata. Caller-visible revisions and backend ETags are different concepts.

## Booking ledger

```text
schema: 1
bookings: { bookingId: Booking }
requests: { scopedOperationKey: immutable mutation receipt/fingerprint }
staff: { revision, catalog, medical, stock, products, receipts, audit, requests, ... }
loyalty: { rules, accounts, coupons, referrals, requests, ... }
visitProgram: { schema, referralCreditSar, visits, rewards, transactions }
walletIntegration: { schema, enabled, campaignId, activatedAt }
walletOutbox: { schema, sequences, events }
```

The exact nested shapes and migration/compatibility behavior are defined by the server modules; the outline is not a replacement runtime validator. Catalog/media/legacy fields may be absent in older records. Do not normalize missing physical stock values to a verified zero.

A booking holds immutable ownership ID, ID/revision/status, Gregorian date, local time, selected professional, catalog-resolved item snapshots, contact/attendee, pricing/promotion snapshot, attendance, creation/update timestamps, private replay/mail fields and `_staff` visit state. The public `safeBooking()` projection excludes ownership, fingerprints, raw email payloads and medical facts.

Reservation state (`confirmed`/`cancelled`), attendance (`arrived`), clinical/session stage (`session`/`checkout`/`closed`), manual payment balance, and mail/Wallet delivery states are independent. Do not collapse them into one success flag.

## Staff workspace and relationships

- `staff.catalog` holds administrator-managed catalog overrides; server catalog remains the default authority for price/options/duration.
- Bookings reference `serviceId`/`optionId`; item snapshots preserve the accepted historical price/name/duration when the catalog later changes.
- Medical records attach to the projected patient identity, not an arbitrary display name. Required consultation/assessment/consent facts are explicit human attestations.
- Receipts reference a booking and record a manual amount/method/time/lines. Their sum, the booked discounted payable and final additions determine balance. These are not acquiring-gateway settlement receipts.
- Stock/product records and stock history preserve known/unknown quantity, variants, version and audit facts. Reference catalog import supplies labels, not verified real counts or prices.
- Work-mode UI switching does not change the authenticated user or authorize a different server policy.

## Loyalty, stamps and money

`server/visit-rewards.mjs` defines five eligible visits and the `basic` service reward. `recordStamp()` requires a confirmed personal booking, recorded arrival and a positive payable total. It deduplicates by booking ID. Payment is not required to earn that stamp; fully complimentary or other-attendee bookings earn none. Subsequent movement/cancellation does not revoke an already-earned stamp. Historical arrivals are not retroactively imported automatically.

Every fifth qualifying arrival creates one deterministic `FAC-...` reward with owner/earner/earned time. Booking a free facial reserves it. Final completion and full settlement consume it. A gift changes the reward owner once; it is not a duplicate new reward. Cancellation/replay and reward availability follow the actual loyalty transaction paths.

`visitProgram.transactions` stores signed integer cents for referral-wallet/prize activity; a balance is derived from the account's entries. Referral cash credit is separately configurable (`referralCreditSar` begins unset), not automatically a stamp reward or an arbitrary discount. Legacy points/coupons remain a separate compatibility model in `server/loyalty.mjs`; do not merge their units with cents or visit counts.

## Wallet delivery outbox

Business mutations enqueue semantic events inside the same booking-ledger CAS. Each member has a monotonic sequence. Events retain immutable payload, timestamps, intent and status (`pending`, `processing`, `sent`, `unknown`, `failed`, `skipped`). Completion keeps compact semantic-ID tombstones, preventing replay from reissuing the same effect.

An uncertain provider write is not a failed write. Safe read-only reconciliation may recover a uniquely tagged stamp receipt; unsupported uncertain operations stay blocked. Do not create a new semantic ID to force a retry. Notification delivery and financial stamp/redemption ordering have different fencing rules; follow `wallet-events.mjs` and `wallet-dispatch.mjs` rather than implementing a generic retry loop.

## Care Point

Weeks are calculated in Asia/Riyadh. A profile's explicitly chosen first name is separate from private account identity. Server-issued rounds and validated submissions determine scores; the browser cannot set cash or points. Public ranking does not expose private email or admin award evidence.

Week `endsAt`, financial `frozenAt`, global `enabled`, round expiry, selected winner, approved award, credited prize and email delivery are distinct. Financial freezing does not by itself stop allowed ongoing play. A 100 SAR credit uses a deterministic prize transaction in `visitProgram.transactions`; Care Point approval/crediting is a recoverable cross-record process, not one atomic transaction spanning both ledgers. Repeated requests must recover the same award/credit rather than pay twice. Use current owner endpoints for supported winner changes/additional selections; never manually edit records to bypass conflict checks.

## Capacity, retention and migration

Current booking mutation guards include 5,000 historical bookings, 10,000 recent request receipts and 8 MiB serialized ledger size; consult exact comparison boundaries in `server/bookings.mjs`. Request receipts use a 72-hour retention window during successful mutations. Auth/session expiry is logical; no universal automatic record-deletion policy is implemented. These limits are safeguards, not throughput measurements.

Before significant scale or multiple-clinic expansion, plan a transactional database migration with explicit ownership, intervals, revision/CAS semantics, immutable payment/reward events and outbox recovery. Preserve HMAC identity compatibility and `APP_SECRET` for existing datasets. Backups/restores must include linked records and operation receipts, and must be handled privately; no real ledger backup is included here.

## Isolated D1 preview

Historical, excluded review implementation: `demo_records` used `demo_records(visitor TEXT,key TEXT,value TEXT,etag TEXT,PRIMARY KEY(visitor,key))`. `worker/store.mjs` scopes every read/CAS to a random visitor cookie. Insert-only transactional seeding cannot reset prior edits. The synthetic seed contains `.invalid` accounts; fake owner session bootstrapping and mail are isolated from production. Browser-local recommendation plans are not shared D1 clinic records.
