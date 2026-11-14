import { test } from 'node:test'
import assert from 'node:assert/strict'
import QRCode from 'qrcode'

const URL_CASA_MARISMA = 'https://cartaviva.app/carta/casa-marisma'

test('QRCode.toDataURL produce un PNG base64 valido para la URL de Casa Marisma', async () => {
  const dataUrl = await QRCode.toDataURL(URL_CASA_MARISMA, {
    width: 880,
    margin: 2,
    color: { dark: '#171416', light: '#ffffff' },
  })

  assert.equal(typeof dataUrl, 'string')
  assert.ok(dataUrl.startsWith('data:image/png;base64,'), 'debe empezar por data:image/png;base64,')

  const base64 = dataUrl.slice('data:image/png;base64,'.length)
  assert.ok(base64.length > 100, 'base64 debe tener contenido')

  const buf = Buffer.from(base64, 'base64')
  // Cabecera PNG: 89 50 4E 47 0D 0A 1A 0A
  assert.equal(buf[0], 0x89)
  assert.equal(buf[1], 0x50)
  assert.equal(buf[2], 0x4e)
  assert.equal(buf[3], 0x47)
  assert.equal(buf[4], 0x0d)
  assert.equal(buf[5], 0x0a)
  assert.equal(buf[6], 0x1a)
  assert.equal(buf[7], 0x0a)
})

test('QRCode.toDataURL rechaza con URL vacia o invalida', async () => {
  await assert.rejects(() => QRCode.toDataURL(''), /No input text/)
})
