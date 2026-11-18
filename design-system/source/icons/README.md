# Clinime icon source pack

158 unique original icons from official `lucide-static@1.61.0`, retrieved 26 October 2026. This release adds 48 originals to the first 110 and preserves all previous icon entries and SVG bytes.

`icon-manifest.json` is the full release manifest. Each entry includes category, English/Arabic labels, a 24 px source specification, an explicit RTL decision, package/source location and SHA-256 hash. `icon-additions-manifest.json` contains the 48 additions only; `icon-additions-file-map.json` maps their names to absolute SVG paths for the current machine. `missing-names.txt` is the same addition list as plain text. It records the original expansion delta, not a claim that these names remain absent.

`cache/lucide-static-1.61.0.tgz` is the pinned downloaded upstream package. Its SHA-256 must equal `source_tarball_sha256` before extraction. All 158 SVG files were compared byte for byte with this archive and their manifest hashes, viewBox, stroke and fill attributes verified.

`reconcile-icon-pack.py` computes the union of the existing pack, `spec/component-contract.json` icon manifest/fields, `build/component-families.json` icon fields and literal icon names used by `build/components-figma.js`. New names must exist in the actual pinned archive and have reviewed bilingual labels; missing originals or labels stop the script. It appends without modifying existing entries, refreshes both source/preview sprites and updates the preview asset hash. Input hashes are recorded in the full manifest. The current contract and renderer require 136 unique names; the pack contains all of them plus the 22 retained original extras.

`build-icon-pack.py` bootstraps a new pack or delegates to reconciliation if one exists. Both scripts are idempotent for the current inputs. The source SVGs are unmodified: RTL mirroring belongs to a component instance/variant, never to the retained original file.

Retain the complete distributed `LICENSE` with this pack. Lucide uses ISC; the included Feather-derived notices use MIT. Official sources: [Lucide guide](https://lucide.dev/guide/), [license](https://lucide.dev/license), [pinned package](https://registry.npmjs.org/lucide-static/-/lucide-static-1.61.0.tgz).

Local source completion does not establish native Figma import completion. Native component counts, guide text and missing-only import results must be verified separately.
