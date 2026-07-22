export async function enviarAprobacionPreview({
  restauranteId,
  previewToken,
  destino,
  reviewerName,
  reviewerEmail,
  note,
}) {
  const res = await fetch('/api/publicacion/preview-approval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurante_id: restauranteId,
      preview_token: previewToken,
      destino,
      reviewer_name: reviewerName,
      reviewer_email: reviewerEmail,
      note,
    }),
  })
  const data = await res.json().catch(() => ({}))
  return { res, data }
}
