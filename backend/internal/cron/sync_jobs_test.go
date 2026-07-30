package cron

import (
	"testing"
	"time"
)

func TestNewJobSyncSchedulerUsesHourlyDefault(t *testing.T) {
	scheduler := NewJobSyncScheduler(nil, 0)

	if scheduler.interval != time.Hour {
		t.Fatalf("expected default interval %s, got %s", time.Hour, scheduler.interval)
	}
}

func TestNewJobSyncSchedulerKeepsConfiguredInterval(t *testing.T) {
	configured := 30 * time.Minute
	scheduler := NewJobSyncScheduler(nil, configured)

	if scheduler.interval != configured {
		t.Fatalf("expected configured interval %s, got %s", configured, scheduler.interval)
	}
}
