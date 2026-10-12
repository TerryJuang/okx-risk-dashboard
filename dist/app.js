'use strict';
const $=id=>document.getElementById(id);
const fieldIds={entry:'entry',capital:'capital',risk:'risk',stop:'stop',rr:'rr',splitCount:'split-count',mmr:'mmr',maxLeverage:'max-leverage',openFee:'open-fee',closeFee:'close-fee',slippage:'slippage',buffer:'buffer',leverage:'leverage'};
const number=id=>$(id).value.trim()===''?NaN:Number($(id).value);
const fmt=(n,digits=2)=>new Intl.NumberFormat('zh-TW',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(n);
const compact=n=>new Intl.NumberFormat('zh-TW',{maximumFractionDigits:8}).format(n);
const price=n=>n===0?'0':new Intl.NumberFormat('zh-TW',{maximumSignificantDigits:10}).format(n);
const clean=n=>Number.isFinite(n)?String(Number(n.toPrecision(12))):'';
let side='long', stopDriver='percent', budgetDriver='risk';
const readValues=()=>({...Object.fromEntries(Object.entries(fieldIds).map(([key,id])=>[key,number(id)])),side});
function syncInputs(changed) {
  if(changed==='stop') stopDriver='percent';
  if(changed==='stop-price') stopDriver='price';
  if(changed==='risk') budgetDriver='risk';
  if(changed==='loss-budget') budgetDriver='amount';
  const entry=number('entry'), capital=number('capital'), sign=side==='long'?1:-1;
  if(['entry','stop','stop-price','side'].includes(changed)) {
    if(stopDriver==='percent') $('stop-price').value=clean(entry*(1-sign*number('stop')/100));
    else $('stop').value=entry>0?clean(sign*(entry-number('stop-price'))/entry*100):'';
  }
  if(['capital','risk','loss-budget'].includes(changed)) {
    if(budgetDriver==='risk') $('loss-budget').value=clean(capital*number('risk')/100);
    else $('risk').value=capital>0?clean(number('loss-budget')/capital*100):'';
  }
}
function renderBars(r) {
  const container=$('capital-bars'); container.replaceChildren();
  container.style.gridTemplateColumns=`repeat(${r.splitCount},minmax(0,1fr))`;
  container.style.gap=`${Math.min(4,40/r.splitCount)}px`;
  for(let i=0;i<r.splitCount;i++) {
    const bar=document.createElement('div'),fill=document.createElement('span');
    bar.className='capital-bar'+(i<r.maxParts?' in-limit':'');
    fill.style.width=`${Math.min(1,Math.max(0,r.parts-i))*100}%`;
    bar.appendChild(fill);container.appendChild(bar);
  }
  container.setAttribute('aria-label',`保證金占總資金 ${fmt(r.margin/r.capital*100)}%，上限 ${compact(r.capPct)}%`);
}
function renderMap(r) {
  const rows=[{name:'停利',value:r.takePrice,kind:'take',detail:`價格 ${r.side==='long'?'+':'−'}${compact(r.stop*r.rr)}% · 預估淨利 ${fmt(r.plannedProfit)} U`},
    {name:'入場',value:r.entry,kind:'entry',detail:`${r.side==='long'?'做多':'做空'} · ${r.leverage}× 逐倉`},
    {name:'停損',value:r.stopPrice,kind:'stop',detail:`價格 ${r.side==='long'?'−':'+'}${compact(r.stop)}% · 預估虧損 ${fmt(r.plannedLoss)} U`},
    {name:'預估強平',value:r.liquidation,kind:'liquidation',detail:r.liquidation===0?'模型下限，不代表實際無風險':'依目前假設參數計算'}].sort((a,b)=>b.value-a.value);
  $('price-map').replaceChildren();
  rows.forEach(row=>{
    const el=document.createElement('div');el.className=`price-row ${row.kind}`;
    const label=document.createElement('span');label.className='price-name';label.textContent=row.name;
    const value=document.createElement('strong');value.textContent=price(row.value);
    const detail=document.createElement('small');detail.textContent=row.detail;
    el.append(label,value,detail);$('price-map').appendChild(el);
  });
  $('price-map').setAttribute('aria-label',rows.map(x=>`${x.name} ${price(x.value)} USDT`).join('，'));
  $('price-title').textContent=`${r.side==='long'?'做多':'做空'} · 出場價位（USDT）`;
  $('liquidation-gap').textContent=`停損至預估強平差距 ${price(r.gap)} USDT（入場價的 ${fmt(r.gap/r.entry*100,3)}%）。強平距離 ${fmt(r.liquidationDistance*100,3)}%，要求嚴格大於停損＋滑價＋緩衝 ${fmt(r.requiredDistance*100,3)}%。`;
}
function render() {
  let r;
  try { r=calculate(readValues()); }
  catch(error) {
    const waiting=Object.values(fieldIds).some(id=>$(id).value.trim()==='');
    const prompt=waiting?'請補齊價格與試算欄位':'請先修正輸入';
    $('input-error').textContent=waiting?'':error.message;$('input-error').hidden=waiting;
    document.querySelectorAll('[data-output]').forEach(el=>el.textContent='—');
    $('result-badge').textContent=waiting?'待輸入':'待修正';$('result-badge').classList.toggle('capped',!waiting);
    $('amount-caption').textContent=prompt+'。';
    $('price-map').replaceChildren();$('price-map').setAttribute('aria-label',prompt);
    $('price-title').textContent=`${side==='long'?'做多':'做空'} · 出場價位（USDT）`;
    $('checks').replaceChildren();$('capital-bars').replaceChildren();$('capital-bars').setAttribute('aria-label',prompt);
    ['liquidation-gap','parts-label','cap-note'].forEach(id=>$(id).textContent='—');
    ['calculation-warning','split-warning'].forEach(id=>$(id).hidden=true);
    $('leverage-value').textContent=$('leverage').value;
    $('leverage').setAttribute('aria-valuetext',`${$('leverage').value} 倍，待輸入完整條件`);
    $('leverage-guidance').textContent='填入有效條件後，顯示符合停損與緩衝條件的槓桿上限。';
    return null;
  }
  $('input-error').hidden=true;
  $('leverage-value').textContent=r.leverage;
  $('leverage').setAttribute('aria-valuetext',`${r.leverage} 倍，可選 1 至 100 倍，符合目前條件的上限 ${r.maxAllowed} 倍`);
  $('leverage-guidance').textContent=r.maxAllowed?`符合目前停損、滑價、緩衝及合約上限的槓桿：1–${r.maxAllowed} 倍。`:'目前 1–100 倍皆無法同時符合停損、緩衝與合約上限。';
  $('result-badge').textContent=r.ready?'符合試算條件 · 待核對 OKX':'未符合開單條件';
  $('result-badge').classList.toggle('capped',!r.ready);
  const outputs={notional:fmt(r.notional),margin:fmt(r.margin),'equation-leverage':r.leverage+'×','equation-notional':fmt(r.notional),
    'planned-loss':fmt(r.plannedLoss,4),'planned-profit':fmt(r.plannedProfit,4),'rr-result':`${compact(r.rr)} / ${fmt(r.netRR,3)}`,
    'budget-equation':`${compact(r.capital)} × ${compact(r.risk)}% = ${compact(r.budget)} U`,
    'notional-equation':`${compact(r.budget)} ÷ ${fmt(r.lossRate*100,5)}% ≈ ${fmt(r.targetNotional)} U（上限前）`,
    'margin-equation':`${fmt(r.notional)} ÷ ${r.leverage} ≈ ${fmt(r.margin)} U`};
  Object.entries(outputs).forEach(([id,value])=>$(id).textContent=value);
  $('amount-caption').textContent=`虧損預算 ${compact(r.budget)} U · 交易額以 0.01 U 向下取整${r.capped?' · 已縮小至資金切分上限':''}`;
  $('parts-label').textContent=`${fmt(r.parts)} / ${r.maxParts} 份上限`;
  $('cap-note').textContent=`每份 ${fmt(r.capital/r.splitCount)} U；保證金上限 ${fmt(r.cap)} U。開倉費另計 ${fmt(r.openCost,4)} U，合計需 ${fmt(r.cashRequired,4)} U。`;
  $('split-warning').hidden=r.splitCount>=10;
  $('split-warning').textContent=r.splitCount<10?`目前 ${r.splitCount} 份，低於建議的 10 份；單筆保證金上限提高至總資金 ${compact(r.capPct)}%。`:'';
  const checks=[{ok:r.rrOk,text:`${r.side==='long'?'做多 RR > 2':'做空 RR ≥ 1'}：${r.rrOk?'符合':'不符合'}`},
    {ok:r.liquidationOutside,text:r.liquidationOutside?'預估強平在停損、滑價與緩衝之外':r.liquidationDistance<=r.stop/100?'目前槓桿可能在停損前強平，停損損益僅供理論比較':'目前槓桿未保留足夠的滑價與強平緩衝'}];
  if(!r.contractLeverageOk) checks.push({ok:false,text:`目前 ${r.leverage} 倍超過設定的合約上限 ${r.maxLeverage} 倍。`});
  $('checks').replaceChildren();checks.forEach(check=>{const el=document.createElement('p');el.className=check.ok?'check-ok':'check-bad';el.textContent=(check.ok?'✓ ':'! ')+check.text;$('checks').appendChild(el);});
  const warnings=[];
  if(r.capped) warnings.push(`原需 ${compact(r.targetNotional/r.leverage)} U 保證金，超過 ${r.maxParts} 份上限。已縮小交易額，實際預估虧損降為 ${fmt(r.plannedLoss,4)} U。`);
  if(!r.netRROk) warnings.push(`費用後 RR 為 ${fmt(r.netRR,3)}，未達${r.side==='long'?'大於 2':'至少 1'}。即使價格 RR 合格，成本也會吃掉報酬。`);
  if(r.risk>3) warnings.push(`單筆風險 ${compact(r.risk)}%，高於原教材的 1–3% 範例範圍。`);
  if(r.notional===0) warnings.push('交易額取整後為 0，不能據此下單；請核對最小張數。');
  $('calculation-warning').textContent=warnings.join('\n');$('calculation-warning').hidden=!warnings.length;
  renderBars(r);renderMap(r);return r;
}
Object.values(fieldIds).concat(['stop-price','loss-budget']).forEach(id=>$(id).addEventListener('input',()=>{syncInputs(id);render();}));
document.querySelectorAll('[data-side]').forEach(button=>button.addEventListener('click',()=>{
  side=button.dataset.side;
  document.querySelectorAll('[data-side]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  // Preserve the distance when switching side; a former long stop is not a valid short stop.
  stopDriver='percent';syncInputs('side');render();
}));
$('risk-form').addEventListener('submit',event=>event.preventDefault());
render();

// Retain the existing optional browser-agent interface, using the same validation.
if(document.modelContext?.registerTool) {
  const lifecycle=new AbortController();
  const numeric={type:'number',exclusiveMinimum:0};
  const properties=Object.fromEntries(Object.keys(fieldIds).map(k=>[k,{...numeric}]));
  for(const key of ['leverage','maxLeverage']) properties[key]={type:'integer',minimum:1,maximum:100};
  for(const key of ['mmr','openFee','closeFee','slippage','buffer']) properties[key]={type:'number',minimum:0};
  properties.side={type:'string',enum:['long','short']};
  try {
    Promise.resolve(document.modelContext.registerTool({name:'configure_risk_calculation',title:'設定開單風險試算',
      description:'設定 USDT 永續逐倉試算、停損距離與槓桿，回傳交易額、保證金、停利停損與預估強平價。只更新本頁，不下單。',
      inputSchema:{type:'object',properties,required:['capital','risk'],additionalProperties:false},
      execute(input) {
        if(!input || typeof input!=='object' || !('capital' in input) || !('risk' in input) || Object.keys(input).some(k=>!(k in properties))) throw new Error('請提供合法試算欄位與總資金、風險％。');
        const values={...readValues(),...input};calculate(values);
        Object.entries(fieldIds).forEach(([key,id])=>$(id).value=String(values[key]));
        side=values.side;stopDriver='percent';budgetDriver='risk';syncInputs('side');syncInputs('risk');
        document.querySelectorAll('[data-side]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.side===side)));
        const result=render();return {unit:'USDT',...result};
      }},{signal:lifecycle.signal})).catch(()=>{});
    window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  } catch(_) { /* Optional integration does not affect ordinary calculation. */ }
}
