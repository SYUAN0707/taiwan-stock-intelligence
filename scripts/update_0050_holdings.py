#!/usr/bin/env python3
"""Refresh 0050 top-20 equity holdings, preferring Yuanta official disclosures."""
import datetime as dt
import json
import re
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

OUT = Path("data/0050_holdings.json")
YUANTA_API = "https://www.yuantaetfs.com/api/StkWeights?date=&fundid=1066"
YUANTA_PAGE = "https://www.yuantaetfs.com/product/detail/0050/ratio"
STOCKANALYSIS_PAGE = "https://stockanalysis.com/quote/tpe/0050/holdings/"
MONEYDJ_PAGE = "https://www.moneydj.com/etf/x/basic/basic0007b.xdjhtm?etfid=0050.tw"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
    "Accept": "application/json,text/html,application/xhtml+xml,*/*",
    "Referer": "https://www.yuantaetfs.com/",
}

def parse_date(value):
    if not value:
        return ""
    s = str(value).strip()
    m = re.search(r"(20\d{2})[/-]?(\d{1,2})[/-]?(\d{1,2})", s)
    if m:
        try:
            return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
        except ValueError:
            return ""
    for fmt in ("%b %d, %Y", "%B %d, %Y", "%d %b %Y"):
        try:
            return dt.datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    return ""

def normalize_code(value):
    s = str(value or "").strip()
    m = re.search(r"(?<!\d)(\d{4,6})(?!\d)", s)
    return m.group(1) if m else ""

def normalize_weight(value):
    try:
        return float(str(value).replace(",", "").replace("%", "").strip())
    except (TypeError, ValueError):
        return None

def json_rows(payload):
    aliases = {
        "code": {"商品代碼", "證券代號", "股票代號", "code", "stockcode", "stkcode", "symbol"},
        "name": {"商品名稱", "證券名稱", "股票名稱", "name", "stockname", "stkname"},
        "shares": {"商品數量", "持有股數", "股數", "shares", "quantity", "qty"},
        "weight": {"商品權重", "權重", "持股權重", "weight", "holdingweight", "ratio"},
        "date": {"交易日期", "資料日期", "日期", "tradedate", "date", "asofdate"},
    }
    def keynorm(v):
        return re.sub(r"[\s_\-()（）％%]", "", str(v)).lower()
    aliases = {k: {keynorm(x) for x in v} for k, v in aliases.items()}
    def pick(row, kind):
        return next((v for k, v in row.items() if keynorm(k) in aliases[kind]), None)
    found = []
    dates = []
    def walk(obj):
        if isinstance(obj, list):
            for x in obj:
                walk(x)
        elif isinstance(obj, dict):
            code, weight = pick(obj, "code"), pick(obj, "weight")
            if code is not None and weight is not None:
                c = normalize_code(code)
                w = normalize_weight(weight)
                name = str(pick(obj, "name") or "").strip()
                if c and name and w is not None and 0 < w < 100:
                    shares = pick(obj, "shares")
                    try:
                        shares = int(float(str(shares).replace(",", ""))) if shares else None
                    except (TypeError, ValueError):
                        shares = None
                    day = parse_date(pick(obj, "date"))
                    if day:
                        dates.append(day)
                    found.append({"code":c,"name":name,"shares":shares,"weight":w,"trade_date":day})
            else:
                for v in obj.values():
                    if isinstance(v, (dict, list)):
                        walk(v)
    walk(payload)
    return found, max(dates) if dates else ""

def parse_html_holdings(html):
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(" ", strip=True)
    date_match = re.search(
        r"(?:資料日期|資料時間|Trade Date|Last updated|Last checked|As of)\s*[:：]?\s*"
        r"((?:20\d{2}[/-]\d{1,2}[/-]\d{1,2})|(?:[A-Z][a-z]{2,8}\s+\d{1,2},\s+20\d{2}))",
        text, re.I
    )
    day = parse_date(date_match.group(1)) if date_match else ""
    rows = []
    for tr in soup.find_all("tr"):
        cells = [x.get_text(" ", strip=True) for x in tr.find_all(["td", "th"])]
        joined = " ".join(cells)
        cm = re.search(r"(?:TPE:|TWSE:)?(\d{4,6})(?!\d)", joined)
        wm = re.search(r"(?<![\d.])(\d{1,2}(?:\.\d+)?)\s*%", joined)
        if not cm or not wm:
            continue
        code = cm.group(1)
        ci = next((i for i, x in enumerate(cells) if re.search(r"(?:TPE:|TWSE:)?"+code+r"(?!\d)", x)), 0)
        name = ""
        for cell in cells[ci+1:]:
            candidate = re.sub(r"^(?:TPE:|TWSE:)?\d{4,6}\s*", "", cell).strip()
            if candidate and "%" not in candidate and not re.fullmatch(r"[\d,.$BMK+-]+", candidate):
                name = candidate
                break
        if not name:
            name = re.sub(r"^(?:TPE:|TWSE:)?"+code+r"\s*", "", cells[ci]).strip()
        if not name:
            continue
        shares = None
        for cell in cells:
            candidate = cell.replace(",", "").strip()
            if re.fullmatch(r"\d{5,}", candidate):
                shares = int(candidate)
                break
        weight = float(wm.group(1))
        if 0 < weight < 100:
            rows.append({"code":code,"name":name,"shares":shares,"weight":weight,"trade_date":day})

    # Yuanta holdings may be rendered as div text rather than HTML table rows.
    if len(rows) < 20:
        lines = [re.sub(r"\s+", " ", x).strip() for x in soup.get_text("\n", strip=True).splitlines() if x.strip()]
        for i, line in enumerate(lines):
            if not re.fullmatch(r"\d{4,6}", line) or i + 3 >= len(lines):
                continue
            code, name = line, lines[i+1]
            try:
                shares = int(lines[i+2].replace(",", ""))
                weight = float(lines[i+3].replace("%", "").strip())
            except ValueError:
                continue
            if name and 0 < weight < 100:
                rows.append({"code":code,"name":name,"shares":shares,"weight":weight,"trade_date":day})
    return rows, day

def dedupe_sort(rows):
    unique = {}
    for row in rows:
        code = row["code"]
        if code not in unique or row["weight"] > unique[code]["weight"]:
            unique[code] = row
    return sorted(unique.values(), key=lambda x: x["weight"], reverse=True)

def validate(rows, source_date, source_name):
    rows = dedupe_sort(rows)
    if len(rows) < 20:
        raise RuntimeError(f"{source_name} 僅解析到 {len(rows)} 檔股票，至少需要20檔。")
    if not source_date:
        raise RuntimeError(f"{source_name} 沒有可辨識的資料日期。")
    day = dt.date.fromisoformat(source_date)
    today = dt.datetime.now(ZoneInfo("Asia/Taipei")).date()
    if day > today:
        raise RuntimeError(f"{source_name} 資料日期 {source_date} 晚於今天，拒絕更新。")
    if (today - day).days > 7:
        raise RuntimeError(f"{source_name} 資料日期 {source_date} 已超過7天，拒絕覆寫舊資料。")
    return rows[:20]

def fetch_json_source(session):
    r = session.get(YUANTA_API, timeout=30, allow_redirects=True)
    r.raise_for_status()
    if "json" not in r.headers.get("Content-Type", "").lower() and not r.text.lstrip().startswith(("{", "[")):
        raise RuntimeError(f"元大舊 API 未回傳 JSON（HTTP {r.status_code}，Content-Type={r.headers.get('Content-Type')}，最終網址={r.url}）。")
    payload = r.json()
    rows, day = json_rows(payload)
    rows = validate(rows, day, "元大官方 API")
    return rows, day, YUANTA_API, "元大投信官方 API"

def fetch_html_source(session, url, name):
    r = session.get(url, timeout=30)
    r.raise_for_status()
    rows, day = parse_html_holdings(r.text)
    rows = validate(rows, day, name)
    return rows, day, url, name

def main():
    session = requests.Session()
    session.headers.update(HEADERS)
    errors = []
    sources = [
        lambda: fetch_json_source(session),
        lambda: fetch_html_source(session, YUANTA_PAGE, "元大投信官方持股頁"),
        lambda: fetch_html_source(session, STOCKANALYSIS_PAGE, "StockAnalysis 0050 全部持股（次級備援來源）"),
        lambda: fetch_html_source(session, MONEYDJ_PAGE, "MoneyDJ 0050 全部持股（次級備援來源）"),
    ]
    result = None
    for get_source in sources:
        try:
            result = get_source()
            break
        except Exception as exc:
            errors.append(str(exc))
            print("Source unavailable:", str(exc))
    if result is None:
        raise RuntimeError("所有持股來源均未通過資料驗證；保留上一版，不覆寫檔案。\n" + "\n".join(errors))

    rows, source_date, source_url, source_name = result
    top = []
    for rank, row in enumerate(rows[:20], 1):
        row = dict(row)
        row["rank"] = rank
        row["trade_date"] = row.get("trade_date") or source_date
        top.append(row)

    now = dt.datetime.now(ZoneInfo("Asia/Taipei")).isoformat(timespec="seconds")
    official = source_name.startswith("元大投信官方")
    output = {
        "fund_code": "0050",
        "fund_name": "元大台灣50",
        "ranking_basis": "依0050股票部位持股權重排序；不含期貨、現金及其他非股票資產",
        "source_name": source_name,
        "source_type": "official" if official else "secondary_fallback",
        "source_url": source_url,
        "source_date": source_date,
        "checked_at": now,
        "count": len(top),
        "items": top,
        "source_warnings": errors,
        "disclaimer": "本清單為0050基金實際股票持倉權重前20名，不等同臺灣50指數成分股排名。優先使用元大投信官方來源；官方來源無法讀取時才使用備援來源，頁面會標示來源。若來源日期超過7天、股票不足20檔或日期異常，將保留上一版，不以推測值替代。"
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {OUT}: {len(top)} stocks, source={source_name}, date={source_date}, checked={now}")

if __name__ == "__main__":
    main()
