package sanitizer

import (
	"strings"
	"testing"
)

func TestMaskChineseName(t *testing.T) {
	san := New(DefaultConfig())
	input := "姓名：张三，性别：男"
	masked := san.Mask(input)

	// 姓名应被替换
	if strings.Contains(masked, "张三") {
		t.Errorf("Expected name to be masked, got: %s", masked)
	}
	if !strings.Contains(masked, "[NAME_") {
		t.Errorf("Expected NAME placeholder, got: %s", masked)
	}
}

func TestMaskPhone(t *testing.T) {
	san := New(DefaultConfig())
	input := "手机：13812345678"
	masked := san.Mask(input)

	if strings.Contains(masked, "13812345678") {
		t.Errorf("Expected phone to be masked, got: %s", masked)
	}
	if !strings.Contains(masked, "[PHONE_") {
		t.Errorf("Expected PHONE placeholder, got: %s", masked)
	}
}

func TestMaskEmail(t *testing.T) {
	san := New(DefaultConfig())
	input := "邮箱：test@example.com"
	masked := san.Mask(input)

	if strings.Contains(masked, "test@example.com") {
		t.Errorf("Expected email to be masked")
	}
	if !strings.Contains(masked, "[EMAIL_") {
		t.Errorf("Expected EMAIL placeholder, got: %s", masked)
	}
}

func TestMaskAndUnmaskRoundTrip(t *testing.T) {
	san := New(DefaultConfig())
	input := "姓名：张三，手机：13812345678，邮箱：zhangsan@example.com，地址：北京市朝阳区望京SOHO"

	masked := san.Mask(input)
	restored := san.Unmask(masked)

	if restored != input {
		t.Errorf("Round-trip failed.\n  original: %s\n  restored: %s", input, restored)
	}
}

func TestNoFalsePositiveDegree(t *testing.T) {
	san := New(DefaultConfig())
	input := "学历：本科，硕士，博士"

	masked := san.Mask(input)

	// 学历枚举值不应被替换
	if masked != input {
		t.Errorf("Expected no masking for degree enums, got: %s", masked)
	}
}

func TestNoDoubleMask(t *testing.T) {
	san := New(DefaultConfig())
	// 先做一次脱敏，再做第二次，应该不会多出额外占位符
	masked1 := san.Mask("姓名：张三")
	masked2 := san.Mask(masked1)

	if masked1 != masked2 {
		t.Errorf("Double masking should be idempotent.\n  first:  %s\n  second: %s", masked1, masked2)
	}
}

func TestCustomKeywords(t *testing.T) {
	cfg := DefaultConfig()
	cfg.CustomKeywords = []string{"天枢", "北斗"}
	san := New(cfg)

	input := "负责天枢推荐系统和北斗数据分析平台的开发"
	masked := san.Mask(input)

	if strings.Contains(masked, "天枢") || strings.Contains(masked, "北斗") {
		t.Errorf("Expected custom keywords to be masked, got: %s", masked)
	}
	if !strings.Contains(masked, "[CODE_") {
		t.Errorf("Expected CODE placeholder for custom keywords, got: %s", masked)
	}
}

func TestUnmaskOrderIndependent(t *testing.T) {
	san := New(DefaultConfig())
	// 多种类型混合
	input := "张三的手机号是13812345678，邮箱zhangsan@test.com"
	masked := san.Mask(input)
	restored := san.Unmask(masked)

	if restored != input {
		t.Errorf("Unmask order bug.\n  original: %s\n  restored: %s", input, restored)
	}
}

func TestSkipPhone(t *testing.T) {
	cfg := DefaultConfig()
	cfg.SkipPhone = true
	san := New(cfg)

	input := "手机：13812345678"
	masked := san.Mask(input)

	if !strings.Contains(masked, "13812345678") {
		t.Errorf("Expected phone NOT to be masked when SkipPhone=true, got: %s", masked)
	}
}

func TestEmptyInput(t *testing.T) {
	san := New(DefaultConfig())
	masked := san.Mask("")
	restored := san.Unmask("")

	if masked != "" || restored != "" {
		t.Error("Empty input should stay empty")
	}
}

func TestSanitizerConcurrency(t *testing.T) {
	// 并发安全：每个 goroutine 用自己的 Sanitizer
	done := make(chan bool)
	for i := 0; i < 10; i++ {
		go func() {
			san := New(DefaultConfig())
			masked := san.Mask("张三 13812345678")
			restored := san.Unmask(masked)
			if restored != "张三 13812345678" {
				t.Errorf("Concurrent round-trip failed: %s", restored)
			}
			done <- true
		}()
	}
	for i := 0; i < 10; i++ {
		<-done
	}
}

func TestSalaryMask(t *testing.T) {
	san := New(DefaultConfig())
	input := "期望薪资：20k-30k，目前薪资：25K/月"
	masked := san.Mask(input)

	if strings.Contains(masked, "20k") || strings.Contains(masked, "25K") {
		t.Errorf("Expected salary to be masked, got: %s", masked)
	}
}

func BenchmarkMask(b *testing.B) {
	input := `姓名：张三
手机：13812345678
邮箱：zhangsan@example.com
地址：北京市朝阳区望京SOHO T3 12层
GitHub：https://github.com/zhangsan
工作经历：2019-2022年就职于字节跳动，担任高级后端工程师，负责天枢推荐系统核心模块开发。
学历：本科 - 清华大学`

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		// 每次重新创建 Sanitizer（模拟真实场景）
		s := New(DefaultConfig())
		s.Mask(input)
	}
}
