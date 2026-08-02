package job_application

import (
	"database/sql"
	"testing"
)

func TestResolveAssociationUpdate(t *testing.T) {
	currentSnapshot := "snapshot-1"
	tests := []struct {
		name         string
		params       UpdateApplicationParams
		wantResume   string
		wantSnapshot *string
	}{
		{
			name:         "unrelated update keeps association",
			params:       UpdateApplicationParams{},
			wantResume:   "resume-1",
			wantSnapshot: &currentSnapshot,
		},
		{
			name: "explicit empty snapshot clears association",
			params: UpdateApplicationParams{
				SnapshotVersionIDProvided: true,
			},
			wantResume: "resume-1",
		},
		{
			name: "new snapshot replaces association",
			params: UpdateApplicationParams{
				SnapshotVersionID:         "snapshot-2",
				SnapshotVersionIDProvided: true,
			},
			wantResume:   "resume-1",
			wantSnapshot: stringPointer("snapshot-2"),
		},
		{
			name: "changing resume without snapshot clears association",
			params: UpdateApplicationParams{
				ResumeID: "resume-2",
			},
			wantResume: "resume-2",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resumeID, snapshotID := resolveAssociationUpdate("resume-1", &currentSnapshot, tt.params)
			if resumeID != tt.wantResume {
				t.Fatalf("resume id = %q, want %q", resumeID, tt.wantResume)
			}
			if !equalOptionalString(snapshotID, tt.wantSnapshot) {
				t.Fatalf("snapshot id = %v, want %v", snapshotID, tt.wantSnapshot)
			}
		})
	}
}

func TestOptionalStringFromNull(t *testing.T) {
	if got := optionalString(sql.NullString{}); got != nil {
		t.Fatalf("optionalString(NULL) = %v, want nil", got)
	}
	got := optionalString(sql.NullString{String: "snapshot-1", Valid: true})
	if got == nil || *got != "snapshot-1" {
		t.Fatalf("optionalString(valid) = %v, want snapshot-1", got)
	}
}

func stringPointer(value string) *string { return &value }

func equalOptionalString(left, right *string) bool {
	if left == nil || right == nil {
		return left == right
	}
	return *left == *right
}
