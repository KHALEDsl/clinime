# Public source scope and deployment boundaries

Snapshot: 2026-11-18, Asia/Riyadh.

## Included

- Current local `client/`, `server/`, `netlify/` and tests. This is a source snapshot, not a fresh live Netlify deployment export.
- Portable build assets under `assets-source/` and accepted service/specialist photographs.
- Design-system tokens, icons, fonts, contracts, historical construction helpers and component specimen under `design-system/`.
- A new isolated no-login demo adapter that reuses the API and business logic with synthetic records, fake mail and local Wallet previews.

The demo adapter does not change `server/api.mjs` authentication or production access policy. Production server endpoints still enforce sessions, origin/CSRF and configured staff access.

## Excluded

No live `.env`, provider/CLI credentials, saved sessions, customer/member exports, private evidence or Git history is included. The former standalone D1 Admin review, historical explorations and redundant old archives are not part of this repository; all accepted current Customer/Admin interfaces are included in `client/`. The old live enrollment QR is excluded.

## Running a real clinic

The local demo is for review and development. A real installation needs its own authenticated Customer/Staff access, private storage, schedule, catalog, staffing/permissions, mail sender and optional Wallet provider setup. Use `.env.example` for names only and obtain private values through the clinic's authorized operator. Never copy the demo's no-login adapter into a real customer-data environment.

Cloud account access, DNS/domain ownership, Netlify deploy history/rollback rights, Resend sender setup, Loopy member reconciliation and native Figma access are separate from source files. Publishing this repository does not grant or configure those resources.

Keep an existing APP_SECRET stable when retaining existing identities; changing it requires a planned migration. Validate backup/restore and session/ownership permissions on an isolated environment before migrating actual records. The supplied sample opening hours and specialist names are not a verified clinic roster or schedule.

## Behavior limits

- Receipts are operator-recorded amounts; there is no established acquiring gateway or refund settlement.
- Wallet membership QR, visit stamps and referral cash balance are independent concepts. A provider acknowledgement does not establish physical-device delivery.
- Growth recommendations use descriptive rules and available historical records; competitor references are manual. They are not guaranteed sales or live competitor/ad reporting.
- Prize selection, wallet credit, email acceptance and gameplay availability are separate states. Demo awards transfer no real money.
- Maeen is Coming Soon; historical local tools do not constitute a deployed autonomous social agent.

The existing single-ledger storage design has bounded capacity/contention; unit tests are not a load benchmark. Review the data model before broader clinic use.

This release is authorized for public GitHub source sharing. It does not deploy to Netlify or modify the live clinic.
