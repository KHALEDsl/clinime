# Clinime mobile booking — reference-led visual revision

Date: 2026-10-27

Authoritative editable artifact: https://www.figma.com/design/5WVoJPHxwLqvhiy72BoRs9/Clinime-Components?node-id=77-49

## Applied direction

The user's three supplied Fresha screenshots determine the composition: category tiles and large horizontally scrolling image cards; a full-width photo above a rounded information surface; and vertical day pills above full-width time rows. Clinime retains navy, blush, Sora and Noto Sans Arabic.

- Home, Arabic and English: semantic category icons, large service cards, horizontal scrolling and navigation.
- Ten service catalogs: two-column photo cards and horizontally scrolling category controls with full category names.
- Forty detail/selected-service states: full-width image, information surface, readable price/duration, options and booking action.
- Eight date states: five-day strip, full-width time choices and an October date-picker action.
- Four calendar states: Arabic/English, preserving the selected time. Only October 29 and 30 are enabled; no month switching is implemented.
- Thirty-six other flow states: white surfaces, consistent Clinime actions, spacing and information hierarchy.
- All old raster imagery on this booking page was replaced. Five newly generated editorial images are illustrative; they do not document the actual clinic, a real patient, a verified treatment device or a clinical outcome.

## Verification

The live Figma prototype was exercised from home through category gallery, Hydrafacial Deluxe, clinic, calendar, October 30, 12:00, simulated Google sign-in, self-booking and review. Review displayed the selected service, SAR 850, 75 minutes and October 30 at 12:00. Home-card dragging, calendar opening and calendar-day selection worked in this run.

An independent visual review inspected current Arabic/English home, gallery and detail screenshots at 390×844. The reviewer confirmed distinct gallery images and the consultations icon, and reported no major visible defect in those sampled screens. Other-flow samples and date/calendar screens were inspected by their respective editors. This is not evidence that every state, input method or responsive size was exercised.

Final structural read: 107 top-level frames (including documentation and new calendar states), 378 interactive nodes, 91 image paints using only the five replacement hashes. All 294 baseline interactive node IDs still have reactions. This checks presence, not the correctness of every destination.

Figma authentication, availability and booking completion remain simulations. No production authentication, scheduling, payment or notification service was connected in this revision.

## Review links

- Home: https://www.figma.com/proto/5WVoJPHxwLqvhiy72BoRs9/Clinime-Components?node-id=78-1114&starting-point-node-id=78%3A986
- Catalog: https://www.figma.com/proto/5WVoJPHxwLqvhiy72BoRs9/Clinime-Components?node-id=78-1159&starting-point-node-id=78%3A986
- Detail: https://www.figma.com/proto/5WVoJPHxwLqvhiy72BoRs9/Clinime-Components?node-id=78-1217&starting-point-node-id=78%3A986
- Date: https://www.figma.com/proto/5WVoJPHxwLqvhiy72BoRs9/Clinime-Components?node-id=78-1693&starting-point-node-id=78%3A986

Native frame renders: home-final.png, services-final.png, detail-final.png and date-final.png in this folder.
