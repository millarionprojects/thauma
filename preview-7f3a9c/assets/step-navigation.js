const steps=[...document.querySelectorAll('#how .steps article')];
function moveTo(id){
 const target=document.getElementById(id);if(!target)return;
 const header=document.querySelector('.header');
 const top=target.getBoundingClientRect().top+window.scrollY-(header?.getBoundingClientRect().height||0)-20;
 window.scrollTo({top:Math.max(0,top),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 if(!target.hasAttribute('tabindex'))target.tabIndex=-1;
 target.focus({preventScroll:true});
}
function activate(index){
 if(index===0){moveTo('dropZone');return;}
 if(index===1){moveTo('designs');return;}
 const ready=document.querySelector('#resultPanel .result-buttons a');
 if(ready){location.href=ready.href;return;}
 moveTo('create');
 const toast=document.getElementById('toast');
 toast.textContent=document.documentElement.lang==='en'?'Create your gift first, then you can view its opening.':'Сначала создайте подарок — после этого можно посмотреть его открытие.';
 toast.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>toast.classList.remove('show'),4500);
}
steps.forEach((step,index)=>{
 step.tabIndex=0;step.setAttribute('role','link');
 step.addEventListener('click',()=>activate(index));
 step.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate(index);}});
});
