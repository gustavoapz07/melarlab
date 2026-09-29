// Uso: node herramientas/iconos.js
// Dibuja el ícono de MelarLab (el hexágono: la celda y la miel guardada adentro) y genera
// en app/public el favicon SVG y los PNG que piden Android, iPhone y el manifiesto de la app.
// Si Chromium no está donde lo espera Playwright, indica la ruta con CHROMIUM_PATH.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const FONDO = '#0a0a0a';
const TINTA = '#ffffff';
const destino = path.join(__dirname, '..', 'app', 'public');

// Hexágono con un vértice arriba, en un lienzo de 512.
function hexagono(r) {
  const p = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    p.push(`${(256 + r * Math.cos(a)).toFixed(1)} ${(256 + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${p.join(' L')}Z`;
}

// Mismas proporciones que la marca de la app (src/mi-dia/MiDia.tsx): anillo de 0,225 R y celda interna de 0,42 R.
// Con R = 160 el dibujo queda dentro de la zona segura de los íconos adaptables de Android (círculo de 0,4 del lado).
function svg({ esquinas }) {
  const r = 160;
  const fondo = esquinas
    ? `<rect width="512" height="512" rx="${esquinas}" fill="${FONDO}"/>`
    : `<rect width="512" height="512" fill="${FONDO}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${fondo}` +
    `<path d="${hexagono(r)}" fill="none" stroke="${TINTA}" stroke-width="${(r * 0.225).toFixed(0)}" stroke-linejoin="miter"/>` +
    `<path d="${hexagono(r * 0.42)}" fill="${TINTA}"/></svg>`;
}

const ICONOS = [
  // [archivo, lado, esquinas redondeadas]
  ['pwa-192x192.png', 192, 112],
  ['pwa-512x512.png', 512, 112],
  ['maskable-icon-512x512.png', 512, 0], // Android recorta la forma
  ['apple-touch-icon-180x180.png', 180, 0], // iPhone redondea solo y no acepta transparencia
];

(async () => {
  fs.mkdirSync(destino, { recursive: true });
  fs.writeFileSync(path.join(destino, 'favicon.svg'), svg({ esquinas: 112 }) + '\n');
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const [archivo, lado, esquinas] of ICONOS) {
    const p = await b.newPage({ viewport: { width: lado, height: lado } });
    const marca = svg({ esquinas }).replace('<svg ', `<svg width="${lado}" height="${lado}" `);
    await p.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${marca}</body></html>`);
    await p.screenshot({ path: path.join(destino, archivo), omitBackground: true, clip: { x: 0, y: 0, width: lado, height: lado } });
    await p.close();
    console.log('ok', archivo);
  }
  await b.close();
})();
