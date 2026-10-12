const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../dist/journal-core.js');
const {calculate}=require('../dist/calculator.js');
const base={entry:1200,capital:500,risk:2,stop:2,rr:3,splitCount:10,mmr:.5,maxLeverage:100,openFee:.05,closeFee:.05,slippage:.05,buffer:25,leverage:20,side:'long'};
const bridge=()=>({inputs:base,raw:{...Object.fromEntries(Object.entries(base).map(([k,v])=>[k,String(v)])),'stop-price':'1176','loss-budget':'10'},stopDriver:'percent',budgetDriver:'risk'});
const entry=(extra={})=>C.entry({price:100,quantity:10,openingFee:1,funding:-.5,margin:100,leverage:10,openedAt:Date.UTC(2026,0,1),...extra});
const fill=(extra={})=>({price:110,quantity:4,fee:.4,executedAt:Date.UTC(2026,0,2),reason:'分批止盈',note:'',...extra});
const near=(a,b)=>assert.ok(Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(b)),a+' != '+b);
test('snapshot stores exact calculator results and all input strings without DOM rounding',()=>{
 const s=C.snapshot(bridge(),{symbol:'eth',timeframeOption:'other',customTimeframe:'90'},calculate);
 assert.deepEqual(s.result,calculate(base));assert.deepEqual(s.inputs,base);
 assert.equal(s.symbol,'ETH-USDT-SWAP');assert.equal(s.timeframeMinutes,90);assert.equal(s.raw['stop-price'],'1176');
});
test('timeframe and symbol validation rejects missing/invalid inputs',()=>{
 for(const value of ['',0,-1,.5,Infinity,NaN])assert.throws(()=>C.timeframe('other',value));
 assert.throws(()=>C.timeframe('',1));assert.equal(C.timeframe('1440',''),1440);
 assert.throws(()=>C.symbol('<script>'));assert.throws(()=>C.symbol('BTC-USD'));assert.equal(C.symbol('BTC-USDT-SWAP'),'BTC-USDT-SWAP');
});
test('unready risk calculations cannot be mislabeled as saved ready plans',()=>{
 assert.throws(()=>C.snapshot({...bridge(),inputs:{...base,leverage:100}},{symbol:'BTC',timeframeOption:'3'},calculate));
});
test('long partial closes keep remaining position and charge opening fee exactly once',()=>{
 const a=entry(),first=C.summarizeFills(a,[fill()],'long');
 assert.equal(first.status,'partial');assert.equal(first.remaining,6);near(first.net,38.1);
 const done=C.summarizeFills(a,[fill(),fill({quantity:6,price:90,fee:.6})],'long');
 assert.equal(done.status,'closed');assert.equal(done.remaining,0);near(done.net,-22.5);
});
test('short price difference reverses direction while actual fees retain their sign',()=>{
 const done=C.summarizeFills(entry(),[fill(),fill({quantity:6,price:90,fee:.6})],'short');
 near(done.net,17.5);assert.equal(done.status,'closed');
});
test('actual fee rebates and funding income are added, without applying assumed fee percentages',()=>{
 const r=C.summarizeFills(entry({openingFee:-1,funding:2}),[fill({quantity:10,price:100,fee:-.5})],'long');
 near(r.net,3.5);
});
test('over-closing and invalid actual input are rejected',()=>{
 assert.throws(()=>C.summarizeFills(entry(),[fill({quantity:11})],'long'));
 for(const quantity of [0,-1,'',NaN,Infinity])assert.throws(()=>entry({quantity}));
 assert.throws(()=>C.close(fill({executedAt:Date.UTC(2025,0,1)}),entry()));
 assert.throws(()=>C.close(fill({reason:''}),entry()));assert.throws(()=>C.close(fill({note:'x'.repeat(2001)}),entry()));
});
test('editing, removing and restoring a close updates totals instead of appending duplicates',()=>{
 const a=entry(),one=C.close(fill(),a);let t=C.deltaTotals(C.emptyTotals(),null,one,a,'long');
 const edited=C.close(fill({quantity:5,price:120}),a);t=C.deltaTotals(t,one,edited,a,'long');
 assert.equal(t.count,1);near(t.gross,100);near(t.quantity,5);
 const removed={...edited,deleted:true};t=C.deltaTotals(t,edited,removed,a,'long');assert.deepEqual(t,C.emptyTotals());
 t=C.deltaTotals(t,removed,edited,a,'long');near(t.gross,100);assert.equal(t.count,1);
});
test('fractional quantity closes tolerate only machine precision rounding',()=>{
 const a=entry({quantity:.3}),t=C.summarizeFills(a,[fill({quantity:.1}),fill({quantity:.2})],'long');
 assert.equal(t.status,'closed');assert.equal(t.remaining,0);
 assert.throws(()=>C.summarizeFills(entry({quantity:1e-9}),[fill({quantity:2e-9})],'long'));
});
test('performance excludes planned, cancelled, partial and trashed records, with explicit zero-loss cases',()=>{
 const original={result:{plannedLoss:10}},actual=entry({openingFee:0,funding:0});
 const r={original,actual,status:'closed',trashed:false,totals:{quantity:10,gross:20,fees:0,count:1}};
 const p=C.performance([r,{...r,status:'partial'},{...r,trashed:true},{...r,status:'planned'},{...r,status:'cancelled'}]);
 assert.equal(p.count,1);assert.equal(p.net,20);assert.equal(p.averageR,2);assert.equal(p.profitFactor,null);
 assert.equal(C.performance([]).winRate,null);
 const p2=C.performance([r,{...r,totals:{...r.totals,gross:-10}},{...r,totals:{...r.totals,gross:0}}]);
 near(p2.winRate,1/3);assert.equal(p2.profitFactor,2);
});
test('CSV escapes formulas, quote characters and preserves multiline notes',()=>{
 assert.equal(C.csvCell('=1+2'),'"\'=1+2"');assert.equal(C.csvCell(' @SUM(A1)'),'"\' @SUM(A1)"');
 assert.equal(C.csvCell('a"b\nc'),'"a""b\nc"');
});
