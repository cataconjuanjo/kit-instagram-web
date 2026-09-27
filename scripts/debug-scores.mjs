/**
 * Debug de scores del motor para platos de test.
 * Muestra qué vinos entran/salen de los umbrales para cada plato.
 * Ejecutar: node --experimental-detect-module scripts/debug-scores.mjs
 */
import { analizarMaridaje } from '../app/lib/maridajeEngine.js'

const SCORE_MINIMO = 15
const UMBRAL_RELATIVO = 0.60

const MOCK_WINES = [
  { id: 't1', nombre: 'Tinto Joven',   tipo: 'tinto',    precio_botella: 18, precio_copa: 3.5, uva: 'tempranillo',         notas_cata: 'fruta roja jugoso',               region: 'Rioja' },
  { id: 't2', nombre: 'Tinto Reserva', tipo: 'tinto',    precio_botella: 35, precio_copa: 7,   uva: 'tempranillo cabernet', notas_cata: 'fruta negra especias roble',      region: 'Ribera del Duero' },
  { id: 'b1', nombre: 'Blanco Fresco', tipo: 'blanco',   precio_botella: 20, precio_copa: 4,   uva: 'verdejo',              notas_cata: 'citrico fresco mineral',          region: 'Rueda' },
  { id: 'g1', nombre: 'Fino Seco',     tipo: 'generoso', precio_botella: 12, precio_copa: 2.5, uva: 'palomino',             notas_cata: 'fino salino seco amargo',         region: 'Jerez' },
  { id: 'd1', nombre: 'Pedro Ximenez', tipo: 'dulce',    precio_botella: 22, precio_copa: 5,   uva: 'pedro ximenez',        notas_cata: 'dulce pasas higo miel',           region: 'Jerez' },
]

const PLATOS = [
  { label: 'Rabo de toro (ES)',           consulta: 'Rabo de toro' },
  { label: 'Braised oxtail (EN)',          consulta: 'Braised oxtail' },
  { label: 'Calamar a la plancha',         consulta: 'Calamar a la plancha' },
  { label: 'Calamar hervido (no brasa)',   consulta: 'Calamar hervido' },
  { label: 'Tarta de queso artesana (ES)', consulta: 'Tarta de queso artesana' },
  { label: 'Artisan cheesecake (EN)',      consulta: 'Artisan cheesecake' },
  { label: 'Lubina hervida',               consulta: 'Lubina hervida' },
  { label: 'Croquetas caseras',            consulta: 'Croquetas caseras' },
  { label: 'Coulant de chocolate',         consulta: 'Coulant de chocolate' },
]

const COL = { nombre: 22, tipo: 10, score: 8, min: 7, rel: 7, compat: 8 }
const pad = (s, n) => String(s).padEnd(n)

for (const { label, consulta } of PLATOS) {
  const { candidatos, recomendados } = analizarMaridaje(consulta, MOCK_WINES)
  const todos = [...new Map(
    [...(recomendados || []), ...(candidatos || [])].map(c => [c.vino.id, c])
  ).values()].sort((a, b) => b.score - a.score)
  const topScore = todos[0]?.score ?? 0

  console.log(`\n${'─'.repeat(70)}`)
  console.log(`Plato: ${label}`)
  console.log(`${'─'.repeat(70)}`)
  console.log(
    `  ${pad('Vino', COL.nombre)}${pad('Tipo', COL.tipo)}${pad('Score', COL.score)}` +
    `${pad('≥MIN?', COL.min)}${pad('≥60%?', COL.rel)}${pad('Compat', COL.compat)}  Motivo`
  )
  for (const c of todos) {
    const score  = c.score.toFixed(1)
    const minOk  = c.score >= SCORE_MINIMO         ? '✓' : '✗ EXCL'
    const relOk  = c.score >= topScore * UMBRAL_RELATIVO ? '✓' : '✗ EXCL'
    const compat = c.compatible ? 'OK' : 'BLOQ'
    console.log(
      `  ${pad(c.vino.nombre, COL.nombre)}${pad(c.vino.tipo, COL.tipo)}${pad(score, COL.score)}` +
      `${pad(minOk, COL.min)}${pad(relOk, COL.rel)}${pad(compat, COL.compat)}  ${(c.motivo || '').slice(0, 55)}`
    )
  }
  if (!todos.length) console.log('  (sin candidatos)')
}
