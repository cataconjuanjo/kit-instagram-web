/**
 * Calculo canonico de PVP de referencia para botella y copa.
 *
 * La botella usa la misma regla comercial que el catalogo de consultor:
 * - coste neto <= 6 EUR: coste x 3,5
 * - coste neto <= 11 EUR: coste x 2 + 9 EUR
 * - coste neto > 11 EUR: coste + 20 EUR
 *
 * La copa se deriva del PVP botella dividido por copasVendibles(config),
 * que respeta la configuración del restaurante (copas_por_botella × (1 - merma_copa_pct)).
 *
 * El IVA se aplica al final, despues de calcular el PVP neto.
 * Despues se redondea el PVP comercial:
 * - botella al euro mas cercano
 * - copa al tramo de 0,50 EUR mas cercano
 */
import {
  DEFAULT_WINE_ECONOMICS,
  anadirIva,
  costeNetoCompra,
  copasVendibles,
  margenBrutoPct,
  precioNetoVenta,
  redondear,
} from './wineEconomics'

function numeroPrecio(valor) {
  if (typeof valor === 'string') valor = valor.replace(',', '.')
  return Number(valor) || 0
}

function boolSetting(valor, fallback) {
  if (typeof valor === 'boolean') return valor
  if (valor === 'true' || valor === '1') return true
  if (valor === 'false' || valor === '0') return false
  return fallback
}

function primerNumeroPositivo(valores, fallback) {
  const encontrado = valores.find(valor => numeroPrecio(valor) > 0)
  return encontrado !== undefined ? numeroPrecio(encontrado) : fallback
}

function primerNumeroDefinido(valores, fallback) {
  const encontrado = valores.find(valor => {
    if (valor === undefined || valor === null || valor === '') return false
    return !Number.isNaN(Number(String(valor).replace(',', '.')))
  })
  return encontrado !== undefined ? numeroPrecio(encontrado) : fallback
}

function clamp(valor, min, max) {
  return Math.min(max, Math.max(min, numeroPrecio(valor)))
}

export function normalizarAjustesPrecios(ajustes = {}) {
  const usaFormatoLegacy = ajustes?.margen !== undefined || ajustes?.copas !== undefined
  const margenLegacy = primerNumeroPositivo([ajustes?.margen], null)
  const margenBotella = primerNumeroPositivo([
    ajustes?.margen_objetivo_botella_pct,
    ajustes?.margenObjetivoBotellaPct,
    ajustes?.margenBotella,
    margenLegacy,
  ], DEFAULT_WINE_ECONOMICS.margenObjetivoBotellaPct)
  const margenCopa = primerNumeroPositivo([
    ajustes?.margen_objetivo_copa_pct,
    ajustes?.margenObjetivoCopaPct,
    ajustes?.margenCopa,
    ajustes?.margen_copa,
    margenLegacy,
  ], DEFAULT_WINE_ECONOMICS.margenObjetivoCopaPct)

  return {
    ivaVentaPct: clamp(
      primerNumeroDefinido([ajustes?.iva_venta_pct, ajustes?.ivaVentaPct], DEFAULT_WINE_ECONOMICS.ivaVentaPct),
      0,
      25
    ),
    pvpIncluyeIva: boolSetting(ajustes?.pvp_incluye_iva ?? ajustes?.pvpIncluyeIva, DEFAULT_WINE_ECONOMICS.pvpIncluyeIva),
    costeIncluyeIva: boolSetting(ajustes?.coste_incluye_iva ?? ajustes?.costeIncluyeIva, DEFAULT_WINE_ECONOMICS.costeIncluyeIva),
    copasPorBotella: clamp(
      primerNumeroPositivo([ajustes?.copas_por_botella, ajustes?.copasPorBotella, ajustes?.copas], DEFAULT_WINE_ECONOMICS.copasPorBotella),
      1,
      10
    ),
    mermaCopaPct: clamp(
      primerNumeroDefinido([ajustes?.merma_copa_pct, ajustes?.mermaCopaPct], usaFormatoLegacy ? 0 : DEFAULT_WINE_ECONOMICS.mermaCopaPct),
      0,
      95
    ),
    margenObjetivoBotellaPct: clamp(margenBotella, 1, 95),
    margenObjetivoCopaPct: clamp(margenCopa, 1, 95),
  }
}

function precioConIvaSiAplica(precioNeto, ajustes) {
  return ajustes.pvpIncluyeIva ? anadirIva(precioNeto, ajustes.ivaVentaPct) : redondear(precioNeto, 4)
}

function redondearBotellaComercial(valor) {
  return Math.round(numeroPrecio(valor))
}

function redondearCopaComercial(valor) {
  return redondear(Math.round(numeroPrecio(valor) * 2) / 2, 2)
}

export function calcularPvpNetoBotellaCatalogo(costeNeto) {
  const coste = numeroPrecio(costeNeto)
  if (!coste) return { pvpNeto: 0, regla: '' }
  if (coste <= 6) return { pvpNeto: coste * 3.5, regla: 'x3,5' }
  if (coste <= 11) return { pvpNeto: coste * 2 + 9, regla: 'x2+9 EUR' }
  return { pvpNeto: coste + 20, regla: '+20 EUR' }
}

export function margenCopaPct(precioCopa, costeCompra, ajustes = {}) {
  const config = normalizarAjustesPrecios(ajustes)
  const precio = precioNetoVenta(numeroPrecio(precioCopa), config)
  const coste = costeNetoCompra(numeroPrecio(costeCompra), config) / copasVendibles(config)
  if (!precio || !coste) return 0
  return redondear(((precio - coste) / precio) * 100, 2)
}

/**
 * @param {number|string} coste - Coste de compra.
 * @param {object} ajustes - Acepta economicSettings completo o el formato legacy { margen, copas }.
 * @returns {{ baseBotella, botella, baseCopa, copa, margenBotella, margenCopas, ingresoCopas }}
 */
export function calcularPreciosSugeridos(coste, ajustes) {
  const config = normalizarAjustesPrecios(ajustes)
  const costeNormalizado = numeroPrecio(coste)
  const costeNeto = costeNetoCompra(costeNormalizado, config)

  if (!costeNeto) {
    return { baseBotella: 0, botella: 0, baseCopa: 0, copa: 0, margenBotella: 0, margenCopas: 0, ingresoCopas: 0 }
  }

  const botellaCatalogo = calcularPvpNetoBotellaCatalogo(costeNeto)
  const pvpNetoBotella = botellaCatalogo.pvpNeto
  const baseBotella = precioConIvaSiAplica(pvpNetoBotella, config)
  const botella = redondearBotellaComercial(baseBotella)

  const copas = copasVendibles(config)
  const costePorCopa = costeNeto / copas
  const margenObjetivoCopaPct = config.margenObjetivoCopaPct
  const baseCopa = botella / copas
  const copa = redondearCopaComercial(baseCopa)
  const pvpNetoCopa = config.pvpIncluyeIva ? baseCopa / (1 + config.ivaVentaPct / 100) : baseCopa

  return {
    baseBotella,
    botella,
    baseCopa,
    copa,
    margenBotella: margenBrutoPct(botella, costeNormalizado, config),
    margenCopas: margenCopaPct(copa, costeNormalizado, config),
    ingresoCopas: redondear(copa * copas, 2),
    margenObjetivoBotellaPct: redondear(margenBrutoPct(botella, costeNormalizado, config), 2),
    margenObjetivoCopaPct,
    reglaBotella: botellaCatalogo.regla,
    costeNeto,
    costePorCopa,
    pvpNetoBotella,
    pvpNetoCopa,
    copasVendibles: copas,
  }
}
