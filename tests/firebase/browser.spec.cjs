const {test,expect}=require('@playwright/test');
const mock=String.raw`
const C=globalThis.RiskJournal;
let state=JSON.parse(sessionStorage.getItem('test-journal')||'{"records":{},"fills":{},"revisions":{}}'),listener;
let signedIn=true;
const persist=()=>sessionStorage.setItem('test-journal',JSON.stringify(state));
const account={uid:'test-owner',email:'test@example.invalid'};
export const user=()=>signedIn?account:null;
export const subscribe=cb=>{listener=cb;queueMicrotask(()=>cb(user()));return ()=>{};};
export const access=async()=>true;
export const login=async()=>{signedIn=true;listener(user());};
export const logout=async()=>{signedIn=false;listener(null);};
export const errorText=e=>e.message;
export const operationId=async()=>crypto.randomUUID();
export const getTrade=async id=>state.records[id]||null;
export const listTrades=async trash=>({rows:Object.values(state.records).filter(r=>r.trashed===trash),cursor:null,more:false});
export const listCloses=async id=>Object.values(state.fills[id]||{});
export const listRevisions=async id=>({rows:state.revisions[id]||[],cursor:null,more:false});
function revise(id) {
 const r=state.records[id];r.revision++;r.updatedAt=Date.now();(state.revisions[id]??=[]).push({id:crypto.randomUUID(),record:structuredClone(r),at:Date.now()});persist();return id;
}
export async function createTrade(snapshot,meta,id) {
 const now=Date.now();state.records[id]={id,ownerUid:account.uid,original:snapshot,current:snapshot,actual:null,totals:C.emptyTotals(),status:'planned',
 createdAt:now,updatedAt:now,authTime:Math.floor(now/1000),clientSavedAt:now,clientEditedAt:now,editStartedAt:now,timeZone:'Asia/Taipei',
 revision:0,trashed:false,strategy:meta.strategy,notes:meta.notes};persist();return id;
}
export async function updatePlan(id,rev,op,snapshot,strategy,notes){Object.assign(state.records[id],{current:snapshot,strategy,notes});return revise(id);}
export async function updateNotes(id,rev,op,strategy,notes){Object.assign(state.records[id],{strategy,notes});return revise(id);}
export async function setTrash(id,rev,op,trashed){state.records[id].trashed=trashed;return revise(id);}
export async function cancelPlan(id,rev,op,cancelled){state.records[id].status=cancelled?'cancelled':'planned';return revise(id);}
export async function updateEntry(id,rev,op,value){
 const r=state.records[id],a=C.entry(value);r.actual=a;r.status=C.summary(a,r.totals).status;return revise(id);
}
export async function saveClose(id,rev,op,closeId,value){
 const r=state.records[id],fill=C.close(value,r.actual),fills=state.fills[id]??={};
 const t=C.deltaTotals(r.totals,fills[closeId],fill,r.actual,r.current.inputs.side);fills[closeId]={...fill,id:closeId};
 r.totals=t;r.status=C.summary(r.actual,t).status;return revise(id);
}
`;
for(const size of [{width:1440,height:1000},{width:768,height:1024},{width:390,height:844}]) {
 test('journal UI full flow '+size.width,async({page},testInfo)=>{
  await page.setViewportSize(size);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/journal-api.js',route=>route.fulfill({contentType:'text/javascript',body:mock}));
  await page.goto('/index.html');
  await expect(page.locator('#auth-status')).toContainText('私人日誌可用');
  await page.locator('#entry').fill('1200');await page.locator('#journal-symbol').fill('ETH');
  await page.locator('#timeframe').selectOption('15');
  await page.locator('#stop-price').fill('1176');await expect(page.locator('#stop')).toHaveValue('2');
  await page.locator('#loss-budget').fill('10');await expect(page.locator('#risk')).toHaveValue('2');
  await page.locator('#save-journal').click();await expect(page.locator('#save-status')).toContainText('資料庫已確認保存');
  await page.getByRole('link',{name:'開啟這筆紀錄'}).click();
  await expect(page.locator('#detail-title')).toContainText('ETH-USDT-SWAP');
  await page.locator('#actual-price').fill('100');await page.locator('#actual-quantity').fill('10');
  await page.locator('#actual-time').fill('2026-01-01T10:00:00');
  await page.locator('#actual-margin').fill('100');await page.locator('#actual-fee').fill('1');await page.locator('#actual-funding').fill('-0.5');
  await page.getByRole('button',{name:'確認已成交並保存'}).click();
  await expect(page.locator('#detail-title')).toContainText('持倉中');
  async function close(price,quantity,fee,reason){
   await page.locator('#close-price').fill(price);await page.locator('#close-quantity').fill(quantity);
   await page.locator('#close-time').fill('2026-01-02T10:00:00');await page.locator('#close-fee-actual').fill(fee);
   await page.locator('#close-reason').fill(reason);await page.getByRole('button',{name:'保存這次平倉'}).click();
  }
  await close('110','4','0.4','部分止盈');await expect(page.locator('#detail-title')).toContainText('部分平倉');
  await close('90','7','0.6','超額');await expect(page.locator('#detail-status')).toContainText('不可超過');
  await page.locator('#close-quantity').fill('6');await page.getByRole('button',{name:'保存這次平倉'}).click();
  await expect(page.locator('#detail-title')).toContainText('已全部平倉');
  await expect(page.locator('#performance')).toContainText('-22.500');
  await page.locator('#edit-notes').fill('<img src=x onerror=alert(1)>');await page.getByRole('button',{name:'保存備註'}).click();
  await expect(page.locator('#edit-notes')).toHaveValue('<img src=x onerror=alert(1)>');
  await page.locator('.close-card').first().getByRole('button',{name:'移除此平倉'}).click();
  await expect(page.locator('#detail-title')).toContainText('部分平倉');
  await page.locator('.close-card').first().getByRole('button',{name:'還原這次平倉'}).click();
  await expect(page.locator('#detail-title')).toContainText('已全部平倉');
  await page.locator('#trade-detail').getByRole('button',{name:'移至垃圾桶',exact:true}).click();
  await expect(page.locator('#trade-detail')).toContainText('此筆位於垃圾桶');
  await page.locator('#trade-detail').getByRole('button',{name:'從垃圾桶還原'}).click();
  await expect(page.locator('#detail-title')).toContainText('已全部平倉');
  await expect(page.locator('#actual-price')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('journal-'+size.width+'.png'),fullPage:true});
  await page.locator('#google-logout').click();
  await expect(page.locator('#journal-workspace')).toBeHidden();
  await expect(page.locator('#record-list')).toBeEmpty();
  expect(errors).toEqual([]);
 });
}
test('calculator stays usable when the journal SDK fails to load',async({page})=>{
 await page.route('**/journal-api.js',route=>route.abort());
 await page.goto('/index.html');await page.locator('#entry').fill('1200');
 await expect(page.locator('#notional')).not.toHaveText('—');
 await expect(page.locator('#auth-status')).toContainText('原有試算仍可使用');
 await expect(page.locator('#save-journal')).toBeDisabled();
});
