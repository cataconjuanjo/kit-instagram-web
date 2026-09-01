import { createClient } from '@supabase/supabase-js'
import { titleCaseNombre } from '../../lib/normalizarNombre.js'
import { splitZonaTipo, sospechaZona, splitFormato } from '../../lib/normalizarCatalogo.js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'
const SELECT_PROVEEDOR = [
  'id', 'nombre', 'contacto', 'email', 'telefono', 'zona', 'notas',
  'visible_restaurantes', 'created_at', 'updated_at',
].join(', ')
const SELECT_CATALOGO_VINO = [
  'id', 'proveedor_id', 'nombre', 'bodega', 'tipo', 'region', 'uva',
  'anada', 'referencia', 'formato', 'coste_estimado', 'pvp_recomendado', 'pvp_copa',
  'disponibilidad', 'notas', 'activo', 'favorito', 'created_at',
  'updated_at', 'proveedores_vino(nombre)',
  'zona', 'tamanyo', 'unidades_por_caja', 'referencia_proveedor', 'almacen_proveedor', 'graduacion',
].join(', ')

async function validarAdmin(req) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'Sesión no recibida', status: 401 }

  const supabaseAuth = createClient(supabaseUrl, anonKey)
  const { data, error } = await supabaseAuth.auth.getUser(token)
  if (error || !data?.user) return { error: 'Sesión no válida', status: 401 }
  if ((data.user.email || '').toLowerCase() !== adminEmail.toLowerCase()) {
    return { error: 'No autorizado', status: 403 }
  }

  return { user: data.user }
}

function adminClient() {
  if (!serviceRoleKey) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

async function seleccionarTodo(query, chunkSize = 1000) {
  let from = 0
  let rows = []

  while (true) {
    const { data, error } = await query.range(from, from + chunkSize - 1)
    if (error) throw error
    rows = rows.concat(data || [])
    if (!data || data.length < chunkSize) break
    from += chunkSize
  }

  return rows
}

function texto(body, campo) {
  return repararMojibake(String(body[campo] || '').trim())
}

function dinero(valor) {
  if (valor === '' || valor === null || valor === undefined) return 0
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0
  const limpio = String(valor)
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '')
  if (!limpio) return 0
  const decimal = limpio.includes(',') && limpio.lastIndexOf(',') > limpio.lastIndexOf('.')
    ? limpio.replace(/\./g, '').replace(',', '.')
    : limpio.replace(/,/g, '')
  const numero = Number(decimal)
  return Number.isFinite(numero) ? numero : 0
}

function repararMojibake(valor) {
  if (!valor || !/[ÃÂâ]/.test(valor)) return valor
  const windows1252 = {
    '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87,
    'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e,
    '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
    '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
  }
  const bytes = Uint8Array.from(Array.from(valor).map(char => {
    const codigo = char.charCodeAt(0)
    return windows1252[char] ?? (codigo <= 255 ? codigo : codigo & 255)
  }))
  const reparado = new TextDecoder('utf-8').decode(bytes)
  return reparado.includes('�') ? valor : reparado
}

function repararFila(fila) {
  if (!fila) return fila
  return Object.fromEntries(Object.entries(fila).map(([clave, valor]) => {
    if (typeof valor === 'string') return [clave, repararMojibake(valor)]
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) return [clave, repararFila(valor)]
    return [clave, valor]
  }))
}

function payloadProveedor(body) {
  return {
    nombre: texto(body, 'nombre'),
    contacto: texto(body, 'contacto') || null,
    email: texto(body, 'email') || null,
    telefono: texto(body, 'telefono') || null,
    zona: texto(body, 'zona') || null,
    notas: texto(body, 'notas') || null,
    visible_restaurantes: Boolean(body.visible_restaurantes),
    updated_at: new Date().toISOString()
  }
}

function payloadVino(body) {
  const nombreRaw  = texto(body, 'nombre')
  const regionRaw  = texto(body, 'region')  || null
  const formatoRaw = texto(body, 'formato') || null

  // nombre → titleCase
  const nombreNorm = nombreRaw ? titleCaseNombre(nombreRaw) : nombreRaw

  // region → zona + tipo
  let zona = null
  let tipoNorm = texto(body, 'tipo') || null
  let regionRawGuardado = null
  if (regionRaw) {
    const { zona: z, tipo: tipoExtraido } = splitZonaTipo(regionRaw)
    if (!sospechaZona(z) && z !== regionRaw.trim()) {
      zona = z
      regionRawGuardado = regionRaw
      if (tipoExtraido && !tipoNorm) tipoNorm = tipoExtraido
    }
  }

  // formato → tamanyo, uds, etc.
  let tamanyo = null, unidades_por_caja = null, referencia_proveedor = null
  let almacen_proveedor = null, graduacion = null, formatoRawGuardado = null
  if (formatoRaw) {
    const r = splitFormato(formatoRaw)
    const hayExtraccion =
      r.tamanyo !== formatoRaw || r.unidades_por_caja !== null ||
      r.referencia_proveedor || r.almacen_proveedor || r.graduacion
    if (hayExtraccion) {
      formatoRawGuardado = formatoRaw
      if (!r.revisar) {
        tamanyo = r.tamanyo || null
        unidades_por_caja = r.unidades_por_caja
        referencia_proveedor = r.referencia_proveedor || null
        graduacion = r.graduacion || null
        almacen_proveedor = r.almacen_proveedor || null
      } else if (r.revisarMsg === 'código almacén ambiguo') {
        tamanyo = r.tamanyo || null
        unidades_por_caja = r.unidades_por_caja
        referencia_proveedor = r.referencia_proveedor || null
        graduacion = r.graduacion || null
        // almacen_proveedor queda null intencionadamente
      }
      // posible unidades / sin clasificar → no tocar campos de formato
    }
  }

  return {
    proveedor_id: body.proveedor_id,
    nombre: nombreNorm,
    nombre_raw: nombreRaw !== nombreNorm ? nombreRaw : null,
    bodega: texto(body, 'bodega') || null,
    tipo: tipoNorm,
    region: regionRaw,
    region_raw: regionRawGuardado,
    zona,
    uva: texto(body, 'uva') || null,
    anada: texto(body, 'anada') || null,
    referencia: texto(body, 'referencia') || null,
    formato: formatoRaw,
    formato_raw: formatoRawGuardado,
    tamanyo,
    unidades_por_caja,
    referencia_proveedor,
    graduacion,
    almacen_proveedor,
    coste_estimado: dinero(body.coste_estimado),
    pvp_recomendado: dinero(body.pvp_recomendado),
    disponibilidad: texto(body, 'disponibilidad') || null,
    notas: texto(body, 'notas') || null,
    activo: body.activo !== false,
    updated_at: new Date().toISOString()
  }
}

export async function GET(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const supabase = adminClient()
    const [{ data: proveedores, error: proveedoresError }, vinos] = await Promise.all([
      supabase.from('proveedores_vino').select(SELECT_PROVEEDOR).order('nombre'),
      seleccionarTodo(
        supabase
          .from('proveedor_catalogo_vinos')
          .select(SELECT_CATALOGO_VINO)
          .order('created_at', { ascending: false })
      )
    ])

    if (proveedoresError) throw proveedoresError

    return Response.json({
      proveedores: (proveedores || []).map(repararFila),
      vinos: (vinos || []).map(repararFila),
    })
  } catch (error) {
    console.error('Error leyendo proveedores:', error)
    return Response.json({ error: 'No se pudieron cargar los proveedores.' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const body = await req.json()
    const supabase = adminClient()

    if (body.kind === 'vinos_bulk') {
      const proveedorId = body.proveedor_id
      const vinos = Array.isArray(body.vinos) ? body.vinos : []
      if (!proveedorId || !vinos.length) {
        return Response.json({ error: 'Proveedor y vinos son obligatorios.' }, { status: 400 })
      }

      const payload = vinos
        .map(vino => payloadVino({ ...vino, proveedor_id: proveedorId }))
        .filter(vino => vino.nombre)

      if (!payload.length) {
        return Response.json({ error: 'No hay vinos válidos para importar.' }, { status: 400 })
      }

      if (body.reemplazar === true) {
        const { error } = await supabase
          .from('proveedor_catalogo_vinos')
          .delete()
          .eq('proveedor_id', proveedorId)

        if (error) throw error
      }

      const { data, error } = await supabase
        .from('proveedor_catalogo_vinos')
        .insert(payload)
        .select(SELECT_CATALOGO_VINO)

      if (error) throw error
      return Response.json({ vinos: data || [] })
    }

    if (body.kind === 'vino') {
      const dataPayload = payloadVino(body)
      if (!dataPayload.proveedor_id || !dataPayload.nombre) {
        return Response.json({ error: 'Proveedor y nombre del vino son obligatorios.' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('proveedor_catalogo_vinos')
        .insert([dataPayload])
        .select(SELECT_CATALOGO_VINO)
        .single()

      if (error) throw error
      return Response.json({ vino: data })
    }

    const dataPayload = payloadProveedor(body)
    if (!dataPayload.nombre) return Response.json({ error: 'El nombre del proveedor es obligatorio.' }, { status: 400 })

    const { data, error } = await supabase
      .from('proveedores_vino')
      .insert([dataPayload])
      .select(SELECT_PROVEEDOR)
      .single()

    if (error) throw error
    return Response.json({ proveedor: data })
  } catch (error) {
    console.error('Error creando proveedor/catálogo:', error)
    return Response.json({ error: 'No se pudo guardar.' }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const body = await req.json()

    if (body.kind === 'marcar_todos_visibles') {
      const supabase = adminClient()
      const { data, error } = await supabase
        .from('proveedores_vino')
        .update({ visible_restaurantes: true, updated_at: new Date().toISOString() })
        .eq('visible_restaurantes', false)
        .select('id')
      if (error) throw error
      return Response.json({ actualizados: (data || []).length })
    }

    if (!body.id) return Response.json({ error: 'ID obligatorio.' }, { status: 400 })
    const supabase = adminClient()

    if (body.kind === 'favorito') {
      const { data, error } = await supabase
        .from('proveedor_catalogo_vinos')
        .update({ favorito: Boolean(body.favorito), updated_at: new Date().toISOString() })
        .eq('id', body.id)
        .select('id, favorito')
        .single()
      if (error) throw error
      return Response.json({ vino: data })
    }

    if (body.kind === 'vino') {
      const dataPayload = payloadVino(body)
      if (!dataPayload.proveedor_id || !dataPayload.nombre) {
        return Response.json({ error: 'Proveedor y nombre del vino son obligatorios.' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('proveedor_catalogo_vinos')
        .update(dataPayload)
        .eq('id', body.id)
        .select(SELECT_CATALOGO_VINO)
        .single()

      if (error) throw error
      return Response.json({ vino: data })
    }

    const dataPayload = payloadProveedor(body)
    if (!dataPayload.nombre) return Response.json({ error: 'El nombre del proveedor es obligatorio.' }, { status: 400 })

    const { data, error } = await supabase
      .from('proveedores_vino')
      .update(dataPayload)
      .eq('id', body.id)
      .select(SELECT_PROVEEDOR)
      .single()

    if (error) throw error
    return Response.json({ proveedor: data })
  } catch (error) {
    console.error('Error editando proveedor/catálogo:', error)
    return Response.json({ error: 'No se pudo editar.' }, { status: 500 })
  }
}

export async function DELETE(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const { id, kind } = await req.json()
    if (!id) return Response.json({ error: 'ID obligatorio.' }, { status: 400 })

    const tabla = kind === 'vino' ? 'proveedor_catalogo_vinos' : 'proveedores_vino'
    const { error } = await adminClient().from(tabla).delete().eq('id', id)
    if (error) throw error

    return Response.json({ ok: true })
  } catch (error) {
    console.error('Error borrando proveedor/catálogo:', error)
    return Response.json({ error: 'No se pudo borrar.' }, { status: 500 })
  }
}
