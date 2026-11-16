# 台股智能觀測站 Taiwan Stock Intelligence

純網頁版（非 APP），以白色簡約介面呈現台灣上市櫃市場研究資訊。

## 本版功能
- 市場總覽與示例股票列表
- 股票搜尋與個股分析頁框架
- 瀏覽器自選股
- 投資評分模型架構
- 供應鏈搜尋示例
- 財經新聞與官方資訊入口
- 桌機及手機瀏覽器響應式版面

## 部署到 Render 免費 Static Site
1. 登入 https://dashboard.render.com/
2. New → Static Site，連接 GitHub。
3. 選擇 SYUAN0707/taiwan-stock-intelligence。
4. Build Command 留空，Publish Directory 填 `.`。
5. 建立後 Render 會提供公開的 onrender.com 網址。

也可使用 Render Blueprint 匯入本儲存庫的 render.yaml。

## 重要限制
目前是可公開部署的網站起始版，行情欄位刻意顯示「—」，不以虛構數字冒充即時行情。正式功能仍需：
- TWSE/TPEx 全市場行情及即時展示授權
- 法人盤後資料、逐筆成交及大單資料來源
- 後端 API、資料庫與登入帳號
- 新聞資料介接及供應鏈關係驗證
- 回測與推薦績效紀錄

投資評分僅供研究輔助，不構成投資建議。
