# Clinime live client mapping

Client-only implementation. The approved mobile layout, date selection, supplied images and original brand entrance remain. Production builds should load `api.js` before `engine.js`, then discovery/journey/view modules. Root's builder already does this.

## API-backed behavior

- Email-only sign-in requests a real server challenge. Code verification and email-link verification create the server cookie session; `/api/me` supplies user, CSRF, appointments and preferences. No trusted identity or booking record is loaded from localStorage. That storage now contains only locale/category UI choices.
- Magic links are scrubbed from history immediately before verification. Both fresh navigation and same-tab hash navigation are supported. Missing, expired and used links show recovery to request another email. Codes and tokens are not logged or persisted by the client.
- Availability comes only from `/api/availability`; changing service/date invalidates the time. Rescheduling sends `bookingId` for the owner-only availability exclusion. A calendar month only enables dates offered by the server.
- Create/cancel/reschedule mutations send a stable UUID and retain the exact request body while a result is uncertain. All cart/schedule mutation entrypoints are blocked until reconciliation. A pending request cannot be replayed as another account. Server response snapshots supply saved appointment totals and email status.
- Booking confirmation email is independent of appointment persistence. Failed/pending mail appears prominently with its saved appointment and has an owner-only confirmation retry. Provider acceptance is not proof of inbox delivery.
- Verified email is read-only in contact/profile screens. Profile name, email permission, favorites, logout, cancellation and rescheduling use their corresponding APIs. Logout hides local account state while server appointments remain intact.
- A session generation/latest-read guard rejects stale `/me` responses after logout or account change. Transport never installs CSRF from an unaccepted stale response.

## Checks performed

- JavaScript syntax checks passed. A renderer harness exercised42 Arabic/English routes and10 dialogs, checking required headings, undefined text and legacy content. It caught and corrected a primary-helper ReferenceError before the final source delivery.
- Actual390px WebKit journey with **intercepted API responses only**: email request, wrong-code correction, successful server-envelope verification, one booking POST, saved appointment with failed mail, and one email retry to sent. The outgoing booking body contained requestId/items/date/time/professional/contactName/attendee, with no client prices or arbitrary recipient.
- Actual intercepted expired-link response rendered the expiry message with signed-out state and `#/auth-link`, without the token in the URL.
- Independent reviewer retained reproducible source probes in root `INDEPENDENT-REVIEW.md`: stable unknown-create recovery, stale `/me` after logout and stale `/me` after account change, including the next mutation's CSRF.
- Scans found no hard-coded verification bypass, inactive provider controls, phone activation, internal comparison image dependency or public review-tool wording in client JavaScript. Legacy duplicate renderers/dictionaries were removed.

No real mail was sent during these checks. Mocked browser results do not establish production cookie/security headers, actual Blobs persistence, mail acceptance or inbox delivery. Root owns live adapter verification, credentials/configuration, final build and deployment.

## Deliberate contract limits

Persisted appointment edits change date/time only, matching the PATCH API. Unconfirmed carts remain editable. Verified-email changes and account deletion have no API in the agreed contract and are not exposed as dead controls. The Booking emails page is read-only: verified recipient, transactional booking/change/cancel messages, and a route to appointment details for confirmation retry. No reminder scheduler control is exposed. The preferences endpoint remains compatible but has no reminder toggle in the UI. Physical clinic address/arrival data remain unavailable and are stated honestly. Menu values use the supplied bundled catalog; committed prices/duration are calculated by the server and displayed from its snapshot.

Final rebuild must include the latest client changes: prominent mail failure status, retry-status focus, same-tab magic-link handling and account-owner recovery guard. No deploy or credential access was performed by this client agent.
