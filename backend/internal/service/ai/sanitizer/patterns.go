package sanitizer

import "regexp"

// 预编译的正则模式（避免运行时重复编译）
var (
	// 中文姓名：
	//   a) 姓名标识词后跟的 2-4 汉字（如 "姓名：张三"）
	//   b) 2-4 汉字后跟称谓（如 "张三先生"）
	//   c) 简历中姓名区域常见的 "XXX | 岗位" 模式
	reChineseName   = regexp.MustCompile(`(?:姓名|名字|候选人|Name|本人)\s*[:：]\s*[\x{4e00}-\x{9fa5}]{2,4}(?:\s|$|，|,|。|\.|\||[\x{4e00}-\x{9fa5}]{2,4}(?:女士|先生|同学|同志))`)
	reNameWithTitle = regexp.MustCompile(`[\x{4e00}-\x{9fa5}]{2,4}(?:女士|先生|同学|同志)`)
	reNameInHeader  = regexp.MustCompile(`^[\x{4e00}-\x{9fa5}]{2,4}\s*[\|｜]`) // "张三 | 高级工程师"

	// 手机号：1 开头 11 位
	rePhone = regexp.MustCompile(`1[3-9]\d{9}`)

	// 固定电话：区号-号码
	reTel = regexp.MustCompile(`0\d{2,3}-\d{7,8}`)

	// 邮箱
	reEmail = regexp.MustCompile(`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`)

	// 身份证号：18位
	reIDCard = regexp.MustCompile(`[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]`)

	// URL
	reURL = regexp.MustCompile(`https?://[^\s,，。；;、\n\r"]+`)

	// 地址：省/市/区/县/路/街/号/大厦/广场/中心/园/层/楼/栋/单元/室
	reAddress = regexp.MustCompile(`[\x{4e00}-\x{9fa5}]{2,}(?:省|市|自治区|特别行政区|区|县|镇|乡|路|街|道|巷|弄|号|大厦|广场|中心|花园|苑|园|层|楼|栋|单元|室|座|幢|弄|胡同)[\x{4e00}-\x{9fa5}\d\-#A-Za-z]*`)

	// Github / LinkedIn / 个人网站 URL 中的用户名
	reGithubUser = regexp.MustCompile(`github\.com/([a-zA-Z0-9_-]+)`)
	reLinkedIn   = regexp.MustCompile(`linkedin\.com/in/([a-zA-Z0-9_-]+)`)

	// 薪资：数字 + 单位
	reSalary = regexp.MustCompile(`\d{1,3}[kK]?\s?[-~至到]\s?\d{1,3}[kK]|[￥¥\d]+[kKwW万]?(?:/年|/月|元/月|元|K|k)`)
)
