// Tests para los tokens firmados del borrador del simulador. Verifica que
// crearTokenBorradorCarta + validarTokenBorradorCarta solo acepta los
// tokens de tipo='carta_borrador' ligados al restaurante correcto.
//
// Requiere SUPABASE_SERVICE_ROLE_KEY en env para que la firma HMAC
// funcione (si falta, los tests saltan con un aviso explícito).
//
// Ejecutar: node --test scripts/cartaBorradorToken.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

// Inyectamos un secreto estable en env antes de importar el módulo.
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-secret-for-token-tests-32bytes!!'

const mod = await import('../app/lib/cartaPruebaToken.js')
const {
  crearTokenBorradorCarta,
  validarTokenBorradorCarta,
  crearTokenPruebaCarta,
  validarTokenPruebaCarta,
} = mod

const REST_A = '11111111-1111-1111-1111-111111111111'
const REST_B = '22222222-2222-2222-2222-222222222222'

test('crear + validar: token válido para su restaurante', () => {
  const token = crearTokenBorradorCarta(REST_A)
  assert.equal(validarTokenBorradorCarta(token, REST_A), true)
})

test('rechaza si el restaurante_id no coincide', () => {
  const token = crearTokenBorradorCarta(REST_A)
  assert.equal(validarTokenBorradorCarta(token, REST_B), false)
})

test('rechaza un token de prueba_carta (tipo distinto)', () => {
  // Un token para visualizar la carta pública en modo prueba no debe
  // valer como token de borrador del simulador.
  const tokenPrueba = crearTokenPruebaCarta(REST_A)
  assert.equal(validarTokenBorradorCarta(tokenPrueba, REST_A), false)
  // Pero sí debería seguir valiendo como token de prueba (compat).
  assert.equal(validarTokenPruebaCarta(tokenPrueba, REST_A), true)
})

test('rechaza un token manipulado (firma inválida)', () => {
  const token = crearTokenBorradorCarta(REST_A)
  const [payload] = token.split('.')
  const manipulado = `${payload}.firma-falsa`
  assert.equal(validarTokenBorradorCarta(manipulado, REST_A), false)
})

test('rechaza un token caducado', () => {
  // duracion_ms por debajo del mínimo se normaliza al mínimo (15 min);
  // así que no podemos crear uno ya caducado. Verificamos con un payload
  // falseado manualmente que la validación respeta exp<=now.
  const vencido = Buffer.from(JSON.stringify({
    restaurante_id: REST_A,
    tipo: 'carta_borrador',
    exp: Date.now() - 1000,
  })).toString('base64url')
  // Firma correcta sobre un payload caducado: sigue siendo inválido.
  const firma = createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY).update(vencido).digest('base64url')
  assert.equal(validarTokenBorradorCarta(`${vencido}.${firma}`, REST_A), false)
})

test('token vacío o malformado se rechaza sin lanzar', () => {
  assert.equal(validarTokenBorradorCarta('', REST_A), false)
  assert.equal(validarTokenBorradorCarta('no-es-un-token', REST_A), false)
  assert.equal(validarTokenBorradorCarta('sin.firma.', REST_A), false)
})
