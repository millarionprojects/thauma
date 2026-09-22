const header=document.querySelector('.header'),root=document.documentElement;
export function headerOffset(){return (header?.getBoundingClientRect().height||0)+28;}
function update(){root.style.setProperty('--thauma-header-height',`${Math.ceil(header?.getBoundingClientRect().height||0)}px`);}
update();if(header&&window.ResizeObserver)new ResizeObserver(update).observe(header);
let pending=0;
function keepFocusedLabelVisible(){
 cancelAnimationFrame(pending);pending=requestAnimationFrame(()=>{
  const input=document.activeElement;
  if(!input?.matches?.('.form-fields input,.form-fields textarea,.form-fields select'))return;
  const label=input.closest('label')||input,rect=label.getBoundingClientRect();
  const top=Math.max(header?.getBoundingClientRect().bottom||0,window.visualViewport?.offsetTop||0)+28;
  if(rect.top<top)window.scrollBy({top:rect.top-top,behavior:'instant'});
 });
}
document.addEventListener('focusin',keepFocusedLabelVisible);
window.addEventListener('resize',()=>{update();keepFocusedLabelVisible();});
window.visualViewport?.addEventListener('resize',keepFocusedLabelVisible);
document.addEventListener('focusin',()=>setTimeout(keepFocusedLabelVisible,320));

// Preview-only UX: when creation succeeds, keep the generated link visible.
// Do not auto-open it: the user must be able to copy/share the result first.
const resultPanel=document.getElementById('resultPanel');
if(resultPanel){
  let handledHref='';
  const observer=new MutationObserver(()=>{
    const link=resultPanel.querySelector('.result-ready a.button.primary[href*="open.html?id="]');
    if(!link||link.href===handledHref)return;
    handledHref=link.href;
    requestAnimationFrame(()=>{
      resultPanel.scrollIntoView({behavior:'smooth',block:'center'});
      const copy=resultPanel.querySelector('#copyLink');
      setTimeout(()=>copy?.focus?.({preventScroll:true}),420);
    });
  });
  observer.observe(resultPanel,{childList:true,subtree:true});
}
