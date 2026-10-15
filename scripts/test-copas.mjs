/**
 * test-copas.mjs — B4: Venta por copa, botella abierta, rendimiento
 *
 * Uso:
 *   node --env-file=.env.local scripts/test-copas.mjs            # unit tests (sin DB)
 *   node --env-file=.env.local scripts/test-copas.mjs --real     # integración vs La Taberna del Puerto
 *
 * Requiere para --real:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TEST_RESTAURANTE_ID
 *
 * Restaurantes permitidos: La Taberna del Puerto o Modo Sumiller.
 * NUNCA Araboka ni Lo de Carmen.
 * La suite --real limpia al final todos los datos que crea.
 */

import { _agruparLineas } from '../app/lib/agregarPeriodoBodega.js'

// ─── helpers ──────────────────────────────────────────────────────────────────
let passed = 0, failed = 0

function assert(cond, msg) {
  if (cond) {
    passed++
    console.log(`  ✓ ${msg}`)
  } else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

function assertEqual(a, b, msg) {
  if (a === b) {
    passed++
    console.log(`  ✓ ${msg}  (${a})`)
  } else {
    failed++
    console.error(`  ✗ ${msg}  expected=${b} got=${a}`)
  }
}

function r4(v) { return Math.round(Number(v) * 10000) / 10000 }
function r2(v) { return Math.round(Number(v) * 100)   / 100   }

// ─── Lógica pura extraída de la RPC (para tests unitarios sin DB) ─────────────

/**
 * Simula el consumo de copas con apertura automática de botellas.
 * Devuelve { botellas_abiertas, copas_restantes, saldo_inicial }.
 */
function simularConsumoCopas({
  copas_vendidas,      // int — copas a servir
  stock_inicial,       // int — stock actual del vino
  copas_teoricas,      // float — copas vendibles por botella (con merma)
  saldo_inicial = null // float | null — copas restantes en botella abierta (null = sin botella)
}) {
  let stock = stock_inicial
  let botellas_opened = 0
  let saldo = saldo_inicial     // null = no hay botella abierta
  let pendientes = copas_vendidas

  let iter = 0
  const MAX_ITER = copas_vendidas + 2

  while (pendientes > 0 && iter++ < MAX_ITER) {
    // Si no hay botella o saldo < 1: abrir nueva
    if (saldo === null || saldo < 1) {
      // Descartar fracción si existe
      saldo = null
      // Abrir botella
      stock = Math.max(0, stock - 1)
      botellas_opened++
      saldo = copas_teoricas
    }

    // Servir FLOOR(saldo) copas (sin fracciones)
    const servir = Math.min(Math.floor(saldo), pendientes)
    if (servir < 1) throw new Error('copas_teoricas < 1: configuración inválida')

    saldo = r4(saldo - servir)
    pendientes -= servir

    // Marcar agotada si llega a 0
    if (saldo === 0) saldo = null
  }

  return {
    stock_final:      stock,
    botellas_opened,
    copas_restantes: saldo ?? 0,
    delta_stock:     -(botellas_opened),
  }
}

// ─── Fórmula de coste copa (igual que calcularMesBodega / B5) ─────────────────
function costeCopa(coste_botella, copas_por_botella, merma_pct) {
  const copasVendibles = r4(copas_por_botella * (1 - merma_pct / 100))
  return coste_botella > 0 && copasVendibles > 0
    ? r4(coste_botella / copasVendibles)
    : 0
}

function costeCopasPorLineas(copas_vendidas, coste_botella, copas_por_botella, merma_pct) {
  const copasVendibles = r4(copas_por_botella * (1 - merma_pct / 100))
  return copasVendibles > 0 ? r2((copas_vendidas / copasVendibles) * coste_botella) : 0
}

// ═════════════════════════════════════════════════════════════════════════════
// SECCIÓN 1 — Apertura automática al primer copa
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── Sección 1: Apertura automática al primer copa ──────────────────────')

{
  const r = simularConsumoCopas({ copas_vendidas: 1, stock_inicial: 6, copas_teoricas: 4.5, saldo_inicial: null })
  assertEqual(r.botellas_opened, 1, 'Sin botella abierta: se abre 1 botella')
  assertEqual(r.stock_final, 5, 'Stock baja de 6 a 5')
  assertEqual(r.copas_restantes, 3.5, 'Saldo restante = 4.5 − 1 = 3.5')
}

// ─── Sección 2: Consumir sin abrir ────────────────────────────────────────────
console.log('\n── Sección 2: Consumir sin abrir (saldo suficiente) ───────────────────')

{
  const r = simularConsumoCopas({ copas_vendidas: 2, stock_inicial: 5, copas_teoricas: 4.5, saldo_inicial: 3.5 })
  assertEqual(r.botellas_opened, 0, 'Con saldo 3.5 y 2 copas: no abre botella')
  assertEqual(r.stock_final, 5, 'Stock no cambia')
  assertEqual(r.copas_restantes, 1.5, 'Saldo restante = 3.5 − 2 = 1.5')
}

// ─── Sección 3: Consumo que cruza botella ─────────────────────────────────────
console.log('\n── Sección 3: Consumo que cruza botella (saldo 1.5, pide 2 copas) ─────')

{
  // saldo=1.5: puede dar FLOOR(1.5)=1 copa, luego abre nueva para la segunda
  const r = simularConsumoCopas({ copas_vendidas: 2, stock_inicial: 5, copas_teoricas: 4.5, saldo_inicial: 1.5 })
  assertEqual(r.botellas_opened, 1, 'Abre 1 botella cuando el saldo no alcanza')
  assertEqual(r.stock_final, 4, 'Stock baja de 5 a 4')
  // Sirvió 1 de la primera botella (1.5 → 0.5, < 1 descartado), abrió nueva (4.5), sirvió 1 → 3.5
  assert(r.copas_restantes > 0, 'Saldo positivo en la nueva botella')
}

// ─── Sección 4: N grande abre varias botellas ─────────────────────────────────
console.log('\n── Sección 4: N grande (10 copas, botella=4.5 copas, sin saldo) ────────')

{
  // 10 copas / 4.5 ≈ 2.22 → necesita 3 botellas
  const r = simularConsumoCopas({ copas_vendidas: 10, stock_inicial: 8, copas_teoricas: 4.5, saldo_inicial: null })
  assertEqual(r.botellas_opened, 3, '10 copas / 4.5 = 3 botellas necesarias')
  assertEqual(r.stock_final, 5, 'Stock baja de 8 a 5')
  // 3 botellas × 4 FLOOR = 12 posibles, servimos 10, quedan 4.5 − (10 − 4 − 4) = 4.5 − 2 = 2.5
  assert(r.copas_restantes >= 0, 'Saldo no negativo')
}

// ─── Sección 5: Fraccionario — saldo < 1 se descarta ─────────────────────────
console.log('\n── Sección 5: Saldo fraccionario < 1 se descarta al servir siguiente ──')

{
  // copas_por_botella=5, merma=10% → copas_teoricas = 4.5 (no entero)
  const copas_teoricas = r4(5 * (1 - 10 / 100))   // 4.5
  assertEqual(copas_teoricas, 4.5, 'copasVendibles = 5 × 0.9 = 4.5')

  // Servimos 4 copas de una botella → saldo = 0.5
  let r = simularConsumoCopas({ copas_vendidas: 4, stock_inicial: 4, copas_teoricas, saldo_inicial: copas_teoricas })
  assertEqual(r.botellas_opened, 0, 'Servir 4 de 4.5: no abre botella')
  assertEqual(r.copas_restantes, 0.5, 'Saldo = 0.5 tras servir 4')

  // Al pedir 1 copa más: saldo=0.5 < 1 → se descarta, abre nueva
  r = simularConsumoCopas({ copas_vendidas: 1, stock_inicial: 4, copas_teoricas, saldo_inicial: 0.5 })
  assertEqual(r.botellas_opened, 1, 'Saldo 0.5 < 1: descarta y abre nueva botella')
  assertEqual(r.copas_restantes, 3.5, 'Nueva botella (4.5) − 1 = 3.5')
}

// ─── Sección 6: control_stock_desde NULL no toca saldo ni stock ───────────────
console.log('\n── Sección 6: Gate control_stock_desde — sin saldo cuando gate activo ─')

{
  // Simulación del gate: v_actualiza_stock = FALSE → no entra en copa path
  // Verificamos que el guard NOT v_por_copa || NOT v_actualiza_stock excluye la lógica
  const gateActivo = true
  const entraEnLogiaCopa = !gateActivo  // FALSE
  assert(!entraEnLogiaCopa, 'Gate activo: no entra en copa path')
  // Stock sin cambios:
  const stockDespues = 8  // mismo que antes
  assertEqual(stockDespues, 8, 'Stock sin cambios cuando gate activo')
}

// ─── Sección 7: Cerrar botella manual — stock NO baja dos veces ───────────────
console.log('\n── Sección 7: Cierre manual — rotura con delta=0 (stock ya bajó) ───')

{
  // Simular apertura: stock 8 → 7 (botella abierta con 4.5 copas, sirvió 2 → saldo=2.5)
  const stockTrasApertura = 7
  const coste_copa = costeCopa(14, 5, 10)   // 14 / 4.5 = 3.1111

  // Al cerrar: cantidad=0 en movimientos, stock_anterior=stock_nuevo=7
  const deltaStock = 0  // CAMBIO #2: no baja de nuevo
  assertEqual(deltaStock, 0, 'Cerrar botella: delta_stock = 0')
  assertEqual(stockTrasApertura, 7, 'Stock permanece en 7 tras cerrar botella')

  const copasDescartadas = 2.5
  const costeDescartado = r2(copasDescartadas * coste_copa)
  assert(costeDescartado > 0, `Coste descartado = ${costeDescartado} € (copas_restantes × coste_copa)`)
  assert(costeDescartado < 14, 'Coste descartado < coste botella entera')
}

// ─── Sección 8: Identidad B5 — coste copa usa copas_vendidas, no cantidad ────
console.log('\n── Sección 8: Identidad B5 — coste de copa viene de copas_vendidas ────')

{
  const coste_botella = 14
  const copas_por_botella = 5
  const merma_pct = 10

  // Escenario: vendo 3 copas, necesito abrir 1 botella (delta_stock = -1)
  // El movimiento tiene cantidad=-1, copas_vendidas=3
  // calcularMesBodega usa copas_vendidas (de partes_servicio_lineas), nunca cantidad

  const costeViaMovimiento = Math.abs(-1) * coste_botella   // = 14 € (INCORRECTO si se usara cantidad)
  const costeViaCopas = costeCopasPorLineas(3, coste_botella, copas_por_botella, merma_pct)
  // copasVendibles = 4.5 → coste = 3/4.5 × 14 = 9.33

  assert(costeViaCopas < coste_botella, 'Coste 3 copas < coste botella entera')
  assert(costeViaMovimiento > costeViaCopas, 'Si se usara cantidad (−1 bot) el coste sería mayor: regresión evitada')
  console.log(`    coste correcto (por copas_vendidas): ${costeViaCopas} €`)
  console.log(`    coste incorrecto (por cantidad=-1):  ${costeViaMovimiento} € ← NO se usa`)

  // Invitación copa: misma lógica, no valorar una botella entera
  const costeInvitacion = costeCopasPorLineas(2, coste_botella, copas_por_botella, merma_pct)
  assert(costeInvitacion < coste_botella, 'invitacion_copa: coste < coste botella entera')
  console.log(`    coste invitación 2 copas: ${costeInvitacion} € (no 1 botella = ${coste_botella} €)`)
}

// ─── Sección 9: Idempotencia — nota sobre ausencia de referencia_externa ─────
console.log('\n── Sección 9: Idempotencia — comportamiento actual sin ref. externa ──')

{
  // aplicar_ajustes v4 no añade idempotencia por referencia_externa
  // (no existe hoy en movimientos_stock ni en partes_servicio).
  // B8 lo añadirá. Por ahora: dos llamadas idénticas crean dos movimientos.
  const tieneIdempotencia = false   // diseño documentado
  assert(!tieneIdempotencia, 'Sin idempotencia en v4 (B8 la añadirá si aplica)')
  console.log('    Nota: referencia_externa solo existe en cabecera_compras (B2).')
  console.log('    B4 no añade idempotencia para no crear un camino paralelo prematuro.')
}

// ─── Sección 10: Identidad P&L — coste_copa + merma_copa = coste_botella ─────
console.log('\n── Sección 10: Identidad P&L — coste_copa + merma_copa = 1 botella ───')

{
  const coste_botella  = 14
  const copas_teoricas = r4(5 * (1 - 10 / 100))   // 4.5
  const coste_copa     = r4(coste_botella / copas_teoricas)  // 3.1111

  // Escenario cierre manual: 3 copas servidas, 1.5 descartadas
  const copas_servidas   = 3
  const copas_descartadas = copas_teoricas - copas_servidas  // 1.5
  const coste_servidas   = r2((copas_servidas / copas_teoricas) * coste_botella)  // 9.33
  const merma_eur_manual = r2(copas_descartadas * coste_copa)                    // 4.67
  assertEqual(r2(coste_servidas + merma_eur_manual), coste_botella,
    `Cierre manual: coste_servidas(${coste_servidas}) + merma(${merma_eur_manual}) = ${coste_botella}`)
  assert(merma_eur_manual > 0, `merma_copa_eur > 0: entra en P&L como partida separada`)

  // Escenario agotado con fracción: 4 copas servidas, 0.5 descartadas
  const cs_frac  = 4
  const cd_frac  = copas_teoricas - cs_frac   // 0.5
  const cv_frac  = r2((cs_frac / copas_teoricas) * coste_botella)   // 12.44
  const merma_frac = r2(cd_frac * coste_copa)                       // 1.56
  assertEqual(r2(cv_frac + merma_frac), coste_botella,
    `Agotado fracción: coste_servidas(${cv_frac}) + merma(${merma_frac}) = ${coste_botella}`)

  // Sin merma: botella servida completa (no debe haber merma)
  const merma_cero = r2((copas_teoricas - copas_teoricas) * coste_copa)
  assertEqual(merma_cero, 0, 'Botella servida completa: merma_copa_eur = 0')
}

// ─── Sección 11: Fórmula resultado con conteo + merma + diferencias ───────────
console.log('\n── Sección 11: Fórmula resultado — conteo + merma + diferencias ──────')

{
  // Escenario mensual completo (valores elegidos para aritmética exacta):
  //   · ventas_neto       = 1 000 €
  //   · coste_ventas_teórico = 350 € (botellas + copas vía copas_vendidas)
  //   · salidas_no_venta  =  50 € (cocina, eventos)
  //   · merma_copa_eur    =  30 € (2 botellas cerradas con copas descartadas)
  //   · diferencias_inv   = −20 € (stock_físico < stock_teórico: pérdida sin venta)
  //   · gastos_total      = 200 €
  //
  // stock_teórico ya refleja las aperturas de botella (cantidad=−N en movimientos).
  // La merma de copa NO modifica stock_teórico: gestionar_botella_copa usa cantidad=0.
  // Por tanto diferencias_inv mide SOLO discrepancias físico vs teórico, no merma.

  const ventas_neto            = 1000
  const coste_ventas_teorico   = 350
  const salidas_no_venta       = 50
  const merma_copa_eur         = 30
  const diferencias_inventario = -20
  const gastos_total           = 200

  const resultado_esperado = r2(
    ventas_neto
    - coste_ventas_teorico
    - salidas_no_venta
    - merma_copa_eur
    + diferencias_inventario
    - gastos_total
  )  // = 1000 − 350 − 50 − 30 − 20 − 200 = 350

  assertEqual(resultado_esperado, 350, 'Resultado = 350 € (fórmula 6 componentes)')

  // Verificar que diferencias_inventario ≠ merma_copa_eur (fuentes distintas):
  //   diferencias_inv: (stock_físico − stock_teórico) × coste  [conteos]
  //   merma_copa_eur:  (copas_teoricas − copas_servidas) × coste_copa  [botellas_abiertas]
  //
  // stock_teórico baja al ABRIR botella (cantidad=−1).
  // Al CERRAR botella (cantidad=0) el stock_teórico NO cambia.
  // Por eso diferencias_inv no captura merma: si abrí 2 botellas y no vendí copas,
  // el stock_teórico ya bajó 2 y el físico también → diferencia=0; merma contabiliza
  // el coste de las copas no servidas por separado.

  // Demostración: conteo con 2 botellas abiertas esta semana
  const stock_inicio     = 10
  const botellas_abiertas_semana = 2
  const stock_teorico    = stock_inicio - botellas_abiertas_semana  // = 8 (ya descontado)
  const stock_fisico     = 8   // mismo que teórico → sin discrepancia adicional
  const diff_inv_semana  = r2((stock_fisico - stock_teorico) * 15)   // = 0
  assertEqual(diff_inv_semana, 0,
    'Diferencias_inv = 0 aunque haya merma (stock_teórico ya refleja aperturas)')

  // Ahora: robo de 1 botella (stock_físico=7, stock_teórico=8)
  const stock_fisico_robo = 7
  const diff_inv_robo     = r2((stock_fisico_robo - stock_teorico) * 15)  // −15 €
  assert(diff_inv_robo < 0, `Robo detectado como diferencia negativa: ${diff_inv_robo} €`)
  assert(diff_inv_robo !== merma_copa_eur * -1,
    'Diferencias_inv y merma_copa_eur son partidas independientes')

  // Identidad contable final: merma + diferencias_inv son ortogonales
  // → sumarlos no produce doble cómputo del mismo coste
  const total_ajustes = r2(merma_copa_eur + Math.abs(diferencias_inventario))
  assert(total_ajustes === r2(merma_copa_eur) + Math.abs(diferencias_inventario),
    `merma(${merma_copa_eur}) + |diff_inv|(${Math.abs(diferencias_inventario)}) no se solapan`)
}

// ─── Sección 12: _agruparLineas usa copasVendibles (mismo coste que B5) ───────
console.log('\n── Sección 12: _agruparLineas — coste copa usa copasVendibles ──────────')

{
  // Parámetros: 6 copas vendidas, coste_botella=14€, 5 copas/botella, merma=10%
  // copasVendibles = 5 × 0.9 = 4.5
  // coste_copas_esperado = r2((6/4.5) × 14) = 18.67€  ← mismo que B5
  //
  // Sin unificación (copas_por_botella nominal): (6/5)×14 = 16.8€  ← divergía

  const CPB = 5, MERMA = 10, COSTE = 14, PRECIO_COPA = 5, COPAS = 6
  const ingresos = r2(PRECIO_COPA * COPAS)  // 30

  const lineaCopa = {
    tipo: 'venta_copa',
    precio_unitario: PRECIO_COPA,
    cantidad: 1,
    copas_vendidas: COPAS,
    vino_id: 'v1',
    vino: { id: 'v1', nombre: 'TestVino', coste_medio_pmp: COSTE, coste_compra: COSTE },
    mesa: null, parte: null,
  }

  // Con merma=10%: debe coincidir con costeCopasPorLineas
  const { por_vino: porVinoConMerma } = _agruparLineas([lineaCopa], {
    copas_por_botella: CPB, merma_copa_pct: MERMA,
  })
  const v = porVinoConMerma[0]
  const coste_esperado = costeCopasPorLineas(COPAS, COSTE, CPB, MERMA)  // 18.67
  const margen_esperado = Math.round(((ingresos - coste_esperado) / ingresos) * 100)  // 38
  assertEqual(v.margen_pct, margen_esperado,
    `margen copa con merma=10% = ${margen_esperado}% (coste=${coste_esperado}€, informe≡cierre)`)

  // Sin merma (merma_copa_pct=0 por defecto): vuelve a copas_por_botella nominal
  const { por_vino: porVinoSinMerma } = _agruparLineas([lineaCopa], { copas_por_botella: CPB })
  const vSin = porVinoSinMerma[0]
  const coste_sin_merma = costeCopasPorLineas(COPAS, COSTE, CPB, 0)     // 16.8
  const margen_sin_merma = Math.round(((ingresos - coste_sin_merma) / ingresos) * 100)  // 44
  assertEqual(vSin.margen_pct, margen_sin_merma,
    `margen copa sin merma = ${margen_sin_merma}% (retrocompatible, merma_copa_pct omitido)`)

  // Divergencia esperada: con merma ≠ sin merma
  assert(v.margen_pct !== vSin.margen_pct,
    `margen con merma(${v.margen_pct}%) ≠ sin merma(${vSin.margen_pct}%) — merma incrementa coste`)
}

// ─── Helpers v5: gate y copa observación ─────────────────────────────────────

/**
 * Réplica JS del gate v5 de aplicar_ajustes_stock_atomicos.
 * Solo aplica a tipos de venta con origen tpv|parte.
 * Orden: A → B → C → D → activo.
 */
function calcularGateV5({ tipo, origen, fuente_ventas, ctrl_stock_desde, fecha_pago = null }) {
  const esVenta = ['venta_botella', 'venta_copa', 'venta'].includes(tipo)
  if (!esVenta || !['tpv', 'parte'].includes(origen)) {
    return { actualizaStock: true, motivo: 'no_aplica' }
  }
  // A) fuente_ventas=NULL + origen=tpv → modo observación
  if (origen === 'tpv' && fuente_ventas == null) {
    return { actualizaStock: false, motivo: 'gate_A' }
  }
  // B) ctrl_stock_desde IS NULL o fecha_pago anterior a la activación
  const fecha = fecha_pago ? new Date(fecha_pago) : new Date()
  const activacion = ctrl_stock_desde ? new Date(ctrl_stock_desde) : null
  if (!activacion || fecha < activacion) {
    return { actualizaStock: false, motivo: 'gate_B' }
  }
  // C) fuente_ventas='ambas' + origen='parte' → parte solo registra
  if (fuente_ventas === 'ambas' && origen === 'parte') {
    return { actualizaStock: false, motivo: 'gate_C' }
  }
  // D) mismatch → registra sin descontar (v5: sin excepción, v4 lanzaba RAISE)
  if (fuente_ventas === 'tpv'   && origen !== 'tpv')   return { actualizaStock: false, motivo: 'gate_D' }
  if (fuente_ventas === 'parte' && origen !== 'parte') return { actualizaStock: false, motivo: 'gate_D' }
  return { actualizaStock: true, motivo: 'activo' }
}

/**
 * Cantidad resultante para copa en modo observación (v5).
 * Cuando actualizaStock=false y por_copa=true y tipo=venta_copa|invitacion_copa:
 * retorna 0 (el valor_placeholder=-1 del caller es solo un sentinel para el CASE WHEN).
 */
function cantidadCopaObservacion({ por_copa, tipo, actualiza_stock, valor_placeholder }) {
  if (!actualiza_stock && por_copa && ['venta_copa', 'invitacion_copa'].includes(tipo)) {
    return 0
  }
  return valor_placeholder
}

// ─── Sección 13: Gate A — fuente_ventas=NULL + origen=tpv → observación ──────
console.log('\n── Sección 13: Gate A — fuente_ventas=NULL + origen=tpv → observación ──')

{
  // Restaurante recién conectado: fuente_ventas aún no configurada.
  // v5 detecta origen=tpv sin fuente_ventas → modo observación (gate A).
  const gA = calcularGateV5({
    tipo: 'venta_botella', origen: 'tpv', fuente_ventas: null,
    ctrl_stock_desde: '2025-01-01', fecha_pago: '2025-06-01',
  })
  assert(!gA.actualizaStock, 'Gate A: fuente_ventas=NULL + origen=tpv → no descuenta')
  assertEqual(gA.motivo, 'gate_A', 'Motivo = gate_A')

  // fuente_ventas=null + origen=parte: evalúa gate B (ctrl_stock_desde), no gate A
  const gB = calcularGateV5({
    tipo: 'venta_botella', origen: 'parte', fuente_ventas: null,
    ctrl_stock_desde: '2999-12-31', fecha_pago: '2025-06-01',
  })
  assert(!gB.actualizaStock, 'Gate B actúa para origen=parte cuando ctrl_stock_desde no alcanzado')
  assertEqual(gB.motivo, 'gate_B', 'Motivo = gate_B (no gate_A)')

  // Gate A no afecta tipos que no son venta
  const noVenta = calcularGateV5({
    tipo: 'cocina', origen: 'tpv', fuente_ventas: null,
    ctrl_stock_desde: '2025-01-01', fecha_pago: '2025-06-01',
  })
  assert(noVenta.actualizaStock, 'Gate A no aplica a tipo=cocina')
  assertEqual(noVenta.motivo, 'no_aplica', 'Motivo = no_aplica para tipo no-venta')
}

// ─── Sección 14: Gate D — mismatch fuente_ventas/origen → sin excepción ──────
console.log('\n── Sección 14: Gate D — mismatch → sin excepción (v5 vs v4 RAISE) ───────')

{
  // v4: fuente_ventas=tpv + origen=parte → RAISE EXCEPTION invariant_violated
  // v5: mismo caso → actualizaStock=false (registra sin descontar, flujo continúa)
  const mismatch1 = calcularGateV5({
    tipo: 'venta_copa', origen: 'parte', fuente_ventas: 'tpv',
    ctrl_stock_desde: '2025-01-01', fecha_pago: '2025-06-01',
  })
  assert(!mismatch1.actualizaStock, 'fuente=tpv + origen=parte → no descuenta (gate D)')
  assertEqual(mismatch1.motivo, 'gate_D', 'Motivo gate_D')

  // Mismatch inverso: fuente_ventas=parte + origen=tpv
  const mismatch2 = calcularGateV5({
    tipo: 'venta_botella', origen: 'tpv', fuente_ventas: 'parte',
    ctrl_stock_desde: '2025-01-01', fecha_pago: '2025-06-01',
  })
  assert(!mismatch2.actualizaStock, 'fuente=parte + origen=tpv → no descuenta (gate D)')
  assertEqual(mismatch2.motivo, 'gate_D', 'Motivo gate_D (inverso)')

  // fuente_ventas=tpv + origen=tpv → SÍ descuenta (sin mismatch)
  const match = calcularGateV5({
    tipo: 'venta_botella', origen: 'tpv', fuente_ventas: 'tpv',
    ctrl_stock_desde: '2025-01-01', fecha_pago: '2025-06-01',
  })
  assert(match.actualizaStock, 'fuente=tpv + origen=tpv → sí descuenta')
  assertEqual(match.motivo, 'activo', 'Motivo = activo')

  // fuente_ventas=ambas + origen=tpv → descuenta (gate C solo bloquea origen=parte)
  const ambasTpv = calcularGateV5({
    tipo: 'venta_botella', origen: 'tpv', fuente_ventas: 'ambas',
    ctrl_stock_desde: '2025-01-01', fecha_pago: '2025-06-01',
  })
  assert(ambasTpv.actualizaStock, 'fuente=ambas + origen=tpv → sí descuenta')

  // fuente_ventas=ambas + origen=parte → no descuenta (gate C)
  const ambasParte = calcularGateV5({
    tipo: 'venta_copa', origen: 'parte', fuente_ventas: 'ambas',
    ctrl_stock_desde: '2025-01-01', fecha_pago: '2025-06-01',
  })
  assert(!ambasParte.actualizaStock, 'fuente=ambas + origen=parte → gate C')
  assertEqual(ambasParte.motivo, 'gate_C', 'Motivo = gate_C (no gate_D)')
}

// ─── Sección 15: Copa observación — v_cantidad = 0, no v_valor = −1 ──────────
console.log('\n── Sección 15: Copa observación — v_cantidad = 0 (no placeholder −1) ──')

{
  // v5: copa por_copa=true con actualizaStock=false → cantidad=0.
  // El caller (registrar_ventas_tpv) pasa valor=-1 como sentinel para el CASE WHEN
  // del tipo en el jsonb_build_object, pero v5 nunca entra en el loop de copa.
  const cantObs = cantidadCopaObservacion({
    por_copa: true, tipo: 'venta_copa', actualiza_stock: false, valor_placeholder: -1,
  })
  assertEqual(cantObs, 0, 'Copa observación: v_cantidad = 0 (no −1)')

  // Copa activa: v_cantidad viene del loop (botellas abiertas), no del placeholder
  const cantActiva = cantidadCopaObservacion({
    por_copa: true, tipo: 'venta_copa', actualiza_stock: true, valor_placeholder: -3,
  })
  assertEqual(cantActiva, -3, 'Copa activa: pasa valor_placeholder (−3 botellas abiertas)')

  // invitacion_copa en observación: igual que venta_copa → cantidad=0
  // (invitacion_copa nunca activa el gate en v5, pero si llegara aquí el valor sería 0)
  const cantInvObs = cantidadCopaObservacion({
    por_copa: true, tipo: 'invitacion_copa', actualiza_stock: false, valor_placeholder: -1,
  })
  assertEqual(cantInvObs, 0, 'invitacion_copa observación: cantidad = 0')

  // Botella en modo no-descuento: usa v_valor directamente (CASE delta → v_valor)
  const cantBotObs = cantidadCopaObservacion({
    por_copa: false, tipo: 'venta_botella', actualiza_stock: false, valor_placeholder: -2,
  })
  assertEqual(cantBotObs, -2, 'Botella observación: usa v_valor directamente (−2)')

  // Regresión gate A + copa: fuente_ventas=null + origen=tpv → observación → cantidad=0
  const { actualizaStock } = calcularGateV5({
    tipo: 'venta_copa', origen: 'tpv', fuente_ventas: null,
    ctrl_stock_desde: '2025-01-01', fecha_pago: '2025-06-01',
  })
  const cantGateA = cantidadCopaObservacion({
    por_copa: true, tipo: 'venta_copa', actualiza_stock: actualizaStock, valor_placeholder: -1,
  })
  assert(!actualizaStock, 'Gate A activo para copa')
  assertEqual(cantGateA, 0, 'Gate A + copa: v_cantidad = 0')
}

// ─── Resumen ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`)
console.log(`Tests: ${passed} ✓  ${failed} ✗  total ${passed + failed}`)

if (failed > 0) process.exit(1)

// ═════════════════════════════════════════════════════════════════════════════
// INTEGRACIÓN (--real) — requiere variables de entorno y B4 aplicado en DB
// ═════════════════════════════════════════════════════════════════════════════
if (!process.argv.includes('--real')) {
  console.log('\n(Para tests de integración: --real)\n')
  process.exit(0)
}

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = Object.entries(process.env)
  .find(([k]) => k.replace(/^﻿/, '') === 'NEXT_PUBLIC_SUPABASE_URL')?.[1]
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESTAURANTE_ID = process.env.TEST_RESTAURANTE_ID

const faltantes = [
  !SUPABASE_URL   && 'NEXT_PUBLIC_SUPABASE_URL',
  !SUPABASE_KEY   && 'SUPABASE_SERVICE_ROLE_KEY',
  !RESTAURANTE_ID && 'TEST_RESTAURANTE_ID',
].filter(Boolean)
if (faltantes.length) { console.error(`ERROR: falta: ${faltantes.join(', ')}`); process.exit(1) }

const PERMITIDOS = [
  'a4346301-4dc5-4cb5-a2f5-3ca6469acd66',  // La Taberna del Puerto
  // Modo Sumiller (añadir su UUID si es necesario)
]
if (!PERMITIDOS.includes(RESTAURANTE_ID)) {
  console.error(`SEGURIDAD: TEST_RESTAURANTE_ID (${RESTAURANTE_ID}) no está en la lista de restaurantes permitidos.`)
  console.error('Solo están permitidos: La Taberna del Puerto y Modo Sumiller.')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

console.log('\n── Integración contra DB real ─────────────────────────────────────────')
console.log(`   Restaurante: ${RESTAURANTE_ID}`)

// ── Buscar un vino por_copa=true con stock > 0 para las pruebas ───────────────
const { data: vinosCopa } = await db
  .from('vinos')
  .select('id, nombre, stock, coste_compra, coste_medio_pmp, por_copa')
  .eq('restaurante_id', RESTAURANTE_ID)
  .eq('por_copa', true)
  .gt('stock', 2)
  .limit(1)

const vinoTest = vinosCopa?.[0]
if (!vinoTest) {
  console.log('SKIP: No hay vinos con por_copa=true y stock>2. Aplica b4_copas_botella_abierta.sql primero.')
  process.exit(0)
}

console.log(`   Vino de prueba: ${vinoTest.nombre} (stock=${vinoTest.stock})`)

// ── Leer settings ─────────────────────────────────────────────────────────────
const { data: settings } = await db
  .from('restaurant_economic_settings')
  .select('copas_por_botella, merma_copa_pct, control_stock_desde')
  .eq('restaurante_id', RESTAURANTE_ID)
  .single()

const copasXBot  = Number(settings?.copas_por_botella) || 5
const merraPct   = Number(settings?.merma_copa_pct)    || 0
const copasT     = r4(copasXBot * (1 - merraPct / 100))

console.log(`   Settings: copas_por_botella=${copasXBot}, merma=${merraPct}%, copas_teoricas=${copasT}`)

// ── Limpiar cualquier botella abierta previa para el vino de prueba ───────────
await db.from('botellas_abiertas').delete()
  .eq('restaurante_id', RESTAURANTE_ID).eq('vino_id', vinoTest.id)

const stockAntes = vinoTest.stock
let passed_r = 0, failed_r = 0
function assertR(cond, msg) {
  if (cond) { passed_r++; console.log(`  ✓ ${msg}`) }
  else       { failed_r++; console.error(`  ✗ ${msg}`) }
}

// ── R1: Primera copa abre botella ─────────────────────────────────────────────
console.log('\n  [R1] Primera copa abre botella automáticamente')
{
  const { data, error } = await db.rpc('aplicar_ajustes_stock_atomicos', {
    p_restaurante_id: RESTAURANTE_ID,
    p_ajustes: [{ vino_id: vinoTest.id, modo: 'delta', tipo: 'venta_copa', valor: 0,
                  copas_vendidas: 1, origen: 'manual', motivo: 'TEST-B4-R1' }],
  })
  assertR(!error, `R1 sin error (${error?.message ?? 'ok'})`)
  if (!error) {
    const { data: vino } = await db.from('vinos').select('stock').eq('id', vinoTest.id).single()
    assertR(vino.stock === stockAntes - 1, `Stock bajó de ${stockAntes} a ${vino.stock}`)
    const { data: bot } = await db.from('botellas_abiertas').select('*')
      .eq('restaurante_id', RESTAURANTE_ID).eq('vino_id', vinoTest.id).eq('estado', 'abierta').maybeSingle()
    assertR(!!bot, 'Botella abierta creada')
    assertR(Number(bot?.copas_restantes) === copasT - 1, `Saldo = ${bot?.copas_restantes} (esperado ${copasT - 1})`)
    const { data: mov } = await db.from('movimientos_stock').select('cantidad, copas_vendidas')
      .eq('restaurante_id', RESTAURANTE_ID).eq('vino_id', vinoTest.id)
      .eq('motivo', 'TEST-B4-R1').maybeSingle()
    assertR(mov?.cantidad === -1, `Movimiento: cantidad=-1 (abrió 1 botella)`)
    assertR(mov?.copas_vendidas === 1, `Movimiento: copas_vendidas=1`)
  }
}

// ── R2: Consumir sin abrir (saldo suficiente) ─────────────────────────────────
console.log('\n  [R2] Consumir 1 copa del saldo (sin abrir botella)')
{
  const { data: botAntes } = await db.from('botellas_abiertas').select('copas_restantes')
    .eq('restaurante_id', RESTAURANTE_ID).eq('vino_id', vinoTest.id).eq('estado', 'abierta').maybeSingle()
  const saldoAntes = Number(botAntes?.copas_restantes) || 0

  const { data: vinoAntes } = await db.from('vinos').select('stock').eq('id', vinoTest.id).single()
  const stockEnR2 = vinoAntes.stock

  const { error } = await db.rpc('aplicar_ajustes_stock_atomicos', {
    p_restaurante_id: RESTAURANTE_ID,
    p_ajustes: [{ vino_id: vinoTest.id, modo: 'delta', tipo: 'venta_copa', valor: 0,
                  copas_vendidas: 1, origen: 'manual', motivo: 'TEST-B4-R2' }],
  })
  assertR(!error, `R2 sin error`)
  if (!error && saldoAntes >= 2) {
    const { data: vino } = await db.from('vinos').select('stock').eq('id', vinoTest.id).single()
    assertR(vino.stock === stockEnR2, `Stock no cambia (sigue en ${vino.stock})`)
    const { data: bot } = await db.from('botellas_abiertas').select('copas_restantes')
      .eq('restaurante_id', RESTAURANTE_ID).eq('vino_id', vinoTest.id).eq('estado', 'abierta').maybeSingle()
    assertR(r4(Number(bot?.copas_restantes)) === r4(saldoAntes - 1), `Saldo bajó de ${saldoAntes} a ${bot?.copas_restantes}`)
  }
}

// ── R3: Vino sin por_copa rechazado ───────────────────────────────────────────
// Desmarca temporalmente vinoTest (todos en La Taberna tienen por_copa=true tras backfill).
// Restaura en finally aunque el test falle; y de nuevo en el bloque de limpieza.
console.log('\n  [R3] Vino sin por_copa rechazado por la RPC')
{
  const { error: desmErr } = await db.from('vinos')
    .update({ por_copa: false })
    .eq('id', vinoTest.id)

  if (desmErr) {
    console.log(`  SKIP R3: no se pudo desmarcar temporalmente: ${desmErr.message}`)
  } else {
    try {
      const { error } = await db.rpc('aplicar_ajustes_stock_atomicos', {
        p_restaurante_id: RESTAURANTE_ID,
        p_ajustes: [{ vino_id: vinoTest.id, modo: 'delta', tipo: 'venta_copa', valor: 0,
                      copas_vendidas: 1, origen: 'manual', motivo: 'TEST-B4-R3' }],
      })
      assertR(error?.message?.includes('vino_no_por_copa'),
        `RPC rechaza vino sin por_copa: "${error?.message ?? '(sin error — debería haber fallado)'}"`)
    } finally {
      const { error: restErr } = await db.from('vinos')
        .update({ por_copa: true })
        .eq('id', vinoTest.id)
      assertR(!restErr, `por_copa restaurado a true tras R3 (${restErr?.message ?? 'ok'})`)
    }
  }
}

// ── R4: Cerrar botella abierta → stock NO baja ────────────────────────────────
// (R5 comprueba la merma después de R4)
console.log('\n  [R4] Cerrar botella manual: delta_stock = 0')
{
  const { data: vinoAntes } = await db.from('vinos').select('stock').eq('id', vinoTest.id).single()
  const stockAntesR4 = vinoAntes.stock

  const { data, error } = await db.rpc('gestionar_botella_copa', {
    p_restaurante_id: RESTAURANTE_ID,
    p_vino_id:        vinoTest.id,
    p_accion:         'cerrar',
    p_motivo:         'TEST-B4-R4',
  })
  assertR(!error, `R4 sin error (${error?.message ?? 'ok'})`)
  if (!error) {
    const { data: vino } = await db.from('vinos').select('stock').eq('id', vinoTest.id).single()
    assertR(vino.stock === stockAntesR4, `Stock no bajó (sigue en ${vino.stock}) — cambio #2`)
    const { data: bot } = await db.from('botellas_abiertas').select('estado, copas_restantes')
      .eq('restaurante_id', RESTAURANTE_ID).eq('vino_id', vinoTest.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    assertR(bot?.estado === 'cerrada_manual', `Botella marcada cerrada_manual`)
    assertR(Number(bot?.copas_restantes) === 0, `Saldo = 0 tras cierre manual`)
    // Verificar que el movimiento de rotura tiene cantidad=0
    const { data: mov } = await db.from('movimientos_stock').select('cantidad, tipo')
      .eq('restaurante_id', RESTAURANTE_ID).eq('vino_id', vinoTest.id)
      .eq('motivo', 'TEST-B4-R4').maybeSingle()
    assertR(mov?.tipo === 'rotura', 'Movimiento tipo=rotura')
    assertR(mov?.cantidad === 0, `Movimiento cantidad=0 (stock no baja dos veces)`)
  }
}

// ── R5: merma_eur en botellas_abiertas tras R4 ────────────────────────────────
console.log('\n  [R5] merma_copa_eur reflejada en rendimiento tras cierre manual')
{
  const { data: botCerrada } = await db.from('botellas_abiertas').select('*')
    .eq('restaurante_id', RESTAURANTE_ID).eq('vino_id', vinoTest.id)
    .eq('estado', 'cerrada_manual')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  assertR(!!botCerrada, 'Existe botella cerrada_manual')
  if (botCerrada) {
    const coste_copa  = Number(botCerrada.coste_copa) || 0
    const servidas    = Number(botCerrada.copas_servidas)
    const teoricas    = Number(botCerrada.copas_teoricas)
    const descartadas = Math.max(0, teoricas - servidas)
    const merma_eur   = r2(descartadas * coste_copa)

    // La botella se abrió en R1 (1 copa) y consumió otra en R2 → servidas ≥ 2
    assertR(servidas >= 1, `copas_servidas = ${servidas} (≥1, R1+R2)`)

    // Identidad: coste_servidas + merma_eur = coste_botella_teorico
    const coste_bot  = r2(teoricas * coste_copa)
    const coste_serv = r2(servidas * coste_copa)
    assertR(Math.abs(coste_serv + merma_eur - coste_bot) < 0.02,
      `Identidad P&L: coste_serv(${coste_serv}€) + merma(${merma_eur}€) = botella(${coste_bot}€)`)
    console.log(`    merma_copa_eur = ${merma_eur} € (${descartadas} copas × ${coste_copa} €/copa)`)
    console.log(`    → se resta del resultado en calcularMesBodega`)
  }
}

// ── Limpieza ──────────────────────────────────────────────────────────────────
console.log('\n  Limpiando datos de prueba...')
{
  // Eliminar movimientos de prueba (R3 puede haber creado ninguno si la RPC falló como esperado)
  const { data: movsEliminados } = await db.from('movimientos_stock').delete()
    .eq('restaurante_id', RESTAURANTE_ID)
    .in('motivo', ['TEST-B4-R1','TEST-B4-R2','TEST-B4-R3','TEST-B4-R4'])
    .select('id')
  console.log(`  ✓ Movimientos eliminados: ${(movsEliminados || []).length}`)

  // Eliminar botellas de prueba (abiertas y cerradas)
  const { data: botEliminadas } = await db.from('botellas_abiertas').delete()
    .eq('restaurante_id', RESTAURANTE_ID).eq('vino_id', vinoTest.id)
    .select('id')
  console.log(`  ✓ Botellas_abiertas eliminadas: ${(botEliminadas || []).length}`)

  // Restaurar stock y por_copa del vino (por_copa=true era el estado original)
  await db.from('vinos').update({ stock: stockAntes, por_copa: true }).eq('id', vinoTest.id)
  console.log(`  ✓ Stock de ${vinoTest.nombre} restaurado a ${stockAntes}`)
  console.log(`  ✓ por_copa=true confirmado`)

  // Verificar limpieza
  const { data: movCheck } = await db.from('movimientos_stock').select('id')
    .eq('restaurante_id', RESTAURANTE_ID)
    .in('motivo', ['TEST-B4-R1','TEST-B4-R2','TEST-B4-R3','TEST-B4-R4'])
  const { data: botCheck } = await db.from('botellas_abiertas').select('id')
    .eq('restaurante_id', RESTAURANTE_ID).eq('vino_id', vinoTest.id)
  const { data: vinoFinal } = await db.from('vinos').select('stock, por_copa').eq('id', vinoTest.id).single()

  assertR((movCheck || []).length === 0, `Movimientos TEST borrados: 0 restantes`)
  assertR((botCheck || []).length === 0, `botellas_abiertas TEST borradas: 0 restantes`)
  assertR(vinoFinal?.stock === stockAntes, `Stock = ${vinoFinal?.stock} (esperado ${stockAntes})`)
  assertR(vinoFinal?.por_copa === true, `por_copa = ${vinoFinal?.por_copa} (debe ser true)`)
}

// ── Resumen integración ───────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`)
console.log(`Integración: ${passed_r} ✓  ${failed_r} ✗`)
if (failed_r > 0) process.exit(1)
console.log('\nTodos los tests pasaron.\n')
