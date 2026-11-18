/**
 * Unit tests para `leerDimensionesPng` y `calcularExtLogo`
 * de app/lib/excelEstilos.js, usando el PNG REAL del repo.
 *
 * Ejecutar: node --test scripts/leerDimensionesPng.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  LOGO_TARGET_HEIGHT,
  calcularExtLogo,
  leerDimensionesPng,
} from '../app/lib/excelEstilos.js'

describe('leerDimensionesPng — con el isotipo real del repo', () => {
  it('public/brand/carta-viva/isotipo.png lee dimensiones 512×512', () => {
    const buf = fs.readFileSync(path.resolve('public/brand/carta-viva/isotipo.png'))
    const dims = leerDimensionesPng(buf)
    assert.ok(dims, 'devolvió null')
    assert.equal(dims.width,  512)
    assert.equal(dims.height, 512)
  })

  it('devuelve lo mismo si se pasa Uint8Array o ArrayBuffer', () => {
    const buf = fs.readFileSync(path.resolve('public/brand/carta-viva/isotipo.png'))
    const u8  = new Uint8Array(buf)
    const ab  = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
    assert.deepEqual(leerDimensionesPng(u8), { width: 512, height: 512 })
    assert.deepEqual(leerDimensionesPng(ab), { width: 512, height: 512 })
  })

  it('null / undefined / short / firma inválida → null', () => {
    assert.equal(leerDimensionesPng(null), null)
    assert.equal(leerDimensionesPng(undefined), null)
    assert.equal(leerDimensionesPng(new Uint8Array(10)), null)
    // Firma incorrecta: 24 bytes de 0x00.
    assert.equal(leerDimensionesPng(new Uint8Array(24)), null)
    // Firma incorrecta explícita.
    const fake = new Uint8Array(24); fake[0] = 1
    assert.equal(leerDimensionesPng(fake), null)
  })

  it('tipo no soportado (string, number) → null', () => {
    assert.equal(leerDimensionesPng('abc'), null)
    assert.equal(leerDimensionesPng(123), null)
  })
})

describe('calcularExtLogo', () => {
  it('proporción cuadrada (512×512) → ext cuadrado', () => {
    const ext = calcularExtLogo({ width: 512, height: 512 })
    assert.equal(ext.height, LOGO_TARGET_HEIGHT)
    assert.equal(ext.width,  LOGO_TARGET_HEIGHT)
  })

  it('proporción 2:1 → ext.width = 2 × ext.height', () => {
    const ext = calcularExtLogo({ width: 800, height: 400 })
    assert.equal(ext.height, LOGO_TARGET_HEIGHT)
    assert.equal(ext.width, 2 * LOGO_TARGET_HEIGHT)
  })

  it('proporción 0.858 (viewBox SVG original 182×212) → width redondeado', () => {
    // El PNG real es 512×512 pero el SVG original era 182×212.
    // Si algún día cambiara la fuente, la fórmula seguiría siendo
    // proporcional y la altura fija.
    const ext = calcularExtLogo({ width: 182, height: 212 })
    assert.equal(ext.height, LOGO_TARGET_HEIGHT)
    // 56 * (182/212) = 48.07... → 48
    assert.equal(ext.width, Math.round(LOGO_TARGET_HEIGHT * (182 / 212)))
    assert.equal(ext.width, 48)
  })

  it('dims inválidos / null → cuadrado por defecto', () => {
    assert.deepEqual(calcularExtLogo(null), { width: LOGO_TARGET_HEIGHT, height: LOGO_TARGET_HEIGHT })
    assert.deepEqual(calcularExtLogo({}), { width: LOGO_TARGET_HEIGHT, height: LOGO_TARGET_HEIGHT })
    assert.deepEqual(calcularExtLogo({ width: 0, height: 0 }), { width: LOGO_TARGET_HEIGHT, height: LOGO_TARGET_HEIGHT })
  })
})
