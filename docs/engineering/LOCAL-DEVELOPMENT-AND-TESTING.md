# Local development and verification

Public source snapshot: 2026-11-18. All paths start at the repository root.

## Start without accounts

Install Node 22+ and npm. Run `npm ci`, then `npm start`, then open http://127.0.0.1:4173/demo. The start command builds portable assets and runs the isolated demo server. No environment file, TLS certificate, cloud registration, email account, password or OTP is required for normal Customer/Admin flows. See [the demo guide](../DEMO.md).

The demo keeps synthetic clinic records in process memory. Customer/Admin tabs see the same scenario ledger. Stop/restart resets those records; some browser-only UI preferences/plans remain in browser storage. Use the launcher controls to change datasets or states. Guest mode retains the original authentication screens with a local fake inbox.

## Source checks

```sh
npm run build
npm run check
npm test
npm run scan:public
```

The build emits `dist/index.html`, `dist/admin/index.html`, `dist/game/index.html` and content-hashed assets. Source images/fonts are bundled under `assets-source`, so no original desktop paths are required. Static bundles alone do not provide the no-login demo transport.

## Design-system specimen

From the root: `python3 -m http.server 8792 --bind 127.0.0.1 --directory design-system/preview`. Open http://127.0.0.1:8792. This fictional specimen is separate from the current Customer/Admin app.

## Other development tools

`scripts/growth-local-server.mjs` is a prior safe, Admin-only fake-data harness. `scripts/staff-local-server.mjs` exports the in-memory API fixture used by tests and the demo; its older HTTPS entry requires separately supplied local certificates.

`scripts/loyalty-local-server.mjs` and Maeen tools are historical experimental development sources. The legacy loyalty server is blocked by default; the explicit `--external-development-only` flag is intended only for a developer who has reviewed its external-provider behavior. It may enroll a real Loopy member through a public endpoint even without API credentials. It may read local provider/model caches. Do not use it for the isolated demo.

`npm run preview:emails` and `npm run preview:wallet-copy` generate local previews; they do not establish delivery to an email inbox or physical phone.

## Review the journeys

- Customer discovery → service/option → specialist → available date/time → attendee → review → actual local booking response → details.
- Admin → the same booking → arrival → explicit session decision → finish → record a simulated receipt → updated Customer status/rewards.
- Rewards → five-visit facial reward → use or gift; referrals and referral cash balance remain separate.
- Care Point → onboarding/name → round → accepted score → rank → Admin award → local wallet credit/mail record.
- Populated/empty/loading/error/retry and sparse-history cases, Arabic/English Customer views, wide Admin and narrow Customer layouts.

Test outcomes verify their concrete assertions only. A local fake mail acceptance is not inbox/device delivery, a recorded receipt is not real payment settlement, and a successful build is not complete accessibility or production verification.
