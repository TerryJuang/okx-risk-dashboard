'use strict';
let activeTooltip=null;
const closeTooltip=()=>{if(activeTooltip) activeTooltip.hidden=true;activeTooltip=null;};
// Delegation also covers the stop-price help regenerated with each calculation.
const showTooltip=trigger=>{
    const tip=document.getElementById(trigger.getAttribute('aria-describedby'));
    closeTooltip();
    tip.hidden=false;
    const anchor=trigger.getBoundingClientRect();
    const width=tip.offsetWidth, height=tip.offsetHeight;
    const left=Math.max(12,Math.min(anchor.left+anchor.width/2-width/2,window.innerWidth-width-12));
    const top=anchor.top-height>=12?anchor.top-height:anchor.bottom;
    tip.style.left=`${left}px`;
    tip.style.top=`${Math.max(12,Math.min(top,window.innerHeight-height-12))}px`;
    activeTooltip=tip;
};
document.addEventListener('mouseover',event=>{
  const trigger=event.target.closest('.help-icon');
  if(trigger && !trigger.contains(event.relatedTarget)) showTooltip(trigger);
});
document.addEventListener('mouseout',event=>{
  const wrapper=event.target.closest('.tooltip');
  if(wrapper && !wrapper.contains(event.relatedTarget)) closeTooltip();
});
document.addEventListener('focusin',event=>{
  const trigger=event.target.closest('.help-icon');
  if(trigger) showTooltip(trigger);
});
document.addEventListener('focusout',event=>{
  if(event.target.closest('.help-icon')) closeTooltip();
});
document.addEventListener('input',closeTooltip,true);
document.addEventListener('click',event=>{if(event.target.closest('[data-side]')) closeTooltip();},true);
document.addEventListener('keydown',event=>{if(event.key==='Escape') closeTooltip();});
window.addEventListener('resize',closeTooltip);
window.addEventListener('scroll',closeTooltip,true);
