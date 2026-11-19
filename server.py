"""Taiwan stock dashboard API. No synthetic quotes are generated."""
import os, json, time, datetime as dt
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
os.chdir(os.path.dirname(os.path.abspath(__file__)))
S=requests.Session()
retry=Retry(total=2,connect=2,read=2,status=2,backoff_factor=1,status_forcelist=(429,500,502,503,504),allowed_methods=frozenset(["GET"]),raise_on_status=False)
adapter=HTTPAdapter(max_retries=retry,pool_connections=10,pool_maxsize=10)
S.mount("https://",adapter);S.mount("http://",adapter)
S.headers.update({"User-Agent":"Mozilla/5.0 TaiwanStockDashboard/1.0","Accept":"application/json,text/plain,*/*"})
CACHE={}
def cached(k,ttl,fn):
    item=CACHE.get(k)
    if item and time.time()-item[0]<ttl:return item[1]
    v=fn();CACHE[k]=(time.time(),v);return v
def num(v):
    try:
        s=str(v).replace(",","").strip()
        return float(s) if s not in ("","--","---","X") else None
    except (ValueError,TypeError):return None
def roc_date(v):
    z=str(v or "").strip().replace("/","")
    if len(z)==7 and z.isdigit(): return f"{int(z[:3])+1911:04d}-{z[3:5]}-{z[5:7]}"
    if len(z)==8 and z.isdigit(): return f"{z[:4]}-{z[4:6]}-{z[6:8]}"
    return ""

def quotes():
    out={};dates={};errors=[]
    fetched=dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(timespec="seconds")
    try:
        r=S.get("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",timeout=30);r.raise_for_status();rows=r.json()
        if not isinstance(rows,list) or not rows: raise ValueError("上市每日資料為空或格式不符")
        ds={roc_date(x.get("Date")) for x in rows if x.get("Date")};ds.discard("")
        if len(ds)!=1: raise ValueError("上市資料日期不一致或缺少日期")
        day=next(iter(ds));dates["上市"]=day
        for x in rows:
            c=str(x.get("Code","")).strip();p=num(x.get("ClosingPrice"))
            if c and p is not None: out[c]={"code":c,"name":str(x.get("Name","")).strip(),"market":"上市","open":num(x.get("OpeningPrice")),"high":num(x.get("HighestPrice")),"low":num(x.get("LowestPrice")),"price":p,"change":num(x.get("Change")),"volume":num(x.get("TradeVolume")),"amount":num(x.get("TradeValue")),"trades":num(x.get("Transaction")),"trade_date":day,"price_label":"收盤價（非即時）","quote_source":"TWSE 官方每日開放資料"}
    except Exception as e: errors.append("上市行情："+str(e))
    try:
        r=S.get("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes",timeout=30);r.raise_for_status();rows=r.json()
        if not isinstance(rows,list) or not rows: raise ValueError("上櫃每日資料為空或格式不符")
        ds={roc_date(x.get("Date")) for x in rows if x.get("Date")};ds.discard("")
        if len(ds)!=1: raise ValueError("上櫃資料日期不一致或缺少日期")
        day=next(iter(ds));dates["上櫃"]=day
        for x in rows:
            c=str(x.get("SecuritiesCompanyCode") or "").strip();p=num(x.get("Close"))
            if c and p is not None: out[c]={"code":c,"name":str(x.get("CompanyName") or "").strip(),"market":"上櫃","open":num(x.get("Open")),"high":num(x.get("High")),"low":num(x.get("Low")),"price":p,"change":num(x.get("Change")),"volume":num(x.get("TradingShares")),"amount":num(x.get("TransactionAmount")),"trades":num(x.get("Transaction")),"trade_date":day,"price_label":"收盤價（非即時）","quote_source":"TPEx 官方每日開放資料"}
    except Exception as e: errors.append("上櫃行情："+str(e))
    return {"updated_at":fetched,"market_dates":dates,"items":list(out.values()),"count":len(out),"errors":errors,"sources":{"上市":"https://data.gov.tw/dataset/11549","上櫃":"https://data.gov.tw/dataset/11371"},"disclaimer":"官方每日收盤行情，非盤中即時報價；各市場均附實際資料日期，未更新時不以舊資料冒充今日行情。"}



def history_month(code, market, year, month):
    """Fetch one official monthly OHLCV table for a single listed/OTC stock."""
    if market == "上市":
        url = "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY"
        params = {"response":"json","date":f"{year}{month:02d}01","stockNo":code}
        r = S.get(url, params=params, timeout=25); r.raise_for_status()
        payload = r.json()
        raw_rows = payload.get("data", []) if payload.get("stat") == "OK" else []
        rows = []
        for x in raw_rows:
            if len(x) < 7: continue
            day = roc_date(x[0])
            vals = [num(v) for v in x[3:7]]
            if day and all(v is not None for v in vals):
                rows.append({"date":day,"volume":num(x[1]),"open":vals[0],"high":vals[1],"low":vals[2],"close":vals[3]})
        return rows
    if market == "上櫃":
        url = "https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock"
        params = {"code":code,"date":f"{year}/{month:02d}/01","id":"","response":"json"}
        r = S.get(url, params=params, timeout=25); r.raise_for_status()
        payload = r.json()
        tables = payload.get("tables", [])
        raw_rows = tables[0].get("data", []) if tables else []
        rows = []
        for x in raw_rows:
            if len(x) < 7: continue
            day = roc_date(str(x[0]).replace("*","").replace("＊",""))
            vals = [num(v) for v in x[3:7]]
            if day and all(v is not None for v in vals):
                # TPEx monthly table reports trading volume in lots (張).
                rows.append({"date":day,"volume":(num(x[1]) or 0)*1000,"open":vals[0],"high":vals[1],"low":vals[2],"close":vals[3]})
        return rows
    raise ValueError("不支援的市場別")

def stock_history(code):
    code = str(code or "").strip()
    if not code or len(code) > 10 or not code.isalnum():
        raise ValueError("股票代號格式不正確")
    qdata = cached("/api/quotes", 300, quotes)
    stock = next((x for x in qdata.get("items",[]) if x.get("code")==code), None)
    if not stock:
        raise ValueError("目前官方行情清單找不到此股票，暫不查詢歷史資料")
    # The chart must never show a trading day newer than the latest
    # confirmed daily quote date for this stock's market.
    market_cutoff = stock.get("trade_date")
    if not market_cutoff:
        raise ValueError("市場總覽尚未提供此市場的確認行情日期，暫停顯示歷史 K 線")
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
    months = []
    y, m = now.year, now.month
    for _ in range(3):
        months.append((y,m))
        m -= 1
        if m == 0: y,m = y-1,12
    rows = []
    for yy,mm in reversed(months):
        rows.extend(history_month(code, stock["market"], yy, mm))
    raw_unique = {x["date"]:x for x in rows if x.get("date")}
    raw_latest = max(raw_unique) if raw_unique else None
    unique = {day:x for day,x in raw_unique.items() if day <= market_cutoff}
    result = sorted(unique.values(), key=lambda x:x["date"])[-40:]
    if len(result) < 20:
        raise ValueError(f"截至市場總覽行情日期 {market_cutoff}，官方歷史資料僅取得 {len(result)} 個交易日，至少需要 20 日才能計算月線")
    if raw_latest and raw_latest > market_cutoff:
        sync_status = "history_ahead_filtered"
        sync_note = f"歷史資料來源已出現 {raw_latest}，但市場總覽最新確認日期仍為 {market_cutoff}；為避免日期不一致，已排除較新資料。"
    elif raw_latest and raw_latest < market_cutoff:
        sync_status = "history_behind"
        sync_note = f"市場總覽已更新至 {market_cutoff}，但個股歷史資料目前僅到 {raw_latest}；線圖暫以可取得的官方資料呈現。"
    else:
        sync_status = "aligned"
        sync_note = f"個股線圖與市場總覽均截至 {market_cutoff}。"
    return {"code":code,"name":stock.get("name",""),"market":stock["market"],"trade_date":result[-1]["date"],"market_quote_date":market_cutoff,"history_source_latest_date":raw_latest,"date_sync_status":sync_status,"date_sync_note":sync_note,"count":len(result),"items":result,"source":"TWSE 個股日成交資訊 STOCK_DAY" if stock["market"]=="上市" else "TPEx 個股月成交資訊 tradingStock","disclaimer":f"{sync_note} 圖表僅使用不晚於市場總覽確認日期的資料；共近 40 個交易日。上櫃成交量依官方月表張數換算為股數。均線依未還原收盤價計算，遇除權息或減資可能產生跳空。"}

def institutional():
    """Merge same-day official TWSE listed and TPEx OTC institutional data."""
    quote_data = cached("/api/quotes", 300, quotes)
    listed_codes = {
        str(x.get("code", "")).strip()
        for x in quote_data.get("items", [])
        if x.get("market") == "上市"
        and str(x.get("code", "")).strip().isdigit()
        and len(str(x.get("code", "")).strip()) == 4
    }
    otc_codes = {
        str(x.get("code", "")).strip()
        for x in quote_data.get("items", [])
        if x.get("market") == "上櫃"
        and str(x.get("code", "")).strip().isdigit()
        and len(str(x.get("code", "")).strip()) == 4
    }
    if not listed_codes or not otc_codes:
        raise ValueError("上市或上櫃普通股清單不完整，暫停全市場法人排行")

    def integer(v):
        if v is None: return None
        z = str(v).replace(",", "").replace(" ", "").strip()
        if z in ("", "-", "--", "—"): return None
        try: return int(float(z))
        except (ValueError, TypeError): return None

    # TWSE T86 is date-scoped. Search backward for the latest published
    # trading-day report; resolve columns by exact official field names.
    twse_payload = None
    twse_day = ""
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
    for offset in range(0, 11):
        target = today - dt.timedelta(days=offset)
        if target.weekday() >= 5:
            continue
        day_arg = target.strftime("%Y%m%d")
        url = "https://www.twse.com.tw/rwd/zh/fund/T86"
        response = S.get(url, params={
            "date": day_arg, "selectType": "ALL", "response": "json"
        }, timeout=30)
        response.raise_for_status()
        candidate = response.json()
        if candidate.get("stat") == "OK" and candidate.get("data"):
            twse_payload = candidate
            twse_day = roc_date(candidate.get("date")) or target.isoformat()
            break
    if not twse_payload:
        raise ValueError("證交所上市三大法人 T86 最近 10 個日曆日尚無有效資料")

    fields = twse_payload.get("fields", [])
    required = {
        "code": "證券代號",
        "name": "證券名稱",
        "foreign": "外陸資買賣超股數(不含外資自營商)",
        "trust": "投信買賣超股數",
        "dealer": "自營商買賣超股數",
    }
    indexes = {}
    for key, field_name in required.items():
        if field_name not in fields:
            raise ValueError("證交所 T86 欄位缺少或改名：" + field_name)
        indexes[key] = fields.index(field_name)

    listed_items = []
    for row in twse_payload.get("data", []):
        if not isinstance(row, list) or len(row) <= max(indexes.values()):
            continue
        code = str(row[indexes["code"]]).strip()
        if code not in listed_codes:
            continue
        foreign = integer(row[indexes["foreign"]])
        trust = integer(row[indexes["trust"]])
        dealer = integer(row[indexes["dealer"]])
        if foreign is None or trust is None or dealer is None:
            continue
        listed_items.append({
            "code": code,
            "name": str(row[indexes["name"]]).strip(),
            "market": "上市",
            "trade_date": twse_day,
            "foreign_net_shares": foreign,
            "trust_net_shares": trust,
            "dealer_net_shares": dealer,
            "total_net_shares": foreign + trust + dealer,
            "unit": "股",
            "source": "TWSE 官方三大法人買賣超日報 T86"
        })
    if not listed_items:
        raise ValueError("證交所 T86 未取得可與上市行情清單對應的普通股法人資料")

    # TPEx publishes the current daily file independently. Keep its own
    # date and require exact date alignment before producing a combined rank.
    tpex_url = "https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading"
    tpex_response = S.get(tpex_url, timeout=30)
    tpex_response.raise_for_status()
    tpex_rows = tpex_response.json()
    if not isinstance(tpex_rows, list) or not tpex_rows:
        raise ValueError("櫃買中心上櫃法人資料目前沒有有效資料")

    tpex_items = []
    for raw in tpex_rows:
        if not isinstance(raw, dict):
            continue
        code = str(raw.get("SecuritiesCompanyCode") or "").strip()
        day = roc_date(raw.get("Date"))
        if code not in otc_codes or not day:
            continue
        foreign_raw = raw.get("Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference")
        if foreign_raw is None:
            foreign_raw = raw.get("Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference ")
        foreign = integer(foreign_raw)
        trust = integer(raw.get("SecuritiesInvestmentTrustCompanies-Difference"))
        dealer = integer(raw.get("Dealers-Difference"))
        if foreign is None or trust is None or dealer is None:
            continue
        total = integer(raw.get("TotalDifference"))
        tpex_items.append({
            "code": code,
            "name": str(raw.get("CompanyName") or "").strip(),
            "market": "上櫃",
            "trade_date": day,
            "foreign_net_shares": foreign,
            "trust_net_shares": trust,
            "dealer_net_shares": dealer,
            "total_net_shares": total if total is not None else foreign + trust + dealer,
            "unit": "股",
            "source": "TPEx 官方 OpenAPI／政府資料開放平臺資料集 11856"
        })
    if not tpex_items:
        raise ValueError("櫃買中心未取得可與上櫃行情清單對應的普通股法人資料")
    tpex_dates = sorted({x["trade_date"] for x in tpex_items})
    if len(tpex_dates) != 1:
        raise ValueError("櫃買中心法人資料包含多個交易日期，已停止合併排行")
    tpex_day = tpex_dates[0]

    if twse_day != tpex_day:
        raise ValueError(
            f"上市法人資料日期為 {twse_day}，上櫃法人資料日期為 {tpex_day}；"
            "為避免混合不同交易日造成錯誤排行，暫不產生全市場前10名。"
        )

    items = listed_items + tpex_items
    return {
        "market": "上市＋上櫃",
        "trade_date": twse_day,
        "market_dates": {"上市": twse_day, "上櫃": tpex_day},
        "unit": "股",
        "count": len(items),
        "counts": {"上市": len(listed_items), "上櫃": len(tpex_items)},
        "items": items,
        "sources": {
            "上市": "https://www.twse.com.tw/zh/trading/foreign/t86.html",
            "上櫃": "https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading"
        },
        "disclaimer": "合併證交所上市 T86 與櫃買中心上櫃三大法人資料；僅納入行情清單中的四碼普通股，排除 ETF、ETN、權證等非普通股。只有兩市場資料日期完全相同時才產生全市場排行。外資欄位為外陸資買賣超（不含外資自營商），自營商為自行買賣與避險合計；單位為股。"
    }

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        p=urlparse(self.path).path
        if p=="/api/health":return self.send_json({"ok":True})
        if p in ("/api/realtime","/api/t86"):
            return self.send_json({"error":"此功能已停用；目前僅提供官方每日收盤行情。","items":[]},410)
        if p == "/api/quotes":
            try:v=cached(p,300,quotes);code=200
            except Exception as e:v={"error":str(e),"items":[]};code=502
            return self.send_json(v,code)
        if p == "/api/history":
            try:
                code = parse_qs(urlparse(self.path).query).get("code", [""])[0]
                qdata = cached("/api/quotes", 300, quotes)
                stock = next((x for x in qdata.get("items", []) if x.get("code") == code), None)
                if not stock or not stock.get("trade_date"):
                    raise ValueError("無法確認市場總覽最新行情日期，暫停顯示歷史 K 線")
                # Include the quote date in the cache key so a new official
                # market date cannot be masked by yesterday's cached chart.
                cache_key = "history:"+code+":"+stock["trade_date"]
                v = cached(cache_key, 300, lambda: stock_history(code)); status = 200
            except Exception as e:
                v = {"error":str(e),"items":[]}; status = 502
            return self.send_json(v, status)
        if p == "/api/institutional":
            try:v=cached(p,300,institutional);code=200
            except Exception as e:v={"error":str(e),"items":[]};code=502
            return self.send_json(v,code)
        return super().do_GET()
    def send_json(self,v,code=200):
        b=json.dumps(v,ensure_ascii=False).encode()
        self.send_response(code);self.send_header("Content-Type","application/json; charset=utf-8");self.send_header("Content-Length",str(len(b)));self.send_header("Cache-Control","no-store");self.send_header("Access-Control-Allow-Origin","*");self.send_header("Vary","Origin");self.end_headers();self.wfile.write(b)
if __name__=="__main__":
    port=int(os.environ.get("PORT","8000"))
    print("Taiwan Stock Dashboard listening on",port)
    ThreadingHTTPServer(("0.0.0.0",port),Handler).serve_forever()
