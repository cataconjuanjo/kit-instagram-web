// Verifica el nuevo helper getAdminEmail() y la lectura dinámica de ADMIN_EMAIL.
// Comportamiento documentado en app/api/_lib/isConsultor.js:
//   - ADMIN_EMAIL es la env server-side canónica (NEXT_PUBLIC_ADMIN_EMAIL se usa
//     sólo para el cliente, concretamente app/demo.js).
//   - Si ADMIN_EMAIL no está definida, cae al default 'cataconjuanjo@gmail.com'.
//   - isConsultorEmail es case-insensitive.
// Fixture: Casa Marisma (restaurante@casa-marisma.example) nunca es consultor.
import test from 'node:test'
import assert from 'node:assert/strict'

// Reset env antes/después para no filtrar estado entre tests.
const envOriginal = process.env.ADMIN_EMAIL

async function cargarHelper() {
  // Import fresco para que getAdminEmail reevalue process.env.
  // (El helper actual ya hace lectura perezosa, pero mantenemos el reset por higiene.)
  const mod = await import('../../app/api/_lib/isConsultor.js')
  return mod
}

test('getAdminEmail cae al default si ADMIN_EMAIL no está definido', async () => {
  delete process.env.ADMIN_EMAIL
  const { getAdminEmail, isConsultorEmail } = await cargarHelper()
  // Default hardcoded documentado en el helper.
  assert.equal(getAdminEmail(), 'cataconjuanjo@gmail.com')
  // Un email ajeno no coincide, por tanto no es consultor.
  assert.equal(isConsultorEmail('restaurante@casa-marisma.example'), false)
  // Para restaurar entre tests.
  if (envOriginal != null) process.env.ADMIN_EMAIL = envOriginal
})

test('getAdminEmail devuelve el valor de ADMIN_EMAIL cuando está definido', async () => {
  process.env.ADMIN_EMAIL = 'x@y.com'
  const { getAdminEmail, isConsultorEmail } = await cargarHelper()
  assert.equal(getAdminEmail(), 'x@y.com')
  assert.equal(isConsultorEmail('x@y.com'), true)
  // Case-insensitive por diseño.
  assert.equal(isConsultorEmail('X@Y.COM'), true)
  // Un email ajeno sigue sin ser consultor.
  assert.equal(isConsultorEmail('restaurante@casa-marisma.example'), false)
  if (envOriginal != null) process.env.ADMIN_EMAIL = envOriginal
  else delete process.env.ADMIN_EMAIL
})

test('getAdminEmail normaliza a minúsculas', async () => {
  process.env.ADMIN_EMAIL = 'FOO@Bar.COM'
  const { getAdminEmail } = await cargarHelper()
  assert.equal(getAdminEmail(), 'foo@bar.com')
  if (envOriginal != null) process.env.ADMIN_EMAIL = envOriginal
  else delete process.env.ADMIN_EMAIL
})
