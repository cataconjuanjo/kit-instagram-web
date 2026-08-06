/**
 * Crea la tienda demo "A Alacena do Alboio" con su catálogo de 35 vinos.
 *
 * Uso:
 *   node scripts/crear-alboio.js
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

// Cargar .env.local (maneja UTF-8 BOM y comillas)
try {
  const raw = fs.readFileSync('.env.local', 'utf-8').replace(/^﻿/, '')
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
  }
} catch {}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const SLUG   = 'alacena-do-alboio'
const NOMBRE = 'A Alacena do Alboio'
const EMAIL  = 'aalacenadoalboio@gmail.com'

const VINOS = [
  // ── BLANCOS (20) ─────────────────────────────────────────────────────────────
  { nombre: 'Amodiño',              bodega: 'Bodegas Zárate',              tipo: 'blanco',   uva: 'Albariño',    region: 'Rías Baixas',   pais: 'España',   precio_pvp: 16.50, destacado: false },
  { nombre: 'Envidia Cochina',      bodega: 'Bodegas Zárate',              tipo: 'blanco',   uva: 'Albariño',    region: 'Rías Baixas',   pais: 'España',   precio_pvp: 22.00, destacado: true  },
  { nombre: 'Frore do Carme',       bodega: 'Bodegas Zárate',              tipo: 'blanco',   uva: 'Albariño',    region: 'Rías Baixas',   pais: 'España',   precio_pvp: 26.50, destacado: false },
  { nombre: 'Ravia Iria Otero',     bodega: 'Iria Otero Vinos',            tipo: 'blanco',   uva: 'Albariño',    region: 'Rías Baixas',   pais: 'España',   precio_pvp: 18.00, destacado: false },
  { nombre: 'Valmica Iria Otero',   bodega: 'Iria Otero Vinos',            tipo: 'blanco',   uva: 'Albariño',    region: 'Rías Baixas',   pais: 'España',   precio_pvp: 24.00, destacado: false },
  { nombre: 'A Teixa',              bodega: 'Pazo de Señorans',            tipo: 'blanco',   uva: 'Albariño',    region: 'Rías Baixas',   pais: 'España',   precio_pvp: 19.50, destacado: false },
  { nombre: 'Eidos Ermos Blanco',   bodega: 'Eidos',                       tipo: 'blanco',   uva: 'Albariño',    region: 'Rías Baixas',   pais: 'España',   precio_pvp: 21.00, destacado: false },
  { nombre: 'Viña de Martín Os Pasás', bodega: 'Viña de Martín',          tipo: 'blanco',   uva: 'Treixadura',  region: 'Ribeiro',       pais: 'España',   precio_pvp: 17.50, destacado: false },
  { nombre: "Quinta Seara d'Ordens", bodega: "Quinta Seara d'Ordens",      tipo: 'blanco',   uva: 'Alvarinho',   region: 'Vinho Verde',   pais: 'Portugal', precio_pvp: 14.00, destacado: false },
  { nombre: 'Pazo da Bouciña Arte', bodega: 'Pazo da Bouciña',             tipo: 'blanco',   uva: 'Albariño',    region: 'Rías Baixas',   pais: 'España',   precio_pvp: 20.00, destacado: false },
  { nombre: 'Pazo da Bouciña Expresión', bodega: 'Pazo da Bouciña',        tipo: 'blanco',   uva: 'Albariño',    region: 'Rías Baixas',   pais: 'España',   precio_pvp: 28.00, destacado: true  },
  { nombre: 'Pazo da Bouciña Albariño', bodega: 'Pazo da Bouciña',         tipo: 'blanco',   uva: 'Albariño',    region: 'Rías Baixas',   pais: 'España',   precio_pvp: 15.00, destacado: false },
  { nombre: 'Alboio Albariño',      bodega: 'Alboio',                      tipo: 'blanco',   uva: 'Albariño',    region: 'Rías Baixas',   pais: 'España',   precio_pvp: 13.50, destacado: true  },
  { nombre: 'Do Ferreiro Cepas Vellas', bodega: 'Gerardo Méndez (Do Ferreiro)', tipo: 'blanco', uva: 'Albariño', region: 'Rías Baixas', pais: 'España',   precio_pvp: 42.00, destacado: true  },
  { nombre: 'Tormenta 2023',        bodega: 'Torres Galicia',              tipo: 'blanco',   uva: 'Albariño',    region: 'Rías Baixas',   pais: 'España',   precio_pvp: 17.00, destacado: false },
  { nombre: 'Ribeiro Pateiro Ánfora', bodega: 'Viña Mein',                 tipo: 'blanco',   uva: 'Treixadura',  region: 'Ribeiro',       pais: 'España',   precio_pvp: 23.00, destacado: false },
  { nombre: 'Leirana O Pradiño',    bodega: 'Forjas del Salnés',           tipo: 'blanco',   uva: 'Albariño',    region: 'Rías Baixas',   pais: 'España',   precio_pvp: 35.00, destacado: true  },
  { nombre: 'Guimaro Cepas Viejas', bodega: 'Guimaro',                     tipo: 'blanco',   uva: 'Godello',     region: 'Ribeira Sacra', pais: 'España',   precio_pvp: 19.00, destacado: false },
  { nombre: 'Leirana Albariño',     bodega: 'Forjas del Salnés',           tipo: 'blanco',   uva: 'Albariño',    region: 'Rías Baixas',   pais: 'España',   precio_pvp: 22.00, destacado: false },
  { nombre: 'Burgáns',              bodega: 'Martín Códax',                tipo: 'blanco',   uva: 'Albariño',    region: 'Rías Baixas',   pais: 'España',   precio_pvp: 11.50, destacado: false },

  // ── TINTOS (13) ──────────────────────────────────────────────────────────────
  { nombre: 'Novoa Caiño',          bodega: 'Pazo de Señorans',            tipo: 'tinto',    uva: 'Caiño Tinto', region: 'Rías Baixas',   pais: 'España',   precio_pvp: 25.00, destacado: false },
  { nombre: 'Eidos Ermos Tinto',    bodega: 'Eidos',                       tipo: 'tinto',    uva: 'Mencía',      region: 'Rías Baixas',   pais: 'España',   precio_pvp: 21.00, destacado: false },
  { nombre: 'Torna dos Pasás Escolma', bodega: 'Viña de Martín',           tipo: 'tinto',    uva: 'Mencía',      region: 'Ribeiro',       pais: 'España',   precio_pvp: 19.50, destacado: false },
  { nombre: 'Quite 2023',           bodega: 'Quite Vinos',                 tipo: 'tinto',    uva: 'Mencía',      region: 'Ribeira Sacra', pais: 'España',   precio_pvp: 16.00, destacado: false },
  { nombre: 'La Llorona',           bodega: 'La Llorona',                  tipo: 'tinto',    uva: 'Mencía',      region: 'Bierzo',        pais: 'España',   precio_pvp: 18.00, destacado: false },
  { nombre: 'Kinki 2023',           bodega: 'Guimaro',                     tipo: 'tinto',    uva: 'Mencía',      region: 'Ribeira Sacra', pais: 'España',   precio_pvp: 14.00, destacado: false },
  { nombre: 'Muga Selección Especial', bodega: 'Bodegas Muga',             tipo: 'tinto',    uva: 'Tempranillo', region: 'Rioja',         pais: 'España',   precio_pvp: 29.00, destacado: false },
  { nombre: 'Muga Crianza',         bodega: 'Bodegas Muga',                tipo: 'tinto',    uva: 'Tempranillo', region: 'Rioja',         pais: 'España',   precio_pvp: 16.50, destacado: false },
  { nombre: 'Altanza Familia',      bodega: 'Bodegas Altanza',             tipo: 'tinto',    uva: 'Tempranillo', region: 'Rioja',         pais: 'España',   precio_pvp: 22.00, destacado: false },
  { nombre: 'Camiño Real',          bodega: 'Camiño Real',                 tipo: 'tinto',    uva: 'Mencía',      region: 'Ribeira Sacra', pais: 'España',   precio_pvp: 12.50, destacado: false },
  { nombre: 'Guímaro',              bodega: 'Guimaro',                     tipo: 'tinto',    uva: 'Mencía',      region: 'Ribeira Sacra', pais: 'España',   precio_pvp: 17.00, destacado: true  },
  { nombre: 'Goliardo Caiño Tinto', bodega: 'Attis Bodegas y Viñedos',    tipo: 'tinto',    uva: 'Caiño Tinto', region: 'Rías Baixas',   pais: 'España',   precio_pvp: 38.00, destacado: true  },
  { nombre: 'A Ponte',              bodega: 'Guimaro',                     tipo: 'tinto',    uva: 'Mencía',      region: 'Ribeira Sacra', pais: 'España',   precio_pvp: 26.00, destacado: false },

  // ── ESPUMOSOS (2) ────────────────────────────────────────────────────────────
  { nombre: 'Górgola 70 meses',     bodega: 'Górgola',                     tipo: 'espumoso', uva: 'Albariño',    region: 'Rías Baixas',   pais: 'España',   precio_pvp: 45.00, destacado: true  },
  { nombre: 'Grandin Espumoso Reserva', bodega: 'Grandin',                  tipo: 'espumoso', uva: 'Ugni Blanc',  region: 'Val de Loire',  pais: 'Francia',  precio_pvp: 12.50, destacado: false },

  // ── DULCE (1) ────────────────────────────────────────────────────────────────
  { nombre: 'Sitta Pereiras',       bodega: 'Sitta Vinos',                 tipo: 'dulce',    uva: 'Albariño',    region: 'Rías Baixas',   pais: 'España',   precio_pvp: 24.00, destacado: true  },
]

async function main() {
  console.log(`\n▶ Creando kiosko demo: ${NOMBRE}`)
  console.log(`▶ Slug: ${SLUG}\n`)

  // 1. Tienda
  const { data: existe } = await sb.from('tiendas').select('id, nombre').eq('slug', SLUG).single()

  let tiendaId

  if (existe) {
    console.log(`⚠ Tienda ya existe (${existe.id}). Actualizando...`)
    const { error } = await sb.from('tiendas').update({
      nombre:              NOMBRE,
      email:               EMAIL,
      ciudad:              'Vilagarcía de Arousa',
      color_primario:      '#910F3F',
      color_acento:        '#CFC481',
      activo:              true,
      subscription_status: 'active',
      plan:                'premium',
    }).eq('slug', SLUG)
    if (error) { console.error('Error actualizando tienda:', error.message); process.exit(1) }
    tiendaId = existe.id
    console.log(`✓ Tienda actualizada (${tiendaId})`)
  } else {
    const { data: nueva, error } = await sb.from('tiendas').insert({
      nombre:              NOMBRE,
      email:               EMAIL,
      slug:                SLUG,
      ciudad:              'Vilagarcía de Arousa',
      descripcion:         'Tienda de vinos y productos gourmet gallegos en Vilagarcía de Arousa.',
      color_primario:      '#910F3F',
      color_acento:        '#CFC481',
      activo:              true,
      subscription_status: 'active',
      plan:                'premium',
    }).select('id').single()
    if (error) { console.error('Error creando tienda:', error.message); process.exit(1) }
    tiendaId = nueva.id
    console.log(`✓ Tienda creada (${tiendaId})`)
  }

  // 2. Limpiar catálogo previo
  const { error: delErr } = await sb.from('vinos_tienda').delete().eq('tienda_id', tiendaId)
  if (delErr) { console.error('Error limpiando catálogo:', delErr.message); process.exit(1) }
  console.log(`✓ Catálogo anterior limpiado`)

  // 3. Insertar vinos
  const rows = VINOS.map(v => ({
    tienda_id:  tiendaId,
    categoria:  'vino',
    activo:     true,
    stock:      10,
    nombre:     v.nombre,
    bodega:     v.bodega || null,
    tipo:       v.tipo,
    uva:        v.uva || null,
    region:     v.region || null,
    pais:       v.pais || 'España',
    precio_pvp: v.precio_pvp || null,
    destacado:  v.destacado || false,
  }))

  const { error: insErr } = await sb.from('vinos_tienda').insert(rows)
  if (insErr) { console.error('Error insertando vinos:', insErr.message); process.exit(1) }

  const blancos  = rows.filter(v => v.tipo === 'blanco').length
  const tintos   = rows.filter(v => v.tipo === 'tinto').length
  const espum    = rows.filter(v => v.tipo === 'espumoso').length
  const dulces   = rows.filter(v => v.tipo === 'dulce').length
  console.log(`✓ ${rows.length} vinos importados (${blancos} blancos · ${tintos} tintos · ${espum} espumosos · ${dulces} dulces)`)

  console.log('\n─────────────────────────────────────────────────')
  console.log(`  Kiosko: /kiosko/${SLUG}`)
  console.log(`  Admin:  /kiosko-admin/${SLUG}`)
  console.log(`  Email:  ${EMAIL}`)
  console.log('─────────────────────────────────────────────────\n')
}

main().catch(err => { console.error(err); process.exit(1) })
