import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

function norm(s = '') {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Palabras que EXCLUYEN sin importar nada más
const EXCLUIR = /cigarro|cigarrill|tabaco|tobacco|marlboro|winston|camel\b|lucky\s*strike|philip\s*morris|cohiba|montecristo|davidoff|hamlet|veguero|purito|encendedor|mechero|papel\s*fumar|filtro\s*tabaco|vaping|e-cig|iqos|juul|arbol\s*navidad|abeto|guirnalda|adorno\s*(navide|arbol)|bolsa\s*basura|lejia|suavizante|detergente|lavavajillas|bayeta|fregona|farmacia|aspirina|ibuprofeno|paracetamol/

// Basta con que aparezca UNA de estas palabras para incluirlo
const GOURMET = /conserva|chipiron|chipirón|calamar|pulpo|ventresca|bonito|caballa|sardin|anchoa|anchov|navaja|almeja|mejillon|berberecho|berberech|zamburina|necora|gamba|langostin|bogavante|centollo|atun|bacalao|ahumado|escabeche|encurtido|aceituna|aceitunas|aceite|aove|oliva|vinagre|jamon|iberic|paleta|lomo\b|chorizo|salchich|fuet|sobrasada|cecina|morcill|embutido|presa\b|queso|manchego|brie|camembert|gorgonzola|parmesano|gouda|idiazabal|tetilla|miel|mermelada|pate\b|foie|trufa|esparrago|alcachofa|pimiento|tomate\b|seta|hongo|fruto\s*seco|almendra|nuez\b|pistacho|avellana|anacardo|galleta|cookie|chocolate|bombon|turron|mazapan|nougat|polvoron|mantecado|snack|aperitivo|patata\s*frita|chips\b|chip\b|nachos|cecina|mantequilla|butter|nata\b|yogur|kefir|kombucha|cerveza|sidra|delicatessen|gourmet|artesanal|estuche\b|lata\b|tarro\b|bote\b|pack\b/

function esGourmet(nombre, descripcion) {
  const t = norm(`${nombre} ${descripcion}`)
  if (EXCLUIR.test(t)) return false
  return GOURMET.test(t)
}

export async function GET(request, { params }) {
  const { slug } = await params

  const { data: tienda, error: tiendaError } = await supabaseAdmin
    .from('tiendas')
    .select('id')
    .eq('slug', slug)
    .eq('activo', true)
    .single()

  if (tiendaError || !tienda) {
    return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
  }

  // Sin filtro activo ni stock — para gourmet solo importa que tenga precio razonable (mín. 3€)
  const { data: raw, error } = await supabaseAdmin
    .from('vinos_tienda')
    .select('id, nombre, precio_pvp, foto_url, descripcion, apto_cesta, es_vegano, con_alcohol')
    .eq('tienda_id', tienda.id)
    .eq('categoria', 'otro')
    .gte('precio_pvp', 3)
    .order('precio_pvp')
    .limit(500)

  if (error) {
    console.error('gourmet route error:', error)
    return NextResponse.json({ error: 'Error al cargar productos' }, { status: 500 })
  }

  const items = (raw || []).filter(item => {
    if (!item.foto_url) return false
    // Respeta la decisión manual si está fijada; si no, auto-detecta
    if (item.apto_cesta === true) return true
    if (item.apto_cesta === false) return false
    return esGourmet(item.nombre, item.descripcion)
  })

  console.log(`[gourmet] ${raw?.length ?? 0} otros → ${items.length} gourmet aptos`)

  return NextResponse.json({ items })
}
