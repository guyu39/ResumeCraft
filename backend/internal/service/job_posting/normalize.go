package job_posting

import "strings"

// 招聘类型 / 行业在腾讯文档中为自由文本（分别有 75 / 543 种变体），
// 直接作为筛选枚举会产生大量杂乱选项。下列函数在入库时将其归一化为少量大类，
// 仅用于筛选与枚举；原始文本仍保留在 recruitment_type / industry 用于行内展示。

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

// normalizeRecruitmentType 将招聘类型归一化为大类。
// 顺序即优先级：实习占比最高且优先于校招，避免「暑期实习（校招储备）」被归到校招。
func normalizeRecruitmentType(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	switch {
	case containsAny(s, "博士", "博后"):
		return "博士/科研"
	case containsAny(s, "竞赛", "比赛", "大赛"):
		return "竞赛"
	case containsAny(s, "社招"):
		return "社招"
	case containsAny(s, "实习"):
		return "实习"
	case containsAny(s, "秋招", "校招", "校园", "提前批", "全职", "管培", "春招", "招聘"):
		return "校招"
	case containsAny(s, "训练营", "开放日", "夏令营", "顶尖人才", "计划", "项目", "训练", "营"):
		return "专项计划"
	default:
		return "其他"
	}
}

// normalizeIndustry 将所属行业归一化为大类。顺序即优先级。
func normalizeIndustry(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	switch {
	case containsAny(s, "游戏"):
		return "游戏"
	case containsAny(s, "半导体", "芯片", "集成电路", "消费电子", "电子"):
		return "半导体/电子"
	case containsAny(s, "人工智能", "AI", "大模型", "AGI", "自动驾驶", "机器人", "多模态", "智能驾驶", "具身"):
		return "人工智能"
	case containsAny(s, "汽车", "电动"):
		return "汽车"
	case containsAny(s, "金融", "银行", "证券", "基金", "资本", "量化", "保险", "投资", "资管", "期货", "私募", "信托"):
		return "金融"
	case containsAny(s, "航空", "航天"):
		return "航空航天"
	case containsAny(s, "通信"):
		return "通信"
	case containsAny(s, "新能源", "光伏", "储能", "电池"):
		return "新能源"
	case containsAny(s, "制造", "装备", "硬件", "工业", "机械", "材料"):
		return "先进制造"
	case containsAny(s, "教育"):
		return "教育"
	case containsAny(s, "快消", "零售", "消费", "美妆", "食品", "饮", "服饰"):
		return "消费/零售"
	case containsAny(s, "医", "药", "生物", "健康"):
		return "医疗健康"
	case containsAny(s, "地产", "建筑", "建设", "规划", "设计院", "勘察", "勘测"):
		return "地产建筑"
	case containsAny(s, "能源", "电力", "石油", "化工"):
		return "能源化工"
	case containsAny(s, "物流", "供应链", "快递"):
		return "物流供应链"
	case containsAny(s, "互联网", "电商", "科技", "文娱", "软件", "云", "SaaS", "信息技术", "网络", "数字", "平台", "传媒", "文化"):
		return "互联网/科技"
	default:
		return "其他"
	}
}
