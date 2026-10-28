/* Utilidades de RUT chileno (compartidas por el sitio).
   RMRut.format("123456785") -> "12.345.678-5" ; RMRut.valid(...) valida largo y dígito verificador. */
(function(){
  function clean(v){return String(v||"").replace(/[^0-9kK]/g,"").toUpperCase()}
  function format(v){
    var c=clean(v);if(c.length<2)return c;
    return c.slice(0,-1).replace(/\B(?=(\d{3})+(?!\d))/g,".")+"-"+c.slice(-1);
  }
  function valid(v){
    var c=clean(v);if(!/^\d{7,8}[\dK]$/.test(c))return false;
    var b=c.slice(0,-1),d=c.slice(-1),s=0,m=2;
    for(var i=b.length-1;i>=0;i--){s+=+b[i]*m;m=m===7?2:m+1}
    var x=11-(s%11),e=x===11?"0":x===10?"K":String(x);
    return e===d;
  }
  function attach(){
    [].slice.call(document.querySelectorAll("input[data-rut]")).forEach(function(i){
      i.addEventListener("input",function(){i.value=format(i.value)});
    });
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",attach);else attach();
  window.RMRut={clean:clean,format:format,valid:valid};
})();
