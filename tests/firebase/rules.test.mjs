import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,collection,setDoc,getDoc,getDocs,query,where,orderBy,limit,writeBatch,updateDoc,deleteDoc,serverTimestamp,Timestamp} from 'firebase/firestore';
const require=createRequire(import.meta.url),C=require('../../dist/journal-core.js'),{calculate}=require('../../dist/calculator.js');
const projectId='demo-okx-risk-dashboard',authTime=Math.floor(Date.now()/1000);
let env,alice,bob,unknown;
const claims={email_verified:true,auth_time:authTime,firebase:{sign_in_provider:'google.com'}};
const inputs={entry:1200,capital:500,risk:2,stop:2,rr:3,splitCount:10,mmr:.5,maxLeverage:100,openFee:.05,closeFee:.05,slippage:.05,buffer:25,leverage:20,side:'long'};
const bridge={inputs,raw:{...Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,String(v)])),'stop-price':'1176','loss-budget':'10'},stopDriver:'percent',budgetDriver:'risk'};
const resultKeys=["entry","capital","risk","stop","rr","splitCount","mmr","maxLeverage","openFee","closeFee","slippage","buffer","leverage","side","maxAllowed","contractLeverageOk","sign","stopPrice","takePrice","stopFill","takeFill","liquidation","lossRate","profitRate","budget","targetNotional","notional","margin","plannedLoss","plannedProfit","netRR","rrOk","netRROk","maxParts","cap","parts","capPct","capped","quantity","openCost","cashRequired","liquidationOutside","liquidationDistance","requiredDistance","gap","ready"],rawKeys=["entry","capital","risk","stop","rr","splitCount","mmr","maxLeverage","openFee","closeFee","slippage","buffer","leverage","side","stop-price","loss-budget"];
function encodePlan(s) { return {...s,result:JSON.stringify(Object.fromEntries(resultKeys.map(k=>[k,s.result[k]]))),raw:JSON.stringify(Object.fromEntries(rawKeys.map(k=>[k,s.raw[k]])))}; }

const snapshot=()=>C.snapshot(bridge,{symbol:'BTC',timeframeOption:'15'},calculate);
const ref=(db,id,uid='alice')=>doc(db,'users',uid,'trades',id);
function record(uid='alice',id=randomUUID()) {
 const plan=encodePlan(snapshot()),client=Timestamp.fromMillis(Date.UTC(2026,0,1));
 return {schemaVersion:1,appVersion:'journal-v1',ownerUid:uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),authTime,
 clientSavedAt:client,editStartedAt:client,clientEditedAt:client,timeZone:'Asia/Taipei',original:plan,current:plan,
 strategy:'test',notes:'fixture only',actual:null,totals:C.emptyTotals(),status:'planned',trashed:false,deletedAt:null,revision:0,mutationId:id};
}
async function create(db=alice,patch={},uid='alice',id=randomUUID()) {
 const r={...record(uid,id),...patch},b=writeBatch(db),tr=ref(db,id,uid);
 if(typeof r.current.result!=='string')r.current=encodePlan(r.current);
 if(typeof r.original.result!=='string')r.original=encodePlan(r.original);
 b.set(tr,r);b.set(doc(tr,'revisions',r.mutationId),{record:r,at:serverTimestamp(),authTime,closeId:'',close:null});
 await b.commit();return id;
}
async function change(db,id,patch,options={}) {
 const tr=ref(db,id,options.uid||'alice'),old=(await getDoc(tr)).data();
 const op=options.op||randomUUID(),r={...old,...patch,updatedAt:serverTimestamp(),revision:old.revision+1,mutationId:op},b=writeBatch(db);
 b.set(tr,r);
 let changed=null;
 if(options.close) {
   changed={...options.close,createdAt:options.close.createdAt||serverTimestamp(),updatedAt:serverTimestamp(),mutationId:op};
   b.set(doc(tr,'closes',options.closeId||op),changed);
 }
 if(!options.skipRevision)b.set(doc(tr,'revisions',op),{record:r,at:serverTimestamp(),authTime,closeId:changed?(options.closeId||op):'',close:changed});
 await b.commit();return {op,r};
}
const actual=()=>({price:100,quantity:10,openingFee:1,funding:-.5,margin:100,leverage:10,openedAt:Timestamp.fromMillis(Date.UTC(2026,0,1))});
before(async()=>{env=await initializeTestEnvironment({projectId,firestore:{rules:readFileSync('firestore.rules','utf8'),host:'127.0.0.1',port:8080}});});
beforeEach(async()=>{
 await env.clearFirestore();alice=env.authenticatedContext('alice',claims).firestore();bob=env.authenticatedContext('bob',claims).firestore();unknown=env.authenticatedContext('unknown',claims).firestore();
 await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),'journalAccess','alice'),{enabled:true});await setDoc(doc(context.firestore(),'journalAccess','bob'),{enabled:true});});
});
after(async()=>{
 try {
  const response=await fetch('http://127.0.0.1:8080/emulator/v1/projects/'+projectId+':ruleCoverage');
  const report=await response.json();
  console.log('RULE_COVERAGE_TOP',JSON.stringify(Object.keys(report)));
  const file=report?.rules?.files?.[0]||report?.files?.[0];
  console.log('RULE_COVERAGE_FILE_KEYS',JSON.stringify(Object.keys(file||{})));
  console.log('RULE_COVERAGE_SAMPLE',JSON.stringify(report).slice(0,1600));
 }catch(error){console.log('RULE_COVERAGE_ERROR',error.message);}
 await env?.cleanup();
});
test('valid atomic creation, own read and production list query succeed',async()=>{
 const id=await assertSucceeds(create());
 await assertSucceeds(getDoc(ref(alice,id)));
 await assertSucceeds(getDocs(query(collection(alice,'users','alice','trades'),where('trashed','==',false),orderBy('createdAt','desc'),limit(25))));
 const stored=(await getDoc(ref(alice,id))).data();assert.ok(stored.createdAt instanceof Timestamp);
});
test('unauthenticated get and list, unknown UID, non-Google and unverified accounts are denied',async()=>{
 const id=await create(),guest=env.unauthenticatedContext().firestore();
 await assertFails(getDoc(ref(guest,id)));await assertFails(getDocs(collection(guest,'users','alice','trades')));
 await assertFails(create(unknown,{},'unknown'));await assertFails(getDoc(ref(unknown,id)));
 const password=env.authenticatedContext('alice',{...claims,firebase:{sign_in_provider:'password'}}).firestore();
 const unverified=env.authenticatedContext('alice',{...claims,email_verified:false}).firestore();
 await assertFails(getDoc(ref(password,id)));await assertFails(getDoc(ref(unverified,id)));
});
test('cross-account get/list/create/update and client self-enrolment are denied',async()=>{
 const id=await create();
 await assertFails(getDoc(ref(bob,id)));await assertFails(getDocs(collection(bob,'users','alice','trades')));
 await assertFails(create(bob,{},'alice'));
 await assertFails(updateDoc(ref(bob,id),{notes:'other account'}));
 await assertFails(setDoc(doc(unknown,'journalAccess','unknown'),{enabled:true}));
 await assertFails(updateDoc(doc(alice,'journalAccess','alice'),{enabled:true,admin:true}));
});
test('ownership hijack, unknown fields, missing fields and forged timestamps are denied on create',async()=>{
 await assertFails(create(alice,{ownerUid:'bob'}));
 await assertFails(create(alice,{admin:true}));
 await assertFails(create(alice,{createdAt:Timestamp.fromMillis(0)}));
 await assertFails(create(alice,{authTime:1}));
 await assertFails(create(alice,{notes:5}));
 const id=randomUUID(),r=record('alice',id);delete r.notes;const b=writeBatch(alice),tr=ref(alice,id);b.set(tr,r);b.set(doc(tr,'revisions',id),{record:r,at:serverTimestamp(),authTime,closeId:'',close:null});await assertFails(b.commit());
});
test('input and result schemas reject invalid numeric values, missing keys, extra fields and raw string abuse',async()=>{
 for(const mutate of [
 s=>s.inputs.entry=0,s=>s.inputs.entry=NaN,s=>s.inputs.entry=Infinity,s=>s.inputs.leverage=101,
 s=>s.raw.entry='x'.repeat(101),s=>s.extra='bad',s=>delete s.inputs.rr,
 s=>s.timeframeMinutes=0,s=>s.timeframeMinutes=.5,s=>s.timeframeMinutes=30,s=>s.symbol='<script>',
 s=>s.result.ready=false,s=>s.result.margin=Infinity
 ]) {const s=snapshot();mutate(s);await assertFails(create(alice,{current:s,original:s}));}
});
test('canonical JSON snapshots reject extra keys, non-finite numbers and malformed raw strings',async()=>{
 const s=encodePlan(snapshot());s.result=s.result.slice(0,-1)+',"extra":1}';
 await assertFails(create(alice,{current:s,original:s}));
 const t=encodePlan(snapshot());t.result=t.result.replace('"margin":','"margin":null,"unknown":');
 await assertFails(create(alice,{current:t,original:t}));
});
test('valid notes update preserves original snapshot and appends immutable revision',async()=>{
 const id=await create();await assertSucceeds(change(alice,id,{notes:'revised'}));
 const docSnap=await getDoc(ref(alice,id));assert.equal(docSnap.data().revision,1);
 assert.equal((await getDocs(collection(ref(alice,id),'revisions'))).size,2);
});
test('immutable plan, ownership and creation-time modification, missing revision and revision replay are denied',async()=>{
 const id=await create(),old=(await getDoc(ref(alice,id))).data();
 await assertFails(change(alice,id,{original:{...old.original,symbol:'ETH-USDT-SWAP'}}));
 await assertFails(change(alice,id,{ownerUid:'bob'}));
 await assertFails(change(alice,id,{createdAt:Timestamp.fromMillis(0)}));
 await assertFails(change(alice,id,{notes:'no audit'},{skipRevision:true}));
 await assertFails(change(alice,id,{notes:'replay'},{op:old.mutationId}));
 await assertFails(updateDoc(doc(ref(alice,id),'revisions',old.mutationId),{authTime:0}));
});
test('updates also validate field presence, types, finite ranges and maximum lengths',async()=>{
 const id=await create();
 for(const patch of [{notes:'x'.repeat(4001)},{notes:10},{extra:'bad'},{actual:{price:-1}},{totals:{quantity:0,gross:Infinity,fees:0,count:0}}])
  await assertFails(change(alice,id,patch));
 const old=(await getDoc(ref(alice,id))).data();const current={...old.current,raw:{...old.current.raw,entry:'x'.repeat(101)}};
 await assertFails(change(alice,id,{current}));
});
test('planned to actual open, partial and full close enforce quantities and matching audit writes',async()=>{
 const id=await create(),a=actual();await assertSucceeds(change(alice,id,{actual:a,status:'open'}));
 const fill={price:110,quantity:4,fee:.4,executedAt:Timestamp.fromMillis(Date.UTC(2026,0,2)),reason:'take',note:'',deleted:false};
 let totals=C.deltaTotals(C.emptyTotals(),null,fill,a,'long');
 await assertSucceeds(change(alice,id,{totals,status:'partial'},{close:fill}));
 const second={...fill,quantity:6,price:90,fee:.6};totals=C.deltaTotals(totals,null,second,a,'long');
 await assertSucceeds(change(alice,id,{totals,status:'closed'},{close:second}));
 assert.equal(C.summary(a,(await getDoc(ref(alice,id))).data().totals).net,-22.5);
 await assertFails(change(alice,id,{totals:{...totals,quantity:11}}));
});
test('aggregate manipulation without a corresponding close is denied',async()=>{
 const id=await create();await change(alice,id,{actual:actual(),status:'open'});
 await assertFails(change(alice,id,{totals:{quantity:5,gross:999,fees:0,count:1},status:'partial'}));
});
test('close validation, orphan writes, cross-account and permanent deletion are denied',async()=>{
 const id=await create();await change(alice,id,{actual:actual(),status:'open'});
 const fill={price:110,quantity:4,fee:.4,executedAt:Timestamp.fromMillis(Date.UTC(2026,0,2)),reason:'take',note:'',deleted:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),mutationId:randomUUID()};
 await assertFails(setDoc(doc(ref(alice,id),'closes',randomUUID()),fill));
 await assertFails(setDoc(doc(ref(alice,'missing-parent'),'closes',randomUUID()),fill));
 await assertFails(getDocs(collection(ref(bob,id),'closes')));
 const totals={quantity:4,gross:40,fees:.4,count:1};
 for(const patch of [{quantity:-1},{fee:NaN},{reason:'x'.repeat(121)},{note:'x'.repeat(2001)},{extra:true},{executedAt:Timestamp.fromMillis(Date.UTC(2025,0,1))}])
  await assertFails(change(alice,id,{totals,status:'partial'},{close:{...fill,...patch}}));
 await assertFails(deleteDoc(ref(alice,id)));
});
test('close correction, soft deletion, restoration, and actual entry correction stay auditable',async()=>{
 const id=await create(),a=actual();await change(alice,id,{actual:a,status:'open'});
 const cid=randomUUID(),fill={price:110,quantity:4,fee:.4,executedAt:Timestamp.fromMillis(Date.UTC(2026,0,2)),reason:'take',note:'',deleted:false};
 let totals=C.deltaTotals(C.emptyTotals(),null,fill,a,'long');
 await change(alice,id,{totals,status:'partial'},{close:fill,closeId:cid});
 let old=(await getDoc(doc(ref(alice,id),'closes',cid))).data(),next={...old,price:120};
 totals=C.deltaTotals(totals,old,next,a,'long');
 await assertSucceeds(change(alice,id,{totals},{close:next,closeId:cid}));
 old=(await getDoc(doc(ref(alice,id),'closes',cid))).data();next={...old,deleted:true};totals=C.deltaTotals(totals,old,next,a,'long');
 await assertSucceeds(change(alice,id,{totals,status:'open'},{close:next,closeId:cid}));
 old=(await getDoc(doc(ref(alice,id),'closes',cid))).data();next={...old,deleted:false};totals=C.deltaTotals(totals,old,next,a,'long');
 await assertSucceeds(change(alice,id,{totals,status:'partial'},{close:next,closeId:cid}));
 const changedEntry={...a,price:105};totals={...totals,gross:totals.gross+(a.price-105)*totals.quantity};
 await assertSucceeds(change(alice,id,{actual:changedEntry,totals}));
 await assertFails(deleteDoc(doc(ref(alice,id),'closes',cid)));
});
test('trash is restorable, edits while trashed and permanent deletion are denied',async()=>{
 const id=await create();await assertSucceeds(change(alice,id,{trashed:true,deletedAt:serverTimestamp()}));
 await assertFails(change(alice,id,{notes:'forbidden while trashed'}));await assertFails(deleteDoc(ref(alice,id)));
 await assertSucceeds(change(alice,id,{trashed:false,deletedAt:null}));
});

test('a matching revision cannot hide a close quantity change while leaving aggregate totals unchanged',async()=>{
 const id=await create();await change(alice,id,{actual:actual(),status:'open'});
 const fill={price:110,quantity:4,fee:.4,executedAt:Timestamp.fromMillis(Date.UTC(2026,0,2)),reason:'take',note:'',deleted:false};
 await assertFails(change(alice,id,{}, {close:fill}));
});

test('production journal API transactions preserve idempotency, revisions, entry data and partial-close totals in the emulator',async()=>{
 const {writeFileSync,unlinkSync}=await import('node:fs');
 const output=new URL('./_journal-api.emulator.mjs',import.meta.url);
 const values=new Map();globalThis.sessionStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v))};
 globalThis.__journalTest={db:alice,auth:{currentUser:{uid:'alice'}},authTime};
 let source=readFileSync('dist/journal-api.js','utf8')
   .replace(/^import \{initializeAuth[^\n]*\n/m,'')
   .replace(/from 'https:\/\/www\.gstatic\.com\/firebasejs\/13\.0\.0\/firebase-(app|firestore)\.js'/g,"from 'firebase/$1'")
   .replace("import {firebaseConfig} from './firebase-config.js';","const firebaseConfig={};")
   .replace('const app=initializeApp(firebaseConfig);','const app={};')
   .replace(/const auth=initializeAuth\([^;]+;/,'const auth=globalThis.__journalTest.auth;')
   .replace("const db=getFirestore(app,'(default)');","const db=globalThis.__journalTest.db;")
   .replace('const provider=new GoogleAuthProvider();','class GoogleAuthProvider {setCustomParameters(){}}\nconst getIdTokenResult=async()=>({claims:{auth_time:globalThis.__journalTest.authTime}});\nconst provider=new GoogleAuthProvider();');
 writeFileSync(output,source);
 try {
   const api=await import(output.href+'?'+randomUUID());
   const now=Date.now(),plan=snapshot(),id=await api.operationId('create',{plan});
   assert.equal(await api.operationId('create',{plan}),id);
   const metadata={savedAt:now,startedAt:now,editedAt:now,timeZone:'Asia/Taipei',strategy:'api test',notes:''};
   await api.createTrade(plan,metadata,id);await api.createTrade(plan,metadata,id);
   let r=await api.getTrade(id);assert.equal(r.revision,0);assert.deepEqual(r.original.result,calculate(inputs));
   assert.equal((await api.listRevisions(id)).rows.length,1);
   const a={price:100,quantity:10,openingFee:1,funding:-.5,margin:100,leverage:10,openedAt:Date.UTC(2026,0,1)};
   await api.updateEntry(id,r.revision,randomUUID(),a);r=await api.getTrade(id);assert.equal(r.status,'open');
   const fill={price:110,quantity:4,fee:.4,executedAt:Date.UTC(2026,0,2),reason:'take',note:'',deleted:false};
   const cid=randomUUID(),op=randomUUID();
   await api.saveClose(id,r.revision,op,cid,fill);await api.saveClose(id,r.revision,op,cid,fill);
   r=await api.getTrade(id);assert.equal(r.status,'partial');assert.equal(r.totals.count,1);assert.equal(r.totals.quantity,4);
   await assert.rejects(api.saveClose(id,r.revision,randomUUID(),randomUUID(),{...fill,quantity:7}));
   assert.equal((await api.getTrade(id)).totals.quantity,4);
   await api.saveClose(id,r.revision,randomUUID(),randomUUID(),{...fill,quantity:6,price:90,fee:.6});
   r=await api.getTrade(id);assert.equal(r.status,'closed');assert.equal(C.summary(r.actual,r.totals).net,-22.5);
   const unchanged=JSON.stringify(r.original);
   await api.setTrash(id,r.revision,randomUUID(),true);r=await api.getTrade(id);assert.equal(r.trashed,true);
   await api.setTrash(id,r.revision,randomUUID(),false);r=await api.getTrade(id);
   assert.equal(r.trashed,false);assert.equal(JSON.stringify(r.original),unchanged);
 }finally{unlinkSync(output);delete globalThis.__journalTest;delete globalThis.sessionStorage;}
});
