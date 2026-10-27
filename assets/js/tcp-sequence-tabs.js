(()=>{
 'use strict';
 const $=id=>document.getElementById(id),names=['hosts','log'];
 function select(name,focus=false){
  for(const key of names){
   const active=key===name,tab=$(key+'-tab');
   tab.setAttribute('aria-selected',String(active));
   tab.tabIndex=active?0:-1;
   $(key+'-panel').hidden=!active;
  }
  if(focus)$(name+'-tab').focus();
  const pane=name==='hosts'?$('packets'):document.querySelector('.log-scroll');
  const active=pane.querySelector('.active');
  if(active)pane.scrollTop=Math.max(0,active.offsetTop-pane.offsetTop);
  else pane.scrollTop=pane.scrollHeight;
 }
 for(const name of names){
  $(name+'-tab').addEventListener('click',()=>select(name));
  $(name+'-tab').addEventListener('keydown',event=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
   event.preventDefault();
   select(event.key==='Home'?'hosts':event.key==='End'?'log':names[1-names.indexOf(name)],true);
  });
 }
})();
