# Clinime design system

Portable reference sources for Clinime foundations, components, icons, typography and states. This is a design-system specimen; the current accepted application lives in the root `client/` directory.

- `DESIGN.md`: design decisions and historical reference notes.
- `tokens/`: CSS and DTCG-style token sets, light/dark themes and typography.
- `source/brand/`: supplied identity assets and source references.
- `source/icons/`: original SVGs, bilingual labels, manifests and license.
- `source/fonts/`: Arabic companion font and license.
- `spec/`: component/state contracts and native property mappings.
- `preview/`: interactive bilingual light/dark component specimen with fictional records.
- `build/`: historical token and Figma construction helpers. These do not replay every later native refinement.
- `figma-state.json`: historical native-file identifiers; access to those files is separate from this public repository.

## View the specimen

```sh
python3 -m http.server 8792 --bind 127.0.0.1 --directory preview
```

Open http://127.0.0.1:8792. From the repository root, use `--directory design-system/preview` instead. No account is needed. The specimen simulates its sample actions and does not book or charge anyone.

## Use the tokens

Import `tokens/clinime-v2.css` and `tokens/typography.css`, retaining the relative font paths. Theme overrides use `[data-theme="dark"]`. Regenerate token exports from this directory with `python3 build/export-tokens.py`. Check real consumer states when changing tokens.

For the optional historical browser check, install Playwright in your chosen development environment, install its Chromium browser, start the specimen on port 8792 and run `node preview/qa/verify.cjs`. Playwright is not required to run the clinic demo.

Historical counts/captures in source reference documents are dated records. Private evidence and redundant old archives are not distributed here; they do not establish a fresh verification or complete accessibility conformance. Included license and provenance files remain applicable.
