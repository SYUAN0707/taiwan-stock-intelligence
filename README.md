# 台股觀測站

以 `index.html` 作為前端、`server.py` 作為 API 伺服器，整合 TWSE 與 TPEx 公開每日行情，以及 TWSE T86 外陸資買賣超資料。

## 本機啟動

```bash
pip install -r requirements.txt
python server.py
```

瀏覽器開啟 `http://localhost:8000`。

## Render 部署

本專案附有 `render.yaml`。在 Render 建立 Blueprint 或 Web Service，連接 GitHub repository。Build command：`pip install -r requirements.txt`；Start command：`python server.py`。服務會讀取平台提供的 `PORT`，並監聽 `0.0.0.0`。

## 資料範圍與限制

- 上市每日行情：TWSE OpenAPI `STOCK_DAY_ALL`。
- 上櫃每日行情：TPEx OpenAPI `tpex_mainboard_daily_close_quotes`。
- 外陸資買賣超：TWSE RWD T86，單位換算為張。
- 目前是官方每日收盤行情，不是逐筆即時報價；不會用隨機值補資料。
- 上櫃法人資料、完整歷史 K 線、營收財報、重大訊息、新聞、法說會、主力成本估算及經查證供應鏈尚未完成。
- 自選股儲存在使用者瀏覽器 localStorage。

資料來源可能變更欄位或暫時限制存取，請以官方公告及端點回應為準。