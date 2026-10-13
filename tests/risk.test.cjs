const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const {calculate}=require('../dist/calculator.js');
const base={entry:2500,capital:500,risk:2,stop:2,rr:3,splitCount:20,mmr:.5,maxLeverage:100,openFee:.05,closeFee:.05,slippage:.05,buffer:25,leverage:20,side:'long'};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`);
test('No-cost example: 500 U, risk 2%, stop 2%, RR 3, 20x',()=>{
 const r=calculate({...base,openFee:0,closeFee:0,slippage:0});
 assert.equal(r.budget,10);assert.equal(r.notional,500);assert.equal(r.margin,25);
 assert.equal(r.stopPrice,2450);assert.equal(r.takePrice,2650);
 assert.equal(r.plannedLoss,10);assert.equal(r.plannedProfit,30);
});
test('Both directions use strict RR > 1 as a non-blocking reference',()=>{
 for(const side of ['long','short']) for(const rr of [.5,1,1.000001,1.5036]) {
  const r=calculate({...base,side,rr});
  assert.equal(r.rrOk,rr>1);assert.equal(r.ready,true);
 }
 const s=calculate({...base,side:'short',rr:1});
 assert.equal(s.rrOk,false);assert.equal(s.stopPrice,2550);assert.equal(s.takePrice,2450);
 assert.equal(calculate({...base,side:'short',rr:.999999}).rrOk,false);
 assert.equal(s.netRROk,false); // Cost must not be mistaken for price RR.
});
test('Changing leverage preserves the risk-sized notional outside allocation cap',()=>{
 const low=calculate({...base,leverage:10}),high=calculate({...base,leverage:30});
 assert.equal(low.notional,high.notional);near(low.margin,high.margin*3);
 assert.ok(high.liquidation>low.liquidation);
 for(const r of [low,high]) near(r.margin*r.leverage,r.notional);
});
test('Liquidation satisfies independent equity = maintenance plus closing-fee identity',()=>{
 for(const side of ['long','short']) for(const lev of [1,10,20,100]) {
  const r=calculate({...base,side,leverage:lev});
  const pnl=r.quantity*(r.liquidation-r.entry)*(side==='long'?1:-1);
  const required=r.quantity*r.liquidation*(r.mmr+r.closeFee)/100;
  near(r.margin+pnl,required);
 }
});
test('100x remains selectable while unsafe positions are rejected; advisory boundary is strict',()=>{
 for(const side of ['long','short']) {
  const r=calculate({...base,side,leverage:100});
  assert.ok(r.maxAllowed<100);assert.equal(r.leverage,100);
  assert.equal(r.liquidationOutside,false);assert.equal(r.ready,false);
  const allowed=calculate({...base,side,leverage:r.maxAllowed});
  assert.equal(allowed.liquidationOutside,true);assert.equal(allowed.ready,true);
  const next=r.maxAllowed+1,sign=side==='long'?1:-1,q=(r.mmr+r.closeFee)/100;
  const liq=r.entry*(1-sign/next)/(1-sign*q);
  assert.ok(sign*(r.entry-liq)/r.entry<=r.requiredDistance+1e-12);
 }
 // Equality is not accepted as being outside the stop.
 assert.equal(calculate({...base,mmr:0,closeFee:0,slippage:0,buffer:0,stop:5,leverage:100}).maxAllowed,19);
 const contractLimit=calculate({...base,maxLeverage:5,leverage:10});
 assert.equal(contractLimit.liquidationOutside,true);assert.equal(contractLimit.contractLeverageOk,false);assert.equal(contractLimit.ready,false);
});
test('Budget contains fees and slippage; profits deduct actual notional-based closing fee',()=>{
 for(const side of ['long','short']) {
  const r=calculate({...base,side});
  const sign=side==='long'?1:-1;
  const loss=-sign*r.quantity*(r.stopFill-r.entry)+r.notional*r.openFee/100+r.quantity*r.stopFill*r.closeFee/100;
  const profit=sign*r.quantity*(r.takeFill-r.entry)-r.notional*r.openFee/100-r.quantity*r.takeFill*r.closeFee/100;
  near(r.plannedLoss,loss);near(r.plannedProfit,profit);
  assert.ok(loss<=r.budget);assert.ok(r.cashRequired<=r.capital);
 }
});
test('Capital splitting is retained, and insufficient capital does not expand risk',()=>{
 const low=calculate({...base,leverage:1});assert.equal(low.capped,true);assert.equal(low.notional,75);
 const ten=calculate({...base,splitCount:10});assert.equal(ten.cap,150);
 const forty=calculate({...base,splitCount:40});assert.equal(forty.cap,37.5);
 const all=calculate({...base,splitCount:1,risk:100,leverage:1});assert.ok(all.cashRequired<=all.capital+1e-9);
 const tiny=calculate({...base,capital:.01,risk:.01});assert.equal(tiny.notional,0);assert.equal(tiny.ready,false);
});
test('Invalid and impossible scenarios are explicit',()=>{
 for(const key of ['entry','capital','risk','stop','rr']) for(const value of [NaN,0,-1,Infinity]) assert.throws(()=>calculate({...base,[key]:value}));
 assert.throws(()=>calculate({...base,stop:100}));
 assert.throws(()=>calculate({...base,side:'short',stop:40,rr:3}));
 assert.throws(()=>calculate({...base,splitCount:1.5}));
 assert.throws(()=>calculate({...base,leverage:'20'}));
 assert.throws(()=>calculate({...base,leverage:101}));
 assert.throws(()=>calculate({...base,maxLeverage:101}));
 const r=calculate({...base,stop:80,rr:3,buffer:100});
 assert.equal(r.maxAllowed,0);assert.equal(r.ready,false);
});
test('Model properties across directions, costs, distances, and capital splits',()=>{
 for(const side of ['long','short']) for(const stop of [.01,.5,2,10]) for(const leverage of [1,10,50,100]) for(const splitCount of [1,10,20,40]) {
  const r=calculate({...base,side,stop,leverage,splitCount});
  assert.ok(r.plannedLoss<=r.budget+1e-9);
  assert.ok(r.margin<=r.cap+1e-9);assert.ok(r.cashRequired<=r.capital+1e-9);
  assert.equal(r.leverage,leverage);near(r.notional,r.margin*r.leverage);
  assert.equal(r.liquidationOutside,leverage<=r.maxAllowed);
  if(r.ready) assert.ok(r.side==='long'?r.liquidation<r.stopPrice:r.liquidation>r.stopPrice);
 }
});
// Minimal event harness: verifies input synchronization, invalid-state clearing, and
// optional agent-interface wiring. It is not a browser layout or accessibility test.
function makePage() {
 const html=readFileSync(require.resolve('../dist/index.html'),'utf8');
 const nodes=new Map(),sideButtons=[];
 class Element {
  constructor(tag='div'){this.tagName=tag;this.value='';this.textContent='';this.children=[];this.hidden=false;this.disabled=false;this.style={};this.attrs={};this.events={};this.dataset={};this.classList={add(){},remove(){},toggle(){}};}
  addEventListener(event,fn){this.events[event]=fn;}
  setAttribute(name,value){this.attrs[name]=value;}
  appendChild(el){this.children.push(el);return el;}
  append(...els){this.children.push(...els);}
  replaceChildren(...els){this.children=els;}
 }
 const outputs=[];
 for(const match of html.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
  assert.ok(!nodes.has(match[3]),'Duplicate ID '+match[3]);
  const el=new Element(match[1]);el.value=match[2].match(/\bvalue="([^"]*)"/)?.[1]||'';
  if(match[2].includes('data-output'))outputs.push(el);
  nodes.set(match[3],el);
 }
 for(const side of ['long','short']){const el=new Element('button');el.dataset.side=side;sideButtons.push(el);}
 let registered;
 const document={getElementById:id=>{assert.ok(nodes.has(id),'Missing DOM id '+id);return nodes.get(id);},createElement:tag=>new Element(tag),createElementNS:(namespace,tag)=>new Element(tag),querySelectorAll:selector=>selector==='[data-output]'?outputs:sideButtons,modelContext:{registerTool:tool=>{registered=tool;}}};
 const context=vm.createContext({document,window:{addEventListener(){}},Intl,AbortController});
 vm.runInContext(readFileSync(require.resolve('../dist/calculator.js'),'utf8'),context);
 vm.runInContext(readFileSync(require.resolve('../dist/app.js'),'utf8'),context);
 const edit=(id,value)=>{nodes.get(id).value=String(value);nodes.get(id).events.input();};
 return {nodes,edit,sideButtons,tool:()=>registered};
}
test('Input events link stop price/percent and loss amount/risk in both directions',()=>{
 const p=makePage();const val=id=>Number(p.nodes.get(id).value);
 p.edit('entry',2500);
 p.edit('stop-price',2400);assert.equal(val('stop'),4);
 p.edit('entry',2600);near(val('stop'),200/2600*100);assert.equal(val('stop-price'),2400);
 p.edit('stop',2);assert.equal(val('stop-price'),2548);
 p.edit('loss-budget',5);assert.equal(val('risk'),1);
 p.edit('capital',1000);assert.equal(val('loss-budget'),5);assert.equal(val('risk'),.5);
 p.edit('risk',2);assert.equal(val('loss-budget'),20);
 p.sideButtons[1].events.click();assert.equal(val('stop-price'),2652);
});
test('Empty fields clear all results and recovery restores calculation',()=>{
 const p=makePage();
 assert.equal(p.nodes.get('entry').value,'');assert.equal(p.nodes.get('stop-price').value,'');
 assert.equal(p.nodes.get('result-badge').textContent,'待輸入');
 assert.equal(p.nodes.get('split-count').value,'10');
 p.edit('entry',2500);assert.equal(p.nodes.get('margin').textContent,'23.27');
 p.edit('entry','');
 assert.equal(p.nodes.get('notional').textContent,'—');assert.equal(p.nodes.get('price-map').children.length,0);
 assert.equal(p.nodes.get('input-error').hidden,true);assert.equal(p.nodes.get('leverage').disabled,false);
 p.edit('entry',2500);assert.equal(p.nodes.get('input-error').hidden,true);assert.equal(p.nodes.get('price-map').children.length,4);
 p.edit('split-count',9);assert.equal(p.nodes.get('split-warning').hidden,false);
 p.edit('split-count',10);assert.equal(p.nodes.get('split-warning').hidden,true);assert.equal(p.nodes.get('split-warning').textContent,'');
 p.edit('leverage',100);assert.equal(p.nodes.get('leverage').value,'100');assert.equal(p.nodes.get('result-badge').textContent,'未符合開單條件');
 p.edit('entry',-1);assert.equal(p.nodes.get('input-error').hidden,false);
});
test('Agent interface validates before mutation and returns current visible result',()=>{
 const p=makePage(),tool=p.tool();assert.ok(tool);
 const result=tool.execute({entry:2500,capital:1000,risk:1,side:'short',stop:1,rr:1.5,leverage:100});
 assert.equal(result.side,'short');assert.equal(result.leverage,100);assert.equal(result.ready,false);
 assert.equal(p.nodes.get('notional').textContent,fmt(result.notional));
 const previous=p.nodes.get('capital').value;
 assert.throws(()=>tool.execute({capital:-1,risk:2}));assert.equal(p.nodes.get('capital').value,previous);
 function fmt(n){return new Intl.NumberFormat('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);}
});

test('EXIT MAP places both directions on a vertical linear price axis, including unsafe leverage',()=>{
 for(const side of ['long','short']) for(const leverage of [1,20,100]) {
  const p=makePage();
  const r=p.tool().execute({capital:500,risk:2,entry:2500,side,leverage});
  const dots=p.nodes.get('price-axis').children[0].children.filter(el=>el.attrs.class?.startsWith('axis-dot'));
  const values={take:r.takePrice,entry:r.entry,stop:r.stopPrice,liquidation:r.liquidation};
  assert.equal(dots.length,4);
  const low=Math.min(...Object.values(values)),high=Math.max(...Object.values(values));
  for(const dot of dots) {
   const kind=dot.attrs.class.split(' ')[1];
   assert.equal(dot.attrs.cx,'80%');
   const reconstructed=high-(Number(dot.attrs.cy)-32)/344*(high-low);
   near(reconstructed,values[kind]);
   const leaders=p.nodes.get('price-axis').children[0].children.filter(el=>el.attrs.class===`axis-leader ${kind}`);
   assert.equal(leaders.length,3);
   assert.equal(leaders[0].attrs.y1,leaders[0].attrs.y2);
   assert.equal(leaders[2].attrs.y1,dot.attrs.cy);
   assert.equal(leaders[2].attrs.y2,dot.attrs.cy);
  }
  assert.equal(p.nodes.get('price-map').children.length,4);
  assert.equal(p.nodes.get('map-empty').hidden,true);
 }
});
test('Displayed results round to two decimals while calculations retain precision',()=>{
 const p=makePage();
 const format=(n,digits)=>new Intl.NumberFormat('zh-TW',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(n);
 for(const side of ['long','short']) {
  const r=p.tool().execute({capital:500,risk:2,entry:2500,side,leverage:20});
  assert.equal(p.nodes.get('planned-loss').textContent,format(r.plannedLoss,2));
  assert.equal(p.nodes.get('planned-profit').textContent,format(r.plannedProfit,2));
  assert.equal(p.nodes.get('exit-margin').textContent,format(r.margin,2));
  assert.equal(p.nodes.get('exit-leverage').textContent,'20.00×');
  const stopRow=p.nodes.get('price-map').children.find(el=>el.className==='price-row stop');
  const trigger=stopRow.children[1].children[1].children[0];
  assert.equal(trigger.attrs['aria-describedby'],'liquidation-gap');
  assert.match(p.nodes.get('liquidation-gap').textContent,/停損至預估強平差距/);
  assert.ok(p.nodes.get('liquidation-gap').textContent.includes(format(r.liquidationDistance*100,2)));
 }
 const r=p.tool().execute({capital:500,risk:2,entry:2500.123456,rr:1.5036});
 assert.equal(p.nodes.get('entry').value,'2500.123456');
 assert.equal(p.nodes.get('rr').value,'1.5036');
 assert.equal(p.nodes.get('rr-result').textContent,format(1.5036,2)+' / '+format(r.netRR,2));
 assert.equal(p.nodes.get('liquidation-result').textContent,format(r.liquidation,2));
 assert.ok(p.nodes.get('checks').children.every(el=>!el.textContent.includes('RR')));
 p.edit('entry','');
 for(const id of ['exit-margin','exit-leverage','planned-loss','planned-profit','liquidation-gap']) assert.equal(p.nodes.get(id).textContent,'—');
});
test('Funding allocation totals capital without adding loss to the margin again',()=>{
 const p=makePage();
 const r=p.tool().execute({capital:500,risk:2,entry:2500});
 const bars=p.nodes.get('funding-bar').children;
 assert.equal(bars.length,3);
 near(bars.reduce((sum,bar)=>sum+parseFloat(bar.style.width),0),100);
 near(parseFloat(bars[0].style.width)*5,r.margin);
 near(parseFloat(bars[1].style.width)*5,r.openCost);
 near(parseFloat(bars[2].style.width)*5,500-r.cashRequired);
 assert.equal(p.nodes.get('funding-metrics').children.length,3);
 p.edit('entry','');
 for(const id of ['price-axis','funding-bar','funding-metrics']) assert.equal(p.nodes.get(id).children.length,0);
 assert.equal(p.nodes.get('liquidation-result').textContent,'—');
 assert.equal(p.nodes.get('map-empty').hidden,false);assert.equal(p.nodes.get('funding-empty').hidden,false);
 p.edit('entry',2500);p.edit('entry',-1);
 assert.equal(p.nodes.get('price-axis').children.length,0);assert.equal(p.nodes.get('funding-bar').children.length,0);
});
test('Coincident floating-point prices keep finite chart coordinates',()=>{
 const p=makePage();
 p.tool().execute({capital:500,risk:2,entry:2500,stop:1e-16,mmr:4.95,closeFee:.05,leverage:20});
 const svg=p.nodes.get('price-axis').children[0];
 for(const el of svg.children) for(const value of Object.values(el.attrs)) assert.ok(!/NaN|Infinity/.test(String(value)));
});
