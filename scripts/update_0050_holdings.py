#!/usr/bin/env python3
"""Refresh the top 20 equity holdings of Yuanta Taiwan 50 (0050)."""
import datetime as dt
import json
import re
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

SOURCE = "https://www.yuantaetfs.com/api/StkWeights?date=&fundid=1066"
OUT = Path("data/0050_holdings.json")
HEADERS = {"User-Agent": "Mozilla/5.0 TaiwanStockIntelligence/1.0", "Accept": "application/json"}

def norm_key(value):
    return re.sub(r"[\s_\-()（）％%]", "", str(value)).lower()

ALIASES = {
    "code": {"商品代碼", "證券代號", "股票代號", "code", "stockcode", "stkcode", "symbol"},
    "name": {"商品名稱", "證券名稱", "股票名稱", "name", "stockname", "stkname"},
    "shares": {"商品數量", "持有股數", "股數", "shares", "quantity", "qty"},
    "weight": {"商品權重", "權重", "持股權重", "weight", "holdingweight", "ratio"},
    "date": {"交易日期", "資料日期", "日期", "tradeDate", "date", "asofdate"},
}
ALIASES = {k: {norm_key(x) for x in v} for k, v in ALIASES.items()}

def pick(row, kind):
    for key, value in row.items():
        if norm_key(key) in ALIASES[kind]:
            return value
    return None

def parse_date(value):
    if value is None:
        return ""
    s = str(value).strip().replace("/", "-").replace(".", "-")
    m = re.search(r"(20\d{2})-?(\d{1,2})-?(\d{1,2})", s)
    if not m:
        return ""
    try:
        return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
    except ValueError:
        return ""

def flatten(obj):
    if isinstance(obj, list):
        for item in obj:
            yield from flatten(item)
    elif isinstance(obj, dict):
        if pick(obj, "code") is not None and pick(obj, "weight") is not None:
            yield obj
        else:
            for value in obj.values():
                if isinstance(value, (list, dict)):
                    yield from flatten(value)

def main():
    response = requests.get(SOURCE, headers=HEADERS, timeout=30)
    response.raise_for_status()
    payload = response.json()
    records = []
    source_date = ""
    for row in flatten(payload):
        code = str(pick(row, "code") or "").strip()
        name = str(pick(row, "name") or "").strip()
        raw_weight = str(pick(row, "weight") or "").replace(",", "").replace("%", "").strip()
        try:
            weight = float(raw_weight)
        except ValueError:
            continue
        if not re.fullmatch(r"\d{4,6}", code) or not name or not (0 < weight < 100):
            continue
        day = parse_date(pick(row, "date"))
        if day:
            source_date = max(source_date, day)
        raw_shares = str(pick(row, "shares") or "").replace(",", "").strip()
        try:
            shares = int(float(raw_shares)) if raw_shares else None
        except ValueError:
            shares = None
        records.append({"code": code, "name": name, "shares": shares, "weight": weight, "trade_date": day})

    # Deduplicate by stock code, retaining the greatest weight record.
    unique = {}
    for row in records:
        if row["code"] not in unique or row["weight"] > unique[row["code"]]["weight"]:
            unique[row["code"]] = row
    rows = sorted(unique.values(), key=lambda x: x["weight"], reverse=True)
    if len(rows) < 20:
        raise RuntimeError(f"元大投信來源只解析到 {len(rows)} 檔股票，少於20檔；停止覆寫既有資料。請檢查官方 API 欄位是否異動。")
    if not source_date:
        dates = [x["trade_date"] for x in rows if x["trade_date"]]
        source_date = max(dates) if dates else ""
    if not source_date:
        raise RuntimeError("官方來源未提供可辨識的持股資料日期，停止更新，避免誤標日期。")

    top = rows[:20]
    for index, row in enumerate(top, 1):
        row["rank"] = index
        row["trade_date"] = row["trade_date"] or source_date
    now = dt.datetime.now(ZoneInfo("Asia/Taipei")).isoformat(timespec="seconds")
    output = {
        "fund_code": "0050",
        "fund_name": "元大台灣50",
        "ranking_basis": "元大投信官方基金權重－股票；僅計股票部位，不含期貨",
        "source_url": SOURCE,
        "source_date": source_date,
        "checked_at": now,
        "count": len(top),
        "items": top,
        "disclaimer": "本清單為基金實際股票持倉權重前20名，不等同臺灣50指數成分股排名；每日以官方資料更新，官方資料未成功解析時保留上一版，不以推測值替代。"
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {OUT}: {len(top)} stocks, source date {source_date}, checked {now}")

if __name__ == "__main__":
    main()
