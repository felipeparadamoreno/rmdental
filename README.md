# RM Dental · sitio web

Sitio estático (HTML) listo para GitHub Pages.

## Páginas
- `/` página principal
- `/mantencion-implantes.html` landing de mantención de implantes
- `/mejora-presupuesto.html` landing de mejora de presupuesto
- `/profesionales.html` landing para profesionales
- `/controles-infantiles.html` landing de controles dentales infantiles
- `/cambio-amalgamas.html` landing para agendar evaluación de cambio de amalgamas por resinas (usa `og-cambio-amalgamas.jpg` como imagen para compartir)

## Publicar en GitHub Pages
1. Sube todo el contenido de esta carpeta a un repositorio público.
2. Settings → Pages → Deploy from a branch → `main` / `(root)`.
3. Si todavía no tienes el dominio `rmdental.cl` conectado, borra el archivo `CNAME`.
   Si lo tienes, apunta los DNS a GitHub y activa *Enforce HTTPS*.

## Pendiente antes de publicar
- Reemplazar la dirección, los horarios y el teléfono de ejemplo por los reales.
- Revisar el currículum y las frases de los profesionales (son de ejemplo).
- Confirmar autorización de la foto de la niña.
- Confirmar que la foto antes/después de `cambio-amalgamas.html` es de un caso real y que el paciente autorizó su uso; si no lo es, mantener el texto "Ejemplo de restauración".
- Revisar con el equipo clínico los textos de `cambio-amalgamas.html` (aislación del diente, anestesia local, preguntas frecuentes) y agregar el valor si quieren publicarlo.
- FormSubmit ya está conectado: tras publicar, envía una solicitud de prueba desde el sitio y **activa el servicio** con el correo de confirmación que llegará a contacto@rmdental.cl (revisa también spam).
- Agregar una imagen para compartir (`og:image`).

## Selector de horas en las landings
`agenda.js` y `agenda.css` (compartidos) muestran día → franja (Mañana/Mediodía/Tarde) → hora en las landings de implantes, profesionales, controles infantiles y amalgamas. Usan los mismos horarios, anticipación y calendario que `index.html`; si cambias horarios o `CAL_URL`, ajusta también `agenda.js`. Suben ambos archivos junto con los `.html`.

## Google Calendar
Las horas ocupadas se leen de tu calendario con `calendario-rm-dental.gs` (se instala en script.google.com, aparte del sitio). Pega la URL `/exec` en `CAL_URL` dentro de `index.html`. Sin esa URL, todas las horas aparecen libres.

## Panel de administración (solo local)
`panel-admin/` contiene `admin.js` y `admin.html`, el panel para gestionar pacientes, citas, tratamientos y radiografías. **No es parte del sitio público: no lo subas a GitHub.** Cópialos a la carpeta de la API (donde están `server.js` y el `.env`), agrega `ADMIN_PASS` al `.env` y ejecuta `node admin.js` (o `pm2 start admin.js --name rmdental-admin`). Se abre en `http://localhost:3100` y no debe agregarse al túnel de Cloudflare.
