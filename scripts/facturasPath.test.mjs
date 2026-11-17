/**
 * Unit tests for app/lib/facturasPath.js
 * Ejecutar: node --test scripts/facturasPath.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validarPathFactura } from '../app/lib/facturasPath.js'

const RID = '550e8400-e29b-41d4-a716-446655440000'

describe('validarPathFactura — casos válidos', () => {
  it('acepta un path del flujo IA (`_ia/<hash>.<ext>`)', () => {
    const r = validarPathFactura(`${RID}/_ia/abc123.pdf`, RID)
    assert.equal(r.ok, true)
  })

  it('acepta un path de adjunto vinculado (`<cabecera_id>/<file_id>.<ext>`)', () => {
    const r = validarPathFactura(`${RID}/cab-uuid/file-uuid.jpg`, RID)
    assert.equal(r.ok, true)
  })
})

describe('validarPathFactura — casos rechazados', () => {
  it('rechaza path vacío', () => {
    const r = validarPathFactura('', RID)
    assert.equal(r.ok, false)
    assert.equal(r.reason, 'path_vacio')
  })

  it('rechaza path null / no-string', () => {
    assert.equal(validarPathFactura(null, RID).ok, false)
    assert.equal(validarPathFactura(undefined, RID).ok, false)
    assert.equal(validarPathFactura(123, RID).ok, false)
  })

  it('rechaza restaurante_id vacío / no-string', () => {
    assert.equal(validarPathFactura(`${RID}/_ia/a.pdf`, '').ok, false)
    assert.equal(validarPathFactura(`${RID}/_ia/a.pdf`, null).ok, false)
  })

  it('rechaza path con ".." en cualquier posición', () => {
    assert.equal(validarPathFactura(`${RID}/../otros/x.pdf`, RID).reason, 'path_con_ascenso')
    assert.equal(validarPathFactura(`${RID}/_ia/../a.pdf`, RID).reason, 'path_con_ascenso')
    assert.equal(validarPathFactura(`..${RID}/a.pdf`, RID).reason, 'path_con_ascenso')
  })

  it('rechaza path con backslashes', () => {
    const r = validarPathFactura(`${RID}\\_ia\\a.pdf`, RID)
    assert.equal(r.ok, false)
    assert.equal(r.reason, 'path_con_backslash')
  })

  it('rechaza path que apunta a otro restaurante', () => {
    const otro = '11111111-2222-3333-4444-555555555555'
    const r = validarPathFactura(`${otro}/_ia/a.pdf`, RID)
    assert.equal(r.ok, false)
    assert.equal(r.reason, 'path_fuera_de_restaurante')
  })

  it('rechaza prefijo falso (restaurante_id es sub-string, no carpeta)', () => {
    const r = validarPathFactura(`${RID}-otro/_ia/a.pdf`, RID)
    assert.equal(r.ok, false)
    assert.equal(r.reason, 'path_fuera_de_restaurante')
  })
})
