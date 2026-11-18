# No-login demo

Run `npm ci` followed by `npm start` from the repository root. Open http://127.0.0.1:4173/demo. Node 22+ is required. No `.env`, email address, password, cloud account or private key is needed.

To change the port on macOS/Linux:

```sh
npm run demo -- --port=4180
```

The server binds to `127.0.0.1`. Its default identity selection is deliberately limited to this synthetic local environment; it is not an authentication design for real clinic data.

## Entry points

| URL | Purpose |
| --- | --- |
| `/demo` | Launcher and links to the implemented screens |
| `/customer` | Automatic sample customer Sara |
| `/admin` | Automatic sample staff/manager identity |
| `/customer?actor=friend#/loyalty` | Recipient Reem, for reward gifting |
| `/customer?actor=guest#/auth` | Optional original authentication/OTP screens |
| `/demo/mail` | Local captured email text; nothing is delivered externally |
| `/demo/card` | Local card preview, no real Apple/Google Wallet pass |
| `/demo/health` | Active dataset, actors and transport boundaries |

Keep Customer and Admin in separate tabs. They share the same scenario ledger but retain their own actor context. If you change the scenario in one tab, choose the same scenario in the other to inspect the same clinic.

## States

Choose a state from the floating **تجربة محلية · Demo** control, or append `?scenario=STATE` before the URL hash.

| State | What to inspect |
| --- | --- |
| `ready` | Sample appointments, seven specialists, services, stock, receipts, rewards/referrals and game participants |
| `empty` | Empty customer/staff records and the original empty views |
| `slow` | Delayed API responses and existing loading/retry behavior |
| `error` | Intentional API read failure and visible recovery |
| `insufficient` | Short historical data window for dashboard forecasts |

Use **استعادة الحالة الجاهزة** to recover from the error/slow scenario. **إعادة بيانات هذه الحالة** recreates that scenario. Server restart resets all synthetic ledgers. Browser UI preferences, comparison references and locally saved plans may remain in browser storage.

## Review flows

1. **Booking:** Customer → services → choose an option/specialist → available date/time → attendee → review → confirm. Check the booking in appointments and the corresponding local email.
2. **Shared staff state:** Open the same booking in Admin. Record arrival, make the explicit session decision, start/finish the session and record a local receipt. Refresh Customer to inspect the authoritative updated status.
3. **Five-visit reward:** Sara starts with four stamps in the current card and a previously earned facial reward. Use the eligible arrival flow to add a stamp; inspect the resulting free-facial reward. Visit stamps, eligibility/settlement and reward redemption remain independent business states.
4. **Gift:** Gift a reward to `friend@example.invalid`; open the recipient's rewards from the demo control. Use the received reward through the existing booking path.
5. **Referrals:** Inspect Sara's sample referral code, balance and pending referred visit. Use the original staff completion/receipt flow to inspect credit eligibility; no real cash is transferred.
6. **Care Point:** Open the doctor launcher or the Care Point link, complete onboarding/name and a round, inspect accepted points/rank, then inspect/select a participant in Admin's contest view. Any award and notification stay in the local ledger/inbox.
7. **Operations:** Inspect appointments across waiting/session/checkout/closed/cancelled, edit a service, inspect specialists, reviews, products, material catalog, stock counts/history and the original role picker.
8. **Exceptions:** Select empty/slow/error/insufficient, inspect the rendered state, then recover to ready. The optional guest view lets reviewers inspect email/code, expired/invalid input and local sign-in without waiting for an external inbox.

All actions remain subject to their existing business rules. Recording a receipt is a simulated manual accounting event, not a card charge. A session still has an explicit human decision and required acknowledgement; the demo does not invent clinical approval.

## External boundaries

- The fixture uses local memory and fake mail. Server outbound transport is rejected.
- Wallet campaign/enrollment uses a local preview receipt, not Loopy or a real pass.
- External links are explained locally. The demo does not publish content, contact a client or use AI/provider keys.
- Maeen retains its original Coming Soon state. Historical Maeen/provider tools are available as source but are not started by `npm start`.
- The production API and Netlify adapter are included as source and retain authentication. The live clinic is not modified by this repository.
