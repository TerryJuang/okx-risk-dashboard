const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');

test('Hover and focus show regenerated stop help without a click; edits and Escape dismiss it',()=>{
 const events={},windowEvents={};
 const tips={existing:{hidden:true,style:{},offsetWidth:280,offsetHeight:80},stop:{hidden:true,style:{},offsetWidth:280,offsetHeight:100}};
 const document={getElementById:id=>tips[id],addEventListener:(name,fn)=>{events[name]=fn;}};
 const window={innerWidth:360,innerHeight:640,addEventListener:(name,fn)=>{windowEvents[name]=fn;}};
 vm.runInNewContext(readFileSync(require.resolve('../dist/tooltips.js'),'utf8'),{document,window});
 const trigger=id=>{
  const button={getAttribute:()=>id,getBoundingClientRect:()=>({left:310,top:20,bottom:40,width:19})};
  const wrapper={contains:node=>node===button};
  button.closest=selector=>selector==='.help-icon'?button:selector==='.tooltip'?wrapper:null;
  button.contains=node=>node===button;
  return button;
 };
 events.mouseover({target:trigger('existing'),relatedTarget:null});
 assert.equal(tips.existing.hidden,false);
 // The stop button is created after tooltip setup, as on each map render.
 const stop=trigger('stop');
 events.mouseover({target:stop,relatedTarget:null});
 assert.equal(tips.stop.hidden,false);assert.equal(tips.existing.hidden,true);
 assert.ok(parseFloat(tips.stop.style.left)>=12);
 assert.ok(parseFloat(tips.stop.style.left)+280<=348);
 events.mouseout({target:stop,relatedTarget:null});assert.equal(tips.stop.hidden,true);
 events.focusin({target:trigger('stop')});assert.equal(tips.stop.hidden,false);
 events.keydown({key:'Escape'});assert.equal(tips.stop.hidden,true);
 events.mouseover({target:trigger('stop'),relatedTarget:null});
 events.input();assert.equal(tips.stop.hidden,true);
});
