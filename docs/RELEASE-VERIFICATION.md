# Release verification — 2026-11-18

## Executed locally

A fresh local Git clone was installed and built with Node 22.23.5 from the public-package lockfile. Build, syntax checks, all 330 tests and the public source scan passed there. No original workspace assets or environment files were used.

- Portable build completed using only bundled sources/assets.
- JavaScript syntax/public-build check passed for 93 files, including nested staff and game assets.
- Full automated suite: 330 passed, 0 failed (321 existing assertions/tests plus 9 new demo integration tests).
- Public source pattern scan found no matched private keys, credential tokens, personal email literals or machine-specific code paths.
- An independent read-only review preserved all 127 client files, 23 server modules and 3 Netlify adapters; production API/authentication contents match the original local source.
- Independent exact-value scan compared 5 private source values locally, without publishing their values: 0 matches in the public source set.
- Independent HTTP isolation review passed 23 checks: source/private-path denial, Customer/Guest rejection from Staff APIs, Origin/CSRF/Host guards, reset rules, local Wallet receipts and error scenarios. Outbound transport trap observed 0 external attempts.

## Browser journey

- Customer inspected at measured width 390px; document scroll width 390px and no observed broken loaded images on the home view.
- No-login Customer selected Basic Facial and an available time, reached review and confirmed the booking.
- The same booking appeared in Admin at its normal measured 1280px-wide browser view.
- Staff attendance recorded successfully; Customer rewards then displayed 5/5 stamps and the newly earned facial reward.
- Intentional Admin read error was shown; the recovery control returned to the ready dashboard.
- Found and fixed a demo-toolbar overlap with the mobile booking CTA; reloaded and verified the CTA continued to date/time selection.
- Saved Customer rewards/confirmation and Admin dashboard/arrival captures in the local release evidence. Two synthetic-data screenshots are included in `docs/images/`.

## Scope limits

Source, HTTP and selected browser journeys were reviewed. Not every screenshot/PDF was forensically inspected, and not every visual/state combination was manually exercised. No full accessibility assessment, external inbox/device delivery, real payment, live provider mutation or production deployment is claimed. Local data is synthetic and resets on server restart.

The public repository and anonymous download/clone are verified separately at publication time. An optional workflow example is included as `docs/verify-workflow.example.yml`; automatic Actions is not enabled by this release. The current GitHub authorization does not include workflow-write scope.
