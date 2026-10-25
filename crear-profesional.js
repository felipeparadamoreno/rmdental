// crear-profesional.js
// Crea (o actualiza la clave/datos de) un profesional. Ejecutar en la carpeta del servidor:
//   npm i bcryptjs        (una sola vez)
//   node crear-profesional.js 12345678-9 "Dra. Ana Pérez" "Endodoncia" ana@correo.cl "ClaveSegura123"
// Opcionales al final: "Clínica" "Comuna" "Teléfono"

require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

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

(async () => {
  const [rutIn, nombre, especialidad, correo, clave, clinica, comuna, telefono] = process.argv.slice(2);
  const rut = normalizarRut(rutIn);
  if (!rutOk(rut)) { console.error('RUT inválido:', rutIn); process.exit(1); }
  if (!nombre || !clave) { console.error('Uso: node crear-profesional.js RUT "Nombre" "Especialidad" correo "Clave" ["Clínica" "Comuna" "Teléfono"]'); process.exit(1); }
  if (clave.length < 8) { console.error('La clave debe tener al menos 8 caracteres.'); process.exit(1); }

  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'rmdental_app',
    password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'rmdental'
  });
  const hash = await bcrypt.hash(clave, 10);
  await db.query(
    `INSERT INTO profesionales (rut, nombre, especialidad, correo, clinica, comuna, telefono, clave_hash)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), especialidad=VALUES(especialidad), correo=VALUES(correo),
       clinica=VALUES(clinica), comuna=VALUES(comuna), telefono=VALUES(telefono), clave_hash=VALUES(clave_hash), activo=1`,
    [rut, nombre, especialidad || null, correo || null, clinica || null, comuna || null, telefono || null, hash]
  );
  console.log('Listo:', rut, '-', nombre);
  await db.end();
})().catch(e => { console.error(e.message); process.exit(1); });
