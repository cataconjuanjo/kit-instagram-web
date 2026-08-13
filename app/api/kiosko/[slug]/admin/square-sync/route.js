import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'
import { squareSyncForTienda } from '../../../../../api/_lib/squareSync'
import {
  decryptTpvCredential,
  missingEncryptedCredentialColumn,
  resolveSquareAccessToken,
} from '../../../../../lib/tpvCredentials'

export const maxDuration = 120

const SQUARE_TOKEN_SELECT = 'square_access_token, square_access_token_encrypted'
const SQUARE_TOKEN_LEGACY_SELECT = 'square_access_token'

export async function POST(request, { params }) {
  const { slug } = await params

  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status || 403 })

  // Obtener el token de Square específico de esta tienda
  let { data: tiendaData, error: tiendaError } = await supabaseAdmin
    .from('tiendas')
    .select(SQUARE_TOKEN_SELECT)
    .eq('id', access.tienda.id)
    .single()

  if (tiendaError && missingEncryptedCredentialColumn(tiendaError)) {
    const legacy = await supabaseAdmin
      .from('tiendas')
      .select(SQUARE_TOKEN_LEGACY_SELECT)
      .eq('id', access.tienda.id)
      .single()
    tiendaData = legacy.data
    tiendaError = legacy.error
  }

  if (tiendaError) {
    return NextResponse.json({ error: tiendaError.message }, { status: 500 })
  }

  let squareToken = null
  try {
    squareToken = resolveSquareAccessToken(tiendaData).token || decryptTpvCredential(process.env.SQUARE_ACCESS_TOKEN || '')
  } catch (error) {
    console.error('[square-sync] Credencial TPV invalida:', error.message)
    return NextResponse.json({ error: 'Credencial de Square invalida o clave de cifrado no configurada.' }, { status: 500 })
  }

  if (!squareToken) {
    return NextResponse.json(
      { error: 'Esta tienda no tiene un token de Square configurado. Ve a Ajustes → Square.' },
      { status: 400 }
    )
  }

  try {
    const result = await squareSyncForTienda(access.tienda.id, slug, squareToken)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[square-sync]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
