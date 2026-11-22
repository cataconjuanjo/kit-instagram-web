/**
 * Fase H — test de guarda: la lista de tablas hijas de `vinos` sin
 * CASCADE que el handler DELETE /api/admin/restaurantes limpia antes
 * del borrado DEBE cubrir TODAS las FKs que existan hoy en los .sql
 * del repo. Si alguien añade una nueva FK a `vinos(id)` sin
 * `ON DELETE CASCADE` ni `SET NULL`, este test falla.
 *
 * Lógica pura: lee los .sql con fs. No toca BD.
 *
 * Ejecutar: node --test scripts/bajaRestaurante.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { TABLAS_HIJAS_VINOS_SIN_CASCADE, trocear } from '../app/lib/bajaRestaurante.js'

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))

// Directorios a excluir: worktrees efímeros, caches, deploys y
// snapshots de otras fases. El audit real vive en `supabase/` +
// `supabase/migrations_pendientes/`.
const EXCLUIR = /[\\/](\.claude[\\/]worktrees|\.worktrees|\.codex|\.codex-vercel|\.deploy-label-crop|\.vercel-clean-deploy|\.\.kit-hotfix-2|node_modules|\.next)[\\/]/

function listarSQLs(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (EXCLUIR.test(full)) continue
    if (entry.isDirectory()) listarSQLs(full, out)
    else if (entry.isFile() && entry.name.endsWith('.sql')) out.push(full)
  }
  return out
}

/**
 * Busca sentencias `REFERENCES [public.]vinos(id)` en cada .sql y
 * determina si la FK tiene `ON DELETE CASCADE` / `SET NULL` (OK)
 * o no lo tiene (BLOQUEA). Devuelve una lista de ocurrencias
 * {file, line, columna, tabla, bloquea}.
 *
 * Reconoce formatos típicos:
 *   `vino_id uuid NOT NULL REFERENCES public.vinos(id)`
 *   `vino_id uuid NOT NULL REFERENCES vinos(id) ON DELETE CASCADE`
 *   `ADD CONSTRAINT …  FOREIGN KEY (vino_id) REFERENCES public.vinos(id) ON DELETE SET NULL`
 *
 * No intenta reconocer la TABLA a la que pertenece (eso vendría de
 * un parser SQL completo, overkill): nos basta con detectar la
 * EXISTENCIA de una FK bloqueante y pedirle al mantenedor que
 * ubique la tabla y la añada a la lista del módulo puro.
 */
function detectarFKsAVinos(sqlPath) {
  const texto = fs.readFileSync(sqlPath, 'utf8')
  const lineas = texto.split('\n')
  const resultados = []
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i]
    const m = l.match(/references\s+(public\.)?vinos\s*\(/i)
    if (!m) continue
    // Trozo que sigue a REFERENCES: en la misma línea o en las 2
    // siguientes (el ON DELETE suele venir a continuación, a veces
    // al final de la sentencia o en la línea siguiente).
    const trozo = lineas.slice(i, i + 3).join(' ').toLowerCase()
    const cascade = /on\s+delete\s+cascade/i.test(trozo)
    const setNull = /on\s+delete\s+set\s+null/i.test(trozo)
    resultados.push({
      file: path.relative(REPO, sqlPath).replace(/\\/g, '/'),
      line: i + 1,
      contenido: l.trim(),
      bloquea: !cascade && !setNull,
    })
  }
  return resultados
}

// Sólo nos interesan las FKs declaradas en `supabase/` (incluyendo
// `supabase/migrations_pendientes/`). El esquema en otros sitios
// (worktrees efímeros, deploys antiguos) queda fuera.
const sqlFiles = listarSQLs(path.join(REPO, 'supabase'))

describe('baja-restaurante — guarda: lista cubre todas las FKs sin CASCADE a vinos(id)', () => {
  const todas = sqlFiles.flatMap(detectarFKsAVinos)
  const bloqueantes = todas.filter(x => x.bloquea)

  it('se encuentra al menos una FK a vinos(id) en el repo (sanity)', () => {
    assert.ok(todas.length > 0, 'no se detectó ninguna FK a vinos(id) — el regex está roto?')
  })

  it('TODAS las FKs bloqueantes están cubiertas por la lista del módulo', () => {
    // Nombres de tabla cubiertos (la clave: existencia de la tabla en
    // la lista). No necesitamos mapear file→tabla porque la lista
    // documenta la `evidencia` (file:line). El test actúa como
    // "detector de sorpresas": si aparece una FK bloqueante nueva,
    // tiene que existir alguna evidencia en la lista que coincida
    // con su file:line.
    const evidenciasCubiertas = new Set(
      TABLAS_HIJAS_VINOS_SIN_CASCADE.map(t => t.evidencia)
    )
    const faltan = []
    for (const b of bloqueantes) {
      // Un match es "evidencia incluye este file y su línea cabe
      // dentro del rango declarado".
      const ok = [...evidenciasCubiertas].some(ev => {
        const [fileEv, rango] = ev.split(':')
        if (fileEv !== b.file) return false
        if (!rango) return false
        // Rango puede ser "40" o "13-15" (duelo_carta).
        if (rango.includes('-')) {
          const [a, c] = rango.split('-').map(Number)
          return b.line >= a && b.line <= c
        }
        return Number(rango) === b.line
      })
      if (!ok) faltan.push(b)
    }
    assert.equal(
      faltan.length, 0,
      `FKs bloqueantes nuevas no cubiertas por TABLAS_HIJAS_VINOS_SIN_CASCADE:\n` +
      faltan.map(f => `  - ${f.file}:${f.line}  ${f.contenido}`).join('\n')
    )
  })

  it('las evidencias declaradas en el módulo existen realmente en los .sql', () => {
    const faltan = []
    for (const t of TABLAS_HIJAS_VINOS_SIN_CASCADE) {
      const [file, rango] = t.evidencia.split(':')
      const abs = path.join(REPO, file)
      if (!fs.existsSync(abs)) {
        faltan.push(`${t.tabla}: fichero ${file} no existe`)
        continue
      }
      const contenido = fs.readFileSync(abs, 'utf8')
      const lineas = contenido.split('\n')
      const idxs = rango.includes('-')
        ? (() => { const [a, b] = rango.split('-').map(Number); const r = []; for (let i = a; i <= b; i++) r.push(i); return r })()
        : [Number(rango)]
      const todasTienenRef = idxs.every(n => lineas[n - 1] && /references.*vinos/i.test(lineas[n - 1]))
      if (!todasTienenRef) faltan.push(`${t.tabla}: evidencia ${t.evidencia} no apunta a una FK vinos`)
    }
    assert.equal(faltan.length, 0, faltan.join('\n'))
  })

  it('ningún duplicado en la lista (nombres de tabla únicos)', () => {
    const nombres = TABLAS_HIJAS_VINOS_SIN_CASCADE.map(t => t.tabla)
    assert.equal(new Set(nombres).size, nombres.length)
  })
})

describe('trocear — chunks para evitar .in() con URL gigante', () => {
  it('lista vacía → []', () => {
    assert.deepEqual(trocear([]), [])
    assert.deepEqual(trocear(null), [])
    assert.deepEqual(trocear(undefined), [])
  })
  it('lista con tamaño ≤ 200 → un solo chunk', () => {
    const ids = Array.from({ length: 150 }, (_, i) => `id-${i}`)
    const chunks = trocear(ids)
    assert.equal(chunks.length, 1)
    assert.equal(chunks[0].length, 150)
  })
  it('lista con tamaño > 200 → múltiples chunks', () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`)
    const chunks = trocear(ids)
    assert.equal(chunks.length, 3)
    assert.equal(chunks[0].length, 200)
    assert.equal(chunks[1].length, 200)
    assert.equal(chunks[2].length, 50)
  })
  it('tamaño personalizado', () => {
    const ids = Array.from({ length: 10 }, (_, i) => i)
    assert.deepEqual(trocear(ids, 3), [[0,1,2], [3,4,5], [6,7,8], [9]])
  })
})
