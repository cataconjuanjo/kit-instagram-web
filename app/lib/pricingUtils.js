/**
 * Cálculo canónico de precio sugerido de botella y copa.
 *
 * Fórmula: pvpNeto = coste / (1 - margenObjetivo);  pvp = pvpNeto × (1 + IVA%)
 *
 * El margen reportado se mide sobre el precio NETO (sin IVA), igual que
 * margenBrutoPct() en wineEconomics.js.  Esto elimina la discrepancia de ~3 pp
 * que existía cuando precios/page.js ignoraba el IVA en el cálculo.
 */
import { DEFAULT_WINE_ECONOMICS } from './wineEconomics'

const IVA_FACTOR = 1 + DEFAULT_WINE_ECONOMICS.ivaVentaPct / 100  // 1.10

function redondearBotella(valor) {
  const base = Math.floor(valor)
  return (valor - base) >= 0.51 ? base + 1 : base
}

function redondearCopa(valor) {
  return Math.round(valor * 2) / 2
}

/**
 * @param {number|string} coste  - Coste de compra sin IVA (€)
 * @param {{ margen: number, copas: number }} ajustes
 *   margen: margen objetivo en %, rango 5-90
 *   copas:  copas por botella, rango 1-10
 * @returns {{ baseBotella, botella, baseCopa, copa, margenBotella, margenCopas, ingresoCopas }}
 *   Todos los valores en € excepto márgenes (%)
 */
export function calcularPreciosSugeridos(coste, ajustes) {
  const costeNum = Number(coste) || 0
  const margenObjetivo = Math.min(90, Math.max(5, Number(ajustes?.margen) || 65)) / 100
  const copas = Math.min(10, Math.max(1, Number(ajustes?.copas) || 5))

  if (!costeNum) {
    return { baseBotella: 0, botella: 0, baseCopa: 0, copa: 0, margenBotella: 0, margenCopas: 0, ingresoCopas: 0 }
  }

  const pvpNetoBotella = costeNum / (1 - margenObjetivo)
  const baseBotella = pvpNetoBotella * IVA_FACTOR
  const botella = redondearBotella(baseBotella)

  const pvpNetoCopa = (costeNum / copas) / (1 - margenObjetivo)
  const baseCopa = pvpNetoCopa * IVA_FACTOR
  const copa = redondearCopa(baseCopa)

  const ingresoCopas = copa * copas

  const pvpNetoBotellaFinal = botella / IVA_FACTOR
  const pvpNetoCopas = copa / IVA_FACTOR
  const costePorCopa = costeNum / copas

  const margenBotella = pvpNetoBotellaFinal > 0 ? ((pvpNetoBotellaFinal - costeNum) / pvpNetoBotellaFinal) * 100 : 0
  const margenCopas = pvpNetoCopas > 0 ? ((pvpNetoCopas - costePorCopa) / pvpNetoCopas) * 100 : 0

  return { baseBotella, botella, baseCopa, copa, margenBotella, margenCopas, ingresoCopas }
}
