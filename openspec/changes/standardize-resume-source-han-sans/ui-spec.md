## Page Goal

Ensure resume editing preview and exported resumes use one consistent default Chinese sans-serif font: `Source Han Sans SC`.

## User Scenario

Users edit a resume in the preview surface and export it to PDF/HTML. The rendered typography should use the same intended default font across preview and export so spacing, line breaks, and pagination are more predictable.

## Scope

- Applies to resume paper surfaces: `#resume-paper` and `#resume-paper-export`.
- Applies to default resume content font and module title font.
- Does not change resume layout, colors, spacing controls, toolbar layout, template visuals, or export workflow.

## Typography Rules

- Primary resume font family: `Source Han Sans SC`.
- Acceptable runtime fallbacks only for font availability: `Source Han Sans`, `Noto Sans CJK SC`, `Noto Sans SC`, `sans-serif`.
- Existing font size, line height, module spacing, paragraph spacing, and title size settings remain unchanged.
- Body and module title fonts must resolve from `Source Han Sans SC`; stored legacy font-family fields are ignored by preview/export rendering.

## Interaction States

- Settings panel must not show content font or title font dropdowns.
- Translation flow must not show auto-font/fallback controls or font-adjustment hints.
- No new loading, empty, or error states are introduced.

## Responsive Rules

- No breakpoint, page width, zoom, or mobile layout behavior changes.
- Existing preview and export sizing rules remain authoritative.

## Accessibility And Usability

- Preserve existing text contrast and readable sizing.
- Avoid remote font loading that can fail during PDF generation or create invisible text.
- Do not use proprietary Microsoft font files in the app bundle or Docker image.

## Verification

- Inspect resume preview CSS to confirm Source Han Sans SC is the first default.
- Confirm export HTML inlines the same CSS used by preview.
- Build the frontend and run targeted backend tests for changed Go code.
