## Context

ResumeCraft currently uses a mixed font stack for resume rendering: frontend defaults include Microsoft YaHei, PingFang SC, Noto Sans SC, SimSun, and Source Han Sans; Docker maps several proprietary/platform fonts to WenQuanYi or Noto fonts. This makes local editing preview and server-side Chromium PDF export sensitive to each machine's installed fonts.

The user wants Source Han Sans SC to be the single default font for resume editing preview and export. The implementation should avoid bundling Microsoft fonts or relying on remote web-font CDNs.

## Goals / Non-Goals

**Goals:**
- Use `Source Han Sans SC` as the default resume content font and module title font.
- Make resume font family non-configurable in the UI.
- Keep resume preview and export HTML aligned by using the same CSS variable/default font stack.
- Ensure backend fallback style settings produce the same default font name when style settings are absent.
- Preserve existing layout, spacing, color, and export behavior.

**Non-Goals:**
- Do not redesign the settings panel or resume templates.
- Do not remove the style settings fields from existing resume data.
- Do not migrate historical records in the database.
- Do not bundle Microsoft YaHei or other proprietary fonts.
- Do not add a large or low-confidence third-party font package.
- Do not preserve old saved font-family choices during preview/export rendering.

## Decisions

1. **Centralize the default font name in frontend resume types.**
   - Use a `DEFAULT_RESUME_FONT_FAMILY` constant with value `Source Han Sans SC`.
   - Existing default style settings and industry presets reference this constant where they previously used platform-specific CJK fonts.
   - Alternative considered: replace only CSS fallback. Rejected because new resume JSON would still persist old default font names.

2. **Make resume CSS prefer Source Han Sans SC for preview and export.**
   - `#resume-paper` and `#resume-paper-export` will resolve `--resume-font-family` with `Source Han Sans SC` as the default and with narrow open-font fallbacks.
   - Export keeps reusing the same inlined CSS path, so no separate export-only font rule is introduced.
   - Alternative considered: remote Google/Adobe web font import. Rejected because export should work without external network access from the renderer.

3. **Remove user-facing font family controls.**
   - Resume settings must not expose content font or module title font dropdowns.
   - Translation must not expose auto-font/fallback toggles or show font-adjustment hints.
   - Existing `fontFamily` and `moduleTitleFontFamily` fields remain in data only for backward compatibility, but preview/export rendering ignores them.

4. **Update runtime font aliasing for deployment.**
   - Docker fontconfig should map legacy or platform font family names toward `Source Han Sans SC` / `Noto Sans CJK SC`.
   - Debian `fonts-noto-cjk` is retained as the reliable packaged CJK sans font; Noto CJK is derived from Source Han Sans and works as an open fallback when Source Han Sans SC is not installed.

## Risks / Trade-offs

- **Risk: Source Han Sans SC is not installed locally.** → CSS falls back to Source Han Sans / Noto Sans CJK SC / Noto Sans SC, while the persisted default remains Source Han Sans SC.
- **Risk: Existing resumes contain explicit old font fields.** → Keep fields for data compatibility, but force preview/export rendering to Source Han Sans SC.
- **Risk: Server rendering still differs if the exact Source Han Sans SC binary is absent.** → Docker aliasing reduces the difference; exact pixel matching requires installing the same Source Han Sans SC font file in both local preview and server image.
