import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../../supabase'
import { analizarMaridaje, resumenAnalisisParaPrompt } from '../../lib/maridajeEngine'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

function lineaVino(vino) {
  return `- ${vino.nombre} (${[
    vino.bodega,
    vino.tipo,
    vino.region,
    vino.uva ? `uva: ${vino.uva}` : '',
    vino.anada ? `anada: ${vino.anada}` : '',
    vino.precio_copa ? `copa: ${vino.precio_copa} EUR` : '',
    `botella: ${vino.precio_botella} EUR`,
    vino.notas_cata ? `notas: ${vino.notas_cata}` : ''
  ].filter(Boolean).join(', ')})`
}

function lineaPlato(plato) {
  return `- ${plato.nombre}${plato.precio ? ` (${plato.precio} EUR)` : ''}${plato.descripcion ? ': ' + plato.descripcion : ''} (${plato.categoria})`
}

export async function POST(request) {
  try {
    const { consulta, modo, modoMesa, restaurante_id, idioma } = await request.json()

    const { data: vinos } = await supabase
      .from('vinos')
      .select('*')
      .eq('restaurante_id', restaurante_id)
      .eq('activo', true)
      .gt('stock', 0)

    const { data: platos } = await supabase
      .from('platos')
      .select('*')
      .eq('restaurante_id', restaurante_id)
      .eq('activo', true)

    const cartaVinos = (vinos || []).map(lineaVino).join('\n')
    const cartaPlatos = (platos || []).map(lineaPlato).join('\n')
    const analisisMaridaje = modo === 'mesa' || modo === 'plato'
      ? analizarMaridaje(consulta, vinos || [])
      : null
    const criterioCompartido = analisisMaridaje ? resumenAnalisisParaPrompt(analisisMaridaje) : ''

    const prompt = modo === 'mesa'
      ? idioma === 'en'
        ? `The customer is ordering these dishes: ${consulta}.
The available wine list is:
${cartaVinos}

Shared internal pairing analysis:
${criterioCompartido}

The customer wants ${modoMesa}. Recommend two options from this list: one under 30 euros and one with no price limit. For each option explain in 1-2 sentences why it works well with the dishes. Include name and price. Be friendly and specific.`
        : `El cliente va a pedir estos platos: ${consulta}.
La carta de vinos disponible es:
${cartaVinos}

${criterioCompartido}

El cliente quiere ${modoMesa}. Recomienda dos opciones de esta carta: una por debajo de 30 euros y otra sin limite de precio. Para cada opcion explica en 1-2 frases por que funciona bien con el conjunto de platos. Indica nombre y precio. Se amigable y concreto.`
      : modo === 'plato'
        ? idioma === 'en'
          ? `The customer is going to eat: "${consulta}".
The available wine list is:
${cartaVinos}

Shared internal pairing analysis:
${criterioCompartido}

Recommend two wines from this list: one under 30 euros and one with no price limit. For each explain in 1-2 sentences why it pairs well. Include name and price. Be brief and friendly.`
          : `El cliente va a comer: "${consulta}".
La carta de vinos disponible es:
${cartaVinos}

${criterioCompartido}

Recomienda dos vinos de esta carta: uno por debajo de 30 euros y otro sin limite de precio. Para cada uno explica en 1-2 frases por que marida bien. Indica el nombre y precio. Se breve y amigable.`
        : idioma === 'en'
          ? `The customer wants to drink: "${consulta}".
IMPORTANT: Only recommend dishes from this exact list, do not invent any:
${cartaPlatos}

Choose 3 dishes from that list that pair well with this wine. For each explain in 1 sentence why they work together. Name the dishes exactly as they appear in the list. Be brief and friendly.`
          : `El cliente quiere tomar: "${consulta}".
IMPORTANTE: Solo puedes recomendar platos que esten en esta lista exacta, no inventes ninguno:
${cartaPlatos}

Elige 3 platos de esa lista que mariden bien con este vino. Para cada uno explica en 1 frase por que funcionan juntos. Nombra los platos exactamente como aparecen en la lista. Se breve y amigable.`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: idioma === 'en'
        ? 'You are an expert wine sommelier with deep knowledge of food and wine pairing based on WSET Level 3 methodology and the restaurant internal Papilas/Chartier pairing knowledge base. You always respond in plain flowing text, as if speaking in person. Never use asterisks, hashtags, bold or formatting symbols. Your recommendations are based on structural interactions between food and wine: sweetness, acidity, tannins, alcohol, body, umami, salt, bitterness and spice. Sweetness and umami in food make wine taste harder; salt and acidity in food make wine taste softer. Always consider sauces and cooking methods, not just the main ingredient. Be open to sparkling wines, whites, roses and fortified wines when the context calls for it. Always recommend wines from the restaurant actual list, never invent wines. Your tone is knowledgeable, warm and direct.'
        : 'Eres un sommelier experto con profundo conocimiento de armonizacion de vino y comida basado en metodologia WSET Level 3 y en la base interna Papilas/Chartier del restaurante. Respondes siempre en texto plano corrido, como si hablaras en persona. Nunca usas asteriscos, almohadillas, negritas ni simbolos de formato. Tus recomendaciones se basan en interacciones estructurales entre comida y vino: dulzor, acidez, taninos, alcohol, cuerpo, umami, sal, amargor y picante. El dulzor y el umami en la comida hacen que el vino sepa mas duro; la sal y la acidez hacen que sepa mas suave. Considera siempre salsas y metodo de coccion, no solo el ingrediente principal. Eres abierto a recomendar espumosos, blancos, rosados y generosos cuando el contexto lo pide. Siempre recomiendas vinos de la carta real del restaurante, nunca inventas vinos. Tu tono es experto, cercano y directo.',
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: idioma === 'en' ? 'Sure, here is my recommendation in plain text:' : 'Claro, te lo explico en texto corrido sin ningun formato:' }
      ]
    })

    return Response.json({ respuesta: message.content[0].text })
  } catch (error) {
    console.error('Error en maridaje:', error)
    return Response.json({ respuesta: 'Error al consultar el sommelier.' }, { status: 500 })
  }
}
