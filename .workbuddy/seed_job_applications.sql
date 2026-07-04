-- 投递记录假数据（测试用）
-- 自动关联当前数据库中已存在的第一个用户 / 简历 / 快照，避免外键约束失败。
-- 直接执行：psql -d <dbname> -f seed_job_applications.sql

begin;

with target_user as (
    select id as user_id from users where deleted_at is null order by created_at limit 1
),
target_resume as (
    select r.id as resume_id, r.user_id
    from resumes r
    join target_user tu on r.user_id = tu.user_id
    where r.deleted_at is null
    order by r.created_at
    limit 1
),
target_snapshot as (
    select rv.id as snapshot_version_id
    from resume_versions rv
    join target_resume tr on rv.resume_id = tr.resume_id
    order by rv.created_at
    limit 1
),
new_apps as (
    insert into job_applications (
        id, user_id, resume_id, snapshot_version_id,
        company_name, department, target_title, jd_text, jd_hash,
        source, application_url, status, submitted_at, written_test_at
    )
    select
        gen_random_uuid(), tu.user_id, tr.resume_id, ts.snapshot_version_id,
        v.company_name, v.department, v.target_title, v.jd_text, md5(v.jd_text),
        v.source, v.application_url, v.status,
        now() - (v.submitted_days || ' days')::interval,
        case when v.written_test_days is not null then now() - (v.written_test_days || ' days')::interval else null end
    from target_user tu, target_resume tr, target_snapshot ts,
    (values
        ('腾讯',   '云与智慧产业事业群', '前端开发工程师', '负责腾讯云控制台前端开发，要求熟悉 React/TypeScript',           '内推',   'https://careers.tencent.com/job/1', 'interview',            20, 18),
        ('阿里巴巴', '淘天集团',           '前端开发工程师', '负责淘宝详情页前端开发，要求熟悉 React/Vue，有性能优化经验',      '官网投递', 'https://careers.alibaba.com/job/2', 'written_test',         15, 12),
        ('字节跳动', '飞书事业部',         '高级前端工程师', '负责飞书文档前端架构，要求 5 年以上前端经验',                    '内推',   'https://jobs.bytedance.com/job/3',  'offer',                30, 25),
        ('百度',    '搜索业务部',          '前端开发工程师', '负责搜索结果页前端开发，要求熟悉工程化与性能优化',                '官网投递', 'https://talent.baidu.com/job/4',    'rejected',             25, 20),
        ('美团',    '到店事业群',          '前端开发工程师', '负责商家端前端开发，要求熟悉小程序开发',                        'BOSS直聘', 'https://zhipin.com/job/5',          'submitted',            5,  null),
        ('京东',    '零售技术部',          '前端开发工程师', '负责京东商城前端开发，要求熟悉微前端架构',                      '猎头推荐', 'https://zhaopin.jd.com/job/6',      'withdrawn',            35, 30),
        ('小米',    '互联网业务部',        '前端开发工程师', '负责小米商城前端开发，要求熟悉 Vue3 + TypeScript',              '官网投递', 'https://hr.xiaomi.com/job/7',       'interview',            10, 8),
        ('网易',    '互娱事业部',          '前端开发工程师', '负责游戏官网前端开发，要求熟悉动效与 Canvas',                   '内推',   'https://hr.163.com/job/8',          'pending_adaptation',   2,  null)
    ) as v(company_name, department, target_title, jd_text, source, application_url, status, submitted_days, written_test_days)
    returning id, company_name, status
)
select id, company_name, status from new_apps;

-- 为「面试中/offer/终止」状态的投递补充面试轮次记录（一面 -> HR面），演示 Excel 导出的动态列拼接
with app_ids as (
    select ja.id, ja.company_name, ja.status
    from job_applications ja
    where ja.company_name in ('腾讯', '阿里巴巴', '字节跳动', '百度', '京东', '小米')
    order by ja.created_at desc
    limit 6
)
insert into job_application_interviews (application_id, user_id, round, scheduled_at, format, interviewer, result)
select ja.id, (select user_id from job_applications where id = ja.id), r.round,
       now() - (r.days_ago || ' days')::interval, r.format, r.interviewer, r.result
from app_ids ja
join (
    values
        ('腾讯',   '一面', 19, '视频面试', '张工',  '通过'),
        ('腾讯',   '二面', 18, '视频面试', '李经理', ''),
        ('阿里巴巴', '一面', 14, '现场面试', '王工',  '通过'),
        ('字节跳动', '一面', 29, '视频面试', '陈工',  '通过'),
        ('字节跳动', '二面', 27, '视频面试', '刘经理', '通过'),
        ('字节跳动', '三面', 25, '现场面试', '赵总监', '通过'),
        ('字节跳动', 'HR面', 24, '视频面试', 'HR-小杨', '通过'),
        ('百度',    '一面', 24, '视频面试', '孙工',  '终止'),
        ('京东',    '一面', 34, '视频面试', '周工',  '通过'),
        ('京东',    '二面', 32, '视频面试', '吴经理', '终止'),
        ('小米',    '一面', 9,  '视频面试', '郑工',  '通过')
) as r(company_name, round, days_ago, format, interviewer, result)
    on r.company_name = ja.company_name;

commit;
