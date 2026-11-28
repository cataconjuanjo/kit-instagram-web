import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { validarTokenBorradorCarta } from '../../../../../lib/cartaPruebaToken'
import { noStoreHeaders } from '../../../../../lib/publicCacheHeaders'
import { isInternationalWine } from '../../../../../lib/wineRegion'
import { limpiarMarcadorPerfiles, resolverPerfilesVino } from '../../../../../lib/wineProfileTags'

// GET /api/public/restaurante/[slug]/borrador?token=<firmado>
//
// Devuelve la carta propuesta (borrador del simulador: estado ∈ actual/nuevo)
// con la misma forma que /api/public/restaurante/[slug]?carta=1, para que
// /imprimir/carta-pdf pueda consumirla sin bifurcar el componente.
//
// Seguridad:
//   - El token (firmado HMAC, tipo='carta_borrador') lo emite
//     /api/simulador/imprimir-borrador bajo requireRestaurantAccess.
//   - El borrador NO exige carta_publica_activa: justo para poder revisar
//     antes de publicar. El guard es el token.
//   - Sin token válido → 404 (no se filtra si existe borrador).
//   - Respuesta siempre no-store: nada de CDN cache.
//
// Selección de columnas: coste_compra y coste_estimado NUNCA viajan al
// cliente — igual que en la carta pública.
const CAMPOS_RESTAURANTE_SHAPE = [
  'id', 'slug', 'nombre', 'ciudad',
  'color_acento', 'color_primario', 'color_fondo', 'tipografia',
  'logo_url', 'banner_url', 'banner_zoom', 'banner_x', 'banner_y',
  'carta_mostrar_euro', 'carta_copa_decimales', 'carta_pie_texto',
  'carta_descripcion', 'carta_mostrar_copa', 'carta_incluir_bodega_anada',
  'carta_pdf_opciones',
  'carta_publica_activa',
]

function normalizarUrlPublica(valor, { imageOnly = false } = {}) {
  const raw = String(valor || '').trim().slice(0, 2048)
  if (!raw) return ''
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  try {
    const url = new URL(raw)
    const protocolos = imageOnly ? ['http:', 'https:'] : ['http:', 'https:', 'mailto:', 'tel:']
    return protocolos.includes(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

function seleccionarCampos(fila, campos) {
  return Object.fromEntries(campos
    .filter(campo => Object.prototype.hasOwnProperty.call(fila || {}, campo))
    .map(campo => [campo, fila[campo]]))
}

export async function GET(req, { params }) {
  try {
    const slug = String((await params).slug || '').trim()
    if (!/^[a-z0-9_-]{1,120}$/i.test(slug)) {
      return Response.json({ error: 'Restaurante no encontrado.' }, { status: 404, headers: noStoreHeaders() })
    }

    const { searchParams } = new URL(req.url)
    const token = String(searchParams.get('token') || '').trim()
    if (!token) {
      return Response.json({ error: 'Falta token.' }, { status: 401, headers: noStoreHeaders() })
    }

    // Fallback 42703 escalonado: si falta la columna carta_pdf_opciones
    // (migración no aplicada), reintenta sin ella.
    async function leer(cols) {
      return supabaseAdmin.from('restaurantes').select(cols).eq('slug', slug).single()
    }
    let { data: restaurante, error } = await leer(CAMPOS_RESTAURANTE_SHAPE.join(', '))
    if (error && error.code === '42703') {
      const retry = await leer(CAMPOS_RESTAURANTE_SHAPE.filter(c => c !== 'carta_pdf_opciones').join(', '))
      restaurante = retry.data
      error = retry.error
    }

    if (!restaurante) {
      return Response.json({ error: 'Restaurante no encontrado.' }, { status: 404, headers: noStoreHeaders() })
    }

    // Validación del token contra el restaurante_id. Si no cuadra → 403.
    if (!validarTokenBorradorCarta(token, restaurante.id)) {
      return Response.json({ error: 'Token inválido o caducado.' }, { status: 403, headers: noStoreHeaders() })
    }

    // Borrador: líneas estado∈{actual,nuevo}. Se une a `vinos` para recuperar
    // uva/notas/foto cuando la línea procede del catálogo del restaurante.
    const { data: lineas, error: errLineas } = await supabaseAdmin
      .from('carta_simulacion')
      .select(`
        id, estado, nombre, bodega, tipo, region, anada, formato,
        precio_botella, precio_copa,
        vino_id, catalogo_vino_id,
        vinos(id, uva, copa_ml, notas_cata, activo, internacional, foto_url)
      `)
      .eq('restaurante_id', restaurante.id)
      .in('estado', ['actual', 'nuevo'])

    if (errLineas) {
      console.error('[public/borrador]', { slug, code: errLineas.code, message: errLineas.message })
      return Response.json({ error: 'No se pudo cargar el borrador.' }, { status: 503, headers: noStoreHeaders() })
    }

    const vinos = (lineas || []).map(linea => {
      const vinoReal = linea.vinos || {}
      return {
        // Para líneas 'nuevo' aún no hay vino_id real; usamos id de la línea.
        id:              linea.vino_id || linea.id,
        nombre:          linea.nombre,
        bodega:          linea.bodega || null,
        tipo:            linea.tipo || null,
        region:          linea.region || null,
        uva:             vinoReal.uva || null,
        anada:           linea.anada || null,
        // Precios editados en el simulador tienen prioridad.
        precio_copa:     linea.precio_copa    ?? null,
        precio_botella:  linea.precio_botella ?? null,
        copa_ml:         vinoReal.copa_ml || null,
        notas_cata:      limpiarMarcadorPerfiles(vinoReal.notas_cata || null),
        activo:          true,
        internacional:   vinoReal.internacional === true || isInternationalWine(linea),
        foto_url:        normalizarUrlPublica(vinoReal.foto_url || '', { imageOnly: true }),
        perfiles_maridaje: resolverPerfilesVino(vinoReal),
        disponible:      true,
        _es_nuevo:       linea.estado === 'nuevo',
      }
    })

    // Platos para la carta: mismos filtros que la pública.
    const { data: platos } = await supabaseAdmin
      .from('platos')
      .select('id, restaurante_id, nombre, categoria, precio, activo, familias_aromaticas, foto_url')
      .eq('restaurante_id', restaurante.id)
      .eq('activo', true)

    const publico = seleccionarCampos(restaurante, CAMPOS_RESTAURANTE_SHAPE)
    ;['logo_url', 'banner_url'].forEach(campo => {
      if (publico[campo]) publico[campo] = normalizarUrlPublica(publico[campo], { imageOnly: true })
    })

    return Response.json({
      restaurante: {
        ...publico,
        modo_borrador: true,
      },
      vinos,
      platos: platos || [],
      seleccion: [],
    }, { headers: noStoreHeaders() })
  } catch (err) {
    console.error('[public/borrador GET]', err)
    return Response.json({ error: 'No se pudo cargar el borrador.' }, { status: 500, headers: noStoreHeaders() })
  }
}
