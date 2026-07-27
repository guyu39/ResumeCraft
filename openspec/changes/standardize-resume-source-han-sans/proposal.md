## Why

Local preview and server-side PDF export currently depend on different system font fallbacks, which causes visible differences in font metrics, spacing, wrapping, and pagination. Standardizing the resume surface on Source Han Sans SC gives resume editing preview and export a single intended default font.

## What Changes

- Set Source Han Sans SC as the only default resume content font and module title font for new/auto-created resume style settings.
- Make the resume preview and export CSS prefer Source Han Sans SC for `#resume-paper` and `#resume-paper-export`.
- Remove user-facing font family selection from resume settings and translation flows.
- Update backend fallback style settings so legacy records without style settings resolve to Source Han Sans SC.
- Update server fontconfig/Docker aliasing so existing legacy names resolve toward Source Han Sans SC-compatible CJK sans fonts where available.
- Keep the change scoped to resume editing preview/export typography; no layout, color, or interaction redesign.

## Capabilities

### New Capabilities
- `resume-font-standardization`: Defines the default font contract for resume editing preview and PDF/export rendering.

### Modified Capabilities
- None.

## Impact

- Frontend style defaults and resume preview CSS.
- Export HTML generation because it inlines the frontend CSS used by the cloned resume paper.
- Backend resume fallback defaults for records with missing style settings.
- Docker/fontconfig configuration for deployed Chromium rendering.
- Build verification through `npm run build`; backend verification where touched through `go test`.
