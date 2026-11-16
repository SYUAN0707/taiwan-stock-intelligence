"""Taiwan stock dashboard API. No synthetic quotes are generated."""
import os, json, time, datetime as dt
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse
import requests
os.chdir(os.path.dirname(os.path.abspath(__file__)))
S=requests.Session(); S.headers.update({"User-Agent":"Mozilla/5.0 TaiwanStockDashboard/1.0"})
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
def quotes():
    out={};errors=[]
    try:
        rows=S.get("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",timeout=20).json()
        for x in rows:
            c=str(x.get("Code","")).strip();p=num(x.get("ClosingPrice"))
            if c and p is not None:
                out[c]={"code":c,"name":x.get("Name",""),"market":"上市","open":num(x.get("OpeningPrice")),"high":num(x.get("HighestPrice")),"low":num(x.get("LowestPrice")),"price":p,"change":num(x.get("Change")),"volume":num(x.get("TradeVolume")),"amount":num(x.get("TradeValue")),"trades":num(x.get("Transaction"))}
    except Exception as e:errors.append("上市行情："+str(e))
    try:
        rows=S.get("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes",timeout=20).json()
        for x in rows:
            c=str(x.get("SecuritiesCompanyCode") or x.get("代號") or x.get("Code") or "").strip()
            def pick(*ks):
                for k in ks:
                    if k in x:return x[k]
            p=num(pick("Close","收盤","收盤價","ClosingPrice"))
            if c and p is not None:
                out[c]={"code":c,"name":pick("CompanyName","名稱","Name") or "","market":"上櫃","open":num(pick("Open","開盤","開盤價")),"high":num(pick("High","最高","最高價")),"low":num(pick("Low","最低","最低價")),"price":p,"change":num(pick("Change","漲跌","漲跌價差")),"volume":num(pick("TradingShares","成交股數","成交量")),"amount":num(pick("TradingAmount","成交金額")),"trades":num(pick("Transaction","成交筆數"))}
    except Exception as e:errors.append("上櫃行情："+str(e))
    return {"updated_at":dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(timespec="seconds"),"items":list(out.values()),"count":len(out),"errors":errors,"disclaimer":"目前為官方每日收盤行情，非逐筆即時報價。"}
def t86():
    d=dt.date.today()
    for _ in range(12):
        try:
            j=S.get("https://www.twse.com.tw/rwd/zh/fund/T86",params={"date":d.strftime("%Y%m%d"),"selectType":"ALLBUT0999","response":"json"},timeout=20).json()
            if j.get("stat")=="OK" and j.get("data"):
                f=j["fields"]
                def ix(prefix):return next(i for i,v in enumerate(f) if str(v).strip().startswith(prefix))
                ib,iss,inet=ix("外陸資買進股數"),ix("外陸資賣出股數"),ix("外陸資買賣超股數")
                rows={}
                for r in j["data"]:
                    c=str(r[0]).strip();b=num(r[ib]);s=num(r[iss]);net=num(r[inet])
                    if b is not None and s is not None:rows[c]={"foreign_buy_lots":round(b/1000),"foreign_sell_lots":round(s/1000),"foreign_net_lots":round((net or 0)/1000)}
                return {"date":d.isoformat(),"rows":rows,"unit":"張","source":"TWSE T86 外陸資買賣超日報"}
        except Exception:pass
        d-=dt.timedelta(days=1)
    raise RuntimeError("近 12 日未取得有效 T86 資料")
class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        p=urlparse(self.path).path
        if p=="/api/health":return self.send_json({"ok":True})
        if p in ("/api/quotes","/api/t86"):
            try:v=cached(p,300 if p.endswith("quotes") else 900,quotes if p.endswith("quotes") else t86);code=200
            except Exception as e:v={"error":str(e)};code=502
            return self.send_json(v,code)
        return super().do_GET()
    def send_json(self,v,code=200):
        b=json.dumps(v,ensure_ascii=False).encode()
        self.send_response(code);self.send_header("Content-Type","application/json; charset=utf-8");self.send_header("Content-Length",str(len(b)));self.send_header("Cache-Control","no-store");self.end_headers();self.wfile.write(b)
if __name__=="__main__":
    port=int(os.environ.get("PORT","8000"))
    print("Taiwan Stock Dashboard listening on",port)
    ThreadingHTTPServer(("0.0.0.0",port),Handler).serve_forever()
