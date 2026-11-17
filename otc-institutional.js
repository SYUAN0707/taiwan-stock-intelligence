(() => {
  const API = 'https://taiwan-stock-intelligence-api.onrender.com';
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
    if (!r.ok || !Array.isArray(d.items) || !d.items.length) throw Error(d.error || '上櫃法人資料暫時無法取得');
    inst = d.items; instInfo = d;
  }
  const quote = code => quotes.find(x=>x.code===code);
  function chart(q) {
    const close=q.close??q.price; const vals=[q.low,q.open,close,q.high].map(Number);
    if(vals.some(x=>!Number.isFinite(x))) return '<p class="sub">官方當日 OHLC 資料不足，暫不繪製K線。</p>';
    const min=Math.min(...vals), max=Math.max(...vals), span=Math.max(max-min,Math.abs(max)*.01,0.01);
    const y=v=>20+(max-v)/span*180;
    const up=close>=q.open, color=up?'#d84a4a':'#15966a';
    return '<div class="chartbox"><svg viewBox="0 0 460 230" role="img" aria-label="單日 OHLC K 線圖"><line x1="48" y1="20" x2="440" y2="20" stroke="#e7eaf0"/><line x1="48" y1="110" x2="440" y2="110" stroke="#e7eaf0"/><line x1="48" y1="200" x2="440" y2="200" stroke="#e7eaf0"/><text x="5" y="'+(y(max)+4)+'" font-size="11" fill="#758092">'+n(max)+'</text><text x="5" y="'+(y(min)+4)+'" font-size="11" fill="#758092">'+n(min)+'</text><line x1="245" y1="'+y(q.high)+'" x2="245" y2="'+y(q.low)+'" stroke="'+color+'" stroke-width="3"/><rect x="220" y="'+Math.min(y(q.open),y(close))+'" width="50" height="'+Math.max(3,Math.abs(y(q.open)-y(q.close)))+'" fill="'+(up?'#fff':'#15966a')+'" stroke="'+color+'" stroke-width="3"/><text x="220" y="222" font-size="12" fill="#758092">當日</text></svg><div class="chartlegend"><span>開盤 '+n(q.open)+'</span><span>最高 '+n(q.high)+'</span><span>最低 '+n(q.low)+'</span><span>收盤 '+n(q.price)+'</span></div></div>';
  }
  function technical(q) {
    const diff=Number(q.close??q.price)-Number(q.open);
    const change=Number(q.change);
    const range=Number(q.high)-Number(q.low);
    let parts=[];
    parts.push(diff>0?'收盤高於開盤，當日K棒為紅K（上漲）。':diff<0?'收盤低於開盤，當日K棒為綠K（下跌）。':'開盤與收盤相同，當日為十字／平盤型態。');
    if(Number.isFinite(range)&&range>0) {
      const body=Math.abs(diff)/range;
      parts.push(body>=.65?'實體占當日振幅比重較高，當日方向性較明顯。':body<=.25?'實體相對較短，當日多空拉鋸較明顯。':'實體長度居中，需搭配後續交易日確認。');
    }
    if(Number.isFinite(change)) parts.push('當日漲跌價差 '+(change>0?'+':'')+n(change)+' 元。');
    parts.push('目前僅以單日 OHLC 判讀；尚未取得連續歷史日K，因此不計算均線、MACD、RSI，也不推論中長期趨勢。');
    return '<ul class="analysis-list">'+parts.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';
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
    $('content').innerHTML='<section class="panel"><div class="panelhead"><h2>每日收盤行情</h2><span class="tag">'+esc(q.market)+'</span></div><div class="detail"><div><small>收盤價</small><b>'+n(q.price)+'</b></div><div><small>漲跌價差</small><b class="'+cls(q.change)+'">'+n(q.change)+'</b></div><div><small>成交量（股）</small><b>'+n(q.volume)+'</b></div><div><small>成交金額（元）</small><b>'+n(q.amount)+'</b></div><div><small>開盤</small><b>'+n(q.open)+'</b></div><div><small>最高／最低</small><b>'+n(q.high)+'／'+n(q.low)+'</b></div><div><small>交易日期</small><b>'+esc(q.trade_date||'—')+'</b></div><div><small>行情來源</small><b>'+esc(q.quote_source||'交易所每日資料')+'</b></div></div></section><section class="panel"><h2>當日技術線圖（OHLC）</h2>'+chart(q)+'</section><section class="panel"><h2>技術面解讀</h2>'+technical(q)+'</section><section class="panel"><h2>上櫃法人資料</h2>'+(i?'<div class="detail"><div><small>外資（不含外資自營商）</small><b>'+n(i.foreign_net_shares)+' 股</b></div><div><small>投信</small><b>'+n(i.trust_net_shares)+' 股</b></div><div><small>自營商</small><b>'+n(i.dealer_net_shares)+' 股</b></div><div><small>三大法人合計</small><b>'+n(i.total_net_shares)+' 股</b></div></div><p class="sub">資料日期 '+esc(i.trade_date)+'；單位為股。上市個股法人資料依目前設定不提供。</p>':(q.market==='上市'?'此股票為上市股票，依目前設定不提供上市個股法人資料。':'此股票尚無可用的上櫃法人資料。'))+'</section><section class="panel"><h2>相關新聞</h2>'+news(q)+'</section><section class="panel"><h2>同產業／產業關聯權值股</h2>'+(peers.length?'<div class="chainlist">'+peerCards(peers)+'</div>':'<p class="sub">目前尚無已整理並完成來源查證的同產業權值股名單。</p>')+'</section><section class="panel"><h2>下游／供應鏈廠商</h2>'+(chain.length?'<div class="chainlist">'+peerCards(chain)+'</div><p class="sub">此為依你提供的台積電關聯廠商清單建立的初始分類；各公司實際供應、客戶關係及產品項目仍須逐一依年報、法說會或公開資訊查證，不代表已證實的直接供應關係。</p>':'<p class="sub">此股票尚未建立經查證的供應鏈關係，避免把同產業公司直接標示為上下游廠商。</p>')+'</section><button class="secondary" id="backToQuotes">返回每日收盤行情</button>';
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
    let html='<div class="notice">資料日期：'+esc(instInfo.trade_date)+'｜僅上櫃股票｜每欄各自排名前 10 名｜金額為淨買賣超，單位同時顯示股與張。</div>';
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
    html+='<div class="footer">來源：<a href="https://data.gov.tw/dataset/11856" target="_blank" rel="noopener">政府資料開放平臺 11856</a>／<a href="https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading" target="_blank" rel="noopener">櫃買中心 OpenAPI</a>。</div><section class="panel" id="rankDetail" hidden></section>';
    $('content').innerHTML=html;
    document.querySelectorAll('.rank-stock').forEach(b=>b.onclick=()=>{
      const x=inst.find(z=>z.code===b.dataset.code),key=b.dataset.key,val=x[key],box=$('rankDetail');
      box.hidden=false;
      box.innerHTML='<h2>'+esc(b.dataset.label)+'｜'+esc(x.name||x.code)+'（'+esc(x.code)+'）</h2><div class="detail"><div><small>排行類別</small><b>'+ (b.dataset.side==='buy'?'買超':'賣超')+'</b></div><div><small>資料日期</small><b>'+esc(x.trade_date)+'</b></div><div><small>淨買賣超</small><b class="'+cls(val)+'">'+(val>0?'買超 ':'賣超 ')+n(Math.abs(val))+' 股</b></div><div><small>換算張數</small><b>'+n(Math.abs(val)/1000)+' 張</b></div></div><p class="sub">此數字為該法人類別的淨買賣超，不代表買進總量或賣出總量。</p><button class="secondary" id="rankOpenStock">查看個股詳細頁</button>';
      $('rankOpenStock').onclick=()=>showStock(x.code);
      box.scrollIntoView({behavior:'smooth',block:'center'});
    });
  }
  function showSupply() {
    $('pageTitle').textContent='權值股下游供應鏈搜尋';
    $('pageSub').textContent='輸入權值股代號或名稱，查看已整理的產業關聯廠商';
    $('content').innerHTML='<section class="panel"><div class="panelhead"><h2>搜尋權值股</h2></div><div class="filters"><input id="chainSearch" placeholder="例如：台積電、2330" value="台積電"><button class="primary" id="chainGo">搜尋</button></div><div id="chainResults"></div></section>';
    const run=()=>{
      const v=$('chainSearch').value.trim().toLowerCase();
      const match=['2330','台積電','tsmc'].some(x=>v.includes(x));
      $('chainResults').innerHTML=match?'<section class="panel"><h2>台積電（2330）・半導體</h2><p class="sub">以下是依使用者提供名單整理的關聯廠商與角色，尚待公開文件逐筆核實直接供應關係。</p><div class="chainlist">'+peerCards(tsmcChain)+'</div></section>':'<section class="panel"><p>目前沒有「'+esc(v)+'」的已整理供應鏈資料。可先搜尋台積電（2330）；其他權值股將在查證公開資料後逐步加入。</p></section>';
      document.querySelectorAll('.open-stock').forEach(b=>b.onclick=()=>showStock(b.dataset.code));
    };
    $('chainGo').onclick=run;$('chainSearch').onkeydown=e=>{if(e.key==='Enter')run();};run();
  }
  async function openPage(view) {
    if(view==='chips'){
      $('pageTitle').textContent='法人買賣超排行';$('content').innerHTML='<div class="panel loading">正在載入上櫃法人資料…</div>';
      try{if(!quotes.length)await loadQuotes();await loadInst();showRanks();}
      catch(e){$('content').innerHTML='<section class="panel"><h2>上櫃法人資料暫時無法取得</h2><p>'+esc(e.message)+'</p><p class="sub">不會以舊資料或推測數字補值。</p></section>';}
    } else if(view==='supply') {if(!quotes.length)try{await loadQuotes()}catch{} showSupply();}
    else if(view==='market'||view==='stocks') {if(!quotes.length)try{await loadQuotes()}catch{}}
  }
  document.addEventListener('click',e=>{
    const nav=e.target.closest('nav button[data-view]');
    if(nav&&(nav.dataset.view==='chips'||nav.dataset.view==='supply')) {
      e.preventDefault();e.stopImmediatePropagation();
      document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b===nav));
      window.__twCurrentView=nav.dataset.view;openPage(nav.dataset.view);return;
    }
    const row=e.target.closest('#quotesTable td .stock');
    if(row) {
      const code=row.parentElement.querySelector('.code')?.textContent.trim();
      if(code){e.preventDefault();e.stopImmediatePropagation();if(!quotes.length)quotes=window.__twQuotes||[];showStock(code);}
    }
  },true);
  const css=document.createElement('style');
  css.textContent='.rankboard{width:100%;overflow-x:auto}.rankboardhead,.rankboardrow{display:grid;grid-template-columns:58px repeat(3,minmax(180px,1fr));min-width:640px}.rankboardhead{background:var(--surface-2,var(--line));font-weight:700;text-align:center;border-radius:8px 8px 0 0}.rankboardhead>div{padding:12px 8px}.rankboardrow{border-bottom:1px solid var(--line)}.rankboardindex{padding:12px 8px;text-align:center;font-weight:700}.rankboarditem{padding:10px 12px;border-left:1px solid var(--line);min-width:0}.rank-stock{border:0;background:none;color:var(--blue);font:inherit;font-weight:700;cursor:pointer;padding:0;text-align:left}.rankamount{font-size:13px;margin-top:5px;font-weight:700}.rankamount span{font-weight:400;color:var(--muted)}.rankempty{color:var(--muted);padding:12px}.chainlist{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.chainitem{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border:1px solid var(--line);border-radius:10px;padding:12px}.chainitem span{color:var(--muted);flex:1}.chartbox{max-width:650px}.chartbox svg{width:100%;height:auto}.chartlegend{display:flex;gap:15px;flex-wrap:wrap;color:var(--muted);font-size:12px}.analysis-list{padding-left:20px}.analysis-list li{margin:6px 0}@media(max-width:760px){.chainlist{grid-template-columns:1fr}}';
  document.head.appendChild(css);
  window.__twStockDetail=showStock;
  // Prefetch the official daily quote and OTC institutional tables for responsive detail views.
  loadQuotes().catch(()=>{});
  loadInst().catch(()=>{});
})();