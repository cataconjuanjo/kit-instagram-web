/**
 * Unit tests for app/lib/facturasIaMime.js
 * Ejecutar: node --test scripts/facturasIaMime.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCEPT_FACTURA_IA,
  ALLOWED_MIME_FACTURA_IA,
  esErrorMimeStorage,
  esImagen,
  extensionPorMime,
  MIME_FACTURA_IA,
} from '../app/lib/facturasIaMime.js'

describe('ALLOWED_MIME_FACTURA_IA', () => {
  it('incluye los cuatro MIME soportados', () => {
    assert.ok(ALLOWED_MIME_FACTURA_IA.has('application/pdf'))
    assert.ok(ALLOWED_MIME_FACTURA_IA.has('image/png'))
    assert.ok(ALLOWED_MIME_FACTURA_IA.has('image/jpeg'))
    assert.ok(ALLOWED_MIME_FACTURA_IA.has('image/webp'))
  })
  it('no incluye MIME fuera de la lista', () => {
    assert.equal(ALLOWED_MIME_FACTURA_IA.has('image/gif'), false)
    assert.equal(ALLOWED_MIME_FACTURA_IA.has('application/octet-stream'), false)
    assert.equal(ALLOWED_MIME_FACTURA_IA.has(''), false)
  })
})

describe('ACCEPT_FACTURA_IA', () => {
  it('coincide exactamente con lo que espera el <input accept>', () => {
    assert.equal(
      ACCEPT_FACTURA_IA,
      'application/pdf,image/png,image/jpeg,image/webp',
    )
  })
})

describe('extensionPorMime', () => {
  it('mapea cada MIME a su extensión canónica (incluido webp)', () => {
    assert.equal(extensionPorMime('application/pdf'), 'pdf')
    assert.equal(extensionPorMime('image/png'),       'png')
    assert.equal(extensionPorMime('image/jpeg'),      'jpg')
    assert.equal(extensionPorMime('image/webp'),      'webp')
  })
  it('acepta mayúsculas y recorta a bin si no mapea', () => {
    assert.equal(extensionPorMime('IMAGE/WebP'), 'webp')
    assert.equal(extensionPorMime('image/gif'),  'bin')
    assert.equal(extensionPorMime(''),           'bin')
    assert.equal(extensionPorMime(null),         'bin')
    assert.equal(extensionPorMime(undefined),    'bin')
  })
})

describe('esImagen', () => {
  it('distingue imagen de documento PDF', () => {
    assert.equal(esImagen('image/webp'), true)
    assert.equal(esImagen('image/png'),  true)
    assert.equal(esImagen('image/jpeg'), true)
    assert.equal(esImagen('application/pdf'), false)
    assert.equal(esImagen('text/plain'), false)
  })
})

describe('esErrorMimeStorage', () => {
  it('detecta mensajes típicos de MIME no permitido de Supabase Storage', () => {
    assert.equal(esErrorMimeStorage({ message: 'mime type not allowed' }), true)
    assert.equal(esErrorMimeStorage({ message: 'invalid_mime_type: image/webp' }), true)
    assert.equal(esErrorMimeStorage({ message: 'The content-type is not allowed by the bucket.' }), true)
  })
  it('devuelve false para errores que no son de MIME', () => {
    assert.equal(esErrorMimeStorage({ message: 'permission denied' }), false)
    assert.equal(esErrorMimeStorage({ message: '' }), false)
    assert.equal(esErrorMimeStorage(null), false)
    assert.equal(esErrorMimeStorage(undefined), false)
  })
})

describe('MIME_FACTURA_IA — claves ordenadas y freezadas', () => {
  it('es Object.freeze y mantiene orden de inserción (pdf, png, jpeg, webp)', () => {
    assert.equal(Object.isFrozen(MIME_FACTURA_IA), true)
    assert.deepEqual(Object.keys(MIME_FACTURA_IA), [
      'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
    ])
  })
})
