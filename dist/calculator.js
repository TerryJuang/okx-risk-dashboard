'use strict';
// Linear USDT isolated model. All input percentages are in percentage points.
function calculate(v) {
  const bounds = {entry:[0,1e12],capital:[0,1e12],risk:[0,100],stop:[0,100],rr:[0,1000],mmr:[0,50],openFee:[0,5],closeFee:[0,5],slippage:[0,10],buffer:[0,500]};
  const names = {entry:'入場價格',capital:'總資金',risk:'單筆風險',stop:'價格停損距離',rr:'RR',mmr:'維持保證金率',openFee:'開倉費率',closeFee:'平倉費率',slippage:'滑價預留',buffer:'強平緩衝'};
  const allowZero = ['mmr','openFee','closeFee','slippage','buffer'];
  for (const [key,[min,max]] of Object.entries(bounds)) {
    if (!Number.isFinite(v[key]) || v[key] < min || (!allowZero.includes(key) && v[key] === min) || v[key] > max)
      throw new Error(`${names[key]}請填入${allowZero.includes(key)?'不小於':'大於'} ${min}、且不超過 ${max} 的數字。`);
  }
  if (v.stop >= 100) throw new Error('價格停損距離必須小於 100%。');
  if (!['long','short'].includes(v.side)) throw new Error('請選擇做多或做空。');
  if (!Number.isInteger(v.splitCount) || v.splitCount<1 || v.splitCount>1000) throw new Error('切分份數需為 1–1,000 的整數。');
  if (!Number.isInteger(v.maxLeverage) || v.maxLeverage<1 || v.maxLeverage>100) throw new Error('合約槓桿上限需為 1–100 的整數，並依實際合約核對。');
  if (!Number.isInteger(v.leverage) || v.leverage<1 || v.leverage>100) throw new Error('槓桿需為 1–100 的整數。');
  const sign=v.side==='long'?1:-1, d=v.stop/100, slip=v.slippage/100, fo=v.openFee/100, fc=v.closeFee/100, m=v.mmr/100;
  const stopPrice=v.entry*(1-sign*d), takePrice=v.entry*(1+sign*d*v.rr);
  const stopFill=v.entry*(1-sign*(d+slip)), takeFill=v.entry*(1+sign*(d*v.rr-slip));
  if (Math.min(stopPrice,takePrice,stopFill,takeFill)<=0) throw new Error('停損、停利或滑價後的價格不大於 0；請縮小停損距離、RR 或滑價。');
  const requiredDistance=d*(1+v.buffer/100)+slip;
  const liqFor = leverage => v.entry*(1-sign/leverage)/(1-sign*(m+fc));
  // Strictly beyond stop + assumed slippage + chosen extra buffer, with float tolerance.
  let maxAllowed=0;
  for(let l=1;l<=v.maxLeverage;l++) {
    const distance=sign*(v.entry-liqFor(l))/v.entry;
    if (distance>requiredDistance+1e-12) maxAllowed=l;
  }
  const leverage=v.leverage;
  const liquidation=liqFor(leverage);
  const liquidationDistance=sign*(v.entry-liquidation)/v.entry;
  const liquidationOutside=liquidationDistance>requiredDistance+1e-12;
  const contractLeverageOk=leverage<=v.maxLeverage;
  const lossRate=d+slip+fo+fc*(stopFill/v.entry);
  const profitRate=d*v.rr-slip-fo-fc*(takeFill/v.entry);
  const budget=v.capital*v.risk/100, targetNotional=budget/lossRate;
  if (!Number.isFinite(targetNotional) || targetNotional>1e15) throw new Error('試算倉位過大；請核對停損距離與總資金。');
  const maxParts=Math.min(3,v.splitCount), cap=v.capital*maxParts/v.splitCount;
  const notional=Math.floor(Math.min(targetNotional,cap*leverage,v.capital/(1/leverage+fo))*100)/100;
  const margin=notional/leverage, plannedLoss=notional*lossRate, plannedProfit=notional*profitRate;
  const rrOk=v.side==='long'?v.rr>2:v.rr>=1;
  const netRR=profitRate/lossRate, netRROk=v.side==='long'?netRR>2:netRR>=1;
  return {...v,leverage,maxAllowed,contractLeverageOk,sign,stopPrice,takePrice,stopFill,takeFill,liquidation,lossRate,profitRate,budget,targetNotional,notional,margin,plannedLoss,plannedProfit,netRR,rrOk,netRROk,
    maxParts,cap,parts:margin/v.capital*v.splitCount,capPct:maxParts/v.splitCount*100,capped:targetNotional>cap*leverage+1e-9,
    quantity:notional/v.entry,openCost:notional*fo,cashRequired:margin+notional*fo,
    liquidationOutside,liquidationDistance,requiredDistance,
    gap:sign*(stopPrice-liquidation),ready:rrOk && liquidationOutside && contractLeverageOk && notional>0};
}
if (typeof module !== 'undefined') module.exports={calculate};
