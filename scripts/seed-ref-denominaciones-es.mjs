/**
 * Siembra la tabla ref_denominaciones_es con todas las DOP/IGP oficiales de España.
 * Fuente: MAPA (Ministerio de Agricultura, Pesca y Alimentación), denominaciones_espana_dop_igp.csv
 *
 * Para cada nombre_oficial que contenga "/" (nombres bilingües o alternativos)
 * se generan filas adicionales con cada variante como alias de búsqueda.
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-ref-denominaciones-es.mjs
 *
 * Es idempotente: hace upsert por nombre_norm.
 */

import { createClient } from '@supabase/supabase-js'
import { claveNorm } from '../app/lib/normalizarDenominacion.js'

// ── Supabase ────────────────────────────────────────────────────────────────

const supabaseUrl = Object.entries(process.env)
  .find(([k]) => k.replace(/^﻿/, '') === 'NEXT_PUBLIC_SUPABASE_URL')?.[1]
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERROR: Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Datos de referencia MAPA ─────────────────────────────────────────────────
// Formato: [comunidad_autonoma, tipo, nombre_oficial]

const DENOMINACIONES_ES = [
  // Supraautonómicas (varias CCAA)
  ['Supraautonómica (varias CCAA)', 'DOP', 'Cava'],
  ['Supraautonómica (varias CCAA)', 'DOP', 'Jumilla'],
  ['Supraautonómica (varias CCAA)', 'DOP', 'Rioja'],
  ['Supraautonómica (varias CCAA)', 'IGP', 'Ribera del Queiles'],

  // Andalucía
  ['Andalucía', 'DOP', 'Condado de Huelva'],
  ['Andalucía', 'DOP', 'Granada'],
  ['Andalucía', 'DOP', 'Jerez-Xérès-Sherry'],
  ['Andalucía', 'DOP', 'Lebrija'],
  ['Andalucía', 'DOP', 'Málaga'],
  ['Andalucía', 'DOP', 'Manzanilla-Sanlúcar de Barrameda'],
  ['Andalucía', 'DOP', 'Montilla-Moriles'],
  ['Andalucía', 'DOP', 'Sierras de Málaga'],
  ['Andalucía', 'IGP', 'Altiplano de Sierra Nevada'],
  ['Andalucía', 'IGP', 'Bailén'],
  ['Andalucía', 'IGP', 'Cádiz'],
  ['Andalucía', 'IGP', 'Córdoba'],
  ['Andalucía', 'IGP', 'Cumbres del Guadalfeo'],
  ['Andalucía', 'IGP', 'Desierto de Almería'],
  ['Andalucía', 'IGP', 'Laderas del Genil'],
  ['Andalucía', 'IGP', 'Laujar-Alpujarra'],
  ['Andalucía', 'IGP', 'Los Palacios'],
  ['Andalucía', 'IGP', 'Norte de Almería'],
  ['Andalucía', 'IGP', 'Ribera del Andarax'],
  ['Andalucía', 'IGP', 'Sierra Norte de Sevilla'],
  ['Andalucía', 'IGP', 'Sierra Sur de Jaén'],
  ['Andalucía', 'IGP', 'Sierras de Las Estancias y Los Filabres'],
  ['Andalucía', 'IGP', 'Torreperogil'],
  ['Andalucía', 'IGP', 'Villaviciosa de Córdoba'],

  // Aragón
  ['Aragón', 'DOP', 'Aylés'],
  ['Aragón', 'DOP', 'Calatayud'],
  ['Aragón', 'DOP', 'Campo de Borja'],
  ['Aragón', 'DOP', 'Cariñena'],
  ['Aragón', 'DOP', 'Somontano'],
  ['Aragón', 'DOP', 'Urbezo'],
  ['Aragón', 'IGP', 'Bajo Aragón'],
  ['Aragón', 'IGP', 'Ribera del Gállego-Cinco Villas'],
  ['Aragón', 'IGP', 'Ribera del Jiloca'],
  ['Aragón', 'IGP', 'Valdejalón'],
  ['Aragón', 'IGP', 'Valle del Cinca'],

  // Principado de Asturias
  ['Principado de Asturias', 'DOP', 'Cangas'],

  // Islas Baleares
  ['Islas Baleares', 'DOP', 'Binissalem'],
  ['Islas Baleares', 'DOP', 'Pla i Llevant'],
  ['Islas Baleares', 'IGP', 'Formentera'],
  ['Islas Baleares', 'IGP', 'Ibiza/Eivissa'],
  ['Islas Baleares', 'IGP', 'Illes Balears'],
  ['Islas Baleares', 'IGP', 'Isla de Menorca/Illa de Menorca'],
  ['Islas Baleares', 'IGP', 'Mallorca'],
  ['Islas Baleares', 'IGP', 'Serra de Tramuntana-Costa Nord'],

  // Canarias
  ['Canarias', 'DOP', 'Abona'],
  ['Canarias', 'DOP', 'El Hierro'],
  ['Canarias', 'DOP', 'Gran Canaria'],
  ['Canarias', 'DOP', 'Islas Canarias'],
  ['Canarias', 'DOP', 'La Gomera'],
  ['Canarias', 'DOP', 'La Palma'],
  ['Canarias', 'DOP', 'Lanzarote'],
  ['Canarias', 'DOP', 'Tacoronte-Acentejo'],
  ['Canarias', 'DOP', 'Valle de Güímar'],
  ['Canarias', 'DOP', 'Valle de la Orotava'],
  ['Canarias', 'DOP', 'Ycoden-Daute-Isora'],

  // Cantabria
  ['Cantabria', 'IGP', 'Costa de Cantabria'],
  ['Cantabria', 'IGP', 'Liébana'],

  // Castilla y León
  ['Castilla y León', 'DOP', 'Abadía Retuerta'],
  ['Castilla y León', 'DOP', 'Arlanza'],
  ['Castilla y León', 'DOP', 'Arribes'],
  ['Castilla y León', 'DOP', 'Bierzo'],
  ['Castilla y León', 'DOP', 'Cebreros'],
  ['Castilla y León', 'DOP', 'Cigales'],
  ['Castilla y León', 'DOP', 'Dehesa Peñalba'],
  ['Castilla y León', 'DOP', 'León'],
  ['Castilla y León', 'DOP', 'Ribera del Duero'],
  ['Castilla y León', 'DOP', 'Rueda'],
  ['Castilla y León', 'DOP', 'Sierra de Salamanca'],
  ['Castilla y León', 'DOP', 'Tierra del Vino de Zamora'],
  ['Castilla y León', 'DOP', 'Toro'],
  ['Castilla y León', 'DOP', 'Urueña'],
  ['Castilla y León', 'DOP', 'Valles de Benavente'],
  ['Castilla y León', 'DOP', 'Valtiendas'],
  ['Castilla y León', 'IGP', 'Castilla y León'],

  // Castilla-La Mancha
  ['Castilla-La Mancha', 'DOP', 'Almansa'],
  ['Castilla-La Mancha', 'DOP', 'Calzadilla'],
  ['Castilla-La Mancha', 'DOP', 'Campo de Calatrava'],
  ['Castilla-La Mancha', 'DOP', 'Campo de La Guardia'],
  ['Castilla-La Mancha', 'DOP', 'Casa del Blanco'],
  ['Castilla-La Mancha', 'DOP', 'Dehesa del Carrizal'],
  ['Castilla-La Mancha', 'DOP', 'Dominio de Valdepusa'],
  ['Castilla-La Mancha', 'DOP', 'El Vicario'],
  ['Castilla-La Mancha', 'DOP', 'Finca Élez'],
  ['Castilla-La Mancha', 'DOP', 'Guijoso'],
  ['Castilla-La Mancha', 'DOP', 'La Jaraba'],
  ['Castilla-La Mancha', 'DOP', 'La Mancha'],
  ['Castilla-La Mancha', 'DOP', 'Los Cerrillos'],
  ['Castilla-La Mancha', 'DOP', 'Manchuela'],
  ['Castilla-La Mancha', 'DOP', 'Méntrida'],
  ['Castilla-La Mancha', 'DOP', 'Mondéjar'],
  ['Castilla-La Mancha', 'DOP', 'Pago Florentino'],
  ['Castilla-La Mancha', 'DOP', 'Ribera del Júcar'],
  ['Castilla-La Mancha', 'DOP', 'Río Negro'],
  ['Castilla-La Mancha', 'DOP', 'Rosalejo'],
  ['Castilla-La Mancha', 'DOP', 'Uclés'],
  ['Castilla-La Mancha', 'DOP', 'Valdepeñas'],
  ['Castilla-La Mancha', 'DOP', 'Vallegarcía'],
  ['Castilla-La Mancha', 'IGP', 'Castilla'],

  // Cataluña
  ['Cataluña', 'DOP', 'Alella'],
  ['Cataluña', 'DOP', 'Cataluña/Catalunya'],
  ['Cataluña', 'DOP', 'Conca de Barberà'],
  ['Cataluña', 'DOP', 'Costers del Segre'],
  ['Cataluña', 'DOP', 'Empordà'],
  ['Cataluña', 'DOP', 'Montsant'],
  ['Cataluña', 'DOP', 'Penedès'],
  ['Cataluña', 'DOP', 'Pla de Bages'],
  ['Cataluña', 'DOP', 'Priorat/Priorato'],
  ['Cataluña', 'DOP', 'Tarragona'],
  ['Cataluña', 'DOP', 'Terra Alta'],

  // Extremadura
  ['Extremadura', 'DOP', 'Ribera del Guadiana'],
  ['Extremadura', 'IGP', 'Extremadura'],

  // Galicia
  ['Galicia', 'DOP', 'Monterrei'],
  ['Galicia', 'DOP', 'Rías Baixas'],
  ['Galicia', 'DOP', 'Ribeira Sacra'],
  ['Galicia', 'DOP', 'Ribeiro'],
  ['Galicia', 'DOP', 'Valdeorras'],
  ['Galicia', 'IGP', 'Barbanza e Iria'],
  ['Galicia', 'IGP', 'Betanzos'],
  ['Galicia', 'IGP', 'Ribeiras do Morrazo'],
  ['Galicia', 'IGP', 'Terras do Navia'],
  ['Galicia', 'IGP', 'Valle del Miño-Ourense/Val do Miño-Ourense'],

  // La Rioja
  ['La Rioja', 'IGP', 'Valles de Sadacia'],

  // Comunidad de Madrid
  ['Comunidad de Madrid', 'DOP', 'Vinos de Madrid'],

  // Región de Murcia
  ['Región de Murcia', 'DOP', 'Bullas'],
  ['Región de Murcia', 'DOP', 'Yecla'],
  ['Región de Murcia', 'IGP', 'Campo de Cartagena'],
  ['Región de Murcia', 'IGP', 'Murcia'],

  // Comunidad Foral de Navarra
  ['Comunidad Foral de Navarra', 'DOP', 'Bolandin'],
  ['Comunidad Foral de Navarra', 'DOP', 'Navarra'],
  ['Comunidad Foral de Navarra', 'DOP', 'Pago de Arínzano'],
  ['Comunidad Foral de Navarra', 'DOP', 'Pago de Otazu'],
  ['Comunidad Foral de Navarra', 'DOP', 'Prado de Irache'],
  ['Comunidad Foral de Navarra', 'IGP', '3 Riberas'],

  // País Vasco
  ['País Vasco', 'DOP', 'Arabako Txakolina/Txakolí de Álava/Chacolí de Álava'],
  ['País Vasco', 'DOP', 'Bizkaiko Txakolina/Chacolí de Bizkaia/Txakolí de Bizkaia'],
  ['País Vasco', 'DOP', 'Getariako Txakolina/Chacolí de Getaria/Txakolí de Getaria'],

  // Comunidad Valenciana
  ['Comunidad Valenciana', 'DOP', 'Alicante'],
  ['Comunidad Valenciana', 'DOP', 'Chozas Carrascal'],
  ['Comunidad Valenciana', 'DOP', 'El Terrerazo'],
  ['Comunidad Valenciana', 'DOP', 'Los Balagueses'],
  ['Comunidad Valenciana', 'DOP', 'Tharsys'],
  ['Comunidad Valenciana', 'DOP', 'Utiel-Requena'],
  ['Comunidad Valenciana', 'DOP', 'Valencia'],
  ['Comunidad Valenciana', 'DOP', 'Vera de Estenas'],
  ['Comunidad Valenciana', 'IGP', 'Castelló'],
]

// ── Aliases extra para grafías alternativas habituales en catálogos ──────────
// Formato: [comunidad_autonoma, tipo, nombre_oficial_original, alias_nombre_norm]
// Útiles cuando claveNorm(nombre_oficial) no cubre la grafía del proveedor.
const ALIASES_EXTRA = [
  // Rioja: proveedores escriben "D.O.Ca. Rioja", "Rioja Alavesa", etc.
  ['Supraautonómica (varias CCAA)', 'DOP', 'Rioja', 'rioja alavesa'],
  ['Supraautonómica (varias CCAA)', 'DOP', 'Rioja', 'rioja alta'],
  ['Supraautonómica (varias CCAA)', 'DOP', 'Rioja', 'rioja baja'],
  ['Supraautonómica (varias CCAA)', 'DOP', 'Rioja', 'rioja oriental'],
  // Rías Baixas: grafías con/sin tilde
  ['Galicia', 'DOP', 'Rías Baixas', 'rias bajas'],
  // Manzanilla (abreviatura sin el nombre del municipio)
  ['Andalucía', 'DOP', 'Manzanilla-Sanlúcar de Barrameda', 'manzanilla'],
  ['Andalucía', 'DOP', 'Manzanilla-Sanlúcar de Barrameda', 'sanlucar de barrameda'],
  ['Andalucía', 'DOP', 'Manzanilla-Sanlúcar de Barrameda', 'sanlúcar de barrameda'],
  // Sierras de Málaga: proveedores escriben "D.O. Sierra de Málaga" (sin 's')
  ['Andalucía', 'DOP', 'Sierras de Málaga', 'sierra de malaga'],
  ['Andalucía', 'DOP', 'Sierras de Málaga', 'sierras de malaga'],
  // Jerez (abreviatura)
  ['Andalucía', 'DOP', 'Jerez-Xérès-Sherry', 'jerez'],
  ['Andalucía', 'DOP', 'Jerez-Xérès-Sherry', 'sherry'],
  ['Andalucía', 'DOP', 'Jerez-Xérès-Sherry', 'xerez'],
  // Txakoli (solo "txakoli" sin región → ambiguo, pero útil como alias de cada uno)
  // No añadimos alias genérico para evitar ambigüedad
  // Cataluña (variante en castellano)
  ['Cataluña', 'DOP', 'Cataluña/Catalunya', 'cataluña'],
  ['Cataluña', 'DOP', 'Cataluña/Catalunya', 'cataluna'],
  // Priorat (castellano vs catalán)
  ['Cataluña', 'DOP', 'Priorat/Priorato', 'priorat'],
  ['Cataluña', 'DOP', 'Priorat/Priorato', 'priorato'],
  // Empordà
  ['Cataluña', 'DOP', 'Empordà', 'emporda'],
  ['Cataluña', 'DOP', 'Empordà', 'ampurdan'],
  ['Cataluña', 'DOP', 'Empordà', 'ampurdán'],
  // Penedès
  ['Cataluña', 'DOP', 'Penedès', 'penedes'],
  // Conca de Barberà
  ['Cataluña', 'DOP', 'Conca de Barberà', 'conca de barbera'],
  // Ribeira Sacra
  ['Galicia', 'DOP', 'Ribeira Sacra', 'ribeira sacra'],
  // Pago de Arínzano (con/sin tilde)
  ['Comunidad Foral de Navarra', 'DOP', 'Pago de Arínzano', 'pago de arinzano'],
  // Valdejalón
  ['Aragón', 'IGP', 'Valdejalón', 'valdejalon'],
  // Islas Baleares alias
  ['Islas Baleares', 'IGP', 'Ibiza/Eivissa', 'ibiza'],
  ['Islas Baleares', 'IGP', 'Ibiza/Eivissa', 'eivissa'],
  ['Islas Baleares', 'IGP', 'Isla de Menorca/Illa de Menorca', 'menorca'],
  ['Islas Baleares', 'IGP', 'Isla de Menorca/Illa de Menorca', 'illa de menorca'],
  // Valle de Güímar: proveedores escriben "Valle del Güímar" (del vs de)
  ['Canarias', 'DOP', 'Valle de Güímar', 'valle del guimar'],
  ['Canarias', 'DOP', 'Valle de Güímar', 'valle de guimar'],
  // Montilla-Moriles: proveedores omiten guion ("Montilla Moriles")
  ['Andalucía', 'DOP', 'Montilla-Moriles', 'montilla moriles'],
  // Ribeira Sacra: proveedor escribe "Ribera Sacra" (sin 'i')
  ['Galicia', 'DOP', 'Ribeira Sacra', 'ribera sacra'],
  // Montsant: proveedor escribe "Monsant" (sin 't')
  ['Cataluña', 'DOP', 'Montsant', 'monsant'],
  // Pla i Llevant: proveedor escribe "Pla i Levant" (una 'l')
  ['Islas Baleares', 'DOP', 'Pla i Llevant', 'pla i levant'],
  // Sierra de Salamanca: proveedor escribe "Sierra Salamanca" (sin 'de')
  ['Castilla y León', 'DOP', 'Sierra de Salamanca', 'sierra salamanca'],
  // Txakoli variants: algunos proveedores usan 'txacolina' en vez de 'txakolina'
  ['País Vasco', 'DOP', 'Arabako Txakolina/Txakolí de Álava/Chacolí de Álava', 'arabako txacolina'],
  ['País Vasco', 'DOP', 'Bizkaiko Txakolina/Chacolí de Bizkaia/Txakolí de Bizkaia', 'bizkaiko txacolina'],
  ['País Vasco', 'DOP', 'Getariako Txakolina/Chacolí de Getaria/Txakolí de Getaria', 'getariako txacolina'],
  // Galicia/Ourense
  ['Galicia', 'IGP', 'Valle del Miño-Ourense/Val do Miño-Ourense', 'valle del mino-ourense'],
  ['Galicia', 'IGP', 'Valle del Miño-Ourense/Val do Miño-Ourense', 'val do mino-ourense'],
  // Txakoli aliases
  ['País Vasco', 'DOP', 'Arabako Txakolina/Txakolí de Álava/Chacolí de Álava', 'arabako txakolina'],
  ['País Vasco', 'DOP', 'Arabako Txakolina/Txakolí de Álava/Chacolí de Álava', 'txakoli de alava'],
  ['País Vasco', 'DOP', 'Arabako Txakolina/Txakolí de Álava/Chacolí de Álava', 'chacoli de alava'],
  ['País Vasco', 'DOP', 'Bizkaiko Txakolina/Chacolí de Bizkaia/Txakolí de Bizkaia', 'bizkaiko txakolina'],
  ['País Vasco', 'DOP', 'Bizkaiko Txakolina/Chacolí de Bizkaia/Txakolí de Bizkaia', 'txakoli de bizkaia'],
  ['País Vasco', 'DOP', 'Bizkaiko Txakolina/Chacolí de Bizkaia/Txakolí de Bizkaia', 'chacoli de bizkaia'],
  ['País Vasco', 'DOP', 'Getariako Txakolina/Chacolí de Getaria/Txakolí de Getaria', 'getariako txakolina'],
  ['País Vasco', 'DOP', 'Getariako Txakolina/Chacolí de Getaria/Txakolí de Getaria', 'txakoli de getaria'],
  ['País Vasco', 'DOP', 'Getariako Txakolina/Chacolí de Getaria/Txakolí de Getaria', 'chacoli de getaria'],
]

// ── Construir filas para upsert ──────────────────────────────────────────────

function filasPrincipales() {
  const filas = []
  for (const [ccaa, tipo, nombre_oficial] of DENOMINACIONES_ES) {
    // Nombre normalizado de la fila principal
    const nombre_norm = claveNorm(nombre_oficial)
    filas.push({ pais: 'España', comunidad_autonoma: ccaa, tipo, nombre_oficial, nombre_norm })

    // Alias automáticos para nombres con "/" (nombres bilingües)
    const variantes = nombre_oficial.split('/').map(v => v.trim()).filter(Boolean)
    if (variantes.length > 1) {
      for (const variante of variantes) {
        const nn = claveNorm(variante)
        if (nn && nn !== nombre_norm) {
          filas.push({ pais: 'España', comunidad_autonoma: ccaa, tipo, nombre_oficial, nombre_norm: nn })
        }
      }
    }
  }
  return filas
}

function filasAliases() {
  return ALIASES_EXTRA.map(([ccaa, tipo, nombre_oficial, nombre_norm]) => ({
    pais: 'España',
    comunidad_autonoma: ccaa,
    tipo,
    nombre_oficial,
    nombre_norm,
  }))
}

// Merge: las filas principales tienen prioridad; los aliases no sobreescriben
function mergeFilas(principales, aliases) {
  const vistas = new Set(principales.map(f => f.nombre_norm))
  return [...principales, ...aliases.filter(a => !vistas.has(a.nombre_norm))]
}

// ── Main ─────────────────────────────────────────────────────────────────────

const principales = filasPrincipales()
const aliases     = filasAliases()
const todasLasFilas = mergeFilas(principales, aliases)

// Deduplicar por nombre_norm (puede haber colisiones entre principales y aliases)
const dedup = new Map()
for (const f of todasLasFilas) {
  if (!dedup.has(f.nombre_norm)) dedup.set(f.nombre_norm, f)
}
const filas = [...dedup.values()]

console.error(`Filas a sembrar: ${filas.length} (${principales.length} principales + aliases dedup)`)

// Upsert en lotes de 100
const LOTE = 100
let sembradas = 0

for (let i = 0; i < filas.length; i += LOTE) {
  const lote = filas.slice(i, i + LOTE)
  const { error } = await supabase
    .from('ref_denominaciones_es')
    .upsert(lote, { onConflict: 'nombre_norm' })
  if (error) {
    console.error(`\nERROR en lote ${i}–${i + LOTE}:`, error.message)
    process.exit(1)
  }
  sembradas += lote.length
  process.stderr.write(`  ${sembradas}/${filas.length} sembradas...\r`)
}

console.error(`\n\nSeed completado. ${sembradas} filas en ref_denominaciones_es.`)
console.error('Verifica con: SELECT COUNT(*), tipo FROM ref_denominaciones_es GROUP BY tipo;')
