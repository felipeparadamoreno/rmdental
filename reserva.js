/* RM Dental · agendador web (ventana de "Agendar hora").
   Flujo: RUT + reCAPTCHA + términos → datos de contacto → motivo → clínica → hora → confirmación.
   Habla con la API (reserva-route.js). Todo texto que viene del usuario o del servidor se inserta con
   textContent, nunca con innerHTML. Se abre con RMReserva.open() o con cualquier enlace a #agenda. */
(function () {
  "use strict";
  var API = (window.RM_API_URL || "https://api.rmdental.cl").replace(/\/+$/, "");
  var DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  var DOWL = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  var MON = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  var MONL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  var PASOS = 5;
  var ERRORES = {
    rut_invalido: "Revisa tu RUT: no parece válido.",
    falta_aceptar_terminos: "Debes aceptar los términos y condiciones.",
    captcha_invalido: "No pudimos verificar el reCAPTCHA. Inténtalo de nuevo.",
    ficha_inactiva: "Tu ficha está inactiva. Escríbenos a contacto@rmdental.cl para ayudarte.",
    correo_invalido: "Revisa tu correo electrónico.",
    celular_invalido: "Ingresa un celular chileno válido, por ejemplo +56 9 1234 5678.",
    nombre_incompleto: "Completa tu nombre y ambos apellidos.",
    fecha_nac_invalida: "Revisa tu fecha de nacimiento.",
    rut_ya_registrado: "Ese RUT ya está registrado. Vuelve al inicio e ingrésalo de nuevo.",
    sesion_vencida: "Tu sesión expiró. Vuelve a comenzar.",
    hora_no_disponible: "Esa hora acaba de ser tomada. Elige otra.",
    limite_citas: "Ya tienes el máximo de horas próximas agendadas. Escríbenos si necesitas cambiarlas.",
    motivo_invalido: "Elige un motivo de consulta.",
    clinica_no_encontrada: "No encontramos esa clínica. Elige otra.",
    red: "No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo."
  };

  var S, root, body, progress, lastFocus, widgetId = null, recaptchaCargado = false;

  function reset() {
    S = { token: null, existe: false, pista: null, nuevo: false, nombre: "", cfg: null, motivo: "", comuna: "", clinica: null, dias: null, dia: null, hora: null, mes: null, paso: 0 };
  }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") el.className = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) el.setAttribute(k, "");
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null) continue;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }
  function api(method, path, data) {
    var o = { method: method, headers: { "Accept": "application/json" } };
    if (S.token) o.headers.Authorization = "Bearer " + S.token;
    if (data) { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(data); }
    return fetch(API + path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { d.__status = r.status; return d; });
    }).catch(function () { return { ok: false, error: "red" }; });
  }
  function msg(code) { return ERRORES[code] || "Ocurrió un problema. Inténtalo nuevamente."; }
  function fechaLarga(f) { var p = f.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]); return DOWL[d.getDay()] + " " + d.getDate() + " de " + MONL[d.getMonth()]; }

  /* ---------- estructura de la ventana ---------- */
  function build() {
    progress = h("div", { class: "rsv-progress", "aria-hidden": "true" });
    body = h("div", { class: "rsv-body" });
    var cerrar = h("button", { type: "button", class: "rsv-x", "aria-label": "Cerrar", text: "×", onclick: close });
    root = h("div", { class: "rsv-overlay", hidden: true },
      h("div", { class: "rsv-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "rsv-title" },
        h("div", { class: "rsv-head" }, h("span", { class: "rsv-brand", text: "RM Dental" }), cerrar),
        progress, body));
    root.addEventListener("mousedown", function (e) { if (e.target === root) close(); });
    document.addEventListener("keydown", function (e) {
      if (root.hidden) return;
      if (e.key === "Escape") { close(); return; }
      if (e.key === "Tab") { // el foco no sale de la ventana
        var f = [].slice.call(root.querySelectorAll("button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],iframe,[tabindex='0']")).filter(function (x) { return x.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    document.body.appendChild(root);
  }
  function open(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!root) build();
    lastFocus = document.activeElement;
    reset();
    root.hidden = false;
    document.documentElement.classList.add("rsv-lock");
    go(0);
    cargarConfig();
  }
  function close() {
    if (!root || root.hidden) return;
    root.hidden = true;
    document.documentElement.classList.remove("rsv-lock");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function cargarConfig() {
    api("GET", "/reserva/config").then(function (d) {
      if (!d.ok) { S.cfgError = true; if (S.paso === 0) go(0); return; }
      S.cfg = d;
      if (S.paso === 0) montarCaptcha();
    });
  }
  function setProgress(n) {
    progress.textContent = "";
    if (n < 1 || n > PASOS) return;
    for (var i = 1; i <= PASOS; i++) progress.appendChild(h("span", { class: "rsv-dot" + (i < n ? " done" : i === n ? " now" : "") }));
    progress.appendChild(h("span", { class: "rsv-count", text: "Paso " + n + " de " + PASOS }));
  }
  function go(n) {
    S.paso = n;
    root.querySelector(".rsv-dialog").classList.remove("rsv-wide");
    body.textContent = "";
    setProgress(n < PASOS ? n + 1 : 0);
    [paso0, paso1, paso2, paso3, paso4, paso5][n]();
    var t = body.querySelector("#rsv-title");
    if (t) { t.setAttribute("tabindex", "-1"); t.focus(); }
    root.querySelector(".rsv-dialog").scrollTop = 0;
  }
  function titulo(t, sub) {
    body.appendChild(h("h2", { id: "rsv-title", class: "rsv-title", text: t }));
    if (sub) body.appendChild(h("p", { class: "rsv-sub", text: sub }));
  }
  function errorBox() { var e = h("p", { class: "rsv-err", role: "alert" }); return e; }
  function campo(id, label, attrs, hint) {
    var inp = h("input", Object.assign({ id: id, class: "rsv-input" }, attrs || {}));
    return { wrap: h("div", { class: "rsv-field" }, h("label", { for: id, text: label }), inp, hint ? h("small", { text: hint }) : null), input: inp };
  }
  function acciones(back, nextText, onNext) {
    var next = h("button", { type: "submit", class: "btn btn-cta rsv-next", text: nextText });
    var row = h("div", { class: "rsv-actions" });
    if (back != null) row.appendChild(h("button", { type: "button", class: "btn btn-ghost rsv-back", text: "Volver", onclick: function () { go(back); } }));
    row.appendChild(next);
    return { row: row, next: next };
  }
  function ocupado(btn, on, texto) { btn.disabled = on; if (texto) btn.textContent = texto; }

  /* ---------- 1. Bienvenida + RUT ---------- */
  function paso0() {
    titulo("¡Hola! Agendemos tu hora", "Para comenzar, ingresa tu RUT. Así revisamos si ya estás registrado.");
    var rut = campo("rsv-rut", "RUT", { inputmode: "text", autocomplete: "off", placeholder: "12.345.678-5", maxlength: "12" });
    rut.input.addEventListener("input", function () { if (window.RMRut) rut.input.value = RMRut.format(rut.input.value); });
    var cap = h("div", { class: "rsv-captcha", id: "rsv-captcha" });
    var chk = h("input", { type: "checkbox", id: "rsv-tyc" });
    var tyc = h("label", { class: "rsv-check", for: "rsv-tyc" }, chk, h("span", null, "Acepto los ",
      h("a", { href: "terminos.html", target: "_blank", rel: "noopener", text: "términos y condiciones" }), " y el tratamiento de mis datos para gestionar mi atención."));
    var err = errorBox();
    var a = acciones(null, "Continuar");
    var f = h("form", { novalidate: true }, rut.wrap, cap, tyc, err, a.row);
    if (S.cfgError) err.textContent = "No pudimos cargar el agendador. Inténtalo más tarde o escríbenos a contacto@rmdental.cl.";
    f.addEventListener("submit", function (ev) {
      ev.preventDefault(); err.textContent = "";
      if (!window.RMRut || !RMRut.valid(rut.input.value)) { err.textContent = msg("rut_invalido"); rut.input.focus(); return; }
      if (!S.cfg) { err.textContent = msg("red"); cargarConfig(); return; }
      var captcha = "";
      if (S.cfg.recaptcha) {
        captcha = (window.grecaptcha && widgetId !== null) ? grecaptcha.getResponse(widgetId) : "";
        if (!captcha) { err.textContent = "Marca la casilla “No soy un robot”."; return; }
      }
      if (!chk.checked) { err.textContent = msg("falta_aceptar_terminos"); chk.focus(); return; }
      ocupado(a.next, true, "Verificando…");
      api("POST", "/reserva/rut", { rut: rut.input.value, acepto: true, captcha: captcha }).then(function (d) {
        ocupado(a.next, false, "Continuar");
        if (!d.ok) { err.textContent = msg(d.error); if (window.grecaptcha && widgetId !== null) grecaptcha.reset(widgetId); return; }
        S.token = d.token; S.existe = d.existe; S.pista = d.pista; S.rut = rut.input.value;
        go(1);
      });
    });
    body.appendChild(f);
    if (S.cfg) montarCaptcha();
  }
  function montarCaptcha() {
    var el = document.getElementById("rsv-captcha");
    widgetId = null;
    if (!el || !S.cfg || !S.cfg.recaptcha) return;
    function render() {
      var el2 = document.getElementById("rsv-captcha");
      if (!el2 || widgetId !== null || !window.grecaptcha || !grecaptcha.render) return;
      try { widgetId = grecaptcha.render(el2, { sitekey: S.cfg.recaptcha, hl: "es" }); } catch (e) { /* ya renderizado */ }
    }
    if (window.grecaptcha && grecaptcha.render) { render(); return; }
    window.__rsvCaptchaListo = function () { render(); };
    if (!recaptchaCargado) {
      recaptchaCargado = true;
      var s = document.createElement("script");
      s.src = "https://www.google.com/recaptcha/api.js?onload=__rsvCaptchaListo&render=explicit&hl=es";
      s.async = true; s.defer = true;
      document.head.appendChild(s);
    }
  }

  /* ---------- 2. Datos de contacto ---------- */
  function paso1() {
    var err = errorBox(), a;
    var email = campo("rsv-email", "Correo electrónico de contacto", { type: "email", autocomplete: "email", inputmode: "email", placeholder: "tu@correo.cl" },
      S.existe && S.pista && S.pista.correo ? "Tenemos registrado: " + S.pista.correo : null);
    var tel = campo("rsv-tel", "Celular de contacto", { type: "tel", autocomplete: "tel", inputmode: "tel", placeholder: "+56 9 1234 5678" },
      S.existe && S.pista && S.pista.telefono ? "Tenemos registrado: " + S.pista.telefono : "Te enviaremos la confirmación por WhatsApp a este número.");
    var f = h("form", { novalidate: true });
    var nom, pat, mat, nac;
    if (S.existe) {
      titulo("¡Qué bueno verte de nuevo!", "Ya estás registrado. Confirma tu correo y tu celular para enviarte los datos de tu hora.");
    } else {
      titulo("Crea tu ficha", "Aún no te encontramos en nuestro sistema. Completa tus datos, solo tomará un minuto.");
      nom = campo("rsv-nom", "Nombres", { autocomplete: "given-name", maxlength: "60" });
      pat = campo("rsv-pat", "Apellido paterno", { autocomplete: "family-name", maxlength: "40" });
      mat = campo("rsv-mat", "Apellido materno", { autocomplete: "off", maxlength: "40" });
      var hoy = new Date(), pad = function (n) { return (n < 10 ? "0" : "") + n; };
      nac = campo("rsv-nac", "Fecha de nacimiento", { type: "date", autocomplete: "bday", max: hoy.getFullYear() + "-" + pad(hoy.getMonth() + 1) + "-" + pad(hoy.getDate()), min: (hoy.getFullYear() - 120) + "-01-01" },
        "Se abre un calendario para elegir la fecha.");
      [nom, pat, mat, nac].forEach(function (c) { f.appendChild(c.wrap); });
    }
    f.appendChild(email.wrap); f.appendChild(tel.wrap); f.appendChild(err);
    a = acciones(0, S.existe ? "Confirmar y continuar" : "Crear mi ficha y continuar");
    f.appendChild(a.row);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault(); err.textContent = "";
      var data = { email: email.input.value.trim(), telefono: tel.input.value.trim() };
      if (!S.existe) {
        data.nombres = nom.input.value; data.ap_paterno = pat.input.value; data.ap_materno = mat.input.value; data.fecha_nac = nac.input.value;
        if (data.nombres.trim().length < 2 || data.ap_paterno.trim().length < 2 || data.ap_materno.trim().length < 2) { err.textContent = msg("nombre_incompleto"); return; }
        if (!data.fecha_nac) { err.textContent = msg("fecha_nac_invalida"); nac.input.focus(); return; }
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) { err.textContent = msg("correo_invalido"); email.input.focus(); return; }
      if (!/^(\+?56)?\s?9[\s\d]{8,12}$|^\d{8}$/.test(data.telefono.replace(/[()-]/g, ""))) { err.textContent = msg("celular_invalido"); tel.input.focus(); return; }
      ocupado(a.next, true, "Guardando…");
      api("POST", "/reserva/paciente", data).then(function (d) {
        ocupado(a.next, false, S.existe ? "Confirmar y continuar" : "Crear mi ficha y continuar");
        if (!d.ok) { err.textContent = msg(d.error); if (d.error === "sesion_vencida") setTimeout(function () { go(0); }, 1200); return; }
        S.token = d.token; S.nuevo = d.nuevo; S.nombre = d.nombre;
        go(2);
      });
    });
    body.appendChild(f);
  }

  /* ---------- 3. Motivo ---------- */
  function paso2() {
    var primer = (S.nombre || "").split(" ")[0];
    titulo(primer ? "Gracias, " + primer + ". ¿Cuál es el motivo de tu consulta?" : "¿Cuál es el motivo de tu consulta?", "Elige la opción que mejor te describa. Si no estás seguro, no hay problema.");
    var err = errorBox(), lista = h("div", { class: "rsv-options", role: "radiogroup", "aria-labelledby": "rsv-title" });
    ((S.cfg && S.cfg.motivos) || []).forEach(function (m, i) {
      var id = "rsv-m" + i;
      var r = h("input", { type: "radio", name: "rsv-motivo", id: id, value: m });
      if (S.motivo === m) r.checked = true;
      r.addEventListener("change", function () { S.motivo = m; err.textContent = ""; });
      lista.appendChild(h("label", { class: "rsv-opt", for: id }, r, h("span", { text: m })));
    });
    var a = acciones(null, "Continuar");
    var f = h("form", { novalidate: true }, lista, err, a.row);
    f.addEventListener("submit", function (ev) { ev.preventDefault(); if (!S.motivo) { err.textContent = msg("motivo_invalido"); return; } go(3); });
    body.appendChild(f);
  }

  /* ---------- 4. Clínica ---------- */
  function paso3() {
    titulo("Selecciona una clínica", "Elige la región y la comuna para ver nuestras clínicas.");
    var regiones = (S.cfg && S.cfg.regiones) || [];
    var err = errorBox();
    var selR = h("select", { id: "rsv-reg", class: "rsv-input" });
    regiones.forEach(function (r) { selR.appendChild(h("option", { value: r.nombre, text: r.nombre })); });
    var selC = h("select", { id: "rsv-com", class: "rsv-input" });
    var lista = h("div", { class: "rsv-options", role: "radiogroup", "aria-label": "Clínicas disponibles" });
    function pintarComunas() {
      var reg = regiones.filter(function (r) { return r.nombre === selR.value; })[0];
      selC.textContent = "";
      selC.appendChild(h("option", { value: "", text: "Selecciona una comuna" }));
      ((reg && reg.comunas) || []).forEach(function (c) { selC.appendChild(h("option", { value: c.nombre, text: c.nombre })); });
      if (S.comuna) selC.value = S.comuna;
      pintarClinicas();
    }
    function pintarClinicas() {
      lista.textContent = "";
      S.comuna = selC.value;
      var reg = regiones.filter(function (r) { return r.nombre === selR.value; })[0];
      var com = reg && reg.comunas.filter(function (c) { return c.nombre === selC.value; })[0];
      if (!com) { if (!selC.value) lista.appendChild(h("p", { class: "rsv-sub", text: "Selecciona una comuna para ver las clínicas." })); return; }
      com.clinicas.forEach(function (c, i) {
        var id = "rsv-c" + i, r = h("input", { type: "radio", name: "rsv-clinica", id: id, value: String(c.id) });
        if (S.clinica && S.clinica.id === c.id) r.checked = true;
        r.addEventListener("change", function () { S.clinica = c; err.textContent = ""; });
        lista.appendChild(h("label", { class: "rsv-opt", for: id }, r, h("span", null, h("b", { text: c.nombre }), h("small", { text: c.direccion ? c.direccion + " · " + com.nombre : com.nombre }))));
      });
      if (com.clinicas.length === 1 && !S.clinica) { S.clinica = com.clinicas[0]; lista.querySelector("input").checked = true; }
    }
    selR.addEventListener("change", function () { S.comuna = ""; S.clinica = null; pintarComunas(); });
    selC.addEventListener("change", function () { S.clinica = null; pintarClinicas(); });
    var a = acciones(2, "Continuar");
    var f = h("form", { novalidate: true },
      h("div", { class: "rsv-field" }, h("label", { for: "rsv-reg", text: "Región" }), selR),
      h("div", { class: "rsv-field" }, h("label", { for: "rsv-com", text: "Comuna" }), selC), lista, err, a.row);
    f.addEventListener("submit", function (ev) { ev.preventDefault(); if (!S.clinica) { err.textContent = "Elige una clínica para continuar."; return; } S.dias = null; S.dia = null; S.hora = null; go(4); });
    body.appendChild(f);
    pintarComunas();
  }

  /* ---------- 5. Agenda ---------- */
  function paso4() {
    root.querySelector(".rsv-dialog").classList.add("rsv-wide");
    titulo("Elige tu día y tu hora", S.clinica.nombre + (S.clinica.direccion ? " · " + S.clinica.direccion : ""));
    var zona = h("div", { class: "rsv-agenda" }, h("p", { class: "rsv-sub", text: "Buscando horas disponibles…" }));
    var err = errorBox();
    var a = acciones(3, "Confirmar hora");
    a.next.disabled = true;
    var f = h("form", { novalidate: true }, zona, err, a.row);
    body.appendChild(f);

    function pad(n) { return (n < 10 ? "0" : "") + n; }
    function clave(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    function pintar(foco) {
      zona.textContent = "";
      var dias = Object.keys(S.dias || {}).sort();
      if (!dias.length) {
        zona.appendChild(h("p", { class: "rsv-sub", text: "No hay horas disponibles en los próximos días en esta clínica. Prueba con otra clínica o escríbenos a contacto@rmdental.cl." }));
        return;
      }
      var hoy = new Date(), hoyK = clave(hoy);
      var minIdx = hoy.getFullYear() * 12 + hoy.getMonth();
      var u = dias[dias.length - 1].split("-");
      var maxIdx = Math.max(minIdx, +u[0] * 12 + (+u[1] - 1));
      if (!S.mes) { var p0 = (S.dia || dias[0]).split("-"); S.mes = { y: +p0[0], m: +p0[1] - 1 }; }
      var idx = S.mes.y * 12 + S.mes.m;
      function mover(n) { var i = idx + n; S.mes = { y: Math.floor(i / 12), m: i % 12 }; pintar(".rsv-nav-" + (n < 0 ? "prev" : "next")); }

      /* calendario del mes completo (semana de lunes a domingo) */
      var mesTxt = MONL[S.mes.m].charAt(0).toUpperCase() + MONL[S.mes.m].slice(1);
      var cab = h("div", { class: "rsv-cal-head" },
        h("button", { type: "button", class: "rsv-nav rsv-nav-prev", "aria-label": "Mes anterior", text: "‹", disabled: idx <= minIdx, onclick: function () { mover(-1); } }),
        h("div", { class: "rsv-cal-title", "aria-live": "polite", text: S.mes.y + " - " + mesTxt }),
        h("button", { type: "button", class: "rsv-nav rsv-nav-next", "aria-label": "Mes siguiente", text: "›", disabled: idx >= maxIdx, onclick: function () { mover(1); } }));
      var sem = h("div", { class: "rsv-cal-dow", "aria-hidden": "true" });
      ["L", "M", "M", "J", "V", "S", "D"].forEach(function (x) { sem.appendChild(h("span", { text: x })); });
      var grid = h("div", { class: "rsv-cal-grid" });
      var desfase = (new Date(S.mes.y, S.mes.m, 1).getDay() + 6) % 7;
      for (var i = 0; i < 42; i++) {
        (function (d) {
          var k = clave(d), enMes = d.getMonth() === S.mes.m, libre = enMes && !!S.dias[k];
          var b = h("button", { type: "button",
            class: "rsv-cd" + (libre ? " ok" : "") + (enMes ? "" : " out") + (k === hoyK ? " today" : "") + (S.dia === k ? " sel" : ""),
            disabled: !libre, "aria-pressed": libre ? String(S.dia === k) : null,
            "aria-label": fechaLarga(k) + (libre ? "" : ", sin horas disponibles"), text: String(d.getDate()) });
          if (libre) b.addEventListener("click", function () { S.dia = k; S.hora = null; a.next.disabled = true; err.textContent = ""; pintar(".rsv-cd.sel"); });
          grid.appendChild(b);
        })(new Date(S.mes.y, S.mes.m, 1 - desfase + i));
      }
      var colCal = h("div", null, h("p", { class: "rsv-label", text: "Selecciona la fecha" }), h("div", { class: "rsv-cal" }, cab, sem, grid));

      /* horas del día elegido */
      var colHoras = h("div", { class: "rsv-hpanel" }, h("p", { class: "rsv-label", text: "Selecciona una hora" }));
      if (S.dia) {
        colHoras.appendChild(h("p", { class: "rsv-small", text: fechaLarga(S.dia) }));
        var horas = h("div", { class: "rsv-hours", role: "group", "aria-label": "Horas disponibles" });
        S.dias[S.dia].forEach(function (hh) {
          var b = h("button", { type: "button", class: "rsv-hour" + (S.hora === hh ? " sel" : ""), "aria-pressed": S.hora === hh ? "true" : "false", text: hh });
          b.addEventListener("click", function () { S.hora = hh; a.next.disabled = false; err.textContent = ""; pintar(".rsv-hour.sel"); });
          horas.appendChild(b);
        });
        colHoras.appendChild(horas);
      } else colHoras.appendChild(h("p", { class: "rsv-info", text: "Selecciona una fecha primero." }));

      zona.appendChild(colCal); zona.appendChild(colHoras);
      if (S.dia && S.hora) zona.appendChild(h("p", { class: "rsv-sum", text: "Tu hora: " + fechaLarga(S.dia) + " a las " + S.hora + " · 30 minutos" }));
      if (foco) { var el = zona.querySelector(foco); if (el && !el.disabled) el.focus(); }
    }
    function cargar() {
      api("GET", "/reserva/horas?clinica=" + encodeURIComponent(S.clinica.id)).then(function (d) {
        if (!d.ok) { zona.textContent = ""; err.textContent = msg(d.error); if (d.error === "sesion_vencida") setTimeout(function () { go(0); }, 1200); return; }
        S.dias = d.dias || {};
        S.mes = null;
        if (S.dia && !S.dias[S.dia]) { S.dia = null; S.hora = null; }
        pintar();
      });
    }
    cargar();
    f.addEventListener("submit", function (ev) {
      ev.preventDefault(); err.textContent = "";
      if (!S.dia || !S.hora) return;
      ocupado(a.next, true, "Confirmando…");
      api("POST", "/reserva/confirmar", { clinica_id: S.clinica.id, fecha: S.dia, hora: S.hora, motivo: S.motivo }).then(function (d) {
        if (!d.ok) {
          ocupado(a.next, false, "Confirmar hora");
          err.textContent = msg(d.error);
          if (d.error === "hora_no_disponible") { S.hora = null; a.next.disabled = true; cargar(); }
          else if (d.error === "sesion_vencida") setTimeout(function () { go(0); }, 1200);
          return;
        }
        S.resultado = d; go(5);
      });
    });
  }

  /* ---------- 6. Confirmación ---------- */
  function paso5() {
    var d = S.resultado, c = d.cita;
    titulo("¡Tu hora quedó confirmada!", "Te enviamos los datos por WhatsApp y por correo.");
    body.appendChild(h("div", { class: "rsv-ficha" },
      h("p", null, h("b", { text: "Cuándo: " }), fechaLarga(c.fecha) + " a las " + c.hora),
      h("p", null, h("b", { text: "Dónde: " }), c.clinica + (c.direccion ? " — " + c.direccion : "")),
      h("p", null, h("b", { text: "Motivo: " }), c.motivo),
      h("p", null, h("b", { text: "Profesional: " }), c.profesional)));
    var avisos = [];
    if (!d.whatsapp_enviado) avisos.push("No pudimos enviar el WhatsApp ahora; revisa tu correo.");
    if (!d.correo_enviado) avisos.push("No pudimos enviar el correo ahora; guarda estos datos.");
    if (avisos.length) body.appendChild(h("p", { class: "rsv-warn", text: avisos.join(" ") }));
    body.appendChild(h("h3", { class: "rsv-h3", text: "Antes de tu atención: tu anamnesis" }));
    body.appendChild(h("p", { class: "rsv-sub", text: "Necesitamos que completes tu encuesta de salud (anamnesis) para abrir tu ficha clínica." }));
    body.appendChild(h("ol", { class: "rsv-steps" },
      h("li", null, "Ingresa a tu portal con tu RUT. Te enviaremos un código de acceso a tu correo registrado."),
      h("li", null, "Completa la encuesta de salud. Al terminar recibirás una copia en PDF.")));
    body.appendChild(h("div", { class: "rsv-actions rsv-col" },
      h("a", { class: "btn btn-cta", href: d.enlaces.portal, text: "Ir a mi portal" }),
      h("a", { class: "btn btn-ghost", href: d.enlaces.encuesta, text: "Completar mi anamnesis" }),
      h("button", { type: "button", class: "btn btn-ghost", text: "Cerrar", onclick: close })));
  }

  window.RMReserva = { open: open, close: close };

  /* Todos los enlaces y botones "Agendar hora" (href="#agenda") abren esta ventana */
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href='#agenda'],[data-agendar]");
    if (!a || e.defaultPrevented && !a.hasAttribute("data-agendar")) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    open(e);
  });
  if (location.hash === "#agenda") window.addEventListener("load", function () { open(); });
})();
