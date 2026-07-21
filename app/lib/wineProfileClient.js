export const DEFAULT_WINE_PROFILE = {
  dulzor: 2,
  acidez: 3,
  taninos: 3,
  alcohol: 3,
  cuerpo: 3,
  intensidad: 3,
  final: 3,
}

function restauranteIdDesdeOpciones({ restaurante, restauranteId }) {
  if (restauranteId !== undefined) return restauranteId
  return restaurante.id
}

export async function solicitarPerfilVino(vino, {
  restaurante,
  restauranteId,
  pruebaToken,
  incluirPruebaToken = false,
} = {}) {
  const body = {
    nombre: vino.nombre,
    tipo: vino.tipo,
    region: vino.region,
    uva: vino.uva,
    anada: vino.anada,
    restaurante_id: restauranteIdDesdeOpciones({ restaurante, restauranteId }),
  }

  if (incluirPruebaToken) body.prueba_token = pruebaToken

  const res = await fetch('/api/perfil', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  return res.json()
}

export async function cargarPerfilesVino(vinosACargar, {
  restaurante,
  restauranteId,
  pruebaToken,
  incluirPruebaToken = false,
  onPerfilRecibido,
  onPerfilError,
} = {}) {
  const resultados = await Promise.all(
    vinosACargar.map(async vino => {
      try {
        const data = await solicitarPerfilVino(vino, {
          restaurante,
          restauranteId,
          pruebaToken,
          incluirPruebaToken,
        })
        onPerfilRecibido?.(vino, data)
        return { id: vino.id, perfil: data.perfil }
      } catch (error) {
        onPerfilError?.(vino, error)
        return { id: vino.id, perfil: { ...DEFAULT_WINE_PROFILE } }
      }
    })
  )

  const perfiles = {}
  resultados.forEach(resultado => { perfiles[resultado.id] = resultado.perfil })
  return perfiles
}
