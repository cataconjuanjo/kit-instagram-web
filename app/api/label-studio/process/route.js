import { NextResponse } from 'next/server'
// sharp se importa dinámicamente para evitar errores de build en entornos sin binarios nativos
let sharpLib = null
async function getSharp() {
  if (!sharpLib) sharpLib = (await import('sharp')).default
  return sharpLib
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 18 * 1024 * 1024
const MAX_GEMINI_EDGE = 1800
const MAX_OUTPUT_EDGE = 2400
const MAX_OUTPUT_PIXELS = 6_000_000
const DEFAULT_MODEL = 'gemini-3.6-flash'
const MIME_OK = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

const DETECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    label_detected: {
      type: 'boolean',
      description: 'True only when a front wine bottle label is visible.',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Estimated confidence from 0 to 1.',
    },
    coordinate_space: {
      type: 'string',
      enum: ['pixels', 'normalized_0_1000'],
      description: 'Use pixels whenever possible. Use normalized_0_1000 only if the model cannot infer exact pixels.',
    },
    bounding_box: {
      type: ['object', 'null'],
      additionalProperties: false,
      description: 'Axis-aligned bounding box around the visible wine label.',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
      },
      required: ['x', 'y', 'width', 'height'],
    },
    corners: {
      type: 'array',
      description: 'Four visible label corners ordered top-left, top-right, bottom-right, bottom-left. Return an empty array when four valid corners are not visible.',
      minItems: 0,
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
        },
        required: ['x', 'y'],
      },
    },
    notes: {
      type: 'string',
      description: 'Short note about ambiguity, occlusion, or why corners are missing.',
    },
  },
  required: ['label_detected', 'confidence', 'coordinate_space', 'bounding_box', 'corners', 'notes'],
}

class PublicError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

function jsonError(message, status = 500, details = undefined) {
  return NextResponse.json({ error: message, details }, { status })
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function finiteNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function polygonArea(points) {
  let area = 0
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i]
    const next = points[(i + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }
  return Math.abs(area / 2)
}

function orderCorners(points) {
  const byY = [...points].sort((a, b) => a.y - b.y || a.x - b.x)
  const top = byY.slice(0, 2).sort((a, b) => a.x - b.x)
  const bottom = byY.slice(2, 4).sort((a, b) => a.x - b.x)
  return [top[0], top[1], bottom[1], bottom[0]]
}

function normalizePoint(point, imageSize, scale) {
  const x = finiteNumber(point?.x)
  const y = finiteNumber(point?.y)
  if (x === null || y === null) return null
  return {
    x: clamp(x * scale.x, 0, imageSize.width - 1),
    y: clamp(y * scale.y, 0, imageSize.height - 1),
  }
}

function normalizeBox(box, imageSize, scale) {
  if (!box || typeof box !== 'object') return null
  const x = finiteNumber(box.x)
  const y = finiteNumber(box.y)
  const width = finiteNumber(box.width)
  const height = finiteNumber(box.height)
  if (x === null || y === null || width === null || height === null) return null
  if (width <= 1 || height <= 1) return null

  const scaled = {
    x: x * scale.x,
    y: y * scale.y,
    width: width * scale.x,
    height: height * scale.y,
  }
  const left = clamp(Math.floor(scaled.x), 0, imageSize.width - 1)
  const top = clamp(Math.floor(scaled.y), 0, imageSize.height - 1)
  const right = clamp(Math.ceil(scaled.x + scaled.width), left + 1, imageSize.width)
  const bottom = clamp(Math.ceil(scaled.y + scaled.height), top + 1, imageSize.height)

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

function scaleForCoordinateSpace(rawDetection, geminiSize, outputSize) {
  const base = {
    x: outputSize.width / geminiSize.width,
    y: outputSize.height / geminiSize.height,
  }

  if (rawDetection?.coordinate_space === 'normalized_0_1000') {
    return {
      x: outputSize.width / 1000,
      y: outputSize.height / 1000,
    }
  }

  return base
}

function normalizeDetection(rawDetection, geminiSize, outputSize) {
  const scale = scaleForCoordinateSpace(rawDetection, geminiSize, outputSize)
  let corners = Array.isArray(rawDetection?.corners)
    ? rawDetection.corners
      .map(point => normalizePoint(point, outputSize, scale))
      .filter(Boolean)
    : []

  if (corners.length === 4) {
    corners = orderCorners(corners)
  } else {
    corners = []
  }

  const cornersValid = corners.length === 4
    && polygonArea(corners) > 400
    && distance(corners[0], corners[1]) > 12
    && distance(corners[1], corners[2]) > 12
    && distance(corners[2], corners[3]) > 12
    && distance(corners[3], corners[0]) > 12

  if (!cornersValid) corners = []

  let boundingBox = normalizeBox(rawDetection?.bounding_box, outputSize, scale)

  if (!boundingBox && corners.length === 4) {
    const xs = corners.map(point => point.x)
    const ys = corners.map(point => point.y)
    const left = clamp(Math.floor(Math.min(...xs)), 0, outputSize.width - 1)
    const top = clamp(Math.floor(Math.min(...ys)), 0, outputSize.height - 1)
    const right = clamp(Math.ceil(Math.max(...xs)), left + 1, outputSize.width)
    const bottom = clamp(Math.ceil(Math.max(...ys)), top + 1, outputSize.height)
    boundingBox = { x: left, y: top, width: right - left, height: bottom - top }
  }

  return {
    label_detected: Boolean(rawDetection?.label_detected),
    confidence: clamp(Number(rawDetection?.confidence || 0), 0, 1),
    coordinate_space: rawDetection?.coordinate_space === 'normalized_0_1000'
      ? 'normalized_0_1000'
      : 'pixels',
    bounding_box: boundingBox,
    corners,
    notes: String(rawDetection?.notes || '').slice(0, 500),
  }
}

function parseGeminiJson(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) throw new PublicError('Gemini no devolvio contenido JSON.', 502)

  try {
    return JSON.parse(trimmed)
  } catch {
    const fenced = trimmed
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim()
    const start = fenced.indexOf('{')
    const end = fenced.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) {
      throw new PublicError('No se pudo interpretar el JSON devuelto por Gemini.', 502)
    }
    return JSON.parse(fenced.slice(start, end + 1))
  }
}

function extractGeminiText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text
  if (typeof payload?.response?.output_text === 'string') return payload.response.output_text

  const legacyParts = payload?.candidates?.[0]?.content?.parts
  if (Array.isArray(legacyParts)) {
    return legacyParts.map(part => part.text).filter(Boolean).join('\n')
  }

  const output = payload?.output
  if (Array.isArray(output)) {
    return output
      .flatMap(item => item?.content || [])
      .map(part => part?.text)
      .filter(Boolean)
      .join('\n')
  }

  return ''
}

async function callGemini({ imageBuffer, mimeType, width, height }) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) {
    throw new PublicError('Falta GEMINI_API_KEY en .env.local.', 500)
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL
  const prompt = [
    'Analyze this wine bottle photo and locate the main front bottle label.',
    `The image dimensions are exactly ${width} by ${height} pixels.`,
    'Return only JSON matching the schema.',
    'bounding_box must be pixel coordinates in the original image shown to you: x, y, width, height.',
    'corners must contain exactly four visible label corners ordered top-left, top-right, bottom-right, bottom-left.',
    'Do not invent hidden or occluded corners. If four reliable corners are not visible, return corners as an empty array.',
    'If several labels are visible, choose the main front label on the bottle.',
    'Ignore capsules, neck labels, glass reflections, shelves, and background text.',
  ].join('\n')

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
      'Api-Revision': '2026-05-20',
    },
    body: JSON.stringify({
      model,
      input: [
        { type: 'text', text: prompt },
        {
          type: 'image',
          data: imageBuffer.toString('base64'),
          mime_type: mimeType,
        },
      ],
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: DETECTION_SCHEMA,
      },
      generation_config: {
        temperature: 0,
      },
    }),
  })

  const bodyText = await response.text()
  let payload
  try {
    payload = JSON.parse(bodyText)
  } catch {
    payload = { raw: bodyText }
  }

  if (!response.ok) {
    const message = payload?.error?.message || 'Gemini no pudo analizar la imagen.'
    throw new PublicError(message, response.status)
  }

  return parseGeminiJson(extractGeminiText(payload))
}

async function prepareImages(inputBuffer) {
  const sharp = await getSharp()
  const normalizedBuffer = await sharp(inputBuffer, { limitInputPixels: 60_000_000 })
    .rotate()
    .toBuffer()
  const sourceMeta = await sharp(normalizedBuffer).metadata()
  const sourceSize = {
    width: sourceMeta.width,
    height: sourceMeta.height,
  }

  if (!sourceSize.width || !sourceSize.height) {
    throw new PublicError('No se pudo leer el tamano de la imagen.', 400)
  }

  const shouldResize = sourceSize.width > MAX_GEMINI_EDGE
    || sourceSize.height > MAX_GEMINI_EDGE
    || normalizedBuffer.byteLength > 8 * 1024 * 1024

  if (!shouldResize) {
    return {
      sourceBuffer: normalizedBuffer,
      sourceSize,
      geminiBuffer: normalizedBuffer,
      geminiMime: sourceMeta.format === 'png' ? 'image/png' : sourceMeta.format === 'webp' ? 'image/webp' : 'image/jpeg',
      geminiSize: sourceSize,
    }
  }

  const geminiBuffer = await sharp(normalizedBuffer)
    .resize({ width: MAX_GEMINI_EDGE, height: MAX_GEMINI_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()
  const geminiMeta = await sharp(geminiBuffer).metadata()

  return {
    sourceBuffer: normalizedBuffer,
    sourceSize,
    geminiBuffer,
    geminiMime: 'image/jpeg',
    geminiSize: {
      width: geminiMeta.width,
      height: geminiMeta.height,
    },
  }
}

function solveLinearSystem(matrix, vector) {
  const size = vector.length
  const a = matrix.map((row, index) => [...row, vector[index]])

  for (let col = 0; col < size; col += 1) {
    let pivot = col
    for (let row = col + 1; row < size; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row
    }
    if (Math.abs(a[pivot][col]) < 1e-10) {
      throw new PublicError('Las esquinas detectadas no permiten corregir la perspectiva.', 422)
    }
    ;[a[col], a[pivot]] = [a[pivot], a[col]]

    const divisor = a[col][col]
    for (let j = col; j <= size; j += 1) a[col][j] /= divisor

    for (let row = 0; row < size; row += 1) {
      if (row === col) continue
      const factor = a[row][col]
      for (let j = col; j <= size; j += 1) a[row][j] -= factor * a[col][j]
    }
  }

  return a.map(row => row[size])
}

function homographyFromDestinationToSource(sourceCorners, width, height) {
  const destination = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ]
  const matrix = []
  const vector = []

  for (let i = 0; i < 4; i += 1) {
    const { x, y } = destination[i]
    const u = sourceCorners[i].x
    const v = sourceCorners[i].y
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    vector.push(u)
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    vector.push(v)
  }

  const h = solveLinearSystem(matrix, vector)
  return [...h, 1]
}

function sampleBilinear(raw, width, height, x, y) {
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) {
    return [0, 0, 0, 0]
  }

  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(width - 1, x0 + 1)
  const y1 = Math.min(height - 1, y0 + 1)
  const dx = x - x0
  const dy = y - y0
  const weights = [
    [(1 - dx) * (1 - dy), x0, y0],
    [dx * (1 - dy), x1, y0],
    [(1 - dx) * dy, x0, y1],
    [dx * dy, x1, y1],
  ]

  const pixel = [0, 0, 0, 0]
  for (const [weight, px, py] of weights) {
    const offset = (py * width + px) * 4
    pixel[0] += raw[offset] * weight
    pixel[1] += raw[offset + 1] * weight
    pixel[2] += raw[offset + 2] * weight
    pixel[3] += raw[offset + 3] * weight
  }

  return pixel.map(value => clamp(Math.round(value), 0, 255))
}

async function perspectiveWarp(sourceBuffer, sourceSize, corners) {
  const sharp = await getSharp()
  const topWidth = distance(corners[0], corners[1])
  const bottomWidth = distance(corners[3], corners[2])
  const leftHeight = distance(corners[0], corners[3])
  const rightHeight = distance(corners[1], corners[2])
  let outputWidth = Math.max(16, Math.round(Math.max(topWidth, bottomWidth)))
  let outputHeight = Math.max(16, Math.round(Math.max(leftHeight, rightHeight)))

  const edgeScale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(outputWidth, outputHeight))
  const pixelScale = Math.min(1, Math.sqrt(MAX_OUTPUT_PIXELS / (outputWidth * outputHeight)))
  const scale = Math.min(edgeScale, pixelScale)
  outputWidth = Math.max(16, Math.round(outputWidth * scale))
  outputHeight = Math.max(16, Math.round(outputHeight * scale))

  const scaledCorners = corners.map(point => ({
    x: point.x,
    y: point.y,
  }))
  const transform = homographyFromDestinationToSource(scaledCorners, outputWidth, outputHeight)
  const { data: raw } = await sharp(sourceBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const output = Buffer.alloc(outputWidth * outputHeight * 4)

  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      const denominator = transform[6] * x + transform[7] * y + transform[8]
      const sourceX = (transform[0] * x + transform[1] * y + transform[2]) / denominator
      const sourceY = (transform[3] * x + transform[4] * y + transform[5]) / denominator
      const pixel = sampleBilinear(raw, sourceSize.width, sourceSize.height, sourceX, sourceY)
      const offset = (y * outputWidth + x) * 4
      output[offset] = pixel[0]
      output[offset + 1] = pixel[1]
      output[offset + 2] = pixel[2]
      output[offset + 3] = pixel[3]
    }
  }

  const buffer = await sharp(output, {
    raw: { width: outputWidth, height: outputHeight, channels: 4 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()

  return {
    buffer,
    width: outputWidth,
    height: outputHeight,
    method: 'perspective',
  }
}

async function cropBoundingBox(sourceBuffer, sourceSize, box) {
  const sharp = await getSharp()
  const pad = Math.round(Math.max(box.width, box.height) * 0.025)
  const left = clamp(box.x - pad, 0, sourceSize.width - 1)
  const top = clamp(box.y - pad, 0, sourceSize.height - 1)
  const right = clamp(box.x + box.width + pad, left + 1, sourceSize.width)
  const bottom = clamp(box.y + box.height + pad, top + 1, sourceSize.height)
  const width = right - left
  const height = bottom - top
  const buffer = await sharp(sourceBuffer)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()

  return {
    buffer,
    width,
    height,
    method: 'bounding_box',
  }
}

function cleanFileName(name = 'label') {
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 70) || 'label'
}

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('image')

    if (!file || typeof file === 'string') {
      throw new PublicError('Falta la imagen.', 400)
    }
    if (!MIME_OK.has(file.type)) {
      throw new PublicError('Solo se admiten JPG, PNG o WebP.', 400)
    }
    if (file.size > MAX_BYTES) {
      throw new PublicError('La imagen supera el limite de 18 MB.', 400)
    }

    const originalBuffer = Buffer.from(await file.arrayBuffer())
    const prepared = await prepareImages(originalBuffer)
    const rawDetection = await callGemini({
      imageBuffer: prepared.geminiBuffer,
      mimeType: prepared.geminiMime,
      width: prepared.geminiSize.width,
      height: prepared.geminiSize.height,
    })
    const detection = normalizeDetection(rawDetection, prepared.geminiSize, prepared.sourceSize)

    if (!detection.label_detected || !detection.bounding_box) {
      throw new PublicError(detection.notes || 'No se detecto una etiqueta frontal de vino.', 422)
    }

    const output = detection.corners.length === 4
      ? await perspectiveWarp(prepared.sourceBuffer, prepared.sourceSize, detection.corners)
      : await cropBoundingBox(prepared.sourceBuffer, prepared.sourceSize, detection.bounding_box)

    const fileName = `${cleanFileName(file.name)}-label-studio.png`
    const pngBase64 = output.buffer.toString('base64')

    return NextResponse.json({
      ok: true,
      image: {
        name: file.name,
        width: prepared.sourceSize.width,
        height: prepared.sourceSize.height,
        inputBytes: file.size,
      },
      detection,
      output: {
        fileName,
        method: output.method,
        width: output.width,
        height: output.height,
        bytes: output.buffer.byteLength,
        mimeType: 'image/png',
        dataUrl: `data:image/png;base64,${pngBase64}`,
      },
    })
  } catch (error) {
    if (error instanceof PublicError) {
      return jsonError(error.message, error.status)
    }

    console.error('[label-studio]', error)
    return jsonError('No se pudo procesar la etiqueta.', 500)
  }
}
