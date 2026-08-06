-- ============================================================
-- job_postings 唯一约束由 (company_name, recruitment_type)
-- 调整为表达式唯一索引：
-- (company_name, recruitment_type, COALESCE(open_date, '1970-01-01'))
--
-- 起因：Redis「最近新增岗位」语义应为「新出现的岗位记录」，但原唯一键
-- 粒度太粗——同一家公司同一招聘类型开出的新一批岗位（open_date 变化）
-- 会被 ON CONFLICT 当成「更新旧记录」而非「新增」，永远不会进入
-- Redis 最近新增列表。业务确认：以 open_date 变化作为「新一批」的判定信号。
--
-- 若简单把 open_date 直接纳入唯一键（不做 COALESCE），会有副作用：
-- PostgreSQL 唯一索引中 NULL 不参与相等比较，导致 open_date 为 NULL 的
-- 岗位（抓取源未写开启日期）每次同步都无法命中 ON CONFLICT，被反复判定
-- 为「新增」并不断插入新行、刷入 Redis 列表——同一条记录（如"中国银行 ·
-- 暑期实习"）持续占位，因此改为表达式索引一步落地。
--
-- 修复：用 COALESCE(open_date, '1970-01-01') 把「无日期」统一归一到
-- 同一个哨兵值参与唯一比较，使这类记录仍合并为一条、走 UPDATE 而非重复
-- INSERT；有真实 open_date 的记录则按新开启时间区分为不同批次（新增）。
--
-- 幂等：DROP/CREATE 均带 IF EXISTS/IF NOT EXISTS，可重复执行。
-- ============================================================

DROP INDEX IF EXISTS uq_job_postings_company_type;
DROP INDEX IF EXISTS uq_job_postings_company_type_date;

CREATE UNIQUE INDEX IF NOT EXISTS uq_job_postings_company_type_date
    ON job_postings (company_name, recruitment_type, (COALESCE(open_date, DATE '1970-01-01')));
