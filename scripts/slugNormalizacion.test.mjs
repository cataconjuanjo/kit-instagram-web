/**
 * Fase G — normalización de slug en el alta de restaurante.
 *
 * Reproduce la función `slugDesdeNombre` del admin para probar
 * que se preservan guiones a mitad y durante el tipeo, pero se
 * strippean solo guiones iniciales. El strip del final queda
 * reservado a `slugFinal`, que se aplica en el onBlur.
 *
 * Ejecutar: node --test scripts/slugNormalizacion.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// Réplica fiel de la función del componente.
function slugDesdeNombre(nombre) {
  return String(nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .slice(0, 48)
}
function slugFinal(slug) {
  return String(slug || '').replace(/-+$/, '')
}

describe('slugDesdeNombre — normalización progresiva (durante onChange)', () => {
  it('nombre normal → slug con guiones de espacios', () => {
    assert.equal(slugDesdeNombre('Casa Marisma'), 'casa-marisma')
  })

  it('acentos → stripped (ñ→n)', () => {
    assert.equal(slugDesdeNombre('Peña Ferrugent'), 'pena-ferrugent')
  })

  it('CLAVE: preserva guiones a mitad', () => {
    assert.equal(slugDesdeNombre('ensayo-onboarding'), 'ensayo-onboarding')
  })

  it('CLAVE: preserva guion FINAL durante el tipeo', () => {
    // El bug observado: al teclear "ensayo-" la función stripaba el
    // trailing dash, y al continuar "o" el resultado era "ensayoo".
    assert.equal(slugDesdeNombre('ensayo-'), 'ensayo-',
      'el guion final debe preservarse mientras el usuario sigue tecleando')
  })

  it('colapsa dobles guiones a uno solo', () => {
    assert.equal(slugDesdeNombre('a--b---c'), 'a-b-c')
  })

  it('strippa guiones iniciales', () => {
    assert.equal(slugDesdeNombre('---abc'), 'abc')
  })

  it('caracteres inválidos → "-"', () => {
    assert.equal(slugDesdeNombre("O'Donnell"), 'o-donnell')
    assert.equal(slugDesdeNombre('Café & Bar'), 'cafe-bar')
    assert.equal(slugDesdeNombre('Casa / Pepe'), 'casa-pepe')
  })

  it('números y guiones juntos: válidos', () => {
    assert.equal(slugDesdeNombre('taberna-del-puerto-2'), 'taberna-del-puerto-2')
  })

  it('máximo 48 caracteres', () => {
    assert.equal(slugDesdeNombre('x'.repeat(100)).length, 48)
  })

  it('vacío / null / undefined → ""', () => {
    assert.equal(slugDesdeNombre(''), '')
    assert.equal(slugDesdeNombre(null), '')
    assert.equal(slugDesdeNombre(undefined), '')
  })

  it('tipeo progresivo: "e"→"en"→"ens"…→"ensayo-"→"ensayo-o"→... conserva el guion', () => {
    const letras = 'ensayo-onboarding'.split('')
    let acumulado = ''
    const resultados = []
    for (const l of letras) {
      acumulado = slugDesdeNombre(acumulado + l)
      resultados.push(acumulado)
    }
    // El resultado final debe ser el slug completo con guion.
    assert.equal(resultados.at(-1), 'ensayo-onboarding')
    // Y al pasar por "ensayo-" (tras la 7ª letra) el guion
    // debe seguir presente, no haberse stripado.
    assert.equal(resultados[6], 'ensayo-',
      'tras teclear "ensayo-" el guion debe permanecer')
  })
})

describe('slugFinal — normalización al salir del input (onBlur)', () => {
  it('strippa guiones finales', () => {
    assert.equal(slugFinal('ensayo-'),       'ensayo')
    assert.equal(slugFinal('casa-pepe---'),  'casa-pepe')
    assert.equal(slugFinal('abc'),           'abc')
  })

  it('no toca guiones intermedios ni iniciales', () => {
    assert.equal(slugFinal('a-b-c'), 'a-b-c')
  })

  it('vacío / null → ""', () => {
    assert.equal(slugFinal(''), '')
    assert.equal(slugFinal(null), '')
  })
})

describe('contract — no romper slugs ya válidos', () => {
  it('slugs canónicos pasan idempotentes por ambas funciones', () => {
    const canonicos = [
      'casa-marisma',
      'taberna-del-puerto',
      'ensayo-onboarding',
      'restaurant-2',
    ]
    for (const s of canonicos) {
      assert.equal(slugDesdeNombre(s), s, `${s} debe ser idempotente en slugDesdeNombre`)
      assert.equal(slugFinal(s),       s, `${s} debe ser idempotente en slugFinal`)
    }
  })
})
