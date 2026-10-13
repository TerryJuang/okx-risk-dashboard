'use strict';
const $=id=>document.getElementById(id);
const fieldIds={entry:'entry',capital:'capital',risk:'risk',stop:'stop',rr:'rr',splitCount:'split-count',mmr:'mmr',maxLeverage:'max-leverage',openFee:'open-fee',closeFee:'close-fee',slippage:'slippage',buffer:'buffer',leverage:'leverage'};
const number=id=>$(id).value.trim()===''?NaN:Number($(id).value);
const fmt=n=>new Intl.NumberFormat('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const compact=fmt;
const price=fmt;
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
  const segments=[{name:'保證金',value:r.margin,kind:'margin'},
    {name:'開倉費',value:r.openCost,kind:'fee'},
    {name:'其餘資金',value:Math.max(0,r.capital-r.cashRequired),kind:'available'}];
  $('funding-empty').hidden=true;
  $('funding-bar').replaceChildren();$('funding-metrics').replaceChildren();
  segments.forEach(segment=>{
    const percent=segment.value/r.capital*100;
    const bar=document.createElement('span');bar.className=`funding-segment ${segment.kind}`;
    bar.style.width=`${percent}%`;$('funding-bar').appendChild(bar);
    const item=document.createElement('div');item.className=`funding-item ${segment.kind}`;
    const label=document.createElement('span');label.textContent=segment.name;
    const amount=document.createElement('strong');amount.textContent=fmt(segment.value)+' U';
    const share=document.createElement('small');share.textContent=fmt(percent,2)+'%';
    item.append(label,amount,share);$('funding-metrics').appendChild(item);
  });
  $('funding-bar').setAttribute('aria-label',segments.map(s=>`${s.name} ${fmt(s.value)} USDT，占 ${fmt(s.value/r.capital*100)}%`).join('；'));
  $('funding-risk').textContent=`單筆虧損預算 ${compact(r.budget)} U；停損預估虧損 ${fmt(r.plannedLoss)} U（含成本），不與保證金重複加總。`;
}
function renderPriceAxis(rows,r) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width','100%');svg.setAttribute('height','408');svg.setAttribute('aria-hidden','true');
  const low=rows[rows.length-1].value,high=rows[0].value;
  const position=value=>high>low?32+(high-value)/(high-low)*344:204;
  const add=(tag,attrs,text)=>{
    const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
    Object.entries(attrs).forEach(([key,value])=>el.setAttribute(key,String(value)));
    if(text!==undefined) el.textContent=text;
    svg.appendChild(el);return el;
  };
  for(let i=0;i<=4;i++) add('line',{x1:'0%',x2:'96%',y1:32+i*86,y2:32+i*86,class:'axis-grid'});
  [[r.stopPrice,'stop'],[r.takePrice,'take']].forEach(([value,kind])=>
    add('rect',{x:'70%',y:Math.min(position(value),position(r.entry)),width:'20%',height:Math.abs(position(value)-position(r.entry)),class:`axis-zone ${kind}`}));
  add('line',{x1:'80%',x2:'80%',y1:32,y2:376,class:'axis-line'});
  rows.forEach((row,i)=>{
    const y=position(row.value),labelY=48+i*104;
    add('line',{x1:'0%',x2:'18%',y1:labelY,y2:labelY,class:`axis-leader ${row.kind}`});
    add('line',{x1:'18%',x2:'62%',y1:labelY,y2:y,class:`axis-leader ${row.kind}`});
    add('line',{x1:'62%',x2:'80%',y1:y,y2:y,class:`axis-leader ${row.kind}`});
    add('line',{x1:'70%',x2:'90%',y1:y,y2:y,class:`axis-marker ${row.kind}`});
    add('circle',{cx:'80%',cy:y,r:4,class:`axis-dot ${row.kind}`});
  });
  add('text',{x:'80%',y:16,'text-anchor':'middle',class:'axis-end'},'高');
  add('text',{x:'80%',y:402,'text-anchor':'middle',class:'axis-end'},'低');
  $('price-axis').replaceChildren(svg);
  $('price-axis').setAttribute('aria-label',`高價在上、低價在下，點位等比例顯示；標籤以連線避讓。${rows.map(x=>`${x.name} ${price(x.value)} USDT`).join('，')}`);
  $('map-empty').hidden=true;
}
function renderMap(r) {
  const rows=[{name:'停利',value:r.takePrice,kind:'take',detail:`價格 ${r.side==='long'?'+':'−'}${compact(r.stop*r.rr)}% · 預估淨利 ${fmt(r.plannedProfit)} U`},
    {name:'入場',value:r.entry,kind:'entry',detail:`${r.side==='long'?'做多':'做空'} · ${r.leverage}× 逐倉`},
    {name:'停損',value:r.stopPrice,kind:'stop',detail:`價格 ${r.side==='long'?'−':'+'}${compact(r.stop)}% · 預估虧損 ${fmt(r.plannedLoss)} U`},
    {name:'預估強平',value:r.liquidation,kind:'liquidation',detail:r.liquidation===0?'模型下限，不代表實際無風險':'依目前假設參數計算'}].sort((a,b)=>b.value-a.value);
  renderPriceAxis(rows,r);
  $('price-map').replaceChildren();
  rows.forEach(row=>{
    const el=document.createElement('div');el.className=`price-row ${row.kind}`;
    const label=document.createElement('span');label.className='price-name';label.textContent=row.name;
    const value=document.createElement('strong');value.textContent=price(row.value);
    const valueGroup=document.createElement('div');valueGroup.className='price-value';valueGroup.appendChild(value);
    if(row.kind==='stop') {
      const wrapper=document.createElement('span');wrapper.className='tooltip';
      const trigger=document.createElement('button');trigger.type='button';trigger.className='help-icon';trigger.textContent='?';
      trigger.setAttribute('aria-label','停損與預估強平距離說明');trigger.setAttribute('aria-describedby','liquidation-gap');
      wrapper.appendChild(trigger);valueGroup.appendChild(wrapper);
    }
    const detail=document.createElement('small');detail.textContent=row.detail;
    el.append(label,valueGroup,detail);$('price-map').appendChild(el);
  });
  $('price-map').setAttribute('aria-label',rows.map(x=>`${x.name} ${price(x.value)} USDT`).join('，'));
  $('price-title').textContent=`${r.side==='long'?'做多':'做空'} · 出場價位（USDT）`;
  $('liquidation-gap').textContent=`停損至預估強平差距 ${price(r.gap)} USDT（入場價的 ${fmt(r.gap/r.entry*100,3)}%）。強平距離 ${fmt(r.liquidationDistance*100)}%，要求嚴格大於停損＋滑價＋緩衝 ${fmt(r.requiredDistance*100)}%。`;
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
    $('price-axis').replaceChildren();$('price-axis').setAttribute('aria-label',prompt);
    $('map-empty').hidden=false;$('map-empty').textContent=prompt+'，查看出場價位。';
    $('funding-bar').replaceChildren();$('funding-bar').setAttribute('aria-label',prompt);
    $('funding-metrics').replaceChildren();$('funding-risk').textContent='—';
    $('funding-empty').hidden=false;$('funding-empty').textContent=prompt+'，查看資金分配。';
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
  $('leverage-value').textContent=fmt(r.leverage);
  $('leverage').setAttribute('aria-valuetext',`${r.leverage} 倍，可選 1 至 100 倍，符合目前條件的上限 ${r.maxAllowed} 倍`);
  $('leverage-guidance').textContent=r.maxAllowed?`符合目前停損、滑價、緩衝及合約上限的槓桿：1–${r.maxAllowed} 倍。`:'目前 1–100 倍皆無法同時符合停損、緩衝與合約上限。';
  $('result-badge').textContent=r.ready?'符合試算條件 · 待核對 OKX':'未符合開單條件';
  $('result-badge').classList.toggle('capped',!r.ready);
  const outputs={notional:fmt(r.notional),margin:fmt(r.margin),'equation-leverage':fmt(r.leverage)+'×','equation-notional':fmt(r.notional),
    'planned-loss':fmt(r.plannedLoss),'planned-profit':fmt(r.plannedProfit),'rr-result':`${compact(r.rr)} / ${fmt(r.netRR)}`,'liquidation-result':price(r.liquidation),
    'exit-margin':fmt(r.margin),'exit-leverage':fmt(r.leverage)+'×',
    'budget-equation':`${compact(r.capital)} × ${compact(r.risk)}% = ${compact(r.budget)} U`,
    'notional-equation':`${compact(r.budget)} ÷ ${fmt(r.lossRate*100)}% ≈ ${fmt(r.targetNotional)} U（上限前）`,
    'margin-equation':`${fmt(r.notional)} ÷ ${r.leverage} ≈ ${fmt(r.margin)} U`};
  Object.entries(outputs).forEach(([id,value])=>$(id).textContent=value);
  $('amount-caption').textContent=`虧損預算 ${compact(r.budget)} U · 交易額以 0.01 U 向下取整${r.capped?' · 已縮小至資金切分上限':''}`;
  $('parts-label').textContent=`${fmt(r.parts)} / ${r.maxParts} 份上限`;
  $('cap-note').textContent=`每份 ${fmt(r.capital/r.splitCount)} U；保證金上限 ${fmt(r.cap)} U。開倉費另計 ${fmt(r.openCost)} U，合計需 ${fmt(r.cashRequired)} U。`;
  $('split-warning').hidden=r.splitCount>=10;
  $('split-warning').textContent=r.splitCount<10?`目前 ${r.splitCount} 份，低於建議的 10 份；單筆保證金上限提高至總資金 ${compact(r.capPct)}%。`:'';
  const checks=[{ok:r.liquidationOutside,text:r.liquidationOutside?'預估強平在停損、滑價與緩衝之外':r.liquidationDistance<=r.stop/100?'目前槓桿可能在停損前強平，停損損益僅供理論比較':'目前槓桿未保留足夠的滑價與強平緩衝'}];
  if(!r.contractLeverageOk) checks.push({ok:false,text:`目前 ${r.leverage} 倍超過設定的合約上限 ${r.maxLeverage} 倍。`});
  $('checks').replaceChildren();checks.forEach(check=>{const el=document.createElement('p');el.className=check.ok?'check-ok':'check-bad';el.textContent=(check.ok?'✓ ':'! ')+check.text;$('checks').appendChild(el);});
  const warnings=[];
  if(r.capped) warnings.push(`原需 ${compact(r.targetNotional/r.leverage)} U 保證金，超過 ${r.maxParts} 份上限。已縮小交易額，實際預估虧損降為 ${fmt(r.plannedLoss)} U。`);
  if(!r.netRROk) warnings.push(`費用後 RR 為 ${fmt(r.netRR)}，未大於 1.00；成本會吃掉報酬。此提示不限制保存紀錄。`);
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
