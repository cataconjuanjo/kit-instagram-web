// ---------------------------------------------------------------------------
// splitZonaTipo — separa el campo region "ZONA · tipo"
// ---------------------------------------------------------------------------

const SEPS_ZONA_TIPO = [' · ', ' / ', ' - ']

/**
 * Separa el campo region combinado en { zona, tipo }.
 * Tipo queda con primera letra mayúscula.
 * Si no hay separador, todo va a zona y tipo es cadena vacía.
 *
 * Caso especial: separador " - " con parte izquierda de solo dígitos
 * (ej. "7 - EMILIA ROMAGNA") → la zona real es la parte derecha
 * y el número se descarta (es un código de catálogo del proveedor).
 */
export function splitZonaTipo(region) {
  if (!region) return { zona: '', tipo: '', revisarAnada: false }

  const sep = SEPS_ZONA_TIPO.find(s => region.includes(s))
  if (!sep) return { zona: region.trim(), tipo: '', revisarAnada: false }

  const idx = region.indexOf(sep)
  const izquierda = region.slice(0, idx).trim()
  const derecha   = region.slice(idx + sep.length).trim()

  // "N - NOMBRE_REGIÓN": el número es un índice de catálogo del proveedor,
  // no una zona real. La zona real es la parte derecha; tipo queda vacío.
  if (sep === ' - ' && /^\d+$/.test(izquierda)) {
    return { zona: derecha, tipo: '', revisarAnada: false }
  }

  // Derecha es un año de 4 dígitos (1900-2099): posible añada, no tipo de vino
  if (/^(19|20)\d{2}$/.test(derecha)) {
    return { zona: izquierda, tipo: '', revisarAnada: true }
  }

  const tipo = derecha
    ? derecha.charAt(0).toUpperCase() + derecha.slice(1)
    : ''

  return { zona: izquierda, tipo, revisarAnada: false }
}

/** Predicados de sospecha: si alguno es true → marcar REVISAR_ZONA */
const PREDICADOS_SOSPECHA_ZONA = [
  z => z.length > 40,
  z => z.length > 0 && !/[A-ZÁÉÍÓÚÑ]/u.test(z),   // sin ninguna mayúscula → eslogan / nota
  z => /^\d+\s*[-–]\s*\S/.test(z),                  // "7 - EMILIA ROMAGNA" sin corregir
  z => /\b(elaborado|criado|producido|viñedos?\s+de|finca\s+de)\b/i.test(z),
  z => /^\d+$/.test(z.trim()),                       // solo dígitos residuales
]

/**
 * Devuelve true si el valor de zona extraído parece sospechoso
 * y debe revisarse manualmente en lugar de aplicarse automáticamente.
 */
export function sospechaZona(zona) {
  if (!zona) return false
  return PREDICADOS_SOSPECHA_ZONA.some(fn => fn(zona))
}

// ---------------------------------------------------------------------------
// splitFormato — descompone el campo formato en columnas fijas
// ---------------------------------------------------------------------------

const RE_TAMANO_VOL    = /\d+[,.]?\d*\s*(cl|ml|l\b|litros?)/i
const RE_TAMANO_NOMBRE = /^(magnum|jeroboam|doble\s+magnum|imperial|mathusalem|rehoboam|balthazar|nebuchadnezzar)\b/i

// Unidades convencionales: "caja 6", "6 uds", "6 botellas", "x6"
const RE_UNIDADES = /^(?:caja\s+)?(\d+)\s*(uds?|unidades?|bot\.?|botellas?)$|^caja\s+(\d+)$|^x\s*(\d+)$/i

// Patrón "N u/c [CÓDIGO]" (Exclusivas Soto):
// "3 u/c Mad", "6 u/c Est"  — solo almacenes de una sola palabra sin puntos
const RE_UC = /^(\d+)\s+u\/c(?:\s+([A-Za-z]\w*))?$/i

// Patrón "<grado>º<unidades> u/c [ALMACÉN]" (Soto con graduación pegada):
// "19º6 u/c", "19,5º6 u/c Est", "40º1 u/c", "15º6 u/c"
const RE_GRADO_UC = /^(\d+[,.]?\d*)º(\d+)\s+u\/c(?:\s+([A-Za-z]\w*))?$/i

// Referencia alfanumérica del proveedor: sin espacios, mínimo 2 chars
const RE_REF = /^[A-Z0-9][A-Z0-9/_-]{1,}$/i

// Dígito suelto: solo un número sin ninguna palabra clave
const RE_DIGITO_SOLO = /^\d+$/

/**
 * Descompone el campo formato en columnas fijas.
 * Nunca posicional — siempre por patrón de contenido.
 *
 * @param {string} formato
 * @returns {{
 *   tamanyo: string,                 // "75 cl", "magnum", "doble magnum 300 cl"
 *   unidades_por_caja: number|null,
 *   referencia_proveedor: string,    // código SKU del proveedor
 *   almacen_proveedor: string,       // código del patrón "N u/c CÓDIGO" (ej. "Mad", "Est")
 *   graduacion: string,              // grado alcohólico del patrón "Nº" (ej. "19°", "19.5°")
 *   revisar: boolean,
 *   revisarMsg: string,              // descripción del motivo de revisión (para el CSV)
 * }}
 */
export function splitFormato(formato) {
  const vacio = {
    tamanyo: '',
    unidades_por_caja: null,
    referencia_proveedor: '',
    almacen_proveedor: '',
    graduacion: '',
    revisar: false,
    revisarMsg: '',
  }
  if (!formato) return vacio

  const partes = formato.split(/\s*[·•|]\s*/).map(p => p.trim()).filter(Boolean)

  let tamanyo = ''
  let unidades_por_caja = null
  let referencia_proveedor = ''
  let almacen_proveedor = ''
  let graduacion = ''
  let revisar = false
  const sinAsignar = []

  for (const parte of partes) {
    // Tamaño con unidad volumétrica: "75 cl", "0.75 L", "150cl", "doble magnum 300 cl"
    if (RE_TAMANO_VOL.test(parte) || RE_TAMANO_NOMBRE.test(parte)) {
      if (!tamanyo) tamanyo = parte
      continue
    }

    // Patrón "<grado>º<unidades> u/c [almacén]": "19º6 u/c", "19,5º6 u/c Est"
    const gradoMatch = parte.match(RE_GRADO_UC)
    if (gradoMatch) {
      const gradoVal = gradoMatch[1].replace(',', '.')
      if (!graduacion) graduacion = `${gradoVal}°`
      if (unidades_por_caja === null) unidades_por_caja = parseInt(gradoMatch[2], 10)
      if (gradoMatch[3]) {
        almacen_proveedor = gradoMatch[3]
        revisar = true  // código de almacén ambiguo
      }
      continue
    }

    // Patrón "N u/c [ALMACEN]": "3 u/c Mad", "6 u/c Est"
    const ucMatch = parte.match(RE_UC)
    if (ucMatch) {
      if (unidades_por_caja === null) unidades_por_caja = parseInt(ucMatch[1], 10)
      if (ucMatch[2]) {
        almacen_proveedor = ucMatch[2]
        revisar = true
      }
      continue
    }

    // Unidades por caja convencionales: "caja 6", "6 uds", "x12"
    const udMatch = parte.match(RE_UNIDADES)
    if (udMatch) {
      const n = udMatch[1] ?? udMatch[3] ?? udMatch[4]
      if (unidades_por_caja === null) unidades_por_caja = parseInt(n, 10)
      continue
    }

    // Referencia del proveedor: código alfanumérico sin espacios
    if (RE_REF.test(parte)) {
      if (!referencia_proveedor) referencia_proveedor = parte
      continue
    }

    sinAsignar.push(parte)
  }

  // Si tamanyo vacío y sobran fragmentos sin clasificar, el primero es probablemente tamaño
  if (!tamanyo && sinAsignar.length) tamanyo = sinAsignar.shift()

  // Construir mensaje de revisión
  let revisarMsg = ''

  if (sinAsignar.length) {
    revisar = true
    // Detectar dígitos sueltos para dar pista rápida en el CSV
    const digitosSolos = sinAsignar.filter(p => RE_DIGITO_SOLO.test(p))
    const otros = sinAsignar.filter(p => !RE_DIGITO_SOLO.test(p))

    const partes_msg = []
    if (digitosSolos.length) {
      partes_msg.push(`posible unidades=${digitosSolos.join(',')}`)
    }
    if (otros.length) {
      partes_msg.push(`sin clasificar: "${otros.join(' | ')}"`)
    }
    revisarMsg = partes_msg.join('; ')
  }

  // El código de almacén se marca como revisar sin mensaje adicional
  if (revisar && !revisarMsg) revisarMsg = 'código almacén ambiguo'

  return { tamanyo, unidades_por_caja, referencia_proveedor, almacen_proveedor, graduacion, revisar, revisarMsg }
}
