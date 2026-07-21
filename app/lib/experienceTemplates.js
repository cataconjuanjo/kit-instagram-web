export const EXPERIENCIAS_CARTA_VIVA = {
  lanzamiento: {
    id: 'lanzamiento',
    label: 'Lanzamiento QR en sala',
    badge: 'Activacion',
    delivery: {
      tagline: 'Escanea y descubre nuestra carta viva',
      sala: 'Presenta el QR como la forma mas segura de ver la carta actualizada.',
      cliente: 'Desde ahi puedes ver la carta actualizada y las recomendaciones antes de pedir.',
      whatsapp: 'Hola, te paso la Carta Viva actualizada de',
      instagram: 'Carta Viva lista en',
    },
    public: {
      headline: 'Carta viva lista para mesa',
      text: 'Consulta la carta actualizada, vinos y recomendaciones desde el QR del restaurante.',
      hubText: 'Accede a carta, reservas y enlaces utiles desde una experiencia preparada para sala.',
    },
  },
  temporada: {
    id: 'temporada',
    label: 'Carta de temporada',
    badge: 'Temporada',
    delivery: {
      tagline: 'Nuestra seleccion de temporada ya esta viva',
      sala: 'Usa el QR para ensenar novedades, producto de temporada y vinos con foco.',
      cliente: 'Desde ahi puedes ver novedades de temporada y recomendaciones actualizadas.',
      whatsapp: 'Hola, te paso la carta de temporada de',
      instagram: 'Carta de temporada activa en',
    },
    public: {
      headline: 'Seleccion de temporada',
      text: 'Novedades, vinos y platos destacados reunidos para este momento de la carta.',
      hubText: 'La carta de temporada, enlaces utiles y recomendaciones quedan a mano desde aqui.',
    },
  },
  degustacion: {
    id: 'degustacion',
    label: 'Menu degustacion con maridaje',
    badge: 'Experiencia',
    delivery: {
      tagline: 'Un recorrido con maridaje para disfrutar paso a paso',
      sala: 'Presenta el QR como guia del recorrido y sus vinos, no como una carta generica.',
      cliente: 'Desde ahi puedes ver el recorrido, los vinos y las recomendaciones del menu.',
      whatsapp: 'Hola, te paso el menu con maridaje de',
      instagram: 'Menu con maridaje disponible en',
    },
    public: {
      headline: 'Menu degustacion con maridaje',
      text: 'Un recorrido guiado para descubrir cada pase con su vino recomendado.',
      hubText: 'Entra en la carta viva para seguir el recorrido y sus recomendaciones.',
    },
  },
  premium: {
    id: 'premium',
    label: 'Bodega premium por botella',
    badge: 'Premium',
    delivery: {
      tagline: 'Vinos especiales para una mesa especial',
      sala: 'Usa el QR para apoyar recomendaciones premium sin forzar la venta.',
      cliente: 'Desde ahi puedes ver nuestra seleccion especial de bodega y recomendaciones.',
      whatsapp: 'Hola, te paso la seleccion especial de bodega de',
      instagram: 'Seleccion premium disponible en',
    },
    public: {
      headline: 'Seleccion especial de bodega',
      text: 'Referencias singulares y botellas con mas contexto para elegir con seguridad.',
      hubText: 'Descubre la seleccion especial y el resto de enlaces del restaurante.',
    },
  },
  evento: {
    id: 'evento',
    label: 'Evento privado o grupo',
    badge: 'Privado',
    delivery: {
      tagline: 'Una carta preparada para este momento',
      sala: 'Comprueba que el enlace corresponde al evento antes de compartirlo con invitados.',
      cliente: 'Desde ahi puedes ver la carta preparada para esta experiencia.',
      whatsapp: 'Hola, te paso la carta preparada para el evento de',
      instagram: 'Experiencia privada preparada en',
    },
    public: {
      headline: 'Carta preparada para esta experiencia',
      text: 'Una seleccion pensada para el grupo, la reserva o el momento especial.',
      hubText: 'Todo lo necesario para esta experiencia queda reunido en un solo acceso.',
    },
  },
}

export const EXPERIENCE_TEMPLATE_IDS = Object.keys(EXPERIENCIAS_CARTA_VIVA)

export const EXPERIENCIA_ENTREGA_INICIAL = {
  loading: false,
  pendiente: false,
  error: '',
  id: '',
  label: '',
  badge: 'Carta Viva',
  tagline: '',
  sala: '',
  cliente: '',
  whatsapp: '',
  instagram: '',
  progreso: 0,
  completados: 0,
  total: 0,
  objetivo: '',
  responsable: '',
}

export function experienciaTemplateExiste(templateId) {
  return Boolean(EXPERIENCIAS_CARTA_VIVA[templateId])
}

export function experienciaLabel(templateId) {
  return EXPERIENCIAS_CARTA_VIVA[templateId]?.label || ''
}

export function experienciaEntregaDesdePlan(plan = {}) {
  const template = EXPERIENCIAS_CARTA_VIVA[plan?.template_id]
  if (!template) return null
  const completedSteps = plan.completed_steps || {}
  const valores = Object.values(completedSteps)
  const total = valores.length
  const completados = valores.filter(Boolean).length
  return {
    ...EXPERIENCIA_ENTREGA_INICIAL,
    ...template.delivery,
    id: plan.template_id,
    label: template.label,
    badge: template.badge,
    progreso: total ? Math.round((completados / total) * 100) : 0,
    completados,
    total,
    objetivo: plan.objective_date || '',
    responsable: plan.responsible || '',
  }
}

export function experienciaPublicaDesdePlan(plan = {}) {
  const template = EXPERIENCIAS_CARTA_VIVA[plan?.template_id]
  if (!template) return null
  return {
    id: plan.template_id,
    label: template.label,
    badge: template.badge,
    headline: template.public.headline,
    text: template.public.text,
    hub_text: template.public.hubText,
  }
}
