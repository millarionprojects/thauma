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
  // Safari may move the visual viewport after focusing and showing its keyboard.
  const top=Math.max(header?.getBoundingClientRect().bottom||0,window.visualViewport?.offsetTop||0)+28;
  if(rect.top<top)window.scrollBy({top:rect.top-top,behavior:'instant'});
 });
}
document.addEventListener('focusin',keepFocusedLabelVisible);
window.addEventListener('resize',()=>{update();keepFocusedLabelVisible();});
window.visualViewport?.addEventListener('resize',keepFocusedLabelVisible);
// Safari's automatic focus scroll can follow the focus event.
document.addEventListener('focusin',()=>setTimeout(keepFocusedLabelVisible,320));
