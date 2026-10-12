const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');

test('Timeframe presets and custom positive integer minutes remain independent of financial inputs',()=>{
 const html=readFileSync(require.resolve('../dist/index.html'),'utf8');
 const selectMarkup=html.match(/<select id="timeframe"[^>]*>([\s\S]*?)<\/select>/)[1];
 const options=Array.from(selectMarkup.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g),m=>[m[1],m[2]]);
 assert.deepEqual(options,[['','請選擇'],['3','3 分鐘'],['5','5 分鐘'],['15','15 分鐘'],['30','30 分鐘'],['60','1 小時'],['240','4 小時'],['1440','1 天'],['other','其他']]);
 const node=()=>({value:'',hidden:false,disabled:false,required:false,events:{},attrs:{},addEventListener(name,fn){this.events[name]=fn;},setAttribute(name,value){this.attrs[name]=value;},setCustomValidity(message){this.validityMessage=message;}});
 const nodes=Object.fromEntries(['timeframe','custom-timeframe-field','custom-timeframe','timeframe-error'].map(id=>[id,node()]));
 vm.runInNewContext(readFileSync(require.resolve('../dist/timeframe.js'),'utf8'),{document:{getElementById:id=>{assert.ok(id in nodes,'Unexpected financial field access: '+id);return nodes[id];}}});
 const select=nodes.timeframe,input=nodes['custom-timeframe'],field=nodes['custom-timeframe-field'],error=nodes['timeframe-error'];
 assert.equal(field.hidden,true);assert.equal(input.disabled,true);assert.equal(input.required,false);
 for(const minutes of ['3','5','15','30','60','240','1440']) {
  select.value=minutes;select.events.change();
  assert.equal(field.hidden,true);assert.equal(input.disabled,true);
 }
 select.value='other';select.events.change();
 assert.equal(field.hidden,false);assert.equal(input.disabled,false);assert.equal(input.required,true);
 for(const value of ['1','45','90','10080']) {
  input.value=value;input.events.input();assert.equal(error.hidden,true);assert.equal(input.validityMessage,'');
 }
 for(const value of ['0','-1','1.5','NaN','Infinity','9007199254740992']) {
  input.value=value;input.events.input();assert.equal(error.hidden,false);assert.equal(input.attrs['aria-invalid'],'true');assert.notEqual(input.validityMessage,'');
 }
 input.value='';input.events.input();assert.equal(error.hidden,true);assert.equal(input.required,true);
 input.value='45';input.events.input();select.value='15';select.events.change();select.value='other';select.events.change();
 assert.equal(input.value,'45');assert.equal(error.hidden,true);
 select.value='3';select.events.change();assert.equal(input.required,false);assert.equal(input.disabled,true);assert.equal(input.validityMessage,'');
});
