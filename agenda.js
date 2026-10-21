/* Selector de día, franja horaria y hora (compartido por las landings).
   Usa los mismos horarios, anticipación y calendario de la página principal.
   Uso: var sch = RMAgenda.mount("sched");  sch.value() -> null | {when:"lunes 26 de octubre a las 10:00", date:"2026-10-26", time:"10:00"} */
(function(){
  var DOW=["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  var DOWS=["dom","lun","mar","mié","jue","vie","sáb"];
  var MON=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  /* Misma URL /exec del script de Google Calendar que usa index.html. Vacío = todas las horas libres. */
  var CAL_URL="https://script.google.com/macros/s/AKfycbzLgH3RpwsWgI6PYc9_LBGC6hWgk_qmBcvTMjpqpm12vkbMAzET9SUNI4gEtbG9WIscaA/exec";
  var MIN_DAYS=3; /* anticipación mínima, en días */
  var BANDS=[{k:"manana",n:"Mañana",a:0,b:720},{k:"mediodia",n:"Mediodía",a:720,b:840},{k:"tarde",n:"Tarde",a:840,b:1441}];

  function pad(n){return n<10?"0"+n:""+n}
  function fmt(m){return pad(Math.floor(m/60))+":"+pad(m%60)}
  function dkey(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())}
  function longDate(d){return DOW[d.getDay()]+" "+d.getDate()+" de "+MON[d.getMonth()]}
  function bandOf(m){for(var i=0;i<BANDS.length;i++){if(m>=BANDS[i].a&&m<BANDS[i].b)return BANDS[i].k}return null}
  function slotsFor(d,early,endH){endH=endH||15;
    var w=d.getDay();if(w===0||w===2||w===4)return[]; /* domingo, martes y jueves sin atención */
    var t=[];
    function add(a,b){for(var m=a*60;m<b*60;m+=30)t.push(m)}
    if(early){add(7,w===6?13:15)}else if(w===6){add(9,13)}else{add(9,endH)}
    return t;
  }

  var busy={},listeners=[],calStarted=false;
  function isTaken(d,m){
    var a=busy[dkey(d)]||[];
    for(var i=0;i<a.length;i++){if(a[i][0]<m+30&&a[i][1]>m)return true}
    return false;
  }
  function loadCalendar(){
    if(calStarted||!CAL_URL)return;calStarted=true;
    function apply(j){busy=(j&&j.busy)||{};listeners.forEach(function(fn){fn()})}
    function jsonp(){
      var cb="__cal"+Date.now(),sc=document.createElement("script");
      window[cb]=apply;
      sc.src=CAL_URL+"?callback="+cb+"&t="+Date.now();document.head.appendChild(sc);
    }
    try{fetch(CAL_URL+"?t="+Date.now()).then(function(r){return r.text()}).then(function(t){apply(JSON.parse(t))}).catch(jsonp)}catch(e){jsonp()}
  }

  function mount(id,opts){
    var early=!!(opts&&opts.early),endH=(opts&&opts.until)||15;
    var root=typeof id==="string"?document.getElementById(id):id;
    if(!root)return {value:function(){return null},focus:function(){}};
    var now=new Date(),nowMin=now.getHours()*60+now.getMinutes();
    var days=[],selKey=null,selTime=null,selBand=null,animNext=false;

    root.className=(root.className?root.className+" ":"")+"sch";
    root.innerHTML=
      '<p class="sch-label" id="'+root.id+'-dl">Día</p>'+
      '<div class="sch-days" role="group" aria-labelledby="'+root.id+'-dl"></div>'+
      '<p class="sch-label" id="'+root.id+'-bl">¿En qué horario te acomoda?</p>'+
      '<div class="sch-bands" role="group" aria-labelledby="'+root.id+'-bl"></div>'+
      '<div class="sch-reveal"><div><p class="sch-label" id="'+root.id+'-tl">Hora</p><div class="sch-times" role="group" aria-labelledby="'+root.id+'-tl"></div></div></div>'+
      '<p class="sch-sum" aria-live="polite"></p>'+
      '<p class="sch-note">Los horarios tachados ya están tomados. Se reserva con al menos '+MIN_DAYS+' días de anticipación.</p>';
    var daysEl=root.querySelector(".sch-days"),bandsEl=root.querySelector(".sch-bands"),
        wrap=root.querySelector(".sch-reveal"),timesEl=root.querySelector(".sch-times"),sumEl=root.querySelector(".sch-sum");

    function slotOk(o,m){return !(isTaken(o.date,m)||(o.isToday&&m<nowMin+30))}
    function buildDays(){
      days=[];
      for(var i=MIN_DAYS;i<MIN_DAYS+28&&days.length<14;i++){
        var d=new Date(now.getFullYear(),now.getMonth(),now.getDate()+i);
        if(slotsFor(d,early,endH).length===0)continue;
        var o={date:d,key:dkey(d),isToday:i===0};
        var free=slotsFor(d,early,endH).filter(function(m){return slotOk(o,m)});
        if(!free.length)continue;
        days.push(o);
      }
    }
    function cur(){for(var i=0;i<days.length;i++){if(days[i].key===selKey)return days[i]}return null}
    function validate(){
      var o=cur();
      if(!o){selKey=days.length?days[0].key:null;selTime=null;selBand=null;return}
      if(selTime!==null&&!slotOk(o,selTime)){selTime=null}
      if(selBand!==null){
        var ok=slotsFor(o.date,early,endH).some(function(m){return bandOf(m)===selBand&&slotOk(o,m)});
        if(!ok){selBand=null;selTime=null}
      }
    }
    function renderDays(){
      daysEl.innerHTML="";
      if(!days.length){var p=document.createElement("p");p.className="sch-note";p.textContent="No hay horas disponibles por ahora. Escríbenos y te ayudamos.";daysEl.appendChild(p);return}
      days.forEach(function(o){
        var b=document.createElement("button");
        b.type="button";b.className="sch-day";
        b.setAttribute("aria-pressed",selKey===o.key?"true":"false");
        b.innerHTML='<span class="w">'+DOWS[o.date.getDay()]+'</span><span class="d">'+o.date.getDate()+'</span><span class="m">'+MON[o.date.getMonth()].slice(0,3)+'</span>';
        b.addEventListener("click",function(){selKey=o.key;selTime=null;selBand=null;renderAll()});
        daysEl.appendChild(b);
      });
    }
    function renderBands(){
      bandsEl.innerHTML="";
      var o=cur();
      if(!o){var p=document.createElement("p");p.className="sch-note";p.textContent="Primero elige un día.";bandsEl.appendChild(p);return}
      var all=slotsFor(o.date,early,endH);
      BANDS.forEach(function(B){
        var inB=all.filter(function(m){return m>=B.a&&m<B.b});
        if(!inB.length)return;
        var free=inB.filter(function(m){return slotOk(o,m)});
        var b=document.createElement("button");b.type="button";b.className="sch-band";
        b.setAttribute("aria-pressed",selBand===B.k?"true":"false");
        var n=document.createElement("b");n.textContent=B.n;b.appendChild(n);
        if(!free.length){var sp=document.createElement("span");sp.textContent="Sin horas";b.appendChild(sp);b.disabled=true}
        b.addEventListener("click",function(){
          if(selBand!==B.k)animNext=true;
          selBand=B.k;if(selTime!==null&&bandOf(selTime)!==B.k)selTime=null;
          renderAll();
        });
        bandsEl.appendChild(b);
      });
    }
    function renderTimes(){
      var o=cur();
      if(!o||selBand===null){wrap.classList.remove("open");return}
      timesEl.innerHTML="";
      var idx=0,anim=animNext;animNext=false;
      wrap.classList.add("open");
      slotsFor(o.date,early,endH).filter(function(m){return bandOf(m)===selBand}).forEach(function(m){
        var b=document.createElement("button");
        b.type="button";b.className="sch-time"+(anim?" enter":"");b.textContent=fmt(m);
        if(anim)b.style.animationDelay=(idx++*40)+"ms";
        if(!slotOk(o,m)){b.disabled=true;b.setAttribute("aria-label",fmt(m)+" no disponible")}
        b.setAttribute("aria-pressed",selTime===m?"true":"false");
        b.addEventListener("click",function(){selTime=m;renderAll()});
        timesEl.appendChild(b);
      });
    }
    function renderSum(){
      var o=cur();
      if(!o){sumEl.textContent="No hay horas disponibles por ahora.";return}
      if(selTime!==null){sumEl.textContent="Tu hora: "+longDate(o.date)+" a las "+fmt(selTime);return}
      sumEl.textContent=selBand===null?"Elige en qué horario te acomoda el "+longDate(o.date)+".":"Ahora elige una hora para el "+longDate(o.date)+".";
    }
    function renderAll(){renderDays();renderBands();renderTimes();renderSum()}

    buildDays();validate();renderAll();
    listeners.push(function(){buildDays();validate();renderAll()});
    loadCalendar();

    return {
      value:function(){
        var o=cur();
        if(!o||selTime===null)return null;
        return {when:longDate(o.date)+" a las "+fmt(selTime),date:o.key,time:fmt(selTime)};
      },
      focus:function(){var b=root.querySelector(".sch-day");if(b)b.focus()}
    };
  }
  window.RMAgenda={mount:mount};
})();
