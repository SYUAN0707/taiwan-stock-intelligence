(() => {
  const API = location.hostname==='taiwan-stock-intelligence.onrender.com'?'https://taiwan-stock-intelligence-api.onrender.com':'';
  let inst = [], instInfo = null, quotes = [], selectedRank = null;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n = v => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('zh-TW',{maximumFractionDigits:2});
  const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
  const tsmcChain = [
    {code:'3711',name:'日月光投控',role:'封裝與測試服務',group:'封裝測試'},
    {code:'2449',name:'京元電子',role:'半導體晶圓／成品測試',group:'測試服務'},
    {code:'3680',name:'家登',role:'晶圓載具、光罩載具相關產品',group:'載具設備'},
    {code:'6196',name:'帆宣',role:'廠務系統、設備與工程服務',group:'廠務系統'}
  ];
  const tsmcPeers = [
    {code:'2303',name:'聯華電子',role:'晶圓代工'},
    {code:'2454',name:'聯發科',role:'IC設計'},
    {code:'3711',name:'日月光投控',role:'封裝測試'},
    {code:'2449',name:'京元電子',role:'半導體測試'}
  ];
  async function loadQuotes() {
    const r = await fetch(API + '/api/quotes', {cache:'no-store'});
    const d = await r.json();
    if (!r.ok || !Array.isArray(d.items)) throw Error(d.error || '每日行情讀取失敗');
    quotes = d.items; window.__twQuotes = quotes;
  }
  async function loadInst() {
    const r = await fetch(API + '/api/institutional', {cache:'no-store'});
    const d = await r.json();
    if (!r.ok || !Array.isArray(d.items) || !d.items.length) throw Error(d.error || '上市＋上櫃法人資料暫時無法取得');
    inst = d.items; instInfo = d;
  }
  const quote = code => quotes.find(x=>String(x.code)===String(code));
  function chart(rows) {
    if(!Array.isArray(rows)||rows.length<20) return '<p class="sub">官方歷史資料不足 20 個交易日，暫不繪製 K 線或計算月線。</p>';
    const data=rows.slice(-40), closes=data.map(x=>Number(x.close));
    const ma=(period)=>data.map((x,i)=>i+1<period?null:closes.slice(i+1-period,i+1).reduce((a,v)=>a+v,0)/period);
    const ma5=ma(5), ma20=ma(20);
    const lows=data.map(x=>Number(x.low)), highs=data.map(x=>Number(x.high));
    const min=Math.min(...lows),max=Math.max(...highs),pad=(max-min)*.08||Math.abs(max)*.02||1;
    const lo=min-pad,hi=max+pad, W=900,H=330,L=64,R=18,T=18,B=48;
    const plotW=W-L-R,plotH=H-T-B, step=plotW/data.length, body=Math.max(3,Math.min(12,step*.58));
    const y=v=>T+(hi-v)/(hi-lo)*plotH;
    const grid=[0,1,2,3,4].map(i=>{const v=hi-(hi-lo)*i/4, yy=y(v);return '<line x1="'+L+'" y1="'+yy+'" x2="'+(W-R)+'" y2="'+yy+'" stroke="#e7eaf0"/><text x="5" y="'+(yy+4)+'" font-size="11" fill="#758092">'+n(v)+'</text>';}).join('');
    const candles=data.map((x,i)=>{const o=Number(x.open),c=Number(x.close),h=Number(x.high),l=Number(x.low),cx=L+step*(i+.5),up=c>=o,color=up?'#d84a4a':'#15966a';return '<line x1="'+cx+'" y1="'+y(h)+'" x2="'+cx+'" y2="'+y(l)+'" stroke="'+color+'" stroke-width="1.5"/><rect x="'+(cx-body/2)+'" y="'+Math.min(y(o),y(c))+'" width="'+body+'" height="'+Math.max(1.5,Math.abs(y(o)-y(c)))+'" fill="'+(up?'#fff':color)+'" stroke="'+color+'" stroke-width="1.5"/>';}).join('');
    const line=(vals,color)=>vals.map((v,i)=>v==null?null:(L+step*(i+.5))+','+y(v)).filter(Boolean).join(' ');
    const labels=[0,Math.floor((data.length-1)/3),Math.floor(2*(data.length-1)/3),data.length-1].map(i=>'<text x="'+(L+step*(i+.5))+'" y="'+(H-15)+'" text-anchor="middle" font-size="11" fill="#758092">'+esc(data[i].date.slice(5))+'</text>').join('');
    return '<div class="chartbox"><svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="近40個交易日K線與MA5、MA20">'+grid+candles+'<polyline points="'+line(ma5,'')+'" fill="none" stroke="#e0a12b" stroke-width="2.2" stroke-linejoin="round"/><polyline points="'+line(ma20,'')+'" fill="none" stroke="#315bd6" stroke-width="2.2" stroke-linejoin="round"/>'+labels+'</svg><div class="chartlegend"><span style="color:#d84a4a">紅K：收漲</span><span style="color:#15966a">綠K：收跌</span><span style="color:#e0a12b">MA5：5日均線</span><span style="color:#315bd6">MA20：月線</span></div><p class="sub">資料日期：'+esc(data[data.length-1].date)+'｜共 '+data.length+' 個交易日。均線依未還原收盤價計算。</p></div>';
  }
  function technical(rows) {
    if(!Array.isArray(rows)||rows.length<20) return '<p class="sub">歷史資料不足，無法可靠計算短、中期均線；請稍後重試。</p>';
    const d=rows.slice(-40), c=d.map(x=>Number(x.close));
    const avg=n=>c.slice(-n).reduce((a,v)=>a+v,0)/Math.min(n,c.length);
    const ma5=avg(5),ma20=avg(20),last=c[c.length-1],prev=c[c.length-2],fiveAgo=c[Math.max(0,c.length-6)],twentyAgo=c[0];
    const pct=(x,y)=>y?((x/y-1)*100):0;
    const short=last>ma5?'收盤價位於 MA5 之上，短線偏強；留意是否能連續守住 5 日均線。':last<ma5?'收盤價位於 MA5 之下，短線偏弱；觀察能否重新站回 5 日均線。':'收盤價貼近 MA5，短線方向尚待確認。';
    const mid=ma5>ma20?'MA5 高於 MA20，短中期均線呈偏多排列；若 MA5 轉平或跌破月線，需留意動能降溫。':ma5<ma20?'MA5 低於 MA20，短中期均線偏空；需觀察是否站回月線並形成翻揚。':'MA5 與 MA20 接近，中期趨勢尚未明朗，宜等待均線方向確認。';
    const long= pct(last,twentyAgo)>3?'近 40 個交易日收盤價較區間起點上升，這段期間偏向上行；但 40 日不足以判斷長期投資趨勢。':pct(last,twentyAgo)<-3?'近 40 個交易日收盤價較區間起點下跌，這段期間偏向走弱；但不能據此推定長期基本面惡化。':'近 40 個交易日大致處於區間整理；長期展望仍須搭配營收、獲利、產業景氣與公司展望評估。';
    const momentum=pct(last,fiveAgo),daily=pct(last,prev);
    return '<div class="analysis-list"><h3>短期（約 1–5 個交易日）</h3><p>'+esc(short)+'</p><p>近 5 個交易日價格變化約 '+(momentum>=0?'+':'')+n(momentum)+'%；最新一日約 '+(daily>=0?'+':'')+n(daily)+'%。</p><h3>中期（約 1 個月）</h3><p>'+esc(mid)+'</p><p>MA5：'+n(ma5)+' 元；MA20（月線）：'+n(ma20)+' 元。均線是趨勢觀察工具，不保證未來走勢。</p><h3>較長期觀察（本圖僅涵蓋近 40 日）</h3><p>'+esc(long)+'</p><p>本段歷史 K 線不能單獨代表半年或一年展望；需再檢視月營收、毛利率、EPS、現金流、產業需求與重大風險。</p></div>';
  }
  async function loadHistory(code) {
    const chartBox=$('historyChart'), techBox=$('historyTechnical');
    if(!chartBox||!techBox)return;
    chartBox.innerHTML='<p class="sub">正在讀取官方近 40 個交易日歷史資料…</p>';
    techBox.innerHTML='<p class="sub">等待歷史行情資料計算。</p>';
    try{
      const r=await fetch(API+'/api/history?code='+encodeURIComponent(code),{cache:'no-store'});
      const d=await r.json();
      if(!r.ok||!Array.isArray(d.items)||!d.items.length)throw Error(d.error||'歷史行情暫時無法取得');
      const syncClass=d.date_sync_status==='aligned'?'sync-ok':'sync-warn';
      const syncLabel=d.date_sync_status==='aligned'?'日期已同步':d.date_sync_status==='history_ahead_filtered'?'已排除超前日期':'歷史資料更新較慢';
      chartBox.innerHTML='<p class="sub">線圖資料截至：'+esc(d.trade_date||'日期未提供')+'；市場總覽確認日期：'+esc(d.market_quote_date||'日期未提供')+'</p><p class="date-sync '+syncClass+'">'+esc(syncLabel)+'｜'+esc(d.date_sync_note||'')+'</p>'+chart(d.items);
      techBox.innerHTML=technical(d.items)+'<p class="sub">來源：'+esc(d.source)+'。'+esc(d.disclaimer||'')+'</p>';
    }catch(e){
      chartBox.innerHTML='<p class="sub">歷史 K 線讀取失敗：'+esc(e.message)+'。不以假資料替代。</p>';
      techBox.innerHTML='<p class="sub">目前無法取得足夠的官方歷史行情，因此暫不提供技術趨勢判讀。</p>';
    }
  }
  function news(q) {
    const query=encodeURIComponent((q.name||q.code)+' '+q.code+' 台股');
    return '<a target="_blank" rel="noopener" href="https://news.google.com/search?q='+query+'&hl=zh-TW&gl=TW&ceid=TW%3Azh-Hant">在 Google 新聞搜尋 '+esc(q.name||q.code)+' 相關新聞 ↗</a><p class="sub">新聞以外部搜尋結果呈現，不在本站複製未授權新聞全文。</p>';
  }
  function peerCards(items) {
    return items.map(x=>'<div class="chainitem"><b>'+esc(x.name)+'（'+x.code+'）</b><span>'+esc(x.role)+'</span><button class="secondary open-stock" data-code="'+x.code+'">查看個股</button></div>').join('');
  }
  function showStock(code) {
    const q=quote(code);
    if(!q) return;
    const i=inst.find(x=>x.code===code);
    const isTsmc=code==='2330';
    const peers=isTsmc?tsmcPeers:[];
    const chain=isTsmc?tsmcChain:[];
    $('pageTitle').textContent=(q.name||'個股')+'（'+q.code+'）';
    $('pageSub').textContent='每日收盤行情｜'+esc(q.market)+'｜資料日期 '+esc(q.trade_date||'—');
    $('content').innerHTML='<section class="panel"><div class="panelhead"><h2>每日收盤行情</h2><span class="tag">'+esc(q.market)+'</span></div><div class="detail"><div><small>收盤價</small><b>'+n(q.price)+'</b></div><div><small>漲跌價差</small><b class="'+cls(q.change)+'">'+n(q.change)+'</b></div><div><small>成交量（股）</small><b>'+n(q.volume)+'</b></div><div><small>成交金額（元）</small><b>'+n(q.amount)+'</b></div><div><small>開盤</small><b>'+n(q.open)+'</b></div><div><small>最高／最低</small><b>'+n(q.high)+'／'+n(q.low)+'</b></div><div><small>交易日期</small><b>'+esc(q.trade_date||'—')+'</b></div><div><small>行情來源</small><b>'+esc(q.quote_source||'交易所每日資料')+'</b></div></div></section><section class="panel"><h2>近 40 個交易日 K 線</h2><div id="historyChart"></div></section><section class="panel"><h2>技術面解讀（短、中、長期觀察）</h2><div id="historyTechnical"></div></section><section class="panel"><h2>上市＋上櫃法人資料</h2>'+(i?'<div class="detail"><div><small>外資（不含外資自營商）</small><b>'+n(i.foreign_net_shares)+' 股</b></div><div><small>投信</small><b>'+n(i.trust_net_shares)+' 股</b></div><div><small>自營商</small><b>'+n(i.dealer_net_shares)+' 股</b></div><div><small>三大法人合計</small><b>'+n(i.total_net_shares)+' 股</b></div></div><p class="sub">市場：'+esc(i.market)+'；資料日期 '+esc(i.trade_date)+'；單位為股。</p>':(q.market==='上市'?'此股票目前沒有可用的全市場法人資料。':'此股票目前沒有可用的全市場法人資料。'))+'</section><section class="panel"><h2>相關新聞</h2>'+news(q)+'</section><section class="panel"><h2>同產業／產業關聯權值股</h2>'+(peers.length?'<div class="chainlist">'+peerCards(peers)+'</div>':'<p class="sub">目前尚無已整理並完成來源查證的同產業權值股名單。</p>')+'</section><section class="panel"><h2>下游／供應鏈廠商</h2>'+(chain.length?'<div class="chainlist">'+peerCards(chain)+'</div><p class="sub">此為依你提供的台積電關聯廠商清單建立的初始分類；各公司實際供應、客戶關係及產品項目仍須逐一依年報、法說會或公開資訊查證，不代表已證實的直接供應關係。</p>':'<p class="sub">此股票尚未建立經查證的供應鏈關係，避免把同產業公司直接標示為上下游廠商。</p>')+'</section><button class="secondary" id="backToQuotes">返回每日收盤行情</button>';
    loadHistory(code);
    $('backToQuotes').onclick=()=>{document.querySelector('nav button[data-view="market"]')?.click();};
    document.querySelectorAll('.open-stock').forEach(b=>b.onclick=()=>showStock(b.dataset.code));
  }
  function rankColumn(items,key,label,side) {
    return items.map((x,i)=>'<div class="rankcell"><div class="ranknum">'+(i+1)+'.</div><div class="rankstockinfo"><button class="rank-stock" data-code="'+esc(x.code)+'" data-key="'+key+'" data-label="'+esc(label)+'" data-side="'+side+'">'+esc(x.name||x.code)+'（'+esc(x.code)+'）</button><div class="rankamount '+(x[key]>0?'up':x[key]<0?'down':'')+'">'+n(Math.abs(x[key]))+' 股／'+n(Math.abs(x[key])/1000)+' 張</div></div></div>').join('') || '<div class="rankempty">目前沒有資料</div>';
  }
  function showRanks() {
    $('pageTitle').textContent='法人買賣超排行';
    $('pageSub').textContent='買超與賣超分開呈現；外資、投信、自營商並排比較';
    if(!inst.length){$('content').innerHTML='<section class="panel"><h2>法人資料暫時無法取得</h2><p>請稍後重新載入，不以舊資料或推測數字補值。</p></section>';return;}
    const groups=[['foreign_net_shares','外資（不含外資自營商）'],['trust_net_shares','投信'],['dealer_net_shares','自營商']];
    let html='<div class="notice">資料日期：'+esc(instInfo.trade_date)+'｜上市 '+n(instInfo.counts?.['上市'])+' 檔＋上櫃 '+n(instInfo.counts?.['上櫃'])+' 檔｜全市場每欄各自排名前 10 名｜淨買賣超，單位同時顯示股與張。</div>';
    for(const side of ['buy','sell']){
      const title=side==='buy'?'買超':'賣超';
      html+='<section class="panel"><div class="panelhead"><h2>'+title+'</h2><span class="tag">'+(side==='buy'?'由買超多至少排序':'由賣超多至少排序')+'</span></div><div class="rankboard"><div class="rankboardhead"><div>排名</div>'+groups.map(g=>'<div>'+g[1]+'</div>').join('')+'</div>';
      const columns=groups.map(([key,label])=>{
        const arr=[...inst].filter(x=>side==='buy'?x[key]>0:x[key]<0).sort((a,b)=>side==='buy'?b[key]-a[key]:a[key]-b[key]).slice(0,10);
        return {key,label,arr};
      });
      for(let i=0;i<10;i++){
        html+='<div class="rankboardrow"><div class="rankboardindex">'+(i+1)+'.</div>'+columns.map(c=>{
          const x=c.arr[i];
          return x?'<div class="rankboarditem"><button class="rank-stock" data-code="'+esc(x.code)+'" data-key="'+c.key+'" data-label="'+esc(c.label)+'" data-side="'+side+'">'+esc(x.name||x.code)+'（'+esc(x.code)+'）</button><div class="rankamount '+(x[c.key]>0?'up':'down')+'">'+n(Math.abs(x[c.key]))+' 股 <span>('+n(Math.abs(x[c.key])/1000)+' 張)</span></div></div>':'<div class="rankboarditem rankempty">—</div>';
        }).join('')+'</div>';
      }
      html+='</div></section>';
    }
    html+='<div class="footer">來源：<a href="https://www.twse.com.tw/zh/trading/foreign/t86.html" target="_blank" rel="noopener">證交所上市 T86</a>／<a href="https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading" target="_blank" rel="noopener">櫃買中心上櫃 OpenAPI</a>。</div><section class="panel" id="rankDetail" hidden></section>';
    $('content').innerHTML=html;
    document.querySelectorAll('.rank-stock').forEach(b=>b.onclick=()=>{
      const x=inst.find(z=>z.code===b.dataset.code),key=b.dataset.key,val=x[key],box=$('rankDetail');
      box.hidden=false;
      box.innerHTML='<h2>'+esc(b.dataset.label)+'｜'+esc(x.name||x.code)+'（'+esc(x.code)+'）</h2><div class="detail"><div><small>排行類別</small><b>'+ (b.dataset.side==='buy'?'買超':'賣超')+'</b></div><div><small>資料日期</small><b>'+esc(x.trade_date)+'</b></div><div><small>淨買賣超</small><b class="'+cls(val)+'">'+(val>0?'買超 ':'賣超 ')+n(Math.abs(val))+' 股</b></div><div><small>換算張數</small><b>'+n(Math.abs(val)/1000)+' 張</b></div></div><p class="sub">此數字為該法人類別的淨買賣超，不代表買進總量或賣出總量。</p><button class="secondary" id="rankOpenStock">查看個股詳細頁</button>';
      $('rankOpenStock').onclick=()=>showStock(x.code);
      box.scrollIntoView({behavior:'smooth',block:'center'});
    });
  }
  const top20Holdings = [
    {code:'2330',name:'台積電',weight:58.92,sector:'半導體'},
    {code:'2454',name:'聯發科',weight:6.42,sector:'IC設計'},
    {code:'2317',name:'鴻海',weight:2.99,sector:'電子製造服務'},
    {code:'2308',name:'台達電',weight:2.27,sector:'電源與電機'},
    {code:'3711',name:'日月光投控',weight:2.01,sector:'封裝測試'},
    {code:'2891',name:'中信金',weight:1.44,sector:'金融'},
    {code:'1303',name:'南亞',weight:1.38,sector:'塑膠與材料'},
    {code:'2881',name:'富邦金',weight:1.38,sector:'金融'},
    {code:'2303',name:'聯電',weight:1.20,sector:'晶圓代工'},
    {code:'2882',name:'國泰金',weight:1.16,sector:'金融'},
    {code:'2383',name:'台光電',weight:1.11,sector:'電子材料'},
    {code:'3037',name:'欣興',weight:0.97,sector:'IC載板與PCB'},
    {code:'2887',name:'台新新光金',weight:0.96,sector:'金融'},
    {code:'3017',name:'奇鋐',weight:0.96,sector:'散熱'},
    {code:'2885',name:'元大金',weight:0.82,sector:'金融'},
    {code:'2382',name:'廣達',weight:0.78,sector:'伺服器與電子製造'},
    {code:'2345',name:'智邦',weight:0.78,sector:'網通設備'},
    {code:'2884',name:'玉山金',weight:0.75,sector:'金融'},
    {code:'2412',name:'中華電',weight:0.70,sector:'電信'},
    {code:'2886',name:'兆豐金',weight:0.69,sector:'金融'}
  ];
  function showSupply() {
    $('pageTitle').textContent='0050 權值股供應鏈';
    $('pageSub').textContent='依元大台灣50（0050）最新可查持股權重快照，優先追蹤前20大成分股';
    const rows = top20Holdings.map((h,i) => {
      const q=quote(h.code);
      const price=q?n(q.price):'—';
      const change=q?(q.change==null?'—':(q.change>0?'+':'')+n(q.change)):'—';
      const changeClass=q?cls(q.change):'';
      const status=h.code==='2330'?'初步關聯清單（待逐筆核實）':'供應鏈關係查證中';
      return '<tr data-code="'+h.code+'"><td>'+(i+1)+'</td><td><b>'+esc(h.name)+'</b><span class="code">'+h.code+'</span></td><td>'+h.weight.toFixed(2)+'%</td><td>'+esc(h.sector)+'</td><td>'+price+'</td><td class="'+changeClass+'">'+change+'</td><td><span class="tag">'+status+'</span></td><td><button class="secondary supply-detail" data-code="'+h.code+'">個股分析</button></td></tr>';
    }).join('');
    $('content').innerHTML =
      '<section class="panel"><div class="panelhead"><div><h2>0050 權重前20大</h2><div class="sub">持股資料日期：2026/11/18｜按基金投資比例由高至低排序</div></div><span class="tag">前20大</span></div><div class="notice">權重是0050基金持有該股票的投資比例，不是公司市值排名，也不是台灣50指數權重。持股權重會變動，以下為日期快照。</div><div class="tablewrap"><table><thead><tr><th>排名</th><th>股票</th><th>0050權重</th><th>產業類別</th><th>本站收盤價</th><th>本站漲跌</th><th>供應鏈資料狀態</th><th>操作</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="sub">權重來源：MoneyDJ 元大台灣50全部持股明細（資料日期2026/11/18）。本站股價取自本網站官方每日行情，日期依市場資料標示。</p><p><a href="https://www.moneydj.com/ETF/X/Basic/Basic0007B.xdjhtm?etfid=0050.TW" target="_blank" rel="noopener">查看0050完整持股明細 ↗</a></p></section>'+
      '<section class="panel"><div class="panelhead"><h2>查詢供應鏈個股</h2></div><div class="filters"><input id="chainSearch" placeholder="輸入股票代號或名稱，例如 2330、台積電"><button class="primary" id="chainGo">搜尋</button></div><div id="chainResults"><p class="sub">點選上方前20大股票可開啟個股分析；輸入代號可查看已整理的供應鏈資料。</p></div></section>'+
      '<section class="panel"><h2>供應鏈資料原則</h2><p>只把公司年報、法說會、公開資訊或公司正式揭露可支持的客戶／供應商關係列為已查證。僅屬同產業、合作可能或市場傳聞的公司，不會標示成直接供應鏈。</p><p class="sub">金融股及電信股不適合硬套原物料供應鏈，會改以金融服務、設備採購或上下游產業關聯分類，並註明關係類型。</p></section>';
    document.querySelectorAll('.supply-detail').forEach(b=>b.onclick=()=>showStock(b.dataset.code));
    document.querySelectorAll('tr[data-code]').forEach(row=>row.onclick=e=>{if(!e.target.closest('button'))showStock(row.dataset.code);});
    const run=()=>{
      const raw=$('chainSearch').value.trim(),v=raw.toLowerCase();
      if(!v){$('chainResults').innerHTML='<p>請輸入股票代號或名稱。</p>';return;}
      const h=top20Holdings.find(x=>x.code.toLowerCase()===v||x.name.toLowerCase()===v);
      const q=quote(h?h.code:raw) || quotes.find(x=>(String(x.code)+' '+String(x.name)).toLowerCase().includes(v));
      if(!q){$('chainResults').innerHTML='<p>行情清單中找不到「'+esc(raw)+'」，請確認代號或名稱。</p>';return;}
      const relation=q.code==='2330'?'<h3>台積電產業關聯廠商（初步清單）</h3><p class="sub">目前既有清單列出封裝測試、測試服務、載具與廠務系統業者；這些是產業關聯線索，不等同已證實的直接供應商。後續逐筆補上公司揭露來源。</p><div class="chainlist">'+peerCards(tsmcChain)+'</div>':'<h3>供應鏈關係查證中</h3><p>這檔股票已列入0050權重追蹤，但供應商、客戶或合作關係尚未完成公開文件核實，目前不顯示未經證實的公司名單。</p>';
      $('chainResults').innerHTML='<div class="stockcard"><h3>'+esc(q.name)+'（'+esc(q.code)+'）</h3><p>本站收盤價：'+n(q.price)+' 元｜行情日期：'+esc(q.trade_date||'—')+'</p><button class="secondary" id="chainStockDetail">查看個股分析</button></div><section class="panel">'+relation+'</section>';
      $('chainStockDetail').onclick=()=>showStock(q.code);
      document.querySelectorAll('.open-stock').forEach(b=>b.onclick=()=>showStock(b.dataset.code));
    };
    $('chainGo').onclick=run;
    $('chainSearch').onkeydown=e=>{if(e.key==='Enter')run();};
  }
  async function openPage(view) {
    if(view==='chips'){
      $('pageTitle').textContent='法人買賣超排行';$('content').innerHTML='<div class="panel loading">正在載入上市＋上櫃法人資料…</div>';
      try{if(!quotes.length)await loadQuotes();await loadInst();showRanks();}
      catch(e){$('content').innerHTML='<section class="panel"><h2>上市＋上櫃法人資料暫時無法取得</h2><p>'+esc(e.message)+'</p><p class="sub">不會以舊資料或推測數字補值。</p></section>';}
    } else if(view==='supply') {if(!quotes.length)try{await loadQuotes()}catch{} showSupply();}
    else if(view==='market'||view==='stocks') {if(!quotes.length)try{await loadQuotes()}catch{}}
  }
  document.addEventListener('click',async e=>{
    const nav=e.target.closest('nav button[data-view]');
    if(nav&&(nav.dataset.view==='chips'||nav.dataset.view==='supply')) {
      e.preventDefault();e.stopImmediatePropagation();
      document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b===nav));
      window.__twCurrentView=nav.dataset.view;openPage(nav.dataset.view);return;
    }
    const row=e.target.closest('#quotesTable tbody tr');
    if(row && !e.target.closest('button')) {
      const code=row.querySelector('.code')?.textContent.trim();
      if(code){
        e.preventDefault();e.stopImmediatePropagation();
        try {
          // The main page and detail module fetch quotes independently. If a user
          // clicks before this module's prefetch finishes, wait for the data
          // instead of silently doing nothing.
          if(!quote(code)) await loadQuotes();
          if(!quote(code)) throw Error('行情清單中找不到股票代號 '+code);
          showStock(code);
        } catch(err) {
          const notice=$('notice');
          if(notice) notice.textContent='個股資料載入失敗：'+err.message+'。請稍後再試。';
        }
      }
    }
  },true);
  const css=document.createElement('style');
  css.textContent='.rankboard{width:100%;overflow-x:auto}.rankboardhead,.rankboardrow{display:grid;grid-template-columns:58px repeat(3,minmax(180px,1fr));min-width:640px}.rankboardhead{background:var(--surface-2,var(--line));font-weight:700;text-align:center;border-radius:8px 8px 0 0}.rankboardhead>div{padding:12px 8px}.rankboardrow{border-bottom:1px solid var(--line)}.rankboardindex{padding:12px 8px;text-align:center;font-weight:700}.rankboarditem{padding:10px 12px;border-left:1px solid var(--line);min-width:0}.rank-stock{border:0;background:none;color:var(--blue);font:inherit;font-weight:700;cursor:pointer;padding:0;text-align:left}.rankamount{font-size:13px;margin-top:5px;font-weight:700}.rankamount span{font-weight:400;color:var(--muted)}.rankempty{color:var(--muted);padding:12px}#quotesTable tbody tr{cursor:pointer}#quotesTable tbody tr:hover{background:#f3f6ff} .chainlist{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.chainitem{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border:1px solid var(--line);border-radius:10px;padding:12px}.chainitem span{color:var(--muted);flex:1}.chartbox{max-width:650px}.date-sync{padding:9px 12px;border-radius:8px;font-size:13px;margin:8px 0}.date-sync.sync-ok{background:#eaf7ef;color:#176b3a}.date-sync.sync-warn{background:#fff4df;color:#8a5600}.chartbox svg{width:100%;height:auto}.chartlegend{display:flex;gap:15px;flex-wrap:wrap;color:var(--muted);font-size:12px}.analysis-list{padding-left:20px}.analysis-list li{margin:6px 0}@media(max-width:760px){.chainlist{grid-template-columns:1fr}}';
  document.head.appendChild(css);
  window.__twStockDetail=showStock;
  // Prefetch the official daily quote and OTC institutional tables for responsive detail views.
  loadQuotes().catch(()=>{});
  loadInst().catch(()=>{});
})();
