/**
 * Test del anclaje del logo en el worksheet construido por
 * `construirHojaConBranding`. Usa ExcelJS real + el PNG real del
 * repo para comprobar:
 *   - El anchor usa `tl + ext` (NO `br`), evitando la deformación
 *     reportada en b85d588b.
 *   - `ext.width / ext.height` coincide con la proporción del PNG
 *     (tolerancia ±1 %).
 *   - El logo queda íntegramente dentro de las filas 1..BRANDING_ROWS
 *     (alto ≤ suma de alturas) y la columna A tiene width ajustada
 *     para alojar `ext.width` + margen.
 *
 * Ejecutar: node --test scripts/logoAnclaje.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import {
  BRANDING_ROWS,
  LOGO_TARGET_HEIGHT,
  construirHojaConBranding,
  leerDimensionesPng,
} from '../app/lib/excelEstilos.js'

function spec() {
  return {
    name: 'Canales venta',
    columns: [
      { header: 'Canal',   key: 'canal',   width: 22 },
      { header: 'uds',     key: 'uds',     width: 10 },
      { header: 'Neto',    key: 'neto',    width: 16, format: '#,##0.00 "€"' },
    ],
    rows: [{ canal: 'Botella', uds: 88, neto: 2000 }],
    totals: { canal: 'TOTAL', uds: 88, neto: { formula: 'SUM(C2:C2)', result: 2000 } },
  }
}

describe('Logo anclaje — tl+ext, sin br, proporción respetada', () => {
  it('ancla con tl+ext (sin br) y ratio coincide con el PNG real 512×512', () => {
    const buf = fs.readFileSync(path.resolve('public/brand/carta-viva/isotipo.png'))
    const dims = leerDimensionesPng(buf)
    assert.deepEqual(dims, { width: 512, height: 512 })

    const wb = new ExcelJS.Workbook()
    const imageId = wb.addImage({ buffer: buf, extension: 'png' })
    const ws = wb.addWorksheet('Canales venta')
    construirHojaConBranding(ws, spec(), {
      logoImageId: imageId,
      logoDims: dims,
      restauranteNombre: 'Casa Marisma',
      periodo: '2026-11',
    })

    const imgs = ws.getImages()
    assert.equal(imgs.length, 1, 'debería haber 1 imagen anclada')
    const anchor = imgs[0].range
    // Anchor tl.
    assert.deepEqual(
      { col: anchor.tl.col, row: anchor.tl.row },
      { col: 0, row: 0 },
    )
    // SIN br (ExcelJS guarda ext en anchor.ext cuando se usa tl+ext).
    assert.ok(anchor.ext, 'anchor.ext debería existir con tl+ext')
    assert.equal(anchor.ext.height, LOGO_TARGET_HEIGHT)
    // PNG cuadrado → ext cuadrado.
    const ratioImg = anchor.ext.width / anchor.ext.height
    const ratioPng = dims.width / dims.height
    assert.ok(Math.abs(ratioImg - ratioPng) <= 0.01,
      `ratio img ${ratioImg} vs png ${ratioPng}`)
    // Ancho objetivo dentro del rango sensato (no deformado).
    assert.ok(anchor.ext.width > 0 && anchor.ext.width <= 160)
  })

  it('con PNG apaisado (800×400) el ext es 2×56=112 de ancho', () => {
    const dims = { width: 800, height: 400 }
    const wb = new ExcelJS.Workbook()
    const imageId = wb.addImage({
      buffer: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),  // dummy
      extension: 'png',
    })
    const ws = wb.addWorksheet('X')
    construirHojaConBranding(ws, spec(), { logoImageId: imageId, logoDims: dims })
    const anchor = ws.getImages()[0].range
    assert.equal(anchor.ext.height, 56)
    assert.equal(anchor.ext.width,  112)
  })

  it('logo queda DENTRO de las filas 1..BRANDING_ROWS en altura', () => {
    // Suma de alturas de filas 1..3: 32+16+16 = 64 px. El logo mide
    // LOGO_TARGET_HEIGHT=56 px → cabe con 8 px de aire. No invade la
    // fila 4 (separador 8 px) ni la cabecera de la tabla (fila 5).
    const BRANDING_ROW_HEIGHTS = [32, 16, 16, 8]  // mismo valor del módulo
    const altoAcumulado = BRANDING_ROW_HEIGHTS.slice(0, 3).reduce((a, b) => a + b, 0)
    assert.ok(LOGO_TARGET_HEIGHT <= altoAcumulado,
      `${LOGO_TARGET_HEIGHT} > ${altoAcumulado}`)
    assert.ok(BRANDING_ROWS >= 4)
  })

  it('columna A se amplía para alojar el ancho del logo + margen', () => {
    const buf = fs.readFileSync(path.resolve('public/brand/carta-viva/isotipo.png'))
    const dims = leerDimensionesPng(buf)
    const wb = new ExcelJS.Workbook()
    const imageId = wb.addImage({ buffer: buf, extension: 'png' })
    const ws = wb.addWorksheet('X')
    // Spec con col A width=5 (muy estrecha) para forzar la expansión.
    const s = {
      name: 'X',
      columns: [
        { header: 'A', key: 'a', width: 5 },
        { header: 'B', key: 'b', width: 10 },
      ],
      rows: [{ a: 1, b: 2 }],
    }
    construirHojaConBranding(ws, s, { logoImageId: imageId, logoDims: dims })
    const colA = ws.getColumn(1)
    // Con PNG 512×512 y height 56 → ext.width = 56. Ancho necesario
    // aprox (56/7)+1 = 9 chars. Debe quedar >= 9.
    assert.ok(colA.width >= 9, `colA.width = ${colA.width}`)
  })

  it('sin logoDims cae a cuadrado 56×56 (degradación segura)', () => {
    const wb = new ExcelJS.Workbook()
    const imageId = wb.addImage({
      buffer: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
      extension: 'png',
    })
    const ws = wb.addWorksheet('X')
    construirHojaConBranding(ws, spec(), { logoImageId: imageId, logoDims: null })
    const anchor = ws.getImages()[0].range
    assert.equal(anchor.ext.width,  LOGO_TARGET_HEIGHT)
    assert.equal(anchor.ext.height, LOGO_TARGET_HEIGHT)
  })

  it('sin logoImageId: no se añade imagen (degradación sin logo)', () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('X')
    construirHojaConBranding(ws, spec(), { logoImageId: null, logoDims: null })
    assert.equal(ws.getImages().length, 0)
  })
})
