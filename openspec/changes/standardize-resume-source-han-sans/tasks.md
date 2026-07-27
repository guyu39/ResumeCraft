## 1. Frontend Defaults

- [x] 1.1 Add a shared frontend default resume font constant for `Source Han Sans SC`.
- [x] 1.2 Update default resume style settings and built-in presets to use the shared default font.
- [x] 1.3 Keep existing style-settings fields compatible while defaulting them to Source Han Sans SC.

## 2. Rendering And Export

- [x] 2.1 Update resume preview/export CSS to prefer Source Han Sans SC for resume paper rendering.
- [x] 2.2 Confirm export HTML keeps using the same inlined CSS path and needs no separate export-only font override.

## 3. Backend And Deployment

- [x] 3.1 Update backend fallback resume style settings to use Source Han Sans SC.
- [x] 3.2 Update Docker fontconfig aliases so legacy/platform CJK font names resolve toward Source Han Sans SC-compatible sans fonts.

## 4. Fixed Font Enforcement

- [x] 4.1 Remove resume font family dropdowns from settings UI.
- [x] 4.2 Force preview/export style variables to use Source Han Sans SC even when legacy font fields exist.
- [x] 4.3 Remove translation auto-font controls and font adjustment hints.

## 5. Verification

- [x] 5.1 Run frontend build verification.
- [x] 5.2 Run targeted backend Go test verification.
- [x] 5.3 Search for remaining old resume default font references and confirm any leftovers are intentionally out of scope.
