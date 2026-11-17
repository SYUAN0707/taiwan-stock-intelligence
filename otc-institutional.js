(() => {
  const API = 'https://taiwan-stock-intelligence-api.onrender.com';
  let data = [], info = null;
  fetch(API + '/api/quotes', {cache:'no-store'}).then(r=>r.json()).then(q=>{window.__twQuotes=q.items||[];}).catch(()=>{});
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = v => v == null ? '—' : Number(v).toLocaleString('zh-TW');
  const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
  async function fetchData() {
    const r = await fetch(API + '/api/institutional', {cache:'no-store'});
    const d = await r.json();
    if (!r.ok || !Array.isArray(d.items) || !d.items.length) throw Error(d.error || '櫃買法人資料暫時無法取得');
    data = d.items; info = d;
  }
  function renderChips() {
    $('pageTitle').textContent = '上櫃法人籌碼';
    $('pageSub').textContent = '僅使用櫃買中心官方開放資料；上市個股法人資料暫不整合';
    let html = '<div class="notice">資料日期：' + esc(info.trade_date) + '｜資料筆數：' + fmt(info.count) + '｜單位：股。外資欄位不含外資自營商。</div>';
    const fields = [['foreign_net_shares','外資（不含外資自營商）'],['trust_net_shares','投信'],['dealer_net_shares','自營商'],['total_net_shares','三大法人合計']];
    for (const [key,label] of fields) {
      const buys = [...data].sort((a,b)=>b[key]-a[key]).slice(0,10);
      const sells = [...data].filter(x=>x[key]<0).sort((a,b)=>a[key]-b[key]).slice(0,10);
      const rows = arr => arr.map((x,i)=>'<tr><td>'+(i+1)+'</td><td><button class="tool otc-stock" data-code="'+esc(x.code)+'" style="padding:0;color:var(--blue)">'+esc(x.name||x.code)+'</button><span class="code">'+esc(x.code)+'</span></td><td class="'+cls(x[key])+'">'+fmt(x[key])+'</td></tr>').join('') || '<tr><td colspan="3" class="empty">目前沒有資料</td></tr>';
      html += '<section class="panel"><h2>'+label+'買超前 10 名</h2><div class="tablewrap"><table><thead><tr><th>排名</th><th>股票</th><th>買賣超（股）</th></tr></thead><tbody>'+rows(buys)+'</tbody></table></div><h2 style="margin-top:18px">'+label+'賣超前 10 名</h2><div class="tablewrap"><table><thead><tr><th>排名</th><th>股票</th><th>買賣超（股）</th></tr></thead><tbody>'+rows(sells)+'</tbody></table></div></section>';
    }
    html += '<div class="footer">來源：<a href="https://data.gov.tw/dataset/11856" target="_blank" rel="noopener">政府資料開放平臺資料集 11856</a>／<a href="https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading" target="_blank" rel="noopener">櫃買中心 OpenAPI</a>。授權：<a href="https://data.gov.tw/license" target="_blank" rel="noopener">政府資料開放授權條款第 1 版</a>。</div>';
    $('content').innerHTML = html;
  }
  async function showChips() {
    $('pageTitle').textContent='上櫃法人籌碼'; $('pageSub').textContent='載入櫃買中心官方資料中…';
    $('content').innerHTML='<div class="panel loading">正在讀取官方上櫃法人資料…</div>';
    try { await fetchData(); renderChips(); }
    catch(e) { $('content').innerHTML='<section class="panel"><h2>上櫃法人資料暫時無法取得</h2><p>'+esc(e.message)+'</p><p class="sub">不會以舊資料或推測數字補值。</p></section>'; }
  }
  function showStock(code) {
    const q = (window.__twQuotes || []).find(x=>x.code===code);
    const stock = data.find(x=>x.code===code);
    if (!q) { $('pageTitle').textContent=code; $('content').innerHTML='<section class="panel">個股行情資料尚未載入。</section>'; return; }
    $('pageTitle').textContent=(q.name||'個股')+'（'+q.code+'）';
    $('pageSub').textContent='每日收盤行情｜資料日期 '+(q.trade_date||'—');
    $('content').innerHTML='<section class="panel"><h2>公司與行情資訊</h2><div class="detail"><div><small>市場</small><b>'+esc(q.market)+'</b></div><div><small>收盤價</small><b>'+fmt(q.price)+'</b></div><div><small>漲跌</small><b>'+fmt(q.change)+'</b></div><div><small>成交量（股）</small><b>'+fmt(q.volume)+'</b></div><div><small>成交金額（元）</small><b>'+fmt(q.amount)+'</b></div><div><small>最高／最低</small><b>'+fmt(q.high)+'／'+fmt(q.low)+'</b></div></div><button class="secondary" onclick="location.reload()">返回市場總覽</button></section><section class="panel"><h2>法人買賣超</h2>'+(stock?'<div class="detail"><div><small>資料日期</small><b>'+esc(stock.trade_date)+'</b></div><div><small>外資（不含外資自營商）</small><b>'+fmt(stock.foreign_net_shares)+'</b></div><div><small>投信</small><b>'+fmt(stock.trust_net_shares)+'</b></div><div><small>自營商</small><b>'+fmt(stock.dealer_net_shares)+'</b></div><div><small>三大法人合計</small><b>'+fmt(stock.total_net_shares)+'</b></div></div>':(q.market==='上市'?'上市個股法人資料暫不提供。':'此股票目前沒有可用的上櫃法人資料。'))+'</section><section class="panel"><h2>公司資訊與供應鏈</h2><p class="sub">公司簡介、官方產業分類及上下游供應鏈待以公開資訊查證後逐步補入；目前不以推測資料填入。</p></section>';
  }
  document.addEventListener('click', e => {
    const nav = e.target.closest('nav button[data-view="chips"]');
    if (nav) { e.preventDefault(); e.stopImmediatePropagation(); document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b===nav)); showChips(); return; }
    const stock = e.target.closest('.otc-stock');
    if (stock) { e.preventDefault(); showStock(stock.dataset.code); }
    const name = e.target.closest('td .stock');
    if (name) {
      const codeEl = name.parentElement.querySelector('.code');
      if (codeEl) { e.preventDefault(); showStock(codeEl.textContent.trim()); }
    }
  }, true);
  function makeNamesClickable() {
    document.querySelectorAll('#quotesTable td .stock').forEach(el => {
      const code = el.parentElement.querySelector('.code');
      if (!code || el.dataset.clickable) return;
      el.dataset.clickable='1'; el.style.cursor='pointer'; el.title='查看個股資訊';
    });
  }
  const observer = new MutationObserver(makeNamesClickable);
  observer.observe(document.body,{childList:true,subtree:true});
  const refresh = $('refresh');
  if (refresh) refresh.addEventListener('click',()=>{ if(document.querySelector('nav button.active')?.dataset.view==='chips') showChips(); });
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this,args);
    if (String(args[0]).includes('/api/quotes')) {
      try { const copy=response.clone(); const q=await copy.json(); window.__twQuotes=q.items||[]; } catch {}
    }
    return response;
  };
})();