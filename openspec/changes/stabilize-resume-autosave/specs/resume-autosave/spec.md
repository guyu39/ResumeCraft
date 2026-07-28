## ADDED Requirements

### Requirement: Local edits are durably retained before cloud synchronization
The system SHALL persist the latest editable resume payload locally before attempting asynchronous cloud synchronization.

#### Scenario: Edit is retained locally during network failure
- **WHEN** the user changes any persisted resume field and the cloud request fails
- **THEN** the latest payload and its unacknowledged local revision remain available after refresh

#### Scenario: Refresh restores the latest unacknowledged revision
- **WHEN** a resume has a local revision greater than its acknowledged revision and the page is refreshed
- **THEN** the system restores that local payload and schedules cloud synchronization

### Requirement: Cloud saves are serialized and revision-aware
The system SHALL allow only one cloud save request per resume at a time and SHALL save a newer revision after an in-flight request completes.

#### Scenario: Edit occurs during an in-flight save
- **WHEN** revision 2 is being saved and the user creates revision 3
- **THEN** the system does not discard revision 3 and submits the latest payload after revision 2 completes

#### Scenario: Duplicate trigger has no duplicate write
- **WHEN** multiple save triggers occur without a new local revision
- **THEN** the system coalesces them and does not submit an unnecessary duplicate payload

### Requirement: The cloud payload covers all persisted resume fields
The system SHALL save title, locale, template, theme, style settings, modules, personal data, snapshot association, and snapshot drafts according to their respective server version domains.

#### Scenario: Locale and template survive reload
- **WHEN** the user changes the resume locale or template and cloud synchronization succeeds
- **THEN** the same locale and template are returned after a fresh load

#### Scenario: Snapshot draft changes are synchronized without content changes
- **WHEN** only a snapshot draft changes while the main resume content remains unchanged
- **THEN** the snapshot draft is still uploaded and its draft version is acknowledged

### Requirement: Save status reflects confirmed persistence
The system SHALL distinguish local retention, cloud synchronization in progress, confirmed cloud synchronization, offline pending synchronization, and cloud save failure.

#### Scenario: Successful save shows confirmation time
- **WHEN** the server confirms the latest local revision
- **THEN** the editor shows an automatic-save confirmation with the confirmation time

#### Scenario: Keepalive is not treated as confirmed save
- **WHEN** the page sends a keepalive request during unload
- **THEN** the system does not mark the payload as cloud-confirmed until a later server response confirms it

### Requirement: Key workflows request the required save guarantee
The system SHALL flush the current revision before workflows that depend on persisted resume state, including export, print, AI diagnosis, and JD analysis.

#### Scenario: Workflow starts after confirmed flush
- **WHEN** a workflow requests a flush and the latest revision is confirmed by the server
- **THEN** the workflow proceeds with the confirmed revision

#### Scenario: Flush fails
- **WHEN** a workflow requests a flush and cloud synchronization fails
- **THEN** the caller receives a failure result and the UI does not report that the cloud state is up to date

### Requirement: Single-device version conflicts are resolved automatically
The system SHALL resolve a version conflict without presenting a local-versus-cloud choice dialog.

#### Scenario: Conflict contains identical content
- **WHEN** the server returns 409 but the local and cloud persisted payload hashes match
- **THEN** the system aligns server versions and marks the local revision acknowledged

#### Scenario: Conflict contains unacknowledged local edits
- **WHEN** the server returns 409 and the local revision is newer than the acknowledged revision
- **THEN** the system obtains the latest server version and retries the local payload automatically

#### Scenario: Conflict contains no local edits
- **WHEN** the server returns 409 and there is no unacknowledged local revision
- **THEN** the system adopts the cloud payload and resets local sync metadata

### Requirement: Failed synchronization retries after transient recovery
The system SHALL retry transient save failures with bounded backoff and SHALL retry pending revisions when the browser reports that the network is online.

#### Scenario: Network recovers
- **WHEN** a pending local revision exists and the browser emits an online event
- **THEN** the system schedules synchronization for the latest pending revision

#### Scenario: Retry limit is reached
- **WHEN** bounded retries fail repeatedly
- **THEN** the system keeps the payload locally, shows a visible error state, and exposes a retry action

### Requirement: Redis is optional and never the authoritative save store
The system SHALL treat PostgreSQL as the authoritative resume store and SHALL NOT report a cloud save as successful solely because a Redis operation succeeded.

#### Scenario: Redis is unavailable
- **WHEN** a future optional Redis layer is unavailable
- **THEN** PostgreSQL-backed save behavior remains correct, possibly with reduced coalescing or throughput

#### Scenario: PostgreSQL commit fails after Redis enqueue
- **WHEN** an optional Redis queue accepts a save but the PostgreSQL transaction fails
- **THEN** the save is reported as failed and remains recoverable from the client local payload
