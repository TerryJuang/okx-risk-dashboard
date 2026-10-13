'use strict';
(function(root) {
  const LIMIT=1e12;
  const inputKeys=['entry','capital','risk','stop','rr','splitCount','mmr','maxLeverage','openFee','closeFee','slippage','buffer','leverage','side'];
  const number=(value,label,min=0,max=LIMIT,positive=false)=>{
    if(value===null || typeof value==='boolean' || String(value).trim()==='') throw new Error(label+'不可空白。');
    const n=Number(value);
    if(!Number.isFinite(n)||n<min||n>max||(positive&&n===0)) throw new Error(label+'數值不正確。');
    return n;
  };
  function symbol(value) {
    const s=String(value||'').trim().toUpperCase();
    if(!/^[A-Z0-9]{1,20}(?:-USDT(?:-SWAP)?)?$/.test(s)) throw new Error('幣種請填 BTC、ETH-USDT 或 BTC-USDT-SWAP 等 USDT 合約。');
    return s.replace(/-USDT(?:-SWAP)?$/,'')+'-USDT-SWAP';
  }
  function timeframe(option,custom) {
    const allowed=['3','5','15','30','60','240','1440'];
    if(!allowed.includes(option)&&option!=='other') throw new Error('請選擇時間週期。');
    const n=number(option==='other'?custom:option,'時間週期',1,Number.MAX_SAFE_INTEGER);
    if(!Number.isSafeInteger(n)) throw new Error('時間週期需為正整數分鐘。');
    return n;
  }
  function snapshot(bridge,meta,calculator) {
    const inputs=Object.fromEntries(inputKeys.map(k=>[k,bridge.inputs[k]]));
    const result=calculator(inputs);
    if(!result.ready) throw new Error('目前試算未符合開單條件，暫不保存；警告草稿政策待確認。');
    Object.values(result).forEach(v=>{if(typeof v==='number'&&(!Number.isFinite(v)||Math.abs(v)>1e100)) throw new Error('試算輸出超出可保存範圍。');});
    return {inputs,result,raw:{...bridge.raw},stopPriceInput:number(bridge.raw['stop-price'],'停損價格',0,LIMIT,true),
      lossBudgetInput:number(bridge.raw['loss-budget'],'虧損金額',0,LIMIT,true),
      stopDriver:bridge.stopDriver,budgetDriver:bridge.budgetDriver,symbol:symbol(meta.symbol),
      timeframeMinutes:timeframe(meta.timeframeOption,meta.customTimeframe),timeframeOption:meta.timeframeOption,
      calculatorVersion:'sha256:9c8cd677c675ba8c474edf62f0c3db99d88d5b5aade32ae69cac6b35976ebcf7'};
  }
  function millis(value) {
    const n=value&&typeof value.toMillis==='function'?value.toMillis():typeof value==='number'?value:Date.parse(value);
    if(!Number.isFinite(n)||n<Date.UTC(2009,0,1)||n>Date.now()+300000) throw new Error('成交時間不正確，或晚於目前時間。');
    return n;
  }
  function entry(value) {
    const leverage=number(value.leverage,'實際槓桿',1,100);
    if(!Number.isInteger(leverage)) throw new Error('實際槓桿需為整數。');
    return {price:number(value.price,'實際入場均價',0,LIMIT,true),quantity:number(value.quantity,'實際幣數',0,LIMIT,true),
      openingFee:number(value.openingFee,'開倉手續費',-LIMIT),funding:number(value.funding,'累計資金費',-LIMIT),
      margin:number(value.margin,'實際保證金',0,LIMIT,true),leverage,openedAt:millis(value.openedAt)};
  }
  function close(value,actual) {
    if(!actual) throw new Error('請先填寫實際開倉資料。');
    const executedAt=millis(value.executedAt);
    if(executedAt<millis(actual.openedAt)) throw new Error('平倉時間不可早於開倉時間。');
    const reason=String(value.reason||'').trim(),note=String(value.note||'').trim();
    if(!reason||reason.length>120||note.length>2000) throw new Error('請填平倉原因（最多 120 字）；備註最多 2,000 字。');
    return {price:number(value.price,'平倉均價',0,LIMIT,true),quantity:number(value.quantity,'平倉幣數',0,LIMIT,true),
      fee:number(value.fee,'實際平倉費',-LIMIT),executedAt,reason,note,deleted:!!value.deleted};
  }
  function emptyTotals(){return {quantity:0,gross:0,fees:0,count:0};}
  function deltaTotals(totals,oldFill,newFill,actual,side) {
    const t={...totals},sign=side==='long'?1:-1;
    for(const [fill,factor] of [[oldFill,-1],[newFill,1]]) if(fill&&!fill.deleted) {
      t.quantity+=factor*fill.quantity;t.fees+=factor*fill.fee;
      t.gross+=factor*sign*(fill.price-actual.price)*fill.quantity;t.count+=factor;
    }
    const eps=32*Number.EPSILON*Math.max(actual.quantity,Math.abs(t.quantity));
    if(t.quantity < -eps || t.quantity-actual.quantity>eps) throw new Error('累計平倉數量不可超過實際開倉數量。');
    if(Math.abs(t.quantity)<eps) t.quantity=0;
    if(Math.abs(t.quantity-actual.quantity)<=eps) t.quantity=actual.quantity;
    for(const v of Object.values(t)) if(!Number.isFinite(v)||Math.abs(v)>1e30) throw new Error('實際交易數值超出範圍。');
    if(t.count===0) return emptyTotals();
    return t;
  }
  function summary(actual,totals,cancelled=false) {
    if(!actual) return {status:cancelled?'cancelled':'planned',remaining:0,net:0};
    const remaining=actual.quantity-totals.quantity;
    if(remaining<0) throw new Error('平倉数量超出持倉。');
    return {status:remaining===0?'closed':totals.quantity>0?'partial':'open',remaining,
      net:totals.gross-actual.openingFee-totals.fees+actual.funding};
  }
  function summarizeFills(actual,fills,side) {
    let totals=emptyTotals();
    for(const fill of fills) totals=deltaTotals(totals,null,close(fill,actual),actual,side);
    return {totals,...summary(actual,totals)};
  }
  function performance(records) {
    const trades=records.filter(r=>!r.trashed&&r.status==='closed'&&r.actual);
    const nets=trades.map(r=>summary(r.actual,r.totals).net),wins=nets.filter(n=>n>0),losses=nets.filter(n=>n<0);
    const total=a=>a.reduce((s,n)=>s+n,0),profit=total(wins),loss=-total(losses);
    const rs=trades.filter(r=>r.original.result.plannedLoss>0).map(r=>summary(r.actual,r.totals).net/r.original.result.plannedLoss);
    return {count:trades.length,net:total(nets),winRate:trades.length?wins.length/trades.length:null,
      averageWin:wins.length?profit/wins.length:null,averageLoss:losses.length?-loss/losses.length:null,
      profitFactor:loss?profit/loss:null,averageR:rs.length?total(rs)/rs.length:null};
  }
  function csvCell(value) {
    let s=String(value??'');if(/^[\s]*[=+\-@]/.test(s)) s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  }
  const api={symbol,timeframe,snapshot,entry,close,millis,emptyTotals,deltaTotals,summary,summarizeFills,performance,csvCell};
  if(typeof module!=='undefined')module.exports=api;
  root.RiskJournal=Object.freeze(api);
})(typeof globalThis!=='undefined'?globalThis:this);
