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
            if c and p is not None: out[c]={"code":c,"name":str(x.get("CompanyName") or "").strip(),"market":"上櫃","open":num(x.get("Open")),"high":num(x.get("High")),"low":num(x.get("Low")),"price":p,"change":num(x.get("Change")),"volume":num(x.get("TradingShares")),"amount":num(x.get("TradingAmount")),"trades":num(x.get("Transaction")),"trade_date":day,"price_label":"收盤價（非即時）","quote_source":"TPEx 官方每日開放資料"}
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
    unique = {x["date"]:x for x in rows}
    result = sorted(unique.values(), key=lambda x:x["date"])[-40:]
    if len(result) < 20:
        raise ValueError(f"官方歷史資料目前僅取得 {len(result)} 個交易日，至少需要 20 日才能計算月線")
    return {"code":code,"name":stock.get("name",""),"market":stock["market"],"trade_date":result[-1]["date"],"count":len(result),"items":result,"source":"TWSE 個股日成交資訊 STOCK_DAY" if stock["market"]=="上市" else "TPEx 個股月成交資訊 tradingStock","disclaimer":"近 40 個交易日官方 OHLCV 歷史資料；上櫃成交量依官方月表張數換算為股數。均線依未還原收盤價計算，遇除權息或減資可能產生跳空。"}

def institutional():
    """Official TPEx institutional flow, restricted to listed OTC common stocks."""
    url = "https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading"
    r = S.get(url, timeout=30)
    r.raise_for_status()
    rows = r.json()
    if not isinstance(rows, list) or not rows:
        raise ValueError("櫃買中心法人資料目前沒有有效資料")

    # Restrict to the OTC common-stock universe; institutional data has its own publication date.
    quote_data = cached("/api/quotes", 300, quotes)
    otc_codes = {
        str(x.get("code", "")).strip()
        for x in quote_data.get("items", [])
        if x.get("market") == "上櫃"
        and str(x.get("code", "")).strip().isdigit()
        and len(str(x.get("code", "")).strip()) == 4
    }
    if not otc_codes:
        raise ValueError("目前無法取得上櫃普通股清單，暫停法人排行")

    def integer(v):
        if v is None: return None
        z = str(v).replace(",", "").replace(" ", "").strip()
        if z in ("", "-", "--", "—"): return None
        try: return int(float(z))
        except (ValueError, TypeError): return None

    items = []
    for raw in rows:
        if not isinstance(raw, dict): continue
        code = str(raw.get("SecuritiesCompanyCode") or "").strip()
        day = roc_date(raw.get("Date"))
        # TPEx endpoint also contains ETFs, ETNs and other securities.
        # Keep only four-digit common stocks present in the OTC quote dataset.
        if code not in otc_codes or not day:
            continue
        foreign = integer(raw.get("Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference") if raw.get("Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference") is not None else raw.get("Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference "))
        trust = integer(raw.get("SecuritiesInvestmentTrustCompanies-Difference"))
        dealer = integer(raw.get("Dealers-Difference"))
        if foreign is None or trust is None or dealer is None:
            continue
        total = integer(raw.get("TotalDifference"))
        items.append({
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

    if not items:
        raise ValueError("上櫃普通股法人資料為空，或官方欄位格式已變更；不顯示舊資料或推測數字")
    dates = sorted({x["trade_date"] for x in items})
    if len(dates) != 1:
        raise ValueError("櫃買中心法人資料包含多個交易日期，已停止顯示")
    return {
        "market": "上櫃",
        "trade_date": dates[0],
        "unit": "股",
        "count": len(items),
        "items": items,
        "source_url": "https://data.gov.tw/dataset/11856",
        "license_url": "https://data.gov.tw/license",
        "disclaimer": "僅包含上櫃普通股（排除 ETF、ETN、權證等非普通股證券）；法人資料日期依櫃買中心該資料集標示，與行情日期分開呈現；數值單位為股。外資為不含外資自營商。上市個股法人資料暫不提供。"
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
                v = cached("history:"+code, 1800, lambda: stock_history(code)); status = 200
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
