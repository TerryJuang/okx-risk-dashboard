'use strict';
let activeTooltip=null;
const closeTooltip=()=>{if(activeTooltip) activeTooltip.hidden=true;activeTooltip=null;};
document.querySelectorAll('.tooltip').forEach(wrapper=>{
  const trigger=wrapper.querySelector('.help-icon');
  const tip=wrapper.querySelector('[role="tooltip"]');
  const show=()=>{
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
  const hide=()=>{tip.hidden=true;if(activeTooltip===tip) activeTooltip=null;};
  wrapper.addEventListener('mouseenter',show);
  wrapper.addEventListener('mouseleave',hide);
  trigger.addEventListener('focus',show);
  trigger.addEventListener('blur',hide);
});
document.addEventListener('keydown',event=>{if(event.key==='Escape') closeTooltip();});
window.addEventListener('resize',closeTooltip);
window.addEventListener('scroll',closeTooltip,true);
