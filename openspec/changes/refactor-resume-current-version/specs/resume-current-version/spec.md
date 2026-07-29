## ADDED Requirements

### Requirement: Every resume has one current version
The system SHALL create exactly one `current` resume version in the same transaction as a new resume and SHALL bind it through `current_version_id`.

#### Scenario: Create a new resume
- **WHEN** an authenticated user creates a resume
- **THEN** the transaction creates the resume metadata and one current version containing the initial complete resume JSON
- **AND** the resume points to that current version before the transaction commits

#### Scenario: Creation fails midway
- **WHEN** current version creation or pointer update fails
- **THEN** the entire resume creation transaction is rolled back

### Requirement: Current and selected named branch stay synchronized
The system SHALL persist ordinary resume edits to the owned current working version and SHALL synchronize content to the selected named snapshot in the same transaction.

#### Scenario: Save current content
- **WHEN** the client submits complete content with the expected current version
- **THEN** the system updates current content, increments its version, updates its `updated_at`, and returns the new version
- **AND** if a named snapshot is selected, the system updates that snapshot content and `updated_at` without changing other snapshots

#### Scenario: Save with a stale version
- **WHEN** the expected version does not match the owned current version
- **THEN** the system returns a version conflict without changing current or any manual snapshot

### Requirement: Manual snapshots are editable named branches
The system SHALL create manual snapshots from the PostgreSQL current version and SHALL update only the selected manual snapshot during ordinary editing.

#### Scenario: Create a named snapshot
- **WHEN** the user creates a manual snapshot after pending edits are flushed
- **THEN** the system copies current content into a new manual version and records it as the current baseline

#### Scenario: Edit two named snapshots independently
- **WHEN** the user restores manual snapshot A and then edits the resume
- **THEN** the system updates current and manual snapshot A
- **AND** after the user restores and edits snapshot B, switching back to A returns A's saved edits while B retains its own edits

### Requirement: Restore copies a snapshot into current
The system SHALL restore an owned manual snapshot by copying its content into current and updating the resume baseline in one transaction.

#### Scenario: Restore an owned snapshot
- **WHEN** the user restores a manual snapshot belonging to the same resume
- **THEN** current receives the snapshot content, current version increments, and `based_on_snapshot_id` points to that manual snapshot

#### Scenario: Restore a foreign snapshot
- **WHEN** a snapshot belongs to another user or another resume
- **THEN** the system returns not found and changes no content

### Requirement: Active named branch cannot be deleted
The system SHALL reject deletion of the manual snapshot currently referenced by `based_on_snapshot_id` and SHALL require the user to switch branches first.

#### Scenario: Delete the current baseline
- **WHEN** the user deletes the manual snapshot referenced by `based_on_snapshot_id`
- **THEN** the system returns an active-snapshot conflict and changes no content, version, association, or snapshot
- **AND** the client tells the user to switch to another branch before deleting

#### Scenario: Delete a non-current snapshot
- **WHEN** the user deletes a manual snapshot that is not referenced by `based_on_snapshot_id`
- **THEN** the system checks whether a job application references that snapshot
- **AND** deletes it only when no active application reference exists
- **AND** does not change current content or the active branch

#### Scenario: Delete a snapshot referenced by an application
- **WHEN** a job application references the manual snapshot
- **THEN** the system rejects deletion with a snapshot-in-use conflict

### Requirement: Snapshot access is owner scoped
The system SHALL authorize snapshot list, detail, label update, deletion, restore, and comparison using the authenticated user and parent resume.

#### Scenario: List owned snapshots
- **WHEN** a user requests snapshots for a resume they own
- **THEN** the system returns only versions belonging to that resume and excludes current from the user snapshot timeline
- **AND** the client renders the snapshot timeline only when at least two named snapshots exist

#### Scenario: Read another user's snapshot UUID
- **WHEN** a user supplies a snapshot UUID owned by another user
- **THEN** the system returns not found without revealing that the snapshot exists

#### Scenario: Compare snapshots from different resumes
- **WHEN** either comparison snapshot does not belong to the requested resume and user
- **THEN** the system returns not found and does not return either snapshot's content

### Requirement: Version timestamps have distinct semantics
The system SHALL preserve `created_at` as creation time and SHALL update `updated_at` whenever version content or label changes.

#### Scenario: Edit current repeatedly
- **WHEN** current content is saved multiple times
- **THEN** `created_at` remains unchanged and `updated_at` advances after each successful save

### Requirement: Legacy resume content remains rollback compatible
During the compatibility phase, the system SHALL read current as authoritative, SHALL recover missing current from legacy resume content, and SHALL keep the legacy content mirror synchronized until its removal is separately approved.

#### Scenario: Load a migrated resume
- **WHEN** a resume has a bound current version
- **THEN** the API returns current content even if legacy content differs

#### Scenario: Load a legacy resume without current
- **WHEN** a resume has legacy content but no current version
- **THEN** the system creates or resolves one current version without creating duplicates and returns that content

### Requirement: PostgreSQL confirms saved state
The system SHALL treat a resume as automatically saved only after the PostgreSQL transaction updating current commits.

#### Scenario: Database commit succeeds
- **WHEN** the current update transaction commits
- **THEN** the API returns the confirmed current version and the client may display an automatically saved state

#### Scenario: Database commit fails
- **WHEN** the current update transaction fails or conflicts
- **THEN** the client retains its pending local revision and SHALL NOT display that revision as automatically saved
