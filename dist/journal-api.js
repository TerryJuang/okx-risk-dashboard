import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import {initializeAuth,browserSessionPersistence,browserPopupRedirectResolver,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged,getIdTokenResult} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import {getFirestore,doc,collection,getDocFromServer,getDocsFromServer,query,where,orderBy,limit,startAfter,runTransaction,serverTimestamp,Timestamp} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';

const app=initializeApp(firebaseConfig);
const auth=initializeAuth(app,{persistence:browserSessionPersistence,popupRedirectResolver:browserPopupRedirectResolver});
const db=getFirestore(app,'(default)'); // Memory cache only; no persistent offline journal.
const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
const core=globalThis.RiskJournal;

// Store verbose snapshots as canonical, bounded JSON. Numeric inputs remain typed maps.
// JSON's number round trip preserves the calculator's original double precision.
const resultKeys=["entry","capital","risk","stop","rr","splitCount","mmr","maxLeverage","openFee","closeFee","slippage","buffer","leverage","side","maxAllowed","contractLeverageOk","sign","stopPrice","takePrice","stopFill","takeFill","liquidation","lossRate","profitRate","budget","targetNotional","notional","margin","plannedLoss","plannedProfit","netRR","rrOk","netRROk","maxParts","cap","parts","capPct","capped","quantity","openCost","cashRequired","liquidationOutside","liquidationDistance","requiredDistance","gap","ready"];
const rawKeys=["entry","capital","risk","stop","rr","splitCount","mmr","maxLeverage","openFee","closeFee","slippage","buffer","leverage","side","stop-price","loss-budget"];
function encodePlan(s) {
  return {...s,result:JSON.stringify(Object.fromEntries(resultKeys.map(k=>[k,s.result[k]]))),
    raw:JSON.stringify(Object.fromEntries(rawKeys.map(k=>[k,s.raw[k]])))};
}
function decodePlan(s) {
  return {...s,result:typeof s.result==='string'?JSON.parse(s.result):s.result,
    raw:typeof s.raw==='string'?JSON.parse(s.raw):s.raw};
}
function decodeTrade(r) { return {...r,original:decodePlan(r.original),current:decodePlan(r.current)}; }

export const subscribe=listener=>onAuthStateChanged(auth,listener);
export const login=()=>signInWithPopup(auth,provider);
export const logout=()=>signOut(auth);
export const user=()=>auth.currentUser;
export async function access() {
  const u=user();if(!u)return false;
  const r=await getDocFromServer(doc(db,'journalAccess',u.uid));
  return r.exists()&&r.data().enabled===true;
}
function requireUser(){const u=user();if(!u)throw new Error('請先使用 Google 登入。');return u;}
function tradeRef(id){return doc(db,'users',requireUser().uid,'trades',id);}
const data=s=>{
  if(!s.exists())return null;
  let r={id:s.id,...s.data()};
  if(r.original)r=decodeTrade(r);
  if(r.record)r.record=decodeTrade(r.record);
  return r;
};
export async function getTrade(id){return data(await getDocFromServer(tradeRef(id)));}
export async function listTrades(trashed=false,cursor=null) {
  const clauses=[where('trashed','==',trashed),orderBy('createdAt','desc'),limit(25)];
  if(cursor)clauses.push(startAfter(cursor));
  const r=await getDocsFromServer(query(collection(db,'users',requireUser().uid,'trades'),...clauses));
  return {rows:r.docs.map(data),cursor:r.docs.at(-1)||null,more:r.size===25};
}
export async function listCloses(id) {
  const result=[];let cursor=null;
  do {
    const clauses=[orderBy('executedAt','asc'),limit(100)];if(cursor)clauses.push(startAfter(cursor));
    const page=await getDocsFromServer(query(collection(tradeRef(id),'closes'),...clauses));
    result.push(...page.docs.map(data));cursor=page.size===100?page.docs.at(-1):null;
  }while(cursor);
  return result;
}
export async function listRevisions(id,cursor=null) {
  const clauses=[orderBy('at','desc'),limit(25)];if(cursor)clauses.push(startAfter(cursor));
  const r=await getDocsFromServer(query(collection(tradeRef(id),'revisions'),...clauses));
  return {rows:r.docs.map(data),cursor:r.docs.at(-1)||null,more:r.size===25};
}
export async function operationId(action,payload) {
  const uid=requireUser().uid;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
  const hash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  const key='riskjournal:'+uid+':'+action+':'+hash;
  let id=sessionStorage.getItem(key);
  if(!id){id=crypto.randomUUID();sessionStorage.setItem(key,id);}
  return id;
}
async function authTime(){return (await getIdTokenResult(requireUser())).claims.auth_time;}
const ts=n=>Timestamp.fromMillis(n);
const plain=d=>{const {id,...rest}=d;return rest;};
function text(value,label,max){const s=String(value||'').trim();if(s.length>max)throw new Error(label+'過長。');return s;}
function revision(ref,id,record,loginTime,changedClose=null) {
  return {ref:doc(collection(ref,'revisions'),id),value:{record,at:serverTimestamp(),authTime:loginTime,
    closeId:changedClose?changedClose.id:'',close:changedClose?plain(changedClose):null}};
}

async function certifyPlan(plan,id,loginTime) {
  const uid=requireUser().uid,ref=doc(db,'users',uid,'plans',id);
  await runTransaction(db,async tx=>{
    const previous=await tx.get(ref);
    if(previous.exists())return;
    tx.set(ref,{ownerUid:uid,createdAt:serverTimestamp(),authTime:loginTime,snapshot:plan});
  });
}

export async function createTrade(snapshot,metadata,id) {
  const ref=tradeRef(id),uid=requireUser().uid,loginTime=await authTime(),plan=encodePlan(snapshot);
  await certifyPlan(plan,id,loginTime);
  return runTransaction(db,async tx=>{
    const existing=await tx.get(ref);if(existing.exists())return id;
    const record={schemaVersion:1,appVersion:'journal-v1',ownerUid:uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),
      authTime:loginTime,clientSavedAt:ts(metadata.savedAt),editStartedAt:ts(metadata.startedAt),clientEditedAt:ts(metadata.editedAt),
      timeZone:metadata.timeZone,original:plan,current:plan,strategy:text(metadata.strategy,'策略',120),notes:text(metadata.notes,'備註',4000),
      actual:null,totals:core.emptyTotals(),status:'planned',trashed:false,deletedAt:null,revision:0,mutationId:id};
    tx.set(ref,record);const rev=revision(ref,id,record,loginTime);tx.set(rev.ref,rev.value);return id;
  });
}
// expectedRevision rejects edits made from a stale page instead of overwriting another tab.
async function mutate(id,expectedRevision,opId,transform,closeId=null) {
  const ref=tradeRef(id),loginTime=await authTime(),revRef=doc(collection(ref,'revisions'),opId);
  return runTransaction(db,async tx=>{
    const prior=await tx.get(revRef);if(prior.exists())return id;
    const snap=await tx.get(ref);if(!snap.exists())throw new Error('找不到這筆紀錄。');
    const old=snap.data();
    if(old.revision!==expectedRevision)throw new Error('紀錄已在另一處更新，請重新載入後再修改。');
    let oldClose=null,closeRef=null;
    if(closeId){closeRef=doc(collection(ref,'closes'),closeId);const s=await tx.get(closeRef);oldClose=data(s);}
    const outcome=transform(old,oldClose);
    const record={...outcome.record,updatedAt:serverTimestamp(),revision:old.revision+1,mutationId:opId};
    tx.set(ref,record);
    let changed=null;
    if(outcome.close) {
      changed={...outcome.close,id:closeId,createdAt:oldClose?oldClose.createdAt:serverTimestamp(),updatedAt:serverTimestamp(),mutationId:opId};
      tx.set(closeRef,plain(changed));
    }
    const rev=revision(ref,opId,record,loginTime,changed);tx.set(rev.ref,rev.value);return id;
  });
}
export async function updatePlan(id,expected,opId,snapshot,strategy,notes) {
  await certifyPlan(encodePlan(snapshot),opId,await authTime());
  return mutate(id,expected,opId,old=>{
    if(old.trashed)throw new Error('請先從垃圾桶還原。');
    if(old.actual)throw new Error('已成交紀錄保留原交易計畫；請在紀錄管理修改實際成交資料。');
    return {record:{...old,current:encodePlan(snapshot),strategy:text(strategy,'策略',120),notes:text(notes,'備註',4000)}};
  });
}
export function updateNotes(id,expected,opId,strategy,notes) {
  return mutate(id,expected,opId,old=>{
    if(old.trashed)throw new Error('請先從垃圾桶還原。');
    return {record:{...old,strategy:text(strategy,'策略',120),notes:text(notes,'備註',4000)}};
  });
}
export function setTrash(id,expected,opId,trashed) {
  return mutate(id,expected,opId,old=>({record:{...old,trashed,deletedAt:trashed?serverTimestamp():null}}));
}
export function cancelPlan(id,expected,opId,cancelled) {
  return mutate(id,expected,opId,old=>{
    if(old.actual||old.trashed)throw new Error('只能取消尚未成交且未刪除的試算。');
    return {record:{...old,status:cancelled?'cancelled':'planned'}};
  });
}
export async function updateEntry(id,expected,opId,value) {
  const actual=core.entry(value),fills=await listCloses(id);
  for(const fill of fills) if(!fill.deleted)core.close(fill,actual);
  return mutate(id,expected,opId,old=>{
    if(old.trashed||old.status==='cancelled')throw new Error('請先還原或恢復這筆試算。');
    if(actual.quantity<old.totals.quantity)throw new Error('開倉數量不可小於已平倉數量。');
    const totals={...old.totals};
    if(old.actual)totals.gross+=(old.current.inputs.side==='long'?1:-1)*(old.actual.price-actual.price)*totals.quantity;
    const a={...actual,openedAt:ts(actual.openedAt)};
    return {record:{...old,actual:a,totals,status:core.summary(a,totals).status}};
  });
}
export function saveClose(id,expected,opId,closeId,value) {
  return mutate(id,expected,opId,(old,previous)=>{
    if(old.trashed||!old.actual)throw new Error('請先還原紀錄並填寫實際開倉資料。');
    const fill=core.close(value,old.actual);
    const totals=core.deltaTotals(old.totals,previous,fill,old.actual,old.current.inputs.side);
    return {record:{...old,totals,status:core.summary(old.actual,totals).status},close:{...fill,executedAt:ts(fill.executedAt)}};
  },closeId);
}
export function errorText(error) {
  const code=error?.code||'';
  const messages={
    'auth/popup-closed-by-user':'登入視窗已關閉，尚未登入。',
    'auth/popup-blocked':'瀏覽器擋住登入視窗，請允許此網站的彈出視窗後重試。',
    'auth/unauthorized-domain':'此網站尚未加入 Firebase 登入授權網域。',
    'auth/operation-not-allowed':'Firebase 尚未啟用 Google 登入。',
    'auth/network-request-failed':'連線失敗，請檢查網路後重試。',
    'permission-denied':'尚未取得日誌存取權限，或 Firebase 規則尚未部署。表單內容已保留。',
    'unavailable':'目前無法連線至資料庫，請稍後重試。尚未確認保存成功。',
    'failed-precondition':'資料庫索引或設定尚未就緒，請依部署文件檢查。'
  };
  return messages[code]||error?.message||'操作未完成，請重試。';
}
