-- ============================================================
-- job_postings.company_name 由 varchar(200) 加宽为 varchar(500)
-- 起因：抓取源（腾讯文档共享表格）偶发把说明性备注段落误抓成
-- 「企业名称」字段（如"1.阿里系这么多家是单独招聘的..."类整段文字，
-- 长度可达 200+ 字符），导致同步入库时因超长报错、本次同步全部失败
-- （SQLSTATE 22001: value too long for type character varying(200)）。
-- 本迁移作为兜底防御：加宽字段容量，即使未来出现类似超长文本也不
-- 中断整次同步；根治手段是在抓取脚本 toPostings 阶段过滤此类脏数据行
-- （见 python-parser/scrape_smartsheet.py 与 service/job_posting）。
-- 幂等（DO块判断当前类型后再改），可重复执行。
-- ============================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'job_postings'
          AND column_name = 'company_name'
          AND character_maximum_length < 500
    ) THEN
        ALTER TABLE job_postings ALTER COLUMN company_name TYPE VARCHAR(500);
    END IF;
END $$;
