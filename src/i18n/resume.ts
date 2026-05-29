/**
 * 简历组件 i18n 国际化字典
 *
 * 使用方式：import { useI18n } from '@/hooks/useI18n'
 *          const { t } = useI18n()
 *          t('personal.birthDate')  // → '出生年月' 或 'Date of Birth'
 */

type I18nDict = Record<string, { 'zh-CN': string; 'en-US': string }>

const dict: I18nDict = {
  // ========================
  // 个人信息
  // ========================
  'personal.basicInfo': { 'zh-CN': '基本信息', 'en-US': 'Basic Information' },
  'personal.name': { 'zh-CN': '姓名', 'en-US': 'Name' },
  'personal.namePlaceholder': { 'zh-CN': '张三', 'en-US': 'John Doe' },
  'personal.jobIntention': { 'zh-CN': '求职意向', 'en-US': 'Objective' },
  'personal.jobIntentionPlaceholder': { 'zh-CN': '前端开发工程师', 'en-US': 'Frontend Developer' },
  'personal.birthDate': { 'zh-CN': '出生年月', 'en-US': 'Date of Birth' },
  'personal.birthDatePlaceholder': { 'zh-CN': '选择出生年月', 'en-US': 'Select date of birth' },
  'personal.hometown': { 'zh-CN': '籍贯', 'en-US': 'Hometown' },
  'personal.hometownPlaceholder': { 'zh-CN': '北京市海淀区', 'en-US': 'New York, NY' },
  'personal.gender': { 'zh-CN': '性别', 'en-US': 'Gender' },
  'personal.education': { 'zh-CN': '学历', 'en-US': 'Education' },
  'personal.politics': { 'zh-CN': '政治面貌', 'en-US': 'Political Status' },
  'personal.workYears': { 'zh-CN': '工作年限', 'en-US': 'Work Experience' },
  'personal.contactInfo': { 'zh-CN': '联系方式', 'en-US': 'Contact' },
  'personal.phone': { 'zh-CN': '手机号', 'en-US': 'Phone' },
  'personal.phonePlaceholder': { 'zh-CN': '138-0000-0000', 'en-US': '+1 (555) 000-0000' },
  'personal.email': { 'zh-CN': '邮箱', 'en-US': 'Email' },
  'personal.personalAccount': { 'zh-CN': '个人账号（选填）', 'en-US': 'Personal Account (optional)' },
  'personal.personalAccountPlaceholder': { 'zh-CN': 'GitHub / Gitee / 个人主页账号', 'en-US': 'GitHub / Personal website' },
  'personal.city': { 'zh-CN': '所在城市（选填）', 'en-US': 'City (optional)' },
  'personal.cityPlaceholder': { 'zh-CN': '北京市', 'en-US': 'New York' },
  'personal.otherInfo': { 'zh-CN': '补充其他信息（标题：值）', 'en-US': 'Additional Info (Title: Value)' },
  'personal.add': { 'zh-CN': '添加', 'en-US': 'Add' },
  'personal.noOtherInfo': { 'zh-CN': '暂无补充信息，可添加如：期望薪资、到岗时间、婚姻状况等', 'en-US': 'No additional info yet. Add items like: Expected salary, availability, etc.' },
  'personal.otherTitlePlaceholder': { 'zh-CN': '标题，如：期望薪资', 'en-US': 'Title, e.g. Expected Salary' },
  'personal.otherValuePlaceholder': { 'zh-CN': '值，如：20k-30k', 'en-US': 'Value, e.g. $80k-$120k' },
  'personal.fixErrors': { 'zh-CN': '请修正以下问题：', 'en-US': 'Please fix the following:' },
  'personal.avatar': { 'zh-CN': '头像', 'en-US': 'Avatar' },
  'personal.personalAvatar': { 'zh-CN': '个人头像', 'en-US': 'Avatar' },
  'personal.avatarUploadHint': { 'zh-CN': '点击按钮上传，支持 JPG/PNG', 'en-US': 'Click to upload, JPG/PNG supported' },
  'personal.circle': { 'zh-CN': '圆形', 'en-US': 'Circle' },
  'personal.square': { 'zh-CN': '方形', 'en-US': 'Square' },
  'personal.selectImageFile': { 'zh-CN': '请选择图片文件', 'en-US': 'Please select an image file' },
  'personal.avatarUploadFailed': { 'zh-CN': '头像上传失败，请重试', 'en-US': 'Avatar upload failed, please retry' },
  'personal.invalidEmail': { 'zh-CN': '请输入有效的邮箱地址', 'en-US': 'Please enter a valid email address' },
  'personal.invalidPhone': { 'zh-CN': '请输入有效的手机号', 'en-US': 'Please enter a valid phone number' },
  'personal.yourName': { 'zh-CN': '你的姓名', 'en-US': 'Your Name' },
  'personal.selectOptional': { 'zh-CN': '请选择（选填）', 'en-US': 'Select (optional)' },
  'personal.selectPlaceholder': { 'zh-CN': '请选择', 'en-US': 'Select' },

  // ========================
  // 枚举选项
  // ========================
  'enum.male': { 'zh-CN': '男', 'en-US': 'Male' },
  'enum.female': { 'zh-CN': '女', 'en-US': 'Female' },
  'enum.juniorHigh': { 'zh-CN': '初中', 'en-US': 'Junior High' },
  'enum.secondaryVocational': { 'zh-CN': '中专', 'en-US': 'Vocational' },
  'enum.highSchool': { 'zh-CN': '高中', 'en-US': 'High School' },
  'enum.associate': { 'zh-CN': '大专', 'en-US': 'Associate' },
  'enum.bachelor': { 'zh-CN': '本科', 'en-US': "Bachelor's" },
  'enum.master': { 'zh-CN': '硕士', 'en-US': "Master's" },
  'enum.doctorate': { 'zh-CN': '博士', 'en-US': 'Doctorate' },
  'enum.masses': { 'zh-CN': '群众', 'en-US': 'Non-partisan' },
  'enum.leagueMember': { 'zh-CN': '共青团员', 'en-US': 'CYL Member' },
  'enum.partyMember': { 'zh-CN': '中共党员', 'en-US': 'CPC Member' },
  'enum.probationaryMember': { 'zh-CN': '中共预备党员', 'en-US': 'Probationary CPC Member' },
  'enum.democraticParty': { 'zh-CN': '民主党派', 'en-US': 'Democratic Party' },
  'enum.freshGrad': { 'zh-CN': '应届毕业生', 'en-US': 'Fresh Graduate' },
  'enum.under1Year': { 'zh-CN': '1年以下', 'en-US': '< 1 year' },
  'enum.1to3Years': { 'zh-CN': '1-3年', 'en-US': '1-3 years' },
  'enum.3to5Years': { 'zh-CN': '3-5年', 'en-US': '3-5 years' },
  'enum.5to10Years': { 'zh-CN': '5-10年', 'en-US': '5-10 years' },
  'enum.over10Years': { 'zh-CN': '10年以上', 'en-US': '10+ years' },
  'enum.collegeLevel': { 'zh-CN': '院级', 'en-US': 'College' },
  'enum.universityLevel': { 'zh-CN': '校级', 'en-US': 'University' },
  'enum.cityLevel': { 'zh-CN': '市级', 'en-US': 'City' },
  'enum.provincialLevel': { 'zh-CN': '省级', 'en-US': 'Provincial' },
  'enum.nationalLevel': { 'zh-CN': '国家级', 'en-US': 'National' },
  'enum.internationalLevel': { 'zh-CN': '国际级', 'en-US': 'International' },
  'enum.otherLevel': { 'zh-CN': '其他', 'en-US': 'Other' },
  'enum.selectLevel': { 'zh-CN': '请选择等级', 'en-US': 'Select level' },
  'enum.present': { 'zh-CN': '至今', 'en-US': 'Present' },

  // 公司规模
  'enum.under15': { 'zh-CN': '少于15人', 'en-US': '< 15' },
  'enum.15to50': { 'zh-CN': '15-50人', 'en-US': '15-50' },
  'enum.50to150': { 'zh-CN': '50-150人', 'en-US': '50-150' },
  'enum.150to500': { 'zh-CN': '150-500人', 'en-US': '150-500' },
  'enum.500to2000': { 'zh-CN': '500-2000人', 'en-US': '500-2000' },
  'enum.2000to10000': { 'zh-CN': '2000-10000人', 'en-US': '2000-10000' },
  'enum.over10000': { 'zh-CN': '10000人以上', 'en-US': '10000+' },

  // 语言等级
  'enum.ielts60': { 'zh-CN': '雅思 6.0', 'en-US': 'IELTS 6.0' },
  'enum.ielts65': { 'zh-CN': '雅思 6.5', 'en-US': 'IELTS 6.5' },
  'enum.ielts70': { 'zh-CN': '雅思 7.0+', 'en-US': 'IELTS 7.0+' },
  'enum.toefl80': { 'zh-CN': '托福 80+', 'en-US': 'TOEFL 80+' },
  'enum.toefl100': { 'zh-CN': '托福 100+', 'en-US': 'TOEFL 100+' },
  'enum.fluent': { 'zh-CN': '口语流畅', 'en-US': 'Fluent' },
  'enum.good': { 'zh-CN': '口语良好', 'en-US': 'Good' },
  'enum.basic': { 'zh-CN': '口语一般', 'en-US': 'Basic' },

  // ========================
  // 预览标签（个人信息字段的冒号后缀标签）
  // ========================
  'label.birthDate': { 'zh-CN': '出生年月', 'en-US': 'DOB' },
  'label.hometown': { 'zh-CN': '籍贯', 'en-US': 'Hometown' },
  'label.email': { 'zh-CN': '邮箱', 'en-US': 'Email' },
  'label.phone': { 'zh-CN': '电话', 'en-US': 'Phone' },
  'label.city': { 'zh-CN': '城市', 'en-US': 'City' },
  'label.gender': { 'zh-CN': '性别', 'en-US': 'Gender' },
  'label.education': { 'zh-CN': '学历', 'en-US': 'Education' },
  'label.politics': { 'zh-CN': '政治面貌', 'en-US': 'Political Status' },
  'label.workYears': { 'zh-CN': '工作年限', 'en-US': 'Exp.' },
  'label.personalAccount': { 'zh-CN': '个人账号', 'en-US': 'Account' },
  'label.techStack': { 'zh-CN': '技术栈', 'en-US': 'Tech Stack' },
  'label.projectLink': { 'zh-CN': '项目链接', 'en-US': 'Link' },

  // ========================
  // 通用操作
  // ========================
  'common.delete': { 'zh-CN': '删除', 'en-US': 'Delete' },
  'common.moveUp': { 'zh-CN': '上移', 'en-US': 'Move Up' },
  'common.moveDown': { 'zh-CN': '下移', 'en-US': 'Move Down' },
  'common.add': { 'zh-CN': '添加', 'en-US': 'Add' },
  'common.itemN': { 'zh-CN': '第{n}条', 'en-US': 'Item {n}' },
  'common.moduleName': { 'zh-CN': '模块名称', 'en-US': 'Module Name' },
  'common.visitLink': { 'zh-CN': '访问 ↗', 'en-US': 'Visit ↗' },

  // ========================
  // 工作经历表单
  // ========================
  'work.companyName': { 'zh-CN': '公司名称', 'en-US': 'Company' },
  'work.companyNamePlaceholder': { 'zh-CN': '腾讯科技', 'en-US': 'Google Inc.' },
  'work.positionName': { 'zh-CN': '职位名称', 'en-US': 'Position' },
  'work.positionPlaceholder': { 'zh-CN': '高级前端开发工程师', 'en-US': 'Senior Frontend Developer' },
  'work.companySize': { 'zh-CN': '公司规模', 'en-US': 'Company Size' },
  'work.department': { 'zh-CN': '部门名称', 'en-US': 'Department' },
  'work.departmentPlaceholder': { 'zh-CN': '技术研发部（选填）', 'en-US': 'R&D Department (optional)' },
  'work.workTime': { 'zh-CN': '工作时间', 'en-US': 'Period' },
  'work.description': { 'zh-CN': '工作描述', 'en-US': 'Description' },
  'work.descriptionHint': { 'zh-CN': '请简要描述你的工作内容、职责和成就，建议使用项目符号分点描述', 'en-US': 'Describe your responsibilities and achievements, use bullet points recommended' },
  'work.descriptionPlaceholder': { 'zh-CN': '负责公司核心产品的前端架构设计与开发', 'en-US': 'Led frontend architecture design and development for core products' },
  'work.addItem': { 'zh-CN': '添加一条', 'en-US': 'Add Item' },
  'work.companyNamePreview': { 'zh-CN': '公司名称', 'en-US': 'Company Name' },
  'work.fillDescription': { 'zh-CN': '请填写工作描述', 'en-US': 'Please fill in the description' },

  // ========================
  // 教育经历表单
  // ========================
  'education.schoolName': { 'zh-CN': '学校名称', 'en-US': 'School' },
  'education.schoolNamePlaceholder': { 'zh-CN': '清华大学', 'en-US': 'MIT' },
  'education.major': { 'zh-CN': '专业', 'en-US': 'Major' },
  'education.majorPlaceholder': { 'zh-CN': '计算机科学与技术', 'en-US': 'Computer Science' },
  'education.degree': { 'zh-CN': '学历', 'en-US': 'Degree' },
  'education.schoolTime': { 'zh-CN': '在校时间', 'en-US': 'Period' },
  'education.gpaRank': { 'zh-CN': 'GPA / 排名', 'en-US': 'GPA / Rank' },
  'education.honors': { 'zh-CN': '荣誉 / 奖项', 'en-US': 'Honors / Awards' },
  'education.schoolExp': { 'zh-CN': '在校经历', 'en-US': 'Activities' },
  'education.schoolExpHint': { 'zh-CN': '可填写学生组织、科研、竞赛、社会实践等经历', 'en-US': 'Student organizations, research, competitions, etc.' },
  'education.schoolExpPlaceholder': { 'zh-CN': '例如：学生会技术部部长，组织校级活动 3 场，参与导师课题，负责数据清洗与分析', 'en-US': 'E.g. Head of tech dept in student union, organized 3 campus events' },
  'education.addEducation': { 'zh-CN': '添加教育经历', 'en-US': 'Add Education' },
  'education.schoolNamePreview': { 'zh-CN': '学校名称', 'en-US': 'School Name' },
  'education.fillEducation': { 'zh-CN': '请填写教育经历', 'en-US': 'Please fill in education' },

  // ========================
  // 项目经历表单
  // ========================
  'project.projectName': { 'zh-CN': '项目名称', 'en-US': 'Project' },
  'project.projectNamePlaceholder': { 'zh-CN': '企业内部管理系统', 'en-US': 'Enterprise Management System' },
  'project.role': { 'zh-CN': '担任角色', 'en-US': 'Role' },
  'project.rolePlaceholder': { 'zh-CN': '前端负责人', 'en-US': 'Frontend Lead' },
  'project.projectTime': { 'zh-CN': '项目时间', 'en-US': 'Period' },
  'project.projectLink': { 'zh-CN': '项目链接', 'en-US': 'Link' },
  'project.description': { 'zh-CN': '项目描述', 'en-US': 'Description' },
  'project.descriptionHint': { 'zh-CN': '请简要描述项目背景、你的职责和取得的成果', 'en-US': 'Describe the project background, your role and achievements' },
  'project.descriptionPlaceholder': { 'zh-CN': '描述项目背景、你的职责和取得的成果', 'en-US': 'Describe the project background, your role and achievements' },
  'project.techStack': { 'zh-CN': '技术栈', 'en-US': 'Tech Stack' },
  'project.techStackHint': { 'zh-CN': '使用 + 分隔，如：React + TypeScript + Vite', 'en-US': 'Separate with +, e.g. React + TypeScript + Vite' },
  'project.addProject': { 'zh-CN': '添加一个项目', 'en-US': 'Add Project' },
  'project.projectNamePreview': { 'zh-CN': '项目名称', 'en-US': 'Project Name' },
  'project.fillProject': { 'zh-CN': '请填写项目经历', 'en-US': 'Please fill in project details' },

  // ========================
  // 技能
  // ========================
  'skills.fillSkills': { 'zh-CN': '请填写专业技能', 'en-US': 'Please fill in skills' },
  'skills.fillSkillsHint': { 'zh-CN': '可输入技术栈、熟练方向和能力亮点', 'en-US': 'Enter your tech stack, proficiency and highlights' },
  'skills.placeholder': { 'zh-CN': '例如：熟练掌握 React、TypeScript、Vite，熟悉组件化、状态管理、工程化配置，具备性能优化与复杂页面开发经验', 'en-US': 'E.g. Proficient in React, TypeScript, Vite. Experienced in component architecture, state management and performance optimization' },

  // ========================
  // 语言能力
  // ========================
  'languages.language': { 'zh-CN': '语言', 'en-US': 'Language' },
  'languages.languagePlaceholder': { 'zh-CN': '英语', 'en-US': 'English' },
  'languages.proficiency': { 'zh-CN': '熟练度', 'en-US': 'Proficiency' },
  'languages.addLanguage': { 'zh-CN': '添加语言', 'en-US': 'Add Language' },
  'languages.fillLanguages': { 'zh-CN': '请填写语言能力', 'en-US': 'Please fill in languages' },

  // ========================
  // 自我评价
  // ========================
  'summary.fillSummary': { 'zh-CN': '请填写自我评价', 'en-US': 'Please fill in summary' },
  'summary.summaryHint': { 'zh-CN': '请简要描述你的职业背景、核心能力和职业亮点，建议控制在 50-200 字之间', 'en-US': 'Describe your background, core skills and highlights. Keep it 50-200 words' },
  'summary.placeholder': { 'zh-CN': '例：拥有 3 年前端开发经验，擅长 React 技术栈，曾主导多个中大型项目的技术选型与架构设计。', 'en-US': 'E.g. 3 years of frontend experience, specializing in React, led architecture design for multiple projects.' },
  'summary.statusEmpty': { 'zh-CN': '请填写自我评价', 'en-US': 'Please fill in summary' },
  'summary.statusShort': { 'zh-CN': '字数较少，建议补充更多细节', 'en-US': 'Too short, consider adding more details' },
  'summary.statusSaved': { 'zh-CN': '内容已保存', 'en-US': 'Saved' },

  // ========================
  // 荣誉奖项
  // ========================
  'awards.awardName': { 'zh-CN': '奖项名称', 'en-US': 'Award' },
  'awards.awardNamePlaceholder': { 'zh-CN': '校级一等奖学金', 'en-US': 'First Prize Scholarship' },
  'awards.awardLevel': { 'zh-CN': '奖项等级', 'en-US': 'Level' },
  'awards.awardTime': { 'zh-CN': '获得时间', 'en-US': 'Date' },
  'awards.description': { 'zh-CN': '说明', 'en-US': 'Description' },
  'awards.descriptionPlaceholder': { 'zh-CN': '全院前 5%', 'en-US': 'Top 5%' },
  'awards.addAward': { 'zh-CN': '添加奖项', 'en-US': 'Add Award' },
  'awards.fillAwards': { 'zh-CN': '请填写荣誉奖项', 'en-US': 'Please fill in awards' },

  // ========================
  // 证书资质
  // ========================
  'certificates.certName': { 'zh-CN': '证书名称', 'en-US': 'Certificate' },
  'certificates.certTime': { 'zh-CN': '获得时间', 'en-US': 'Date' },
  'certificates.issuer': { 'zh-CN': '颁发机构', 'en-US': 'Issuer' },
  'certificates.issuerPlaceholder': { 'zh-CN': 'AWS 官方', 'en-US': 'AWS Official' },
  'certificates.addCert': { 'zh-CN': '添加证书', 'en-US': 'Add Certificate' },
  'certificates.fillCerts': { 'zh-CN': '请填写证书资质', 'en-US': 'Please fill in certifications' },

  // ========================
  // 作品链接
  // ========================
  'portfolio.title': { 'zh-CN': '标题', 'en-US': 'Title' },
  'portfolio.titlePlaceholder': { 'zh-CN': '个人博客', 'en-US': 'Personal Blog' },
  'portfolio.link': { 'zh-CN': '链接', 'en-US': 'Link' },
  'portfolio.description': { 'zh-CN': '简短描述', 'en-US': 'Brief Description' },
  'portfolio.descriptionPlaceholder': { 'zh-CN': '记录技术学习和项目总结', 'en-US': 'Tech blog and project summaries' },
  'portfolio.addLink': { 'zh-CN': '添加链接', 'en-US': 'Add Link' },
  'portfolio.fillPortfolio': { 'zh-CN': '请添加作品链接', 'en-US': 'Please add portfolio links' },

  // ========================
  // 自定义模块
  // ========================
  'custom.moduleNameHint': { 'zh-CN': '将显示在简历中，如「开源贡献」「志愿服务」等', 'en-US': 'Will be displayed on resume, e.g. "Open Source", "Volunteering"' },
  'custom.moduleNamePlaceholder': { 'zh-CN': '自定义模块名称', 'en-US': 'Custom module name' },
  'custom.itemTitle': { 'zh-CN': '标题', 'en-US': 'Title' },
  'custom.itemTitlePlaceholder': { 'zh-CN': '条目标题', 'en-US': 'Item title' },
  'custom.content': { 'zh-CN': '内容', 'en-US': 'Content' },
  'custom.contentHint': { 'zh-CN': '请简要描述该条目的相关信息，建议控制在 50-200 字之间', 'en-US': 'Describe this item briefly, 50-200 words recommended' },
  'custom.contentPlaceholder': { 'zh-CN': '详细描述...', 'en-US': 'Detailed description...' },
  'custom.addItem': { 'zh-CN': '添加条目', 'en-US': 'Add Item' },
  'custom.fillCustom': { 'zh-CN': '请添加内容', 'en-US': 'Please add content' },

  // ========================
  // 日期格式化
  // ========================
  'date.format': { 'zh-CN': '{y}年{m}月', 'en-US': '{m}/{y}' },

  // ========================
  // 翻译对话框
  // ========================
  'translate.chinese': { 'zh-CN': '中文', 'en-US': 'Chinese' },
  'translate.english': { 'zh-CN': '英文', 'en-US': 'English' },
  'translate.title': { 'zh-CN': '翻译简历', 'en-US': 'Translate Resume' },
  'translate.direction': { 'zh-CN': '翻译方向', 'en-US': 'Direction' },
  'translate.targetLang': { 'zh-CN': '目标语言', 'en-US': 'Target Language' },
  'translate.options': { 'zh-CN': '选项', 'en-US': 'Options' },
  'translate.keepChineseFields': { 'zh-CN': '保留中国特有字段（政治面貌、籍贯等）', 'en-US': 'Keep China-specific fields (political status, hometown, etc.)' },
  'translate.autoFont': { 'zh-CN': '自动调整字体', 'en-US': 'Auto-adjust fonts' },
  'translate.notes': { 'zh-CN': '翻译说明', 'en-US': 'Notes' },
  'translate.copyNote': { 'zh-CN': '将生成一份新的简历副本', 'en-US': 'A new resume copy will be created' },
  'translate.layoutNote': { 'zh-CN': '排版、模板、主题色完全保留', 'en-US': 'Layout, template, and theme are fully preserved' },
  'translate.techNote': { 'zh-CN': '技术名词（React、Go 等）不翻译', 'en-US': 'Technical terms (React, Go, etc.) are not translated' },
  'translate.editNote': { 'zh-CN': '可在创建后自由编辑', 'en-US': 'Can be freely edited after creation' },
  'translate.complete': { 'zh-CN': '翻译完成', 'en-US': 'Translation Complete' },
  'translate.translatedTitle': { 'zh-CN': '翻译标题：', 'en-US': 'Translated Title:' },
  'translate.usedModel': { 'zh-CN': '使用模型：', 'en-US': 'Model Used:' },
  'translate.attention': { 'zh-CN': '注意事项', 'en-US': 'Notes' },
  'translate.fontHint': { 'zh-CN': '建议字体已调整为', 'en-US': 'Suggested font adjusted to' },
  'translate.cancel': { 'zh-CN': '取消', 'en-US': 'Cancel' },
  'translate.translating': { 'zh-CN': '翻译中...', 'en-US': 'Translating...' },
  'translate.start': { 'zh-CN': '开始翻译', 'en-US': 'Start Translation' },
  'translate.createCopy': { 'zh-CN': '创建翻译副本', 'en-US': 'Create Translated Copy' },
}

export default dict
