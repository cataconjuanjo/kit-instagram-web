/**
 * facturasIaMime.js — mapeo canónico de MIME → extensión para los
 * archivos subidos al flujo de "factura con IA".
 *
 * Fuente de verdad única para:
 *   - /api/facturas/extraer: validación del `file.type` entrante y
 *     extensión del objeto en Storage.
 *   - app/dashboard/bodega/FacturaIA.js: atributo `accept` del input.
 *
 * WebP se añade a la vez que la migración `add_facturas_bucket_webp`
 * del bucket `facturas-bodega`. Si el bucket aún no permite webp, la
 * subida devuelve un error de mime: el endpoint lo mapea a un 415
 * "Formato no admitido todavía" (nunca a un 500 genérico).
 */

export const MIME_FACTURA_IA = Object.freeze({
  'application/pdf': { ext: 'pdf',  tipo: 'documento' },
  'image/png':       { ext: 'png',  tipo: 'imagen'    },
  'image/jpeg':      { ext: 'jpg',  tipo: 'imagen'    },
  'image/webp':      { ext: 'webp', tipo: 'imagen'    },
})

export const ALLOWED_MIME_FACTURA_IA = new Set(Object.keys(MIME_FACTURA_IA))

/** Cadena `accept` del input <file> en orden estable. */
export const ACCEPT_FACTURA_IA = Object.keys(MIME_FACTURA_IA).join(',')

/** Devuelve la extensión canónica (minúsculas, sin punto) o 'bin' si no mapea. */
export function extensionPorMime(mime) {
  const m = (typeof mime === 'string') ? mime.toLowerCase() : ''
  return MIME_FACTURA_IA[m]?.ext || 'bin'
}

/** true si es imagen (png/jpeg/webp), false si es PDF o desconocido. */
export function esImagen(mime) {
  const m = (typeof mime === 'string') ? mime.toLowerCase() : ''
  return MIME_FACTURA_IA[m]?.tipo === 'imagen'
}

/**
 * `true` cuando el error que devuelve Supabase Storage al subir
 * corresponde a un MIME no permitido por el bucket (p. ej. webp antes
 * de aplicar la migración). Sirve para que el endpoint responda 415
 * amistoso en lugar de un 500 genérico.
 */
export function esErrorMimeStorage(err) {
  if (!err) return false
  const msg = String(err.message || err.error || '').toLowerCase()
  if (!msg) return false
  return msg.includes('mime') || msg.includes('not allowed') || msg.includes('invalid_mime_type')
}
