/**
 * Builder server-safe (sin 'use client') que convierte una spec de
 * excelSomm.js / informeEconomicoExcel.js en un Buffer .xlsx real
 * usando ExcelJS. NO toca DOM ni URL.createObjectURL: eso vive en
 * `excelSommDownload.js` (cliente).
 *
 * Se añadió en Fase E para que los tests estructurales puedan
 * generar y re-leer el XLSX sin instanciar un navegador.
 */
import {
  aplicarHeaderFooter,
  cargarLogoBuffer,
  construirHojaConBranding,
  leerDimensionesPng,
} from './excelEstilos.js'
import { getIsotipoBuffer } from './isotipoBase64.js'

/**
 * Construye el workbook y devuelve el Buffer binario del .xlsx.
 * Si `spec` está vacío o sin hojas, devuelve null (el cliente también
 * evitaría disparar la descarga en ese caso).
 */
export async function construirXlsxBuffer(spec) {
  if (!spec || !spec.sheets || spec.sheets.length === 0) return null
  const ExcelJS = (await import('exceljs')).default

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Carta Viva'
  wb.created = new Date()

  // En navegador se intenta fetchear /brand/carta-viva/isotipo.png
  // (comportamiento original). En Node (p. ej. tests o worker server),
  // `fetch` no existe en esa ruta → cae al fallback base64 embebido
  // (el mismo que usa el PDF desde la fase B del isotipo).
  let logoBuffer = await cargarLogoBuffer().catch(() => null)
  if (!logoBuffer) {
    try { logoBuffer = getIsotipoBuffer() } catch { logoBuffer = null }
  }
  const logoImageId = (logoBuffer && typeof wb.addImage === 'function')
    ? wb.addImage({ buffer: logoBuffer, extension: 'png' })
    : null
  const logoDims = logoBuffer ? leerDimensionesPng(logoBuffer) : null

  const restauranteNombre = spec.restauranteNombre || ''
  const periodo           = spec.periodo           || ''

  for (const sheet of spec.sheets) {
    const ws = wb.addWorksheet(sheet.name)
    construirHojaConBranding(ws, sheet, {
      logoImageId,
      logoDims,
      restauranteNombre,
      periodo,
    })
  }

  try {
    aplicarHeaderFooter(wb, { restauranteNombre, periodo })
  } catch { /* ignore */ }

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
}
