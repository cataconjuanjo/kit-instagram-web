'use strict'
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

function loadEnv() {
  const env = {}
  for (const f of ['.env.local', '.env.vercel']) {
    if (!fs.existsSync(f)) continue
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  }
  return { ...env, ...process.env }
}

async function fetchAll(sb, table, select, extra) {
  const all = []
  for (let o = 0; ; o += 1000) {
    let q = sb.from(table).select(select).range(o, o + 999)
    if (extra) q = extra(q)
    const { data, error } = await q
    if (error) throw new Error(table + ': ' + error.message)
    all.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return all
}

function table(rows, cols) {
  if (!rows.length) return '(sin resultados)'
  const widths = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)))
  const sep  = widths.map(w => '-'.repeat(w)).join(' | ')
  const head = cols.map((c, i) => c.padEnd(widths[i])).join(' | ')
  const body = rows.map(r => cols.map((c, i) => String(r[c] ?? '').padEnd(widths[i])).join(' | '))
  return [head, sep, ...body].join('\n')
}

async function main() {
  const env = loadEnv()
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } })

  const out = []
  const w = s => out.push(s)

  w('# Métricas del catálogo — Carta Viva')
  w('Generado: 2026-09-12  |  Rama: refactor/catalogo-canonico  |  Bloque 3')
  w('')

  // Carga completa
  process.stderr.write('Cargando proveedor_catalogo_vinos...')
  const cat = await fetchAll(sb, 'proveedor_catalogo_vinos', '*')
  process.stderr.write(' ' + cat.length + ' filas\n')

  const provs = await fetchAll(sb, 'proveedores_vino', 'id, nombre')
  const provMap = Object.fromEntries(provs.map(p => [p.id, p.nombre]))

  // ── 3.1 ──────────────────────────────────────────────────────────────────
  w('## 3.1  Total de referencias por proveedor')
  w('')
  const byProv = {}
  for (const r of cat) {
    if (!byProv[r.proveedor_id]) byProv[r.proveedor_id] = { referencias: 0, favoritos: 0, sin_coste: 0 }
    byProv[r.proveedor_id].referencias++
    if (r.favorito) byProv[r.proveedor_id].favoritos++
    if (!r.coste_estimado) byProv[r.proveedor_id].sin_coste++
  }
  const rows31 = Object.entries(byProv)
    .map(([id, v]) => ({ proveedor: provMap[id] || id, ...v }))
    .sort((a, b) => b.referencias - a.referencias)
  rows31.push({
    proveedor: 'TOTAL',
    referencias: cat.length,
    favoritos: cat.filter(r => r.favorito).length,
    sin_coste: cat.filter(r => !r.coste_estimado).length,
  })
  w(table(rows31, ['proveedor', 'referencias', 'favoritos', 'sin_coste']))
  w('')

  // ── 3.2 ──────────────────────────────────────────────────────────────────
  w('## 3.2  Valores DISTINCT de zona')
  w('')
  const zonaMap = {}
  for (const r of cat) { const k = r.zona || '(null)'; zonaMap[k] = (zonaMap[k] || 0) + 1 }
  const zonas = Object.entries(zonaMap).sort((a, b) => b[1] - a[1])
  w('Zonas distintas: **' + Object.keys(zonaMap).length + '**')
  w('')
  w(table(zonas.map(([zona, n]) => ({ zona, n })), ['zona', 'n']))
  w('')

  // ── 3.3 ──────────────────────────────────────────────────────────────────
  w('## 3.3  Valores DISTINCT de bodega (top 50)')
  w('')
  const bodMap = {}
  for (const r of cat) { const k = r.bodega || '(null)'; bodMap[k] = (bodMap[k] || 0) + 1 }
  const bods = Object.entries(bodMap).sort((a, b) => b[1] - a[1])
  w('Bodegas distintas: **' + Object.keys(bodMap).length + '**')
  w('')
  w(table(bods.slice(0, 50).map(([bodega, n]) => ({ bodega, n })), ['bodega', 'n']))
  w('')

  // ── 3.4 ──────────────────────────────────────────────────────────────────
  w('## 3.4  Valores DISTINCT de formato')
  w('')
  const fmtMap = {}
  for (const r of cat) { const k = r.formato || '(null)'; fmtMap[k] = (fmtMap[k] || 0) + 1 }
  const fmts = Object.entries(fmtMap).sort((a, b) => b[1] - a[1])
  w('Formatos distintos: **' + Object.keys(fmtMap).length + '**')
  w('')
  w(table(fmts.map(([formato, n]) => ({ formato, n })), ['formato', 'n']))
  w('')

  // ── 3.5 / 3.6 ─────────────────────────────────────────────────────────────
  w('## 3.5  Candidatos a duplicado (pg_trgm)')
  w('')
  w('Requiere `similarity()` de pg_trgm. Ver `sql/metricas-catalogo.sql` §3.5.')
  w('')
  w('## 3.6  Agregado de duplicados (pg_trgm)')
  w('')
  w('Ver `sql/metricas-catalogo.sql` §3.6.')
  w('')

  // ── 3.7 ──────────────────────────────────────────────────────────────────
  w('## 3.7  Referencias sin coste, por proveedor')
  w('')
  const sinCosteMap = {}
  for (const r of cat) {
    if (!r.coste_estimado) {
      const k = provMap[r.proveedor_id] || r.proveedor_id
      sinCosteMap[k] = (sinCosteMap[k] || 0) + 1
    }
  }
  const rows37 = Object.entries(sinCosteMap)
    .sort((a, b) => b[1] - a[1])
    .map(([proveedor, sin_coste]) => ({ proveedor, sin_coste }))
  rows37.push({ proveedor: 'TOTAL', sin_coste: cat.filter(r => !r.coste_estimado).length })
  w(table(rows37, ['proveedor', 'sin_coste']))
  w('')

  // ── 3.8 ──────────────────────────────────────────────────────────────────
  w('## 3.8  Columna de añada')
  w('')
  const conAnada  = cat.filter(r => r.anada && r.anada !== '').length
  const sinAnada  = cat.filter(r => !r.anada || r.anada === '').length
  const yearRe    = /\b(19|20)\d{2}\b/
  const embebido  = cat.filter(r => (!r.anada || r.anada === '') && yearRe.test(r.nombre || '')).length
  w('Columna `anada` existe: **sí** (text)')
  w('')
  w('| Métrica | n |')
  w('|---|---|')
  w('| Total filas | ' + cat.length + ' |')
  w('| Con `anada` informada | ' + conAnada + ' |')
  w('| Sin `anada` | ' + sinAnada + ' |')
  w('| Sin `anada` pero con año en `nombre` | ' + embebido + ' |')
  w('')
  const anadaMap = {}
  for (const r of cat) if (r.anada) anadaMap[r.anada] = (anadaMap[r.anada] || 0) + 1
  const topAnada = Object.entries(anadaMap).sort((a, b) => b[1] - a[1]).slice(0, 15)
  w('Top 15 valores de `anada`:')
  w('')
  w(table(topAnada.map(([anada, n]) => ({ anada, n })), ['anada', 'n']))
  w('')

  // ── 3.9 ──────────────────────────────────────────────────────────────────
  w('## 3.9  Columna de disponibilidad')
  w('')
  const dispMap = {}
  for (const r of cat) { const k = r.disponibilidad || '(null)'; dispMap[k] = (dispMap[k] || 0) + 1 }
  w('Columna `disponibilidad` existe: **sí** (text)')
  w('')
  w(table(Object.entries(dispMap).sort((a, b) => b[1] - a[1]).map(([disponibilidad, n]) => ({ disponibilidad, n })), ['disponibilidad', 'n']))
  w('')

  // ── 3.10 ─────────────────────────────────────────────────────────────────
  w('## 3.10  Código de artículo del proveedor')
  w('')
  const conRef     = cat.filter(r => r.referencia && r.referencia !== '').length
  const conRefProv = cat.filter(r => r.referencia_proveedor && r.referencia_proveedor !== '').length
  w('| Columna | Informada | Total |')
  w('|---|---|---|')
  w('| `referencia` | ' + conRef + ' | ' + cat.length + ' |')
  w('| `referencia_proveedor` | ' + conRefProv + ' | ' + cat.length + ' |')
  w('')

  // Cobertura por proveedor para referencia_proveedor
  const refProvByProv = {}
  for (const r of cat) {
    const k = provMap[r.proveedor_id] || r.proveedor_id
    if (!refProvByProv[k]) refProvByProv[k] = { total: 0, con_ref_prov: 0, ejemplo: null }
    refProvByProv[k].total++
    if (r.referencia_proveedor) {
      refProvByProv[k].con_ref_prov++
      if (!refProvByProv[k].ejemplo) refProvByProv[k].ejemplo = r.referencia_proveedor
    }
  }
  const rows310 = Object.entries(refProvByProv)
    .sort((a, b) => b[1].con_ref_prov - a[1].con_ref_prov)
    .map(([proveedor, v]) => ({
      proveedor,
      con_ref_prov: v.con_ref_prov,
      total: v.total,
      pct: Math.round(v.con_ref_prov / v.total * 100) + '%',
      ejemplo: v.ejemplo || '—',
    }))
  w('`referencia_proveedor` por proveedor:')
  w('')
  w(table(rows310, ['proveedor', 'con_ref_prov', 'total', 'pct', 'ejemplo']))
  w('')

  // Cobertura por proveedor para referencia
  const refByProv = {}
  for (const r of cat) {
    const k = provMap[r.proveedor_id] || r.proveedor_id
    if (!refByProv[k]) refByProv[k] = { total: 0, con_ref: 0, ejemplo: null }
    refByProv[k].total++
    if (r.referencia) {
      refByProv[k].con_ref++
      if (!refByProv[k].ejemplo) refByProv[k].ejemplo = r.referencia
    }
  }
  const rows310b = Object.entries(refByProv)
    .sort((a, b) => b[1].con_ref - a[1].con_ref)
    .map(([proveedor, v]) => ({
      proveedor,
      con_ref: v.con_ref,
      total: v.total,
      pct: Math.round(v.con_ref / v.total * 100) + '%',
      ejemplo: v.ejemplo || '—',
    }))
  w('`referencia` por proveedor:')
  w('')
  w(table(rows310b, ['proveedor', 'con_ref', 'total', 'pct', 'ejemplo']))
  w('')

  // Códigos en formato
  const codRe = /[A-Z]{2,4}-\d{2,6}/
  const fmtCod = cat.filter(r => codRe.test(r.formato || ''))
  w('Filas con patrón `XX-0000` en campo `formato`: **' + fmtCod.length + '**')
  w('')

  // Códigos en notas
  const notasRefRe = /\bref[o]?\s*([A-Z0-9][A-Z0-9\-]{3,})/i
  const conCodNotas = cat.filter(r => notasRefRe.test(r.notas || ''))
  w('Filas con código en `notas` (patrón `ref XXXX`): **' + conCodNotas.length + '**')
  w('')
  if (conCodNotas.length) {
    // Agrupar por proveedor
    const notasByProv = {}
    for (const r of conCodNotas) {
      const k = provMap[r.proveedor_id] || r.proveedor_id
      if (!notasByProv[k]) notasByProv[k] = { n: 0, ejemplo: null }
      notasByProv[k].n++
      if (!notasByProv[k].ejemplo) {
        const m = r.notas.match(notasRefRe)
        notasByProv[k].ejemplo = m ? m[1] : r.notas.slice(0, 40)
      }
    }
    w(table(
      Object.entries(notasByProv).sort((a, b) => b[1].n - a[1].n)
        .map(([proveedor, v]) => ({ proveedor, filas: v.n, ejemplo_ref: v.ejemplo })),
      ['proveedor', 'filas', 'ejemplo_ref']
    ))
  }
  w('')
  w('**Diagnóstico 3.10:** La clave más estable para el bloque 9 depende del proveedor:')
  w('- Proveedores con `referencia_proveedor` al 100%: upsert directo por ese campo.')
  w('- Proveedores con `referencia` (código de bodega): útil para agrupar por vino, no para upsert de tarifa.')
  w('- Proveedores sin ningún código: solo la clave normalizada (nombre+bodega+formato) es viable, sin garantía de unicidad.')
  w('')

  // ── 3.11 ─────────────────────────────────────────────────────────────────
  w('## 3.11  Favoritos')
  w('')
  w('Los favoritos están en `proveedor_catalogo_vinos.favorito = true`.')
  w('No apuntan a ninguna otra tabla — el flag es un boolean en la misma fila de oferta.')
  w('')
  const favByProv = {}
  for (const r of cat.filter(f => f.favorito)) {
    const k = provMap[r.proveedor_id] || r.proveedor_id
    favByProv[k] = (favByProv[k] || 0) + 1
  }
  const rows311 = Object.entries(favByProv).sort((a, b) => b[1] - a[1]).map(([proveedor, favoritos]) => ({ proveedor, favoritos }))
  rows311.push({ proveedor: 'TOTAL', favoritos: cat.filter(r => r.favorito).length })
  w(table(rows311, ['proveedor', 'favoritos']))
  w('')

  // ── 3.12 ─────────────────────────────────────────────────────────────────
  w('## 3.12  Lo de Carmen — carta de vinos')
  w('')
  const { data: rests } = await sb.from('restaurantes').select('id, nombre, slug').ilike('nombre', '%carmen%')
  if (!rests?.length) {
    w('No se encontró restaurante con nombre ~carmen~.')
  } else {
    for (const rest of rests) {
      w('Restaurante: **' + rest.nombre + '**  id: `' + rest.id + '`')
      w('')
      const carta = await fetchAll(sb, 'vinos', '*', q => q.eq('restaurante_id', rest.id))
      const conCoste   = carta.filter(r => r.coste_compra   && r.coste_compra   > 0).length
      const conProv    = carta.filter(r => r.proveedor      && r.proveedor      !== '').length
      const conPvpBot  = carta.filter(r => r.precio_botella && r.precio_botella > 0).length
      const conPvpCopa = carta.filter(r => r.precio_copa    && r.precio_copa    > 0).length
      const sinTodo    = carta.filter(r => !r.coste_compra && (!r.proveedor || r.proveedor === '') && !r.precio_botella).length
      w('| Campo | Informado | Total | % |')
      w('|---|---|---|---|')
      w('| Total líneas | ' + carta.length + ' | ' + carta.length + ' | 100% |')
      w('| `coste_compra` | ' + conCoste  + ' | ' + carta.length + ' | ' + Math.round(conCoste  / carta.length * 100) + '% |')
      w('| `proveedor` | '    + conProv   + ' | ' + carta.length + ' | ' + Math.round(conProv   / carta.length * 100) + '% |')
      w('| `precio_botella` | '+ conPvpBot + ' | ' + carta.length + ' | ' + Math.round(conPvpBot / carta.length * 100) + '% |')
      w('| `precio_copa` | '  + conPvpCopa+ ' | ' + carta.length + ' | ' + Math.round(conPvpCopa/ carta.length * 100) + '% |')
      w('| Sin coste, proveedor ni PVP | ' + sinTodo + ' | ' + carta.length + ' | ' + Math.round(sinTodo / carta.length * 100) + '% |')
      w('')
      // Por qué faltan costes
      const sinCosteProv = carta.filter(r => !r.coste_compra || r.coste_compra === 0)
      if (sinCosteProv.length) {
        const tienenProv  = sinCosteProv.filter(r => r.proveedor && r.proveedor !== '').length
        const tienenNombre = sinCosteProv.filter(r => r.nombre && r.nombre !== '').length
        w('De las ' + sinCosteProv.length + ' líneas sin `coste_compra`:')
        w('- Con `proveedor` informado (tarifa no importada): ' + tienenProv)
        w('- Con nombre pero sin proveedor (carta física, coste desconocido): ' + (sinCosteProv.length - tienenProv))
        w('')
        w('Muestra (5 líneas sin coste):')
        w('')
        const muestra = sinCosteProv.slice(0, 5)
        w(table(muestra.map(r => ({
          nombre: (r.nombre || '').slice(0, 35),
          proveedor: (r.proveedor || '∅').slice(0, 20),
          precio_botella: r.precio_botella || '∅',
        })), ['nombre', 'proveedor', 'precio_botella']))
      }
    }
  }
  w('')
  w('---')
  w('_3.5 y 3.6 requieren pg_trgm. Ejecutar `sql/metricas-catalogo.sql` §3.5–3.6 en el SQL Editor de Supabase._')

  fs.mkdirSync('docs', { recursive: true })
  const outPath = 'docs/metricas-catalogo-2026-09-12.md'
  fs.writeFileSync(outPath, out.join('\n'), 'utf8')
  process.stderr.write('Guardado: ' + outPath + '\n')
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
