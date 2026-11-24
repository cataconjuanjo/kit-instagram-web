// Verifica el helper isConsultorFromAuth / isConsultorEmail.
// Casa Marisma lo usa como fixture: su email no es el admin, por lo que
// isConsultorEmail('restaurante@casa-marisma.example') === false.
import test from 'node:test'
import assert from 'node:assert/strict'

import { isConsultorEmail, isConsultorFromAuth } from '../../app/api/_lib/isConsultor.js'

test('isConsultorEmail reconoce el email admin por defecto', () => {
  assert.equal(isConsultorEmail('cataconjuanjo@gmail.com'), true)
  assert.equal(isConsultorEmail('CataConJuanjo@gmail.com'), true)
})

test('isConsultorEmail rechaza cualquier otro email', () => {
  assert.equal(isConsultorEmail('restaurante@casa-marisma.example'), false)
  assert.equal(isConsultorEmail(''), false)
  assert.equal(isConsultorEmail(null), false)
  assert.equal(isConsultorEmail(undefined), false)
})

test('isConsultorFromAuth extrae el email del user', () => {
  assert.equal(isConsultorFromAuth({ user: { email: 'cataconjuanjo@gmail.com' } }), true)
  assert.equal(isConsultorFromAuth({ user: { email: 'restaurante@casa-marisma.example' } }), false)
  assert.equal(isConsultorFromAuth({}), false)
  assert.equal(isConsultorFromAuth(null), false)
})
