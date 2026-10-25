// segunda-opinion-route.js
// Rutas para server.js:
//   POST /segunda-opinion/login   -> valida RUT + clave contra la tabla `profesionales` (MySQL) y entrega un token (8 h)
//   POST /segunda-opinion/enviar  -> con token válido, envía el PDF al paciente (y copia oculta al respaldo)
//
// Instalar (una vez):  npm i bcryptjs jsonwebtoken
// Variables en .env:
//   BACKUP_EMAIL=respaldo@tu-dominio.cl
//   SEGUNDA_OPINION_JWT_SECRET=una-frase-larga-y-distinta   (si no existe, usa JWT_SECRET)
//   SEGUNDA_OPINION_ORIGINS=https://rmdental.cl
//
// Uso en server.js (ANTES de cualquier app.use(express.json()) global, o súbele el límite ahí):
//   const segundaOpinion = require('./segunda-opinion-route');
//   segundaOpinion(app, transporter, '"Red Metropolitana Dental" <tu-correo>', pool);
//   // `pool` = pool de mysql2/promise (el mismo con que consultas la base rmdental)

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function normalizarRut(v) {
  v = String(v || '').replace(/[^0-9kK]/g, '').toUpperCase();
  return v.length < 2 ? '' : v.slice(0, -1) + '-' + v.slice(-1);
}
function rutOk(r) {
  const m = /^(\d{7,8})-([\dK])$/.exec(r); if (!m) return false;
  let s = 0, f = 2;
  for (let i = m[1].length - 1; i >= 0; i--) { s += f * +m[1][i]; f = f === 7 ? 2 : f + 1; }
  const d = 11 - (s % 11);
  return (d === 11 ? '0' : d === 10 ? 'K' : String(d)) === m[2];
}

module.exports = function (app, transporter, from, pool) {
  const BASE = '/segunda-opinion';
  const SECRET = process.env.SEGUNDA_OPINION_JWT_SECRET || process.env.JWT_SECRET;
  const origenes = (process.env.SEGUNDA_OPINION_ORIGINS || 'https://rmdental.cl').split(',').map(s => s.trim());
  const DUMMY = bcrypt.hashSync('no-existe', 10);

  // Freno a intentos de adivinar claves: 5 fallos por RUT+IP -> 15 min bloqueado
  const intentos = new Map();
  const bloqueado = k => {
    const i = intentos.get(k); if (!i) return false;
    if (Date.now() > i.hasta) { intentos.delete(k); return false; }
    return i.n >= 5;
  };
  const fallo = k => { const i = intentos.get(k) || { n: 0 }; i.n++; i.hasta = Date.now() + 15 * 60 * 1000; intentos.set(k, i); };

  // CORS solo para estas rutas
  app.use(BASE, (req, res, next) => {
    const o = req.headers.origin;
    if (o && origenes.includes(o)) {
      res.setHeader('Access-Control-Allow-Origin', o);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // --- Login ---
  app.post(BASE + '/login', express.json({ limit: '10kb' }), async (req, res) => {
    try {
      if (!SECRET) return res.status(500).json({ error: 'Servidor sin configurar' });
      const rut = normalizarRut(req.body && req.body.rut);
      const clave = String((req.body && req.body.clave) || '');
      const ip = req.get('CF-Connecting-IP') || req.ip;
      const k = rut + '|' + ip;

      if (bloqueado(k)) return res.status(429).json({ error: 'Demasiados intentos. Espere 15 minutos.' });
      if (!rutOk(rut) || !clave) return res.status(401).json({ error: 'RUT o clave incorrectos' });

      const [rows] = await pool.query(
        'SELECT id, rut, nombre, especialidad, clinica, comuna, telefono, correo, clave_hash FROM profesionales WHERE rut = ? AND activo = 1 LIMIT 1',
        [rut]
      );
      const p = rows[0];
      const ok = await bcrypt.compare(clave, p ? p.clave_hash : DUMMY); // siempre compara: tiempos parejos
      if (!p || !ok) { fallo(k); return res.status(401).json({ error: 'RUT o clave incorrectos' }); }

      intentos.delete(k);
      const token = jwt.sign({ pid: p.id, scope: 'segunda-opinion' }, SECRET, { expiresIn: '8h' });
      const { clave_hash, id, ...perfil } = p;
      res.json({ token, profesional: perfil });
    } catch (err) {
      console.error('segunda-opinion/login:', err);
      res.status(500).json({ error: 'Error del servidor' });
    }
  });

  // --- Verifica token y que el profesional siga activo (antes de leer el cuerpo grande) ---
  async function auth(req, res, next) {
    try {
      const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
      if (!m || !SECRET) return res.status(401).json({ error: 'No autorizado' });
      const d = jwt.verify(m[1], SECRET);
      if (d.scope !== 'segunda-opinion') return res.status(401).json({ error: 'No autorizado' });
      const [rows] = await pool.query('SELECT nombre FROM profesionales WHERE id = ? AND activo = 1', [d.pid]);
      if (!rows[0]) return res.status(401).json({ error: 'No autorizado' });
      req.profesional = rows[0];
      next();
    } catch (e) {
      res.status(401).json({ error: 'No autorizado' });
    }
  }

  // --- Envío ---
  app.post(BASE + '/enviar', auth, express.json({ limit: '12mb' }), async (req, res) => {
    try {
      if (!process.env.BACKUP_EMAIL) return res.status(500).json({ error: 'Servidor sin configurar' });
      const { caso, paciente, correoPaciente, correoEspecialista, pdfBase64 } = req.body || {};
      if (!EMAIL_RE.test(correoPaciente || '')) return res.status(400).json({ error: 'Correo del paciente inválido' });
      if (!caso || !paciente || !pdfBase64) return res.status(400).json({ error: 'Faltan datos' });

      const pdf = Buffer.from(pdfBase64, 'base64');
      if (pdf.length < 1000 || pdf.slice(0, 4).toString() !== '%PDF') return res.status(400).json({ error: 'PDF inválido' });

      const especialista = req.profesional.nombre; // viene de la base de datos, no del formulario
      await transporter.sendMail({
        from,
        to: correoPaciente,
        cc: EMAIL_RE.test(correoEspecialista || '') ? correoEspecialista : undefined,
        bcc: process.env.BACKUP_EMAIL,
        subject: `Su segunda opinión odontológica · ${caso}`,
        text: `Hola ${paciente},\n\nAdjuntamos su segunda opinión odontológica (caso ${caso}), emitida por ${especialista}.\n\nRed Metropolitana Dental · Una red de profesionales, una segunda mirada.`,
        html: `<p>Hola ${esc(paciente)},</p>
               <p>Adjuntamos su segunda opinión odontológica (caso <b>${esc(caso)}</b>), emitida por ${esc(especialista)}.</p>
               <p style="color:#6b7f8c">Red Metropolitana Dental · Una red de profesionales, una segunda mirada.</p>`,
        attachments: [{ filename: `Segunda_Opinion_${caso}.pdf`, content: pdf, contentType: 'application/pdf' }]
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('segunda-opinion/enviar:', err);
      res.status(500).json({ error: 'No se pudo enviar el correo' });
    }
  });
};
