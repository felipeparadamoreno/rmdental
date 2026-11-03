/* UI odontograma y planes de tratamiento RMDental. Requiere globals api, esc, PD, sesionVencida. */
(function(){
  const $=id=>document.getElementById(id);
  const faces=[['vestibular','V'],['mesial','M'],['oclusal','O'],['distal','D'],['lingual','L']];
  const conditions=[
    ['sano','Sano','#ffffff'],['caries','Caries','#e53935'],['resina_adaptada','Resina adaptada','#21b6b0'],
    ['resina_desadaptada','Resina desadaptada','#8b5cf6'],['amalgama','Amalgama','#2457c5'],['sellante','Sellante','#a78bfa'],
    ['corona','Corona','#64748b'],['endodoncia','Endodoncia','#ef4444'],['ausente','Diente ausente','#111827'],
    ['extraccion_indicada','Extracción indicada','#f97316'],['implante','Implante','#0d9488'],['fractura','Fractura','#f59e0b'],['provisional','Provisional','#eab308']
  ];
  const upper=['18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28'];
  const lower=['48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38'];
  let patient=null,records=[],plans=[],items=[],selectedTooth='16',selectedFace='oclusal',selectedPlan=null;
  const clp=n=>'$'+Number(n||0).toLocaleString('es-CL');
  const conditionMap=Object.fromEntries(conditions.map(x=>[x[0],x]));
  function init(p){
    if(!patient || Number(patient.id)!==Number(p.id)){selectedPlan=null;selectedTooth='16';selectedFace='oclusal';records=[];plans=[];items=[];}
    patient=p;
    const host=$('tab-trat'); if(!host)return;
    if(!$('odonto-app')){
      const app=document.createElement('div');app.id='odonto-app';
      app.innerHTML=`<div class="od-tabs"><button type="button" class="on" data-odtab="chart">Odontograma</button><button type="button" data-odtab="plans">Planes de tratamiento</button><button type="button" data-odtab="history">Evoluciones</button></div>
      <section id="od-chart" class="od-pane"><div class="od-card"><div class="od-head"><div><h2>Odontograma clínico</h2><p>Selecciona una pieza y registra la condición de cada superficie.</p></div><label class="od-check"><input type="checkbox" id="od-child"> Dentición temporal</label></div><div class="od-arch"><div class="od-arch-label">ARCADA SUPERIOR</div><div class="od-teeth" id="od-upper"></div><div class="od-arch-label">ARCADA INFERIOR</div><div class="od-teeth" id="od-lower"></div></div><div class="od-legend" id="od-legend"></div></div>
      <div class="od-card od-editor"><div><h3 id="od-piece-title">Pieza 16</h3><p>Selecciona una cara para registrar su condición.</p><div class="od-faces" id="od-faces"></div></div><div class="od-form"><label>Condición / hallazgo</label><select id="od-condition"></select><label>Estado del registro</label><select id="od-state"><option value="actual">Estado actual</option><option value="observado">Observado</option><option value="planificado">Planificado</option><option value="realizado">Realizado</option></select><label>Observación clínica</label><textarea id="od-note" rows="2" placeholder="Detalle opcional"></textarea><button class="btn" id="od-save">Guardar en odontograma</button><p class="msg" id="od-msg"></p></div></div></section>
      <section id="od-plans" class="od-pane" hidden><div class="od-grid"><form class="od-card" id="od-plan-form"><h2>Crear plan independiente</h2><label>Nombre del plan *</label><input id="od-plan-name" required placeholder="Ej. Rehabilitación oral"><label>Especialidad</label><input id="od-plan-specialty" placeholder="Ej. Rehabilitación oral"><label>Objetivo</label><textarea id="od-plan-goal" rows="2"></textarea><label>Estado</label><select id="od-plan-status"><option value="borrador">Borrador</option><option value="propuesto">Propuesto al paciente</option></select><button class="btn" type="submit">Crear plan</button><p class="msg" id="od-plan-msg"></p></form><div class="od-card"><h2>Planes del paciente</h2><div id="od-plan-list" class="od-plan-list">Cargando…</div></div></div><div class="od-card" id="od-plan-detail" hidden><div class="od-head"><div><h2 id="od-detail-title">Tratamientos del plan</h2><p id="od-detail-total"></p></div><label>Estado del plan<select id="od-plan-edit-status"><option value="borrador">Borrador</option><option value="propuesto">Propuesto</option><option value="aceptado">Aceptado</option><option value="parcial">Parcialmente aceptado</option><option value="rechazado">Rechazado</option><option value="en_curso">En curso</option><option value="completado">Completado</option><option value="archivado">Archivado</option></select></label></div><form id="od-item-form" class="od-item-form"><h3>Agregar tratamiento</h3><div class="od-fields"><div><label>Pieza FDI</label><input id="od-item-tooth" maxlength="2" placeholder="36"></div><div><label>Diagnóstico</label><input id="od-item-diagnosis" placeholder="Caries profunda"></div><div><label>Procedimiento *</label><input id="od-item-procedure" required placeholder="Endodoncia"></div><div><label>Prioridad</label><select id="od-item-priority"><option value="urgente">Urgente</option><option value="alta">Alta</option><option value="media" selected>Media</option><option value="baja">Baja</option></select></div><div><label>Cantidad</label><input id="od-item-qty" type="number" min="1" value="1"></div><div><label>Valor unitario (CLP)</label><input id="od-item-price" type="number" min="0" value="0"></div><div><label>Sesiones estimadas</label><input id="od-item-sessions" type="number" min="0" placeholder="1"></div></div><label>Nota</label><input id="od-item-note" placeholder="Indicaciones internas"><button class="btn" type="submit">Agregar al plan</button><p class="msg" id="od-item-msg"></p></form><div id="od-items-list"></div></div></section>
      <section id="od-history" class="od-pane" hidden><div class="od-card"><h2>Historial del odontograma</h2><div id="od-history-list">Cargando…</div></div></section>`;
      host.insertBefore(app,host.firstChild);
      bind();
    }
    loadAll();
  }
  function bind(){
    $('od-tab'+'s');
    $('odonto-app').addEventListener('click',e=>{const b=e.target.closest('[data-odtab]');if(!b)return;document.querySelectorAll('[data-odtab]').forEach(x=>x.classList.toggle('on',x===b));['chart','plans','history'].forEach(x=>$('od-'+x).hidden=x!==b.dataset.odtab);if(b.dataset.odtab==='history')loadHistory()});
    $('od-child').addEventListener('change',renderTeeth);
    $('od-save').addEventListener('click',saveSurface);
    $('od-plan-form').addEventListener('submit',createPlan);
    $('od-plan-edit-status').addEventListener('change',updatePlanStatus);
    $('od-item-form').addEventListener('submit',addItem);
  }
  function currentTeeth(){if(!$('od-child').checked)return [upper,lower];return [['55','54','53','52','51','61','62','63','64','65'],['85','84','83','82','81','71','72','73','74','75']];}
  function latest(pieza,sup){return records.find(r=>r.pieza===pieza&&r.superficie===sup)}
  function renderTeeth(){
    const [u,l]=currentTeeth();[['od-upper',u],['od-lower',l]].forEach(([id,list])=>{const box=$(id);box.innerHTML='';list.forEach(n=>{const b=document.createElement('button');b.type='button';b.className='od-tooth'+(selectedTooth===n?' selected':'');b.innerHTML=`<span class="od-tooth-num">${n}</span><span class="od-mini">${faces.map(([f,letter])=>{const r=latest(n,f),c=r&&conditionMap[r.codigo]?conditionMap[r.codigo][2]:'#fff';return `<i title="${letter}" style="background:${c}">${letter}</i>`}).join('')}</span>`;b.addEventListener('click',()=>{selectedTooth=n;renderTeeth();renderEditor()});box.appendChild(b)})});
    $('od-legend').innerHTML=conditions.map(c=>`<span><i style="background:${c[2]}"></i>${c[1]}</span>`).join('');
    renderEditor();
  }
  function renderEditor(){
    $('od-piece-title').textContent='Pieza '+selectedTooth;
    $('od-faces').innerHTML=faces.map(([f,l])=>{const r=latest(selectedTooth,f),c=r&&conditionMap[r.codigo]?conditionMap[r.codigo][2]:'#fff';return `<button type="button" data-face="${f}" class="${selectedFace===f?'on':''}" style="--face:${c}"><b>${l}</b><small>${f}</small></button>`}).join('');
    $('od-faces').querySelectorAll('[data-face]').forEach(b=>b.addEventListener('click',()=>{selectedFace=b.dataset.face;renderEditor()}));
    $('od-condition').innerHTML=conditions.map(c=>`<option value="${c[0]}">${c[1]}</option>`).join('');
    const old=latest(selectedTooth,selectedFace);if(old){$('od-condition').value=old.codigo;$('od-state').value=old.estado;$('od-note').value=old.nota||''}else{$('od-condition').value='sano';$('od-state').value='actual';$('od-note').value=''}
  }
  async function loadAll(){
    if(!patient)return;
    const [o,p]=await Promise.all([api('/pro/odontograma/'+patient.id),api('/pro/planes-tratamiento?paciente_id='+patient.id)]);
    if(o.status===401||p.status===401)return sesionVencida();
    if(o.ok)records=o.d.registros||[];
    if(p.ok){plans=p.d.planes||[];items=p.d.items||[]}
    renderTeeth();renderPlans();
  }
  async function saveSurface(){
    const msg=$('od-msg');msg.className='msg';msg.textContent='Guardando…';
    const r=await api('/pro/odontograma',{paciente_id:patient.id,pieza:selectedTooth,superficie:selectedFace,codigo:$('od-condition').value,estado:$('od-state').value,nota:$('od-note').value});
    if(r.status===401)return sesionVencida();if(!r.ok){msg.className='msg err';msg.textContent=r.d.error||'No se pudo guardar.';return}
    msg.className='msg ok';msg.textContent='Registro guardado. Se conservó la evolución anterior.';await loadAll();
  }
  async function createPlan(e){
    e.preventDefault();const msg=$('od-plan-msg');msg.className='msg';msg.textContent='Creando…';
    const r=await api('/pro/planes-tratamiento',{paciente_id:patient.id,nombre:$('od-plan-name').value,especialidad:$('od-plan-specialty').value,objetivo:$('od-plan-goal').value,estado:$('od-plan-status').value});
    if(r.status===401)return sesionVencida();if(!r.ok){msg.className='msg err';msg.textContent=r.d.error||'No se pudo crear.';return}
    e.target.reset();msg.className='msg ok';msg.textContent='Plan creado.';await loadAll();selectPlan(r.d.id);
  }
  function renderPlans(){
    const box=$('od-plan-list');box.innerHTML='';if(!plans.length){box.innerHTML='<span class="empty">Este paciente aún no tiene planes.</span>';return}
    plans.forEach(p=>{const b=document.createElement('button');b.type='button';b.className='od-plan'+(Number(selectedPlan)===Number(p.id)?' on':'');b.innerHTML=`<b>${esc(p.nombre)}</b><span>${esc(p.especialidad||'Sin especialidad')} · ${esc(p.estado)}</span><strong>${clp(p.total)}</strong>`;b.onclick=()=>selectPlan(p.id);box.appendChild(b)});
  }
  function selectPlan(id){selectedPlan=Number(id);const p=plans.find(x=>Number(x.id)===selectedPlan);if(!p)return;$('od-plan-detail').hidden=false;$('od-detail-title').textContent=p.nombre;$('od-plan-edit-status').value=p.estado;$('od-detail-total').textContent='Presupuesto: '+clp(p.total);$('od-item-tooth').value='';renderItems();renderPlans()}
  function renderItems(){
    const box=$('od-items-list'),list=items.filter(x=>Number(x.plan_id)===selectedPlan);box.innerHTML='<h3>Tratamientos incluidos</h3>';
    if(!list.length){box.innerHTML+='<p class="empty">Agrega el primer tratamiento a este plan.</p>';return}
    list.forEach(i=>{const d=document.createElement('div');d.className='od-item';d.innerHTML=`<div><b>${esc(i.procedimiento)}</b><small>${i.pieza?'Pieza '+esc(i.pieza)+' · ':''}${esc(i.diagnostico||'Sin diagnóstico')} · Prioridad ${esc(i.prioridad)}</small><small>${esc(i.estado)} · ${Number(i.cantidad)} × ${clp(i.valor_unitario)} · ${i.sesiones==null?'Sesiones no definidas':i.sesiones+' sesiones'}</small></div><strong>${clp(Number(i.cantidad)*Number(i.valor_unitario))}</strong><div class="od-item-actions"></div>`;const actions=d.querySelector('.od-item-actions');const sel=document.createElement('select');['propuesto','aceptado','rechazado','agendado','en_curso','realizado','cancelado'].forEach(s=>{const op=document.createElement('option');op.value=s;op.textContent=s.replace('_',' ');op.selected=s===i.estado;sel.appendChild(op)});sel.onchange=async()=>{const r=await api('/pro/planes-tratamiento/items/'+i.id,{estado:sel.value},'PUT');if(r.status===401)return sesionVencida();if(!r.ok){alert(r.d.error||'No se pudo actualizar');return}loadAll()};actions.appendChild(sel);box.appendChild(d)});
  }
  async function updatePlanStatus(){const p=plans.find(x=>Number(x.id)===selectedPlan);if(!p)return;const r=await api('/pro/planes-tratamiento/'+p.id,{nombre:p.nombre,especialidad:p.especialidad,objetivo:p.objetivo,observaciones:p.observaciones,estado:$('od-plan-edit-status').value},'PUT');if(r.status===401)return sesionVencida();if(!r.ok){alert(r.d.error||'No se pudo actualizar');return}loadAll()}
  async function addItem(e){
    e.preventDefault();if(!selectedPlan)return;const body={pieza:$('od-item-tooth').value.trim()||null,diagnostico:$('od-item-diagnosis').value,procedimiento:$('od-item-procedure').value,prioridad:$('od-item-priority').value,cantidad:$('od-item-qty').value,valor_unitario:$('od-item-price').value,sesiones:$('od-item-sessions').value,nota:$('od-item-note').value};
    const msg=$('od-item-msg');msg.className='msg';msg.textContent='Guardando…';const r=await api('/pro/planes-tratamiento/'+selectedPlan+'/items',body);
    if(r.status===401)return sesionVencida();if(!r.ok){msg.className='msg err';msg.textContent=r.d.error||'No se pudo agregar.';return}e.target.reset();$('od-item-qty').value=1;$('od-item-price').value=0;msg.className='msg ok';msg.textContent='Tratamiento agregado.';await loadAll();selectPlan(selectedPlan);
  }
  async function loadHistory(){const box=$('od-history-list');box.textContent='Cargando…';const r=await api('/pro/odontograma/'+patient.id+'/historial');if(r.status===401)return sesionVencida();if(!r.ok){box.textContent='No se pudo cargar el historial.';return}const list=r.d.historial||[];if(!list.length){box.innerHTML='<span class="empty">Sin evoluciones registradas.</span>';return}box.innerHTML=list.map(x=>`<div class="od-history-row"><b>Pieza ${esc(x.pieza)} · ${esc(x.superficie)}</b><span>${esc((conditionMap[x.codigo]||[x.codigo,x.codigo])[1])} · ${esc(x.estado)}</span><small>${esc(new Date(x.creado_en).toLocaleString('es-CL'))} · ${esc(x.profesional||'Profesional')}${x.nota?' · '+esc(x.nota):''}</small></div>`).join('')}
  window.odontoInit=init;
})();
