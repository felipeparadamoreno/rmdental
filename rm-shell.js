/* RM Dental · comportamiento compartido: menú de servicios y acceso al asistente IA. */
(function(){
  "use strict";
  /* Cierra el menú de servicios al elegir una opción o al hacer clic fuera */
  document.addEventListener("click",function(e){
    var m=document.querySelector("details.menu[open]");
    if(!m)return;
    if(e.target.closest(".menu-list a")||!e.target.closest(".menu"))m.removeAttribute("open");
  });
  document.addEventListener("keydown",function(e){
    if(e.key==="Escape"){var m=document.querySelector("details.menu[open]");if(m){m.removeAttribute("open")}}
  });

  /* Lleva al buscador "Pregúntale a RMDental" (solo existe en el inicio) */
  function focusAI(){
    var q=document.getElementById("rm-q"),f=document.getElementById("rm-search");
    if(!q)return false;
    (f||q).scrollIntoView({behavior:"smooth",block:"center"});
    setTimeout(function(){try{q.focus({preventScroll:true})}catch(_){q.focus()}},450);
    return true;
  }
  document.addEventListener("click",function(e){
    var a=e.target.closest("[data-ai]");
    if(a&&focusAI())e.preventDefault();
  });
  /* Llegadas desde otras páginas: index.html#rm-search */
  if(location.hash==="#rm-search"){
    window.addEventListener("load",function(){setTimeout(focusAI,350)});
  }
})();
