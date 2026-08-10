package job_posting

import (
	"testing"
	"time"
)

func TestToPostingsFillsDefaultOpenDate(t *testing.T) {
	records := []map[string]string{
		{
			"企业名称": "测试公司",
			"招聘类型": "日常实习",
			"工作地点": "广州",
			"招聘岗位": "开发",
			// 无「开启时间」字段
		},
		{
			"企业名称": "带日期公司",
			"招聘类型": "暑期实习",
			"开启时间": "2026 年 7 月 9 日",
			"工作地点": "北京",
			"招聘岗位": "算法",
		},
	}
	postings, errs := toPostings(records)
	if len(errs) != 0 {
		t.Fatalf("unexpected parse errors: %v", errs)
	}
	if len(postings) != 2 {
		t.Fatalf("postings = %d, want 2", len(postings))
	}
	// 无开启时间的记录补默认 2026-01-01
	if postings[0].OpenDate == nil {
		t.Fatal("open date should be filled with default")
	} else if !postings[0].OpenDate.Equal(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("open date = %v, want 2026-01-01", *postings[0].OpenDate)
	}
	// 有开启时间的记录保持原值
	if postings[1].OpenDate == nil || !postings[1].OpenDate.Equal(time.Date(2026, 7, 9, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("open date = %v, want 2026-07-09", postings[1].OpenDate)
	}
}

func TestToPostingsStillFiltersDirtyRows(t *testing.T) {
	// 只有企业名称、核心字段全空的行必须继续被过滤（补默认日期不能绕过脏数据过滤）
	records := []map[string]string{
		{"企业名称": "菜鸟（过几天补充）"},
	}
	postings, errs := toPostings(records)
	if len(errs) != 0 {
		t.Fatalf("unexpected parse errors: %v", errs)
	}
	if len(postings) != 0 {
		t.Fatalf("dirty row should be filtered, got %d postings", len(postings))
	}
}
