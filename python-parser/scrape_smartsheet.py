#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scrape_smartsheet.py
====================
抓取腾讯文档「智能表格 / Smartsheet」的共享文档数据。

原理（已逆向验证）：
  1. 用 Playwright 打开共享文档页面（无需登录，公开文档）。
  2. 从页面 JS 模型取 baseId（表 base id）与 TOK cookie（xsrf）。
  3. 通过页面内的 fetch 调用 /dop-api/get/sheet 拉取行数据。
     - padId 必须是 "300000000$<baseId>"（注意中间的 $ 符号，缺失则返回空）。
     - 需带 Referer: https://docs.qq.com/ 头，否则 401。
  4. 响应 data.initialAttributedText.text 是一组 chunk，每个 chunk 的
     smartsheet 字段是 base64(zlib) 压缩的 JSON。
  5. 解码后：
     - 含 c.k3.k3 的 chunk 是「结构 chunk」：字段定义 + 记录排序。
     - 含 c.k2.k1（dict）的 chunk 是「数据 chunk」：recordId -> 记录。
  6. 合并所有数据 chunk 的记录，按字段定义把每种单元格类型
     （文本 k1 / 链接 k8 / 单选 k17）解析成可读值，输出 JSON 与 CSV。

用法：
  python scrape_smartsheet.py
可选环境变量/常量在文件底部 CONFIG 区。
"""
import os, sys, json, time, base64, zlib, csv
from playwright.sync_api import sync_playwright

# ----------------------------- CONFIG ---------------------------------------
DOC_URL = "https://docs.qq.com/smartsheet/DRHVEc05MbE5CYUZa?tab=t9HHQn&viewId=vasGeq&_t=1784446032743&nlc=1"
SUB_ID   = "t9HHQn"          # 子表 tab id
VIEW_ID  = "vasGeq"          # 视图 id（表格视图）
REV      = 2385              # 兜底 revision（页面取不到当前 rev 时使用；正常用页面实时 rev）
OUT_JSON = "smartsheet_data.json"
OUT_CSV  = "smartsheet_data.csv"
PAGE_WAIT_MS = 8000          # 页面加载后等待 JS 模型就绪
# ----------------------------------------------------------------------------

def _wait_for_manager(pg, timeout_ms=30000, retries=3):
    """等待腾讯文档页面 JS 模型 getPreloadedTablesManager 注入就绪；偶发未注入时重试重载页面。"""
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            pg.wait_for_function("window.getPreloadedTablesManager", timeout=timeout_ms)
            pg.wait_for_timeout(2000)  # 模型注入后再等一小会儿，确保 base 结构就绪
            return
        except Exception as e:
            last_err = e
            print(f"[warn] 等待页面模型第 {attempt}/{retries} 次失败: {e}", flush=True)
            if attempt < retries:
                pg.reload(wait_until="domcontentloaded", timeout=120000)
    raise RuntimeError(f"页面模型 getPreloadedTablesManager 无法就绪（可能触发了验证/限流）: {last_err}")


def _resolve_rev(pg, pad_id, sub_id, view_id, xsrf, probe_rev=2000000000):
    """向 /dop-api/get/sheet 发一次探测请求，从响应 data.rev 取真实当前 rev。
    腾讯文档改版后页面模型不再暴露 rev，但接口响应顶层 data.rev 始终为服务端当前版本；
    请求一个超大 rev 时，服务端会回退到最新版本并返回 data.rev=最新值。"""
    t = int(time.time() * 1000)
    url = (f"https://docs.qq.com/dop-api/get/sheet?padId={pad_id}&subId={sub_id}"
           f"&startrow=0&endrow=5&xsrf={xsrf}&_r=0.1&outformat=1&normal=1"
           f"&preview_token=&nowb=1&t={t}&needSheetState=2&rev={probe_rev}&optimizedVer=2&viewId={view_id}")
    try:
        resp = pg.evaluate(
            "async (u) => { const r = await fetch(u, {headers:{'Referer':'https://docs.qq.com/'}});"
            " return {status:r.status, text:await r.text()} }", url)
    except Exception as e:
        print(f"[warn] rev 探测请求异常: {e}", flush=True)
        return None
    if resp.get('status') != 200:
        print(f"[warn] rev 探测返回非 200: {resp.get('status')}", flush=True)
        return None
    try:
        data = json.loads(resp['text'])
        rev = data.get('data', {}).get('rev')
        if isinstance(rev, int) and rev > 0:
            print(f"[rev] 从接口响应解析到真实 rev={rev}", flush=True)
            return rev
    except Exception as e:
        print(f"[warn] rev 探测响应解析失败: {e}", flush=True)
    return None


def decode_blob(b64: str) -> dict:
    """base64(zlib) -> dict。自动补 padding。"""
    return json.loads(zlib.decompress(base64.b64decode(b64 + '==')))


def get_cell_value(cell, field_type, option_map):
    """把一个字段的单元格解析成可读字符串。"""
    if not isinstance(cell, dict):
        return ""
    # 单选 / 多选：k17 是 optionId 列表
    if 'k17' in cell and cell['k17']:
        ids = cell['k17'] if isinstance(cell['k17'], list) else [cell['k17']]
        names = [option_map.get(i, i) for i in ids]
        return "/".join(n for n in names if n)
    # 链接：k8 是 [{k2: url, k1:'url', k3: url}]
    if 'k8' in cell and cell['k8']:
        items = cell['k8'] if isinstance(cell['k8'], list) else [cell['k8']]
        urls = [it.get('k2') or it.get('k3') or '' for it in items]
        return " / ".join(u for u in urls if u)
    # 文本 / 数字：k1 是 [{k1:'text', k2:'值'}] 或类似结构
    if 'k1' in cell and cell['k1']:
        items = cell['k1'] if isinstance(cell['k1'], list) else [cell['k1']]
        parts = []
        for it in items:
            if isinstance(it, dict):
                parts.append(str(it.get('k2', '')))
            else:
                parts.append(str(it))
        return "".join(p for p in parts if p)
    return ""

def main():
    records = {}          # recId -> {fieldId: cell}
    field_defs = {}       # fieldId -> def
    record_order = []     # 记录排序（来自结构 chunk）

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, args=["--no-sandbox"])
        pg = b.new_page(viewport={"width": 1366, "height": 900})
        pg.goto(DOC_URL, wait_until="domcontentloaded", timeout=120000)
        _wait_for_manager(pg)   # 等到页面 JS 模型注入，比固定等待更稳

        cookies = {c['name']: c['value'] for c in pg.context.cookies()}
        xsrf = cookies.get('TOK', '')
        meta = pg.evaluate(f"""
            async () => {{
                const TARGET = '27届招聘每日更新';          // 只抓取这一个子表
                const SUB = '{SUB_ID}';                     // 优先用 URL 里的 tab
                const mgr = window.getPreloadedTablesManager();
                const tables = await mgr.getAllTableInfos();
                const pick = tables.find(t => t.id === SUB) || tables[0];
                const blocks = (pick.base && pick.base.blocks) ? pick.base.blocks.values : [];
                let blk = null; const names = [];
                for (const b of blocks) {{
                    const nm = (b && (b.name || b.title)) || '';
                    names.push(nm);
                    if (nm === TARGET) blk = b;
                }}
                if (!blk) throw new Error('未找到子表: ' + TARGET + ' | 可用: ' + JSON.stringify(names));
                return {{ subId: pick.id, baseId: pick.base.baseId,
                          total: blk.totalRecordCount, blockName: (blk.name || blk.title),
                          rev: (pick.base && (pick.base.rev ?? pick.base.revVersion ?? pick.base.version)) || null }};
            }}
        """)
        base_id = meta['baseId']
        sub_id  = meta['subId']          # 解析出的目标 tab（应为 t9HHQn）
        total   = meta['total']
        pad_id  = f"300000000${base_id}"     # 关键：$ 不能丢

        # rev 从页面模型已失效（腾讯文档改版移除 pick.base.rev/revVersion/version 字段），
        # 改为向接口发一次探测请求，从响应 data.rev 取真实当前 rev。
        rev = _resolve_rev(pg, pad_id, sub_id, VIEW_ID, xsrf)
        if rev is None:
            rev = REV
            print(f"[warn] 无法从接口解析真实 rev，回退兜底 REV={REV}（可能漏抓最新记录）", flush=True)
        print(f"[info] 子表={meta['blockName']} subId={sub_id} baseId={base_id} "
              f"total={total} rev={rev} xsrf_len={len(xsrf)}", flush=True)

        def fetch_range(sr, er):
            t = int(time.time() * 1000)
            url = (f"https://docs.qq.com/dop-api/get/sheet?padId={pad_id}&subId={sub_id}"
                   f"&startrow={sr}&endrow={er}&xsrf={xsrf}&_r={0.1}&outformat=1&normal=1"
                   f"&preview_token=&nowb=1&t={t}&needSheetState=2&rev={rev}&optimizedVer=2&viewId={VIEW_ID}")
            return pg.evaluate(
                "async (u) => { const r = await fetch(u, {headers:{'Referer':'https://docs.qq.com/'}});"
                " return {status:r.status, text:await r.text()} }", url)

        def process_response(text):
            data = json.loads(text)
            chunks = data.get('data', {}).get('initialAttributedText', {}).get('text', [])
            got = 0
            for ch in chunks:
                if 'smartsheet' not in ch:
                    continue
                try:
                    obj = decode_blob(ch['smartsheet'])
                except Exception as e:
                    print(f"  [warn] chunk decode failed: {e}", flush=True)
                    continue
                node = obj[0][0]
                c = node.get('c', {})
                # 结构 chunk：字段定义 + 记录排序
                if isinstance(c, dict) and isinstance(c.get('k3'), dict) and 'k3' in c['k3']:
                    fd = c['k3']['k3']
                    if isinstance(fd, dict):
                        field_defs.update(fd)
                    k4 = c['k3'].get('k4')
                    if isinstance(k4, list) and k4:
                        ids = k4[0].get('k1', {}).get('k1')
                        if isinstance(ids, list):
                            record_order.extend(ids)
                # 数据 chunk：recordId -> 记录
                if isinstance(c, dict) and isinstance(c.get('k2'), dict):
                    k1 = c['k2'].get('k1')
                    if isinstance(k1, dict):
                        for rid, rec in k1.items():
                            records[rid] = rec
                            got += 1
            return got

        # ------------------------------------------------------------------
        # 抓取策略（逆向确认的关键规律）：
        #   * startrow=0 的请求只返回「结构 chunk」（字段定义 + 记录排序），
        #     不含任何单元格数据 —— 这是旧脚本丢失前 60 行的根因。
        #   * startrow>=1 的请求才返回单元格数据，返回区间为 [startrow, endrow)，
        #     且服务端不限制单次窗口大小（实测一次可返回 800+ 行）。
        # 因此：先用 (0, WINDOW) 拿结构，再从 startrow=1 分窗抓全量数据。
        # 分窗仅为大表安全兜底（防止未来单响应过大），窗口间不重叠即可，
        # 因 records 以 recordId 为键天然去重。
        # ------------------------------------------------------------------
        WINDOW = 500

        # 1) 取结构（字段定义 + 记录排序）；此请求数据为空属正常
        r = fetch_range(0, 20)
        process_response(r['text'])
        print(f"[struct] 结构就绪：字段 {len(field_defs)} 个，记录排序 {len(record_order)} 条", flush=True)

        # 2) 从 startrow=1 分窗抓取全部数据行（endrow 取 total+2 容错边界）
        sr = 1
        upper = max(total + 2, WINDOW)
        while sr <= upper:
            er = min(sr + WINDOW, upper + 1)
            r = fetch_range(sr, er)
            n = process_response(r['text'])
            print(f"[fetch] {sr}..{er} status={r['status']} 新增 {n} 条；累计 {len(records)}", flush=True)
            if n == 0 and sr > 1:
                # 已抓到末尾（空窗口），提前结束
                break
            sr = er

        if record_order:
            missing = [rid for rid in record_order if rid not in records]
            if missing:
                print(f"[warn] {len(missing)} 条记录未取到单元格数据（通常为置顶/说明行）: "
                      f"{missing[:5]}", flush=True)

        b.close()

    # ---------- 构建字段顺序 / 名称 / 选项映射 ----------
    # 记录排序去重（多次抓取会重复追加），保持顺序
    seen = set(); record_order_dedup = []
    for rid in record_order:
        if rid not in seen:
            seen.add(rid); record_order_dedup.append(rid)
    record_order = record_order_dedup

    # 字段顺序：优先用已知规范顺序（与表格展示一致），缺字段再补 field_defs 里的
    CANON = ['fwkPKY', 'fzHRJH', 'fOS09U', 'fIplfL', 'flMxkf',
             'ffyxJX', 'fOiPD2', 'frssko', 'fqDGvP']
    field_order = [fid for fid in CANON if fid in field_defs]
    for fid in field_defs:
        if fid not in field_order:
            field_order.append(fid)

    headers = []
    option_maps = {}     # fieldId -> {optId: optName}
    for fid in field_order:
        fdef = field_defs.get(fid, {})
        name = fdef.get('k30') or fid
        headers.append(name)
        # 单选选项映射
        k17 = fdef.get('k17')
        if isinstance(k17, dict):
            opt_map = {}
            for opt in k17.get('k3', []):
                opt_map[opt.get('k1')] = opt.get('k2')
            option_maps[fid] = opt_map

    # ---------- 逐条解析 ----------
    rows = []
    order = record_order if record_order else list(records.keys())
    for rid in order:
        rec = records.get(rid)
        if not rec:
            continue
        cells = rec.get('k1', {}) if isinstance(rec.get('k1'), dict) else {}
        row = []
        for fid in field_order:
            cell = cells.get(fid)
            row.append(get_cell_value(cell, None, option_maps.get(fid, {})))
        rows.append(row)

    print(f"[done] 成功解析 {len(rows)} 条记录，{len(headers)} 个字段", flush=True)

    # ---------- 输出 JSON ----------
    out = {
        "source": DOC_URL,
        "total_records": len(rows),
        "fields": [{"id": fid, "name": field_defs.get(fid, {}).get('k30', fid),
                    "type": field_defs.get(fid, {}).get('k31')} for fid in field_order],
        "records": [dict(zip(headers, row)) for row in rows],
    }
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"[write] {OUT_JSON}", flush=True)

    # ---------- 输出 CSV（带 BOM，Excel 友好）----------
    with open(OUT_CSV, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(headers)
        w.writerows(rows)
    print(f"[write] {OUT_CSV}", flush=True)

if __name__ == "__main__":
    main()
