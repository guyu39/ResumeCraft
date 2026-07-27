## ADDED Requirements

### Requirement: Source Han Sans SC is the default resume font
The system SHALL use `Source Han Sans SC` as the default content font and module title font for newly created or automatically defaulted resume style settings.

#### Scenario: New resume uses Source Han Sans SC
- **WHEN** a resume is created without an explicit font family
- **THEN** the resume style settings use `Source Han Sans SC` for both content and module title fonts

#### Scenario: Industry preset uses Source Han Sans SC unless explicitly changed by user
- **WHEN** a built-in industry template preset applies default typography
- **THEN** the preset resolves to `Source Han Sans SC` as the resume font family

### Requirement: Resume preview and export prefer the same font
The system SHALL render the resume editing preview and exported resume HTML with the same `Source Han Sans SC` default font rule.

#### Scenario: Preview uses Source Han Sans SC default
- **WHEN** the resume preview renders without an explicit `--resume-font-family`
- **THEN** the resume paper resolves to `Source Han Sans SC` before any fallback font

#### Scenario: Export uses Source Han Sans SC default
- **WHEN** the frontend generates export HTML for backend PDF rendering
- **THEN** the inlined CSS includes the same resume paper font rule used by editing preview

### Requirement: Backend fallback uses Source Han Sans SC
The system SHALL return `Source Han Sans SC` when backend resume storage needs to provide missing style settings.

#### Scenario: Missing backend style settings
- **WHEN** a resume record has nil or missing style settings
- **THEN** backend fallback style settings use `Source Han Sans SC` as the font family

### Requirement: Font family is not user configurable
The system SHALL NOT expose user-facing controls that allow selecting resume content font family or module title font family.

#### Scenario: Settings panel omits font family controls
- **WHEN** the user opens resume typography settings
- **THEN** the settings panel does not show content font or title font family dropdowns

#### Scenario: Existing resume contains another font
- **WHEN** a saved resume contains an explicit font family other than `Source Han Sans SC`
- **THEN** preview and export rendering still use `Source Han Sans SC`

#### Scenario: Translation omits font family controls
- **WHEN** the user opens the resume translation flow
- **THEN** the translation UI does not show automatic font fallback controls or font adjustment hints
