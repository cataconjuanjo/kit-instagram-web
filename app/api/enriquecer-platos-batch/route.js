/**
 * /api/enriquecer-platos-batch
 * Enriquece con Chartier todos los platos de un restaurante que no tienen
 * familias_aromaticas todavía. Llamado desde el dashboard de platos.
 * Procesa en lotes de 3 en paralelo para no saturar la API de Anthropic.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { registrarConsumoAnthropic } from '../../lib/anthropicUsage'
import { requireRestaurantAccess } from '../_lib/auth'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const FAMILIAS_DISPONIBLES = `
anisado_mentolado: hinojo, menta, albahaca, apio, pepino, wasabi, cilantro, estragon, verbena
terpenico_floral: romero, azafran, cardamomo, lavanda, citricos, jengibre, tomillo, laurel, enebro
tioles: ajo, cebolla, alcaparra, pomelo, fruta de la pasion, tomate verde, brotes, cebollino
lactonas: coco, albaricoque, melocoton, vieira, maiz, nata, mantequilla, cerdo, morcilla, boniato
roble_barrica: brasa, asado, ahumado, tostado, cafe, cacao, sesamo tostado, cebolla caramelizada, pimenton dulce, Maillard
eugenol_clavo: clavo, canela, remolacha, vainilla, cuatro especias, albahaca tailandesa, carnes con especias
sotolon_oxidativo: curry, fenogreco, soja, miso, jarabe de arce, frutos secos, higos, datiles, setas secas
yodado_salino: ostras, algas, crustaceos, mariscos, pulpo, calamar, sepia, pescado crudo, ahumado, caviar, erizo
umami: setas frescas, trufa, queso curado, jamon, anchoa, tomate concentrado, guisantes, algas kombu
capsaicina_picante: guindilla, chile, chipotle, pimenton picante, cayena, sriracha, wasabi
carotenoides: pimenton, zanahoria, calabaza, boniato, tomate, naranja, mango
fruta_roja_floral: fresas, frambuesas, cerezas, rosas, geranio, flores comestibles, grosellas
`.trim()

const SYSTEM_PROMPT = `Eres un experto en la metodología aromática de François Chartier.
Dado un plato de restaurante, extrae su perfil aromático Chartier.
Devuelve ÚNICAMENTE JSON válido, sin markdown ni explicaciones.`

const USER_PROMPT = (nombre, descripcion, categoria) => `Plato: "${nombre}"
${descripcion ? `Descripción: "${descripcion}"` : ''}
Categoría: ${categoria || 'plato principal'}

Familias aromáticas disponibles (elige 1-3, solo las que claramente aplican):
${FAMILIAS_DISPONIBLES}

Devuelve este JSON exacto:
{
  "familias": ["id_familia1"],
  "ingrediente": "ingrediente principal del plato",
  "tecnica": "tecnica de coccion principal o cadena vacia si no aplica",
  "intensidad": 3
}

intensidad: 1 (muy delicado, sutil) → 5 (muy potente, intenso en boca).`

const FAMILIAS_VALIDAS = new Set([
  'anisado_mentolado', 'terpenico_floral', 'tioles', 'lactonas',
  'roble_barrica', 'eugenol_clavo', 'sotolon_oxidativo', 'yodado_salino',
  'umami', 'capsaicina_picante', 'carotenoides', 'fruta_roja_floral',
])

function extraerJson(texto) {
  const limpio = (texto || '').trim()
  try { return JSON.parse(limpio) } catch {}
  const match = limpio.match(/\{[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[0]) } catch { return null }
}

function validarFamilias(result) {
  if (!result || !Array.isArray(result.familias)) return null
  return {
    familias: result.familias.filter(f => FAMILIAS_VALIDAS.has(f)).slice(0, 3),
    ingrediente: String(result.ingrediente || '').slice(0, 100),
    tecnica: String(result.tecnica || '').slice(0, 60),
    intensidad: Math.max(1, Math.min(5, Number(result.intensidad) || 3)),
  }
}

async function enriquecerUnPlato(plato, restauranteId) {
  try {
    const modelo = 'claude-haiku-4-5-20251001'
    const message = await anthropic.messages.create({
      model: modelo,
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: USER_PROMPT(plato.nombre, plato.descripcion, plato.categoria) }],
    })
    await registrarConsumoAnthropic({
      restauranteId,
      endpoint: 'enriquecer_platos_batch',
      modelo,
      usage: message.usage,
      metadata: { plato_id: plato.id, plato: plato.nombre },
    })
    const texto = message.content?.[0]?.text || ''
    const parsed = extraerJson(texto)
    const familias_aromaticas = validarFamilias(parsed)
    if (!familias_aromaticas) return { id: plato.id, ok: false }

    await supabaseAdmin
      .from('platos')
      .update({ familias_aromaticas })
      .eq('id', plato.id)

    return { id: plato.id, ok: true, familias_aromaticas }
  } catch {
    return { id: plato.id, ok: false }
  }
}

async function procesarEnLotes(platos, restauranteId, tamanoLote = 3) {
  const resultados = []
  for (let i = 0; i < platos.length; i += tamanoLote) {
    const lote = platos.slice(i, i + tamanoLote)
    const resultadosLote = await Promise.all(lote.map(plato => enriquecerUnPlato(plato, restauranteId)))
    resultados.push(...resultadosLote)
    // Pequeña pausa entre lotes para no saturar Anthropic
    if (i + tamanoLote < platos.length) {
      await new Promise(resolve => setTimeout(resolve, 300))
    }
  }
  return resultados
}

export async function POST(req) {
  try {
    const { restaurante_id, forzar = false } = await req.json()

    if (!restaurante_id) {
      return Response.json({ error: 'restaurante_id requerido' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    // Verificar que el restaurante existe
    const { data: restaurante } = await supabaseAdmin
      .from('restaurantes')
      .select('id')
      .eq('id', restaurante_id)
      .single()

    if (!restaurante) {
      return Response.json({ error: 'Restaurante no encontrado' }, { status: 404 })
    }

    // Obtener platos pendientes (sin familias o forzar todos)
    let query = supabaseAdmin
      .from('platos')
      .select('id, nombre, descripcion, categoria')
      .eq('restaurante_id', restaurante_id)

    if (!forzar) {
      query = query.is('familias_aromaticas', null)
    }

    const { data: platos, error } = await query

    if (error) return Response.json({ error: error.message }, { status: 500 })
    if (!platos?.length) {
      return Response.json({ procesados: 0, errores: 0, total: 0, mensaje: 'Todos los platos ya tienen perfil aromático' })
    }

    const resultados = await procesarEnLotes(platos, restaurante_id, 3)

    const procesados = resultados.filter(r => r.ok).length
    const errores = resultados.filter(r => !r.ok).length

    return Response.json({
      procesados,
      errores,
      total: platos.length,
      mensaje: `${procesados} de ${platos.length} platos enriquecidos con perfil Chartier`,
      detalle: resultados,
    })
  } catch (error) {
    console.error('Error en batch Chartier:', error)
    return Response.json({ error: 'Error procesando los platos' }, { status: 500 })
  }
}
