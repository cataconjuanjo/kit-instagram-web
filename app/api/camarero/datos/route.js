import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { validarSesionCamarero } from '../../../lib/camareroSession'
import { puedeUsar } from '../../../lib/plans'

const CAMPOS_RESTAURANTE_SALA = [
  'id', 'slug', 'nombre', 'ciudad',
  'plan', 'subscription_status', 'ticket_medio_comida',
]

const SELECT_RESTAURANTE_SALA = CAMPOS_RESTAURANTE_SALA.join(', ')
const SELECT_VINO_SALA = [
  'id', 'restaurante_id', 'nombre', 'bodega', 'tipo', 'region', 'uva', 'anada',
  'precio_copa', 'precio_botella', 'notas_cata', 'activo', 'stock',
  'internacional',
].join(', ')
const SELECT_PLATO_SALA = 'id, restaurante_id, nombre, categoria, precio, descripcion, activo, familias_aromaticas'

function seleccionarCampos(fila, campos) {
  return Object.fromEntries(campos
    .filter(campo => Object.prototype.hasOwnProperty.call(fila || {}, campo))
    .map(campo => [campo, fila[campo]]))
}

export async function POST(req) {
  try {
    const { restaurante_id, sala_token } = await req.json()
    if (!restaurante_id || !validarSesionCamarero(sala_token, restaurante_id)) {
      return Response.json({ error: 'Sesión de sala no válida.' }, { status: 403 })
    }

    const [{ data: restaurante }, { data: vinos }, { data: platos }] = await Promise.all([
      supabaseAdmin.from('restaurantes').select(SELECT_RESTAURANTE_SALA).eq('id', restaurante_id).single(),
      supabaseAdmin.from('vinos').select(SELECT_VINO_SALA).eq('restaurante_id', restaurante_id).eq('activo', true),
      supabaseAdmin.from('platos').select(SELECT_PLATO_SALA).eq('restaurante_id', restaurante_id).eq('activo', true).order('categoria'),
    ])

    if (!restaurante) return Response.json({ error: 'Restaurante no encontrado.' }, { status: 404 })
    return Response.json({
      restaurante: {
        ...seleccionarCampos(restaurante, CAMPOS_RESTAURANTE_SALA),
        sala_disponible: puedeUsar(restaurante, 'modo_camarero'),
      },
      vinos: vinos || [],
      platos: platos || [],
    })
  } catch (error) {
    console.error('[camarero-datos]', error)
    return Response.json({ error: 'No se pudieron cargar los datos de sala.' }, { status: 500 })
  }
}
