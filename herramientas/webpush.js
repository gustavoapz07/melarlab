// Uso: node herramientas/webpush.js
// Prueba el cifrado y la firma de los avisos (supabase/functions/avisos/webpush.ts) sin red y sin navegador:
// el ejemplo del RFC 8291 byte por byte, que un celular cualquiera pueda descifrar el mensaje (descifrado
// aparte, con node:crypto), la firma VAPID, las llaves nuevas y la lista de servicios de push permitidos.
const crypto = require('crypto');
const path = require('path');
const { pathToFileURL } = require('url');

// webpush.ts es un módulo ES sin package.json propio: Node lo reconoce solo y avisa. Ese aviso no es una falla.
process.removeAllListeners('warning');
process.on('warning', (w) => { if (w.code !== 'MODULE_TYPELESS_PACKAGE_JSON') console.warn(w); });

let fallas = 0;
const revisar = (ok, texto, detalle = '') => {
  console.log(`${ok ? 'ok   ' : 'FALLA'} ${texto}${detalle ? ': ' + detalle : ''}`);
  if (!ok) fallas++;
};
const b64u = (s) => Buffer.from(s.replace(/\s/g, ''), 'base64url');
const lanza = async (fn) => { try { await fn(); return false; } catch { return true; } };

/** Descifra como lo haría el celular (RFC 8291), con node:crypto y no con WebCrypto, para no repetir el código probado. */
function descifrar(cuerpo, privadaDelCelular, publicaDelCelular, secreto) {
  const sal = cuerpo.subarray(0, 16);
  const tamano = cuerpo.readUInt32BE(16);
  const largo = cuerpo[20];
  const publicaDelServidor = cuerpo.subarray(21, 21 + largo);
  const cifrado = cuerpo.subarray(21 + largo);
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(privadaDelCelular);
  const compartido = ecdh.computeSecret(publicaDelServidor);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), publicaDelCelular, publicaDelServidor]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', compartido, secreto, info, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(cifrado.subarray(cifrado.length - 16));
  const claro = Buffer.concat([d.update(cifrado.subarray(0, cifrado.length - 16)), d.final()]);
  const fin = claro.lastIndexOf(2);
  return { tamano, mensaje: claro.subarray(0, fin), relleno: claro.subarray(fin + 1) };
}

(async () => {
  const wp = await import(pathToFileURL(path.join(__dirname, '..', 'supabase', 'functions', 'avisos', 'webpush.ts')).href);

  // 1. El ejemplo del RFC 8291 (sección 5 y apéndice A), con su sal y sus llaves fijas.
  const rfc = {
    mensaje: b64u('V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24'),
    asPublica: b64u('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIg Dll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'),
    asPrivada: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
    uaPublica: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    uaPrivada: b64u('q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94'),
    sal: b64u('DGv6ra1nlYgDCS1FRnbzlw'),
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
    encabezado: b64u('DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z 9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml mlMoZIIgDll6e3vCYLocInmYWAmS6Tlz AC8wEqKK6PBru3jl7A8'),
    cifrado: b64u('8pfeW0KbunFT06SuDKoJH9Ql87S1QUrd irN6GcG7sFz1y1sqLgVi1VhjVkHsUoEs bI_0LpXMuGvnzQ'),
  };
  const deRfc = Buffer.from(await wp.cifrar(rfc.mensaje, { p256dh: rfc.uaPublica, auth: rfc.auth },
    { sal: rfc.sal, publica: rfc.asPublica, privada: rfc.asPrivada }));
  const esperado = Buffer.concat([rfc.encabezado, rfc.cifrado]);
  revisar(deRfc.equals(esperado), 'el ejemplo del RFC 8291 sale byte por byte igual', `${deRfc.length} de ${esperado.length} bytes`);
  const vuelta = descifrar(deRfc, rfc.uaPrivada, b64u(rfc.uaPublica), b64u(rfc.auth));
  revisar(vuelta.mensaje.equals(rfc.mensaje), 'y se descifra con la llave del celular del RFC', vuelta.mensaje.toString());

  // 2. Con llaves nuevas: un celular cualquiera descifra el aviso.
  const celular = crypto.createECDH('prime256v1');
  celular.generateKeys();
  const secreto = crypto.randomBytes(16);
  const suscripcion = { endpoint: 'https://fcm.googleapis.com/fcm/send/prueba', p256dh: celular.getPublicKey().toString('base64url'), auth: secreto.toString('base64url') };
  const aviso = { titulo: 'Mi Día', texto: 'El calendario amanece en blanco, Gustavo. ñ á ✓', url: '/' };
  const cuerpo = Buffer.from(await wp.cifrar(new TextEncoder().encode(JSON.stringify(aviso)), suscripcion));
  const leido = descifrar(cuerpo, celular.getPrivateKey(), celular.getPublicKey(), secreto);
  revisar(JSON.parse(leido.mensaje.toString('utf8')).texto === aviso.texto, 'un celular cualquiera descifra el aviso, con tildes y símbolos');
  revisar(leido.tamano === 4096 && cuerpo[20] === 65 && leido.relleno.length === 0, 'encabezado: registro de 4096 y llave de 65 bytes, sin relleno');
  const otro = Buffer.from(await wp.cifrar(new TextEncoder().encode(JSON.stringify(aviso)), suscripcion));
  revisar(!otro.subarray(0, 16).equals(cuerpo.subarray(0, 16)) && !otro.subarray(21, 86).equals(cuerpo.subarray(21, 86)),
    'cada aviso lleva sal y llave de un solo uso nuevas');
  const ajeno = crypto.createECDH('prime256v1');
  ajeno.generateKeys();
  revisar(await lanza(() => descifrar(cuerpo, ajeno.getPrivateKey(), celular.getPublicKey(), secreto)), 'otro celular no lo descifra');

  // 3. Mensajes y suscripciones que no sirven.
  revisar(await lanza(() => wp.cifrar(new Uint8Array(4096 - 16), suscripcion)), 'un mensaje que no cabe en un registro se rechaza');
  revisar(!(await lanza(() => wp.cifrar(new Uint8Array(4096 - 17), suscripcion))), 'el más largo que cabe (4079 bytes) se acepta');
  revisar(await lanza(() => wp.cifrar(new Uint8Array(3), { ...suscripcion, p256dh: suscripcion.p256dh.slice(4) })), 'una llave del celular incompleta se rechaza');
  revisar(await lanza(() => wp.cifrar(new Uint8Array(3), { ...suscripcion, auth: 'corto' })), 'un secreto del celular incompleto se rechaza');

  // 4. Llaves VAPID nuevas y la firma.
  const llaves = await wp.crearLlavesVapid();
  const publica = b64u(llaves.publica);
  revisar(publica.length === 65 && publica[0] === 4 && b64u(llaves.privada).length === 32, 'llaves VAPID nuevas: pública de 65 bytes y privada de 32');
  const ahora = Date.UTC(2026, 9, 2, 12, 0, 0);
  const cabecera = await wp.autorizacionVapid('https://fcm.googleapis.com/fcm/send/abc', llaves, 'https://melarlab.pages.dev', ahora);
  const [, jwt, k] = cabecera.match(/^vapid t=([^,]+), k=(\S+)$/) || [];
  revisar(Boolean(jwt) && k === llaves.publica, 'cabecera "vapid t=…, k=…" con la llave pública');
  const [h, p, f] = (jwt || '..').split('.');
  const encabezadoJwt = JSON.parse(Buffer.from(h, 'base64url'));
  const datosJwt = JSON.parse(Buffer.from(p, 'base64url'));
  revisar(encabezadoJwt.alg === 'ES256' && encabezadoJwt.typ === 'JWT', 'el JWT es ES256');
  revisar(datosJwt.aud === 'https://fcm.googleapis.com' && datosJwt.sub === 'https://melarlab.pages.dev' && datosJwt.exp === ahora / 1000 + 12 * 3600,
    'audiencia: el servicio de push; contacto: la app; vence en 12 horas', JSON.stringify(datosJwt));
  const llavePublica = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: publica.subarray(1, 33).toString('base64url'), y: publica.subarray(33).toString('base64url') }, format: 'jwk' });
  const firmaBien = crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key: llavePublica, dsaEncoding: 'ieee-p1363' }, Buffer.from(f, 'base64url'));
  revisar(firmaBien, 'la firma se verifica con la llave pública (node:crypto)');
  const datosCambiados = Buffer.from(JSON.stringify({ ...datosJwt, aud: 'https://otro.example' })).toString('base64url');
  revisar(!crypto.verify('sha256', Buffer.from(`${h}.${datosCambiados}`), { key: llavePublica, dsaEncoding: 'ieee-p1363' }, Buffer.from(f, 'base64url')),
    'con los datos cambiados, la firma ya no vale');
  const apple = await wp.autorizacionVapid('https://web.push.apple.com/QGu…', llaves, 'https://melarlab.pages.dev', ahora);
  revisar(JSON.parse(Buffer.from(apple.split(' t=')[1].split('.')[1], 'base64url')).aud === 'https://web.push.apple.com', 'para iPhone, la audiencia es el servicio de Apple');

  // 5. Solo se manda a los servicios de push de los navegadores.
  const permitidos = ['https://fcm.googleapis.com/fcm/send/x', 'https://web.push.apple.com/x', 'https://updates.push.services.mozilla.com/wpush/v2/x',
    'https://wns2-bl2p.notify.windows.com/w/?token=x'];
  const rechazados = ['http://fcm.googleapis.com/fcm/send/x', 'https://fcm.googleapis.com.ejemplo.com/x', 'https://ejemplo.com/push', 'https://localhost/x',
    'https://xvmezwvpmveruhfurkxf.supabase.co/rest/v1/', 'https://push.apple.com.ejemplo.com/x', 'javascript:alert(1)'];
  revisar(permitidos.every((u) => wp.SERVICIOS_DE_PUSH.test(u)), 'acepta FCM, Apple, Mozilla y Windows');
  const colados = rechazados.filter((u) => wp.SERVICIOS_DE_PUSH.test(u));
  revisar(colados.length === 0, 'rechaza http, dominios parecidos y cualquier otro sitio', colados.join(', '));
  revisar(await lanza(() => wp.enviar({ ...suscripcion, endpoint: 'https://ejemplo.com/push' }, aviso, llaves, 'https://melarlab.pages.dev')),
    'enviar() no sale a una dirección que no es un servicio de push');

  console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo en orden');
  process.exit(fallas ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
