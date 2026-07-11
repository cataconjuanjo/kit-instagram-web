export async function POST(request) {
  try {
    const body = await request.json()
    const event = {
      type: 'client_error',
      digest: String(body.digest || '').slice(0, 120),
      message: String(body.message || 'Error de interfaz').slice(0, 300),
      path: String(body.path || '').slice(0, 240),
      userAgent: String(request.headers.get('user-agent') || '').slice(0, 180),
      timestamp: new Date().toISOString(),
    }
    console.error('[client-error]', JSON.stringify(event))
    return Response.json({ ok: true }, { status: 202 })
  } catch {
    return Response.json({ ok: true }, { status: 202 })
  }
}
