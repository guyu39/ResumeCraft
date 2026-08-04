-- ============================================================
-- 日报资讯增加原始链接：幂等补齐既有 2026-08-04 日报每条资讯的 url
-- 后续每日 0 点自动生成的新日报天然携带 url，无需此脚本重复执行
-- ============================================================

UPDATE ai_daily_reports
SET items = jsonb_set(
    items,
    ARRAY[(r.rank - 1)::text, 'url'],
    to_jsonb(r.url),
    true
)
FROM (
    VALUES
        ('2026-08-04'::date, 1, 'https://www.aihub.cn/news/qwen3-8-max-release/'),
        ('2026-08-04'::date, 2, 'https://www.xinhuanet.com/20260731/3165dd0ca76f42d5ada4ed42b8824a9a/c.html'),
        ('2026-08-04'::date, 3, 'https://www.tianliaos.com/post/ai-open-source-evolution-model-to-fullstack-2026'),
        ('2026-08-04'::date, 4, 'https://www.cs.com.cn/ssgs/01/2026/07/31/detail_2026073110028545.html'),
        ('2026-08-04'::date, 5, 'https://finance.sina.com.cn/stock/bxjj/2026-08-03/doc-inimafqi2579296.shtml'),
        ('2026-08-04'::date, 6, 'https://finance.sina.com.cn/tech/roll/2026-07-29/doc-iniknmim2622216.shtml'),
        ('2026-08-04'::date, 7, 'https://ai-bot.cn/daily-ai-news/'),
        ('2026-08-04'::date, 8, 'https://www.tianliaos.com/post/ai-open-source-evolution-model-to-fullstack-2026')
) AS r(report_date, rank, url)
WHERE ai_daily_reports.report_date = r.report_date;
