const $=id=>document.getElementById(id);
const core=globalThis.RiskJournal;
const isManager=!!$('journal-workspace');
let api,allowed=false,epoch=0,busy=false,rows=[],cursor=null,more=false,trash=false,selected=null,editing=null,detailEpoch=0;
const labels={planned:'未成交試算',open:'持倉中',partial:'部分平倉',closed:'已全部平倉',cancelled:'已取消'};
const money=n=>Number.isFinite(n)?new Intl.NumberFormat('zh-TW',{minimumFractionDigits:3,maximumFractionDigits:3}).format(n):'—';
const qty=n=>Number.isFinite(n)?new Intl.NumberFormat('zh-TW',{maximumSignificantDigits:12}).format(n):'—';
const ms=value=>value?.toMillis?value.toMillis():typeof value==='number'?value:Date.parse(value);
const date=value=>value?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'short',timeStyle:'medium'}).format(ms(value)):'—';
const local=value=>value?new Date(ms(value)+8*3600000).toISOString().slice(0,19):'';
const fromLocal=value=>Date.parse(value+'+08:00');
const element=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
function action(text,handler,kind='subtle'){const b=element('button',text,'j-button '+kind);b.type='button';b.addEventListener('click',handler);return b;}
function message(id,text,error=false){const el=$(id);if(el){el.textContent=text;el.classList.toggle('j-error',error);}}
function json(value){return JSON.stringify(value,(key,v)=>v&&typeof v.seconds==='number'&&typeof v.nanoseconds==='number'?new Date(v.seconds*1000+v.nanoseconds/1e6).toISOString():v,2);}
function download(name,body,type){const url=URL.createObjectURL(new Blob([body],{type}));const a=element('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function field(form,id,label,type='text',value='',options={}) {
  const wrapper=element('label',label,options.wide?'wide':'');
  const input=element(type==='textarea'?'textarea':'input');input.id=id;input.name=id;
  if(type!=='textarea')input.type=type;
  if(type==='number'){input.step='any';input.inputMode='decimal';}
  if(type==='datetime-local')input.step='1';
  input.value=String(value??'');
  Object.entries(options).filter(([k])=>k!=='wide').forEach(([k,v])=>input[k]=v);
  wrapper.append(input);form.append(wrapper);return input;
}
async function operation(button,status,fn) {
  if(busy)return;busy=true;if(button)button.disabled=true;
  const startedEpoch=epoch;message(status,'處理中，等待資料庫確認…');
  try {await fn();}catch(error){if(startedEpoch===epoch)message(status,api?api.errorText(error):String(error.message||error),true);}
  finally{busy=false;if(button&&startedEpoch===epoch)button.disabled=button.id==='save-journal'?!allowed:false;}
}
function visibleRows(){
  if(!isManager)return [];
  const s=$('filter-symbol').value.trim().toUpperCase(),side=$('filter-side').value,status=$('filter-status').value,tf=$('filter-timeframe').value;
  const from=$('filter-from').value,to=$('filter-to').value;
  return rows.filter(r=>(!s||r.current.symbol.includes(s))&&(!side||r.current.inputs.side===side)&&(!status||r.status===status)&&
    (!tf||r.current.timeframeMinutes===Number(tf))&&(!from||ms(r.createdAt)>=Date.parse(from+'T00:00:00+08:00'))&&
    (!to||ms(r.createdAt)<Date.parse(to+'T00:00:00+08:00')+86400000));
}
function paintList(){
  const list=$('record-list');list.replaceChildren();const visible=visibleRows();
  if(!visible.length)list.append(element('p',trash?'垃圾桶目前沒有符合條件的紀錄。':'目前沒有符合條件的紀錄，可按「新增試算」開始。','j-loading'));
  for(const r of visible){
    const card=element('article',undefined,'record-card'),body=element('div'),buttons=element('div',undefined,'journal-actions');
    body.append(element('h3',r.current.symbol+' · '+(r.current.inputs.side==='long'?'做多':'做空')));
    body.append(element('span',labels[r.status],'j-status'));
    body.append(element('p',r.current.timeframeMinutes+' 分鐘 · 保存 '+date(r.createdAt)+'（台北）'));
    const summary=core.summary(r.actual,r.totals,r.status==='cancelled');
    body.append(element('p',r.actual?'已實現淨損益 '+money(summary.net)+' U · 剩餘 '+qty(summary.remaining)+' 幣':'計畫保證金 '+money(r.current.result.margin)+' U · 尚未確認成交'));
    buttons.append(action('明細／平倉',()=>openDetail(r.id)));
    buttons.append(action(trash?'還原':'移至垃圾桶',async event=>operation(event.currentTarget,'list-status',async()=>{
      const op=await api.operationId('trash',{id:r.id,revision:r.revision,trashed:!r.trashed});
      await api.setTrash(r.id,r.revision,op,!r.trashed);await reloadList();
    }),trash?'':'danger'));
    card.append(body,buttons);list.append(card);
  }
  message('list-status','已載入 '+rows.length+' 筆，篩選後 '+visible.length+' 筆'+(more?'；尚有更多紀錄。':'。'));
  $('load-more').hidden=!more;
  const p=core.performance(visible),stats=$('performance');stats.replaceChildren();
  const metrics=[['完成交易',p.count+' 筆'],['淨損益',money(p.net)+' U'],['勝率',p.winRate===null?'—':(p.winRate*100).toFixed(1)+'%'],
    ['平均獲利',money(p.averageWin)+' U'],['平均虧損',money(p.averageLoss)+' U'],['Profit Factor',p.profitFactor===null?'—（無虧損）':p.profitFactor.toFixed(2)],['平均實際 R',p.averageR===null?'—':p.averageR.toFixed(3)+' R']];
  for(const [label,value]of metrics){const cell=element('div',undefined,'j-stat');cell.append(element('span',label),element('strong',value));stats.append(cell);}
}
async function reloadList(append=false) {
  const requestEpoch=epoch;if(!allowed)return;
  message('list-status','讀取伺服器紀錄中…');
  const page=await api.listTrades(trash,append?cursor:null);if(requestEpoch!==epoch||!allowed)return;
  rows=append?[...rows,...page.rows]:page.rows;cursor=page.cursor;more=page.more;paintList();
}
function detailTable(title,pairs){
  const box=element('details');box.append(element('summary',title));
  const table=element('table',undefined,'j-detail-table');
  for(const [name,value]of pairs){const row=element('tr');row.append(element('th',name),element('td',String(value??'—')));table.append(row);}
  box.append(table);return box;
}
function snapshotView(title,snapshot) {
  const box=element('details');box.append(element('summary',title));box.append(element('pre',json(snapshot),'j-json'));return box;
}
async function openDetail(id,scroll=true) {
  const requestEpoch=epoch,requestDetail=++detailEpoch;selected=id;
  const container=$('trade-detail');container.hidden=false;container.replaceChildren(element('p','讀取紀錄與平倉明細中…','j-loading'));
  try {
    const [r,fills]=await Promise.all([api.getTrade(id),api.listCloses(id)]);
    if(epoch!==requestEpoch||requestDetail!==detailEpoch||!allowed)return;
    if(!r)throw new Error('找不到紀錄。');container.replaceChildren();paintDetail(r,fills);
    if(scroll)container.scrollIntoView({behavior:'smooth',block:'start'});
  } catch(error){if(epoch===requestEpoch&&requestDetail===detailEpoch)container.replaceChildren(element('p',api.errorText(error),'j-error'));}
}
function paintDetail(r,fills) {
  const container=$('trade-detail');
  const title=element('h2',r.current.symbol+' · '+labels[r.status]);title.id='detail-title';container.append(title);
  container.append(element('p','第 '+r.revision+' 次修訂 · 更新 '+date(r.updatedAt)+'（台北）','help'));
  const summary=core.summary(r.actual,r.totals,r.status==='cancelled');
  container.append(element('p',r.actual?'已實現淨損益 '+money(summary.net)+' U · 剩餘 '+qty(summary.remaining)+' 幣':'此筆為試算紀錄，尚未確認實際成交。','note'));
  container.append(element('p','已實現淨損益＝已平倉價差損益－全額開倉費－已付平倉費＋累計資金費。數量單位為幣數；所有輸入時間為台北時間。','help'));
  const status=element('p');status.id='detail-status';status.setAttribute('role','status');container.append(status);
  const buttons=element('div',undefined,'journal-actions');
  if(!r.actual&&!r.trashed){const edit=element('a','修改試算參數','j-button');edit.href='./?edit='+encodeURIComponent(r.id);buttons.append(edit);
    buttons.append(action(r.status==='cancelled'?'恢復試算':'取消試算',e=>operation(e.currentTarget,'detail-status',async()=>{
      const op=await api.operationId('cancel',{id:r.id,revision:r.revision});await api.cancelPlan(r.id,r.revision,op,r.status!=='cancelled');await refreshDetail(r.id);
    })));
  }
  buttons.append(action(r.trashed?'從垃圾桶還原':'移至垃圾桶',e=>operation(e.currentTarget,'detail-status',async()=>{
    const op=await api.operationId('trash',{id:r.id,revision:r.revision,trashed:!r.trashed});
    await api.setTrash(r.id,r.revision,op,!r.trashed);await refreshDetail(r.id);
  }),r.trashed?'':'danger'));
  container.append(buttons);
  container.append(detailTable('登入與保存時間',[
    ['登入者 UID',r.ownerUid],['保存時認證時間',date(r.authTime*1000)],['開始編輯（裝置）',date(r.editStartedAt)],
    ['最後編輯（裝置）',date(r.clientEditedAt)],['點擊保存（裝置）',date(r.clientSavedAt)],['伺服器保存',date(r.createdAt)],['裝置時區',r.timeZone]
  ]));
  container.append(snapshotView('原始試算快照（保留全部輸入與完整計算精度）',r.original));
  container.append(snapshotView('目前試算參數',r.current));
  const revisions=element('details');revisions.append(element('summary','修訂歷程'));
  const revBody=element('div');revisions.append(revBody);let revCursor=null,revLoaded=false;
  const loadRev=action('載入修訂',e=>operation(e.currentTarget,'detail-status',async()=>{
    const page=await api.listRevisions(r.id,revCursor);
    if(selected!==r.id||!allowed)return;
    for(const rev of page.rows)revBody.append(snapshotView('修訂 '+rev.record.revision+' · '+date(rev.at),rev));
    revCursor=page.cursor;revLoaded=true;loadRev.hidden=!page.more;loadRev.textContent='載入更多修訂';
  }));
  revisions.append(loadRev);container.append(revisions);
  if(r.trashed){container.append(element('p','此筆位於垃圾桶。還原後即可修改；不會自動永久刪除。','note'));return;}
  const notesForm=element('form'),ng=element('div',undefined,'j-grid');
  const strategy=field(ng,'edit-strategy','策略名稱','text',r.strategy,{maxLength:120});
  const notes=field(ng,'edit-notes','備註','textarea',r.notes,{maxLength:4000,wide:true});
  const notesButton=element('button','保存備註','j-button');notesButton.type='submit';notesForm.append(ng,notesButton);
  notesForm.addEventListener('submit',e=>{e.preventDefault();operation(notesButton,'detail-status',async()=>{
    const payload={id:r.id,revision:r.revision,strategy:strategy.value,notes:notes.value};
    await api.updateNotes(r.id,r.revision,await api.operationId('notes',payload),strategy.value,notes.value);await refreshDetail(r.id);
  });});container.append(notesForm);
  if(r.status==='cancelled')return;
  const entryForm=element('form');entryForm.append(element('h3',r.actual?'修正實際開倉資料':'補登實際開倉'));
  const eg=element('div',undefined,'j-grid'),a=r.actual||{},inputs={};
  inputs.price=field(eg,'actual-price','實際入場均價（USDT）','number',a.price,{required:true,min:0});
  inputs.quantity=field(eg,'actual-quantity','實際開倉幣數（非合約張數）','number',a.quantity,{required:true,min:0});
  inputs.openedAt=field(eg,'actual-time','開倉時間（台北）','datetime-local',local(a.openedAt),{required:true});
  inputs.leverage=field(eg,'actual-leverage','實際槓桿','number',a.leverage??r.current.inputs.leverage,{required:true,min:1,max:100,step:1});
  inputs.margin=field(eg,'actual-margin','實際投入保證金（USDT）','number',a.margin,{required:true,min:0});
  inputs.openingFee=field(eg,'actual-fee','開倉費（USDT；支出正、返佣負）','number',a.openingFee??0,{required:true});
  inputs.funding=field(eg,'actual-funding','累計資金費（USDT；收入正、支出負）','number',a.funding??0,{required:true});
  const entryButton=element('button',r.actual?'保存開倉修訂':'確認已成交並保存','j-button primary');entryButton.type='submit';entryForm.append(eg,entryButton);
  entryForm.addEventListener('submit',e=>{e.preventDefault();operation(entryButton,'detail-status',async()=>{
    const value=Object.fromEntries(Object.entries(inputs).map(([k,input])=>[k,k==='openedAt'?fromLocal(input.value):input.value]));
    const op=await api.operationId('entry',{id:r.id,revision:r.revision,value});
    await api.updateEntry(r.id,r.revision,op,value);await refreshDetail(r.id);
  });});container.append(entryForm);
  if(!r.actual)return;
  const closeSection=element('section');closeSection.append(element('h3','分批平倉明細'));
  const closeForm=element('form'),cg=element('div',undefined,'j-grid');closeForm.append(element('h3','新增／修正平倉'));
  const ci={};let editClose=null;
  ci.price=field(cg,'close-price','平倉成交均價（USDT）','number','',{required:true,min:0});
  ci.quantity=field(cg,'close-quantity','本次平倉幣數','number','',{required:true,min:0});
  ci.executedAt=field(cg,'close-time','平倉時間（台北）','datetime-local','',{required:true});
  ci.fee=field(cg,'close-fee-actual','本次實際平倉費（USDT）','number','0',{required:true});
  ci.reason=field(cg,'close-reason','平倉原因','text','',{required:true,maxLength:120});
  ci.note=field(cg,'close-note','備註','textarea','',{maxLength:2000,wide:true});
  const cb=element('button','保存這次平倉','j-button primary');cb.type='submit';
  const fillRemaining=action('填入剩餘數量',()=>ci.quantity.value=String(summary.remaining));
  const clearClose=action('取消編輯／新增一筆',()=>{editClose=null;closeForm.reset();cb.textContent='保存這次平倉';});
  const ca=element('div',undefined,'journal-actions');ca.append(cb,fillRemaining,clearClose);closeForm.append(cg,ca);
  for(const fill of fills) {
    const card=element('article',undefined,'close-card'+(fill.deleted?' deleted':''));
    card.append(element('p',(fill.deleted?'已移除 · ':'')+date(fill.executedAt)+' · '+fill.reason));
    card.append(element('p','均價 '+qty(fill.price)+' U × '+qty(fill.quantity)+' 幣 · 費用 '+money(fill.fee)+' U'));
    if(fill.note)card.append(element('p',fill.note));
    const actions=element('div',undefined,'journal-actions');
    if(!fill.deleted)actions.append(action('修改',()=>{
      editClose=fill;for(const [k,input]of Object.entries(ci))input.value=k==='executedAt'?local(fill[k]):String(fill[k]??'');
      cb.textContent='保存平倉修訂';closeForm.scrollIntoView({behavior:'smooth',block:'center'});ci.price.focus();
    }));
    actions.append(action(fill.deleted?'還原這次平倉':'移除此平倉',e=>operation(e.currentTarget,'detail-status',async()=>{
      const value={...fill,deleted:!fill.deleted};
      const op=await api.operationId('remove-close',{id:r.id,revision:r.revision,closeId:fill.id,deleted:value.deleted});
      await api.saveClose(r.id,r.revision,op,fill.id,value);await refreshDetail(r.id);
    }),fill.deleted?'':'danger'));
    card.append(actions);closeSection.append(card);
  }
  if(!fills.length)closeSection.append(element('p','尚未登錄平倉。','help'));
  closeForm.addEventListener('submit',e=>{e.preventDefault();operation(cb,'detail-status',async()=>{
    const value={...Object.fromEntries(Object.entries(ci).map(([k,input])=>[k,k==='executedAt'?fromLocal(input.value):input.value])),deleted:false};
    const op=await api.operationId('close',{id:r.id,revision:r.revision,closeId:editClose?.id||null,value});
    await api.saveClose(r.id,r.revision,op,editClose?.id||op,value);await refreshDetail(r.id);
  });});
  container.append(closeSection,closeForm);
}
async function refreshDetail(id){await reloadList();if(allowed)await openDetail(id,false);}
async function setupCalculator() {
  const params=new URLSearchParams(location.search),id=params.get('edit');
  if(id) {
    const currentEpoch=epoch;editing=await api.getTrade(id);if(currentEpoch!==epoch||!allowed)return;
    if(!editing||editing.trashed||editing.actual)throw new Error('只能在試算頁修改未成交且未刪除的紀錄。');
    globalThis.RiskCalculatorBridge.load(editing.current);
    $('journal-symbol').value=editing.current.symbol;$('journal-strategy').value=editing.strategy;$('journal-notes').value=editing.notes;
    $('timeframe').value=editing.current.timeframeOption;$('timeframe').dispatchEvent(new Event('change',{bubbles:true}));
    if(editing.current.timeframeOption==='other'){$('custom-timeframe').value=String(editing.current.timeframeMinutes);$('custom-timeframe').dispatchEvent(new Event('input',{bubbles:true}));}
    $('save-journal').textContent='保存試算修訂';message('save-status','正在修改既有紀錄；原始快照將保留。');
  }
}
function setupHandlers() {
  if(!isManager) {
    let started=Number(sessionStorage.getItem('riskjournal:started'));
    const params=new URLSearchParams(location.search);
    if(params.has('new')||!Number.isFinite(started)||started<=0) {
      started=Date.now();sessionStorage.setItem('riskjournal:started',String(started));
      if(params.has('new'))history.replaceState(null,'',location.pathname);
    }
    let edited=started;document.addEventListener('input',()=>edited=Date.now());
    document.querySelectorAll('[data-side]').forEach(b=>b.addEventListener('click',()=>edited=Date.now()));
    $('save-journal').addEventListener('click',e=>operation(e.currentTarget,'save-status',async()=>{
      if(!allowed)throw new Error('請先登入並取得日誌存取權限。');
      const snapshot=core.snapshot(globalThis.RiskCalculatorBridge.read(),{symbol:$('journal-symbol').value,
        timeframeOption:$('timeframe').value,customTimeframe:$('custom-timeframe').value},globalThis.calculate);
      const strategy=$('journal-strategy').value,notes=$('journal-notes').value;
      const op=await api.operationId(editing?'plan-edit':'create',{snapshot,strategy,notes,started,id:editing?.id||null,revision:editing?.revision??null});
      let id;
      if(editing)id=await api.updatePlan(editing.id,editing.revision,op,snapshot,strategy,notes);
      else id=await api.createTrade(snapshot,{strategy,notes,startedAt:started,editedAt:edited,savedAt:Date.now(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'},op);
      if(!allowed)return;message('save-status','資料庫已確認保存。可至紀錄管理補登實際成交。');
      const link=element('a',' 開啟這筆紀錄');link.href='journal.html?record='+encodeURIComponent(id);$('save-status').append(link);$('new-journal').hidden=false;
      if(editing)editing=await api.getTrade(id);
    }));
  } else {
    $('show-active').addEventListener('click',()=>switchTrash(false));$('show-trash').addEventListener('click',()=>switchTrash(true));
    $('reload-records').addEventListener('click',e=>operation(e.currentTarget,'list-status',()=>reloadList()));
    $('load-more').addEventListener('click',e=>operation(e.currentTarget,'list-status',()=>reloadList(true)));
    $('load-all').addEventListener('click',e=>operation(e.currentTarget,'list-status',async()=>{while(more&&allowed)await reloadList(true);}));
    for(const id of ['filter-symbol','filter-side','filter-status','filter-timeframe','filter-from','filter-to'])$(id).addEventListener('input',paintList);
    $('export-csv').addEventListener('click',()=>{
      const columns=['幣種','方向','週期分鐘','狀態','保存時間UTC','實際入場','開倉幣數','已平倉幣數','已實現淨損益USDT','策略','備註','全部目前輸入JSON','原始試算JSON'];
      const data=visibleRows().map(r=>[r.current.symbol,r.current.inputs.side,r.current.timeframeMinutes,labels[r.status],new Date(ms(r.createdAt)).toISOString(),
        r.actual?.price??'',r.actual?.quantity??'',r.totals.quantity,r.actual?core.summary(r.actual,r.totals).net:'',r.strategy,r.notes,JSON.stringify(r.current),JSON.stringify(r.original)]);
      download('okx-trades-loaded.csv','\uFEFF'+[columns,...data].map(row=>row.map(core.csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
    });
    $('export-json').addEventListener('click',e=>operation(e.currentTarget,'list-status',async()=>{
      const currentEpoch=epoch,records=[];
      for(const r of visibleRows()) {
        let revisionCursor=null,revisions=[];
        do{const p=await api.listRevisions(r.id,revisionCursor);revisions.push(...p.rows);revisionCursor=p.more?p.cursor:null;}while(revisionCursor&&allowed);
        const closes=await api.listCloses(r.id);
        if(epoch!==currentEpoch||!allowed)return;records.push({trade:r,closes,revisions});
      }
      download('okx-journal-loaded.json',json({schemaVersion:1,scope:'loaded-and-filtered-records',exportedAt:new Date().toISOString(),records}),'application/json;charset=utf-8');
      message('list-status','已下載目前篩選紀錄，包含平倉明細與修訂。');
    }));
  }
}
async function switchTrash(value){
  if(busy)return;trash=value;detailEpoch++;selected=null;$('trade-detail').hidden=true;
  $('show-active').setAttribute('aria-pressed',String(!value));$('show-trash').setAttribute('aria-pressed',String(value));
  await operation(null,'list-status',()=>reloadList());
}
async function initialize() {
  try {
    api=await import('./journal-api.js');
    setupHandlers();
    $('google-login').disabled=false;
    $('google-login').addEventListener('click',e=>operation(e.currentTarget,'auth-status',async()=>{await api.login();}));
    $('google-logout').addEventListener('click',e=>operation(e.currentTarget,'auth-status',async()=>{await api.logout();}));
    api.subscribe(async u=>{
      const currentEpoch=++epoch;allowed=false;editing=null;rows=[];cursor=null;more=false;selected=null;detailEpoch++;
      $('google-login').hidden=!!u;$('google-login').disabled=false;$('google-logout').hidden=!u;$('google-logout').disabled=false;
      $('auth-uid').hidden=!u;
      if(isManager){$('journal-workspace').hidden=true;$('record-list').replaceChildren();$('trade-detail').replaceChildren();$('performance').replaceChildren();}
      else $('save-journal').disabled=true;
      if(!u){message('auth-status','使用 Google 登入後，保存及管理你的私人交易日誌。');$('auth-uid').textContent='';return;}
      $('auth-uid').textContent='UID：'+u.uid;
      message('auth-status','已登入 '+(u.email||u.displayName||'Google 帳號')+'，正在確認存取權限…');
      try {
        const granted=await api.access();if(currentEpoch!==epoch)return;allowed=granted;
        if(!allowed){message('auth-status','已登入，尚未開通日誌權限。請依 Firebase 啟用文件核准上方 UID。');return;}
        message('auth-status','已登入 '+(u.email||u.displayName||'Google 帳號')+' · 私人日誌可用');
        if(isManager) {
          $('journal-workspace').hidden=false;await reloadList();
          const id=new URLSearchParams(location.search).get('record');if(id&&allowed)await openDetail(id);
        }else{await setupCalculator();if(currentEpoch===epoch)$('save-journal').disabled=false;}
      }catch(error){if(currentEpoch===epoch)message('auth-status',api.errorText(error),true);}
    });
  }catch(error){
    message('auth-status','日誌元件載入失敗，請確認網路後重新整理。原有試算仍可使用。',true);
    $('google-login').textContent='重新載入';$('google-login').disabled=false;$('google-login').addEventListener('click',()=>location.reload(),{once:true});
  }
}
await initialize();
