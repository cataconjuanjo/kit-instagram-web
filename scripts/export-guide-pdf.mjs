import fs from 'node:fs'
import path from 'node:path'

const endpoint = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222'
const pageUrl = process.env.GUIDE_URL || 'http://127.0.0.1:3012/guia'
const outputDir = path.resolve(process.env.GUIDE_OUTPUT_DIR || 'output/pdf')
const outputFile = path.join(outputDir, 'carta-viva-guia-de-producto-2026.pdf')

fs.mkdirSync(outputDir, { recursive: true })
if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile)

const targets = await fetch(`${endpoint}/json/list`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.url.includes('/guia'))
  || targets.find(item => item.type === 'page')
if (!target) throw new Error('No se encontró una pestaña de Chrome para exportar la guía.')

const socket = new WebSocket(target.webSocketDebuggerUrl)
let nextId = 0
const pending = new Map()

socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (!message.id || !pending.has(message.id)) return
  const { resolve, reject } = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) reject(new Error(message.error.message))
  else resolve(message.result)
})

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

function command(method, params = {}) {
  const id = ++nextId
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

await command('Page.enable')
await command('Runtime.enable')
await command('Browser.setDownloadBehavior', {
  behavior: 'allow',
  downloadPath: outputDir,
  eventsEnabled: true,
})
await command('Page.navigate', { url: pageUrl })
await new Promise(resolve => setTimeout(resolve, 3500))
const pageState = await command('Runtime.evaluate', {
  expression: `({ url: location.href, title: document.title, ready: document.readyState, html: document.body?.innerText?.slice(0, 80) })`,
  returnByValue: true,
})
console.log(`Página: ${JSON.stringify(pageState?.result?.value || {})}`)
const clickResult = await command('Runtime.evaluate', {
  expression: `(() => {
    const button = document.querySelector('.download')
    if (!button) return 'button-missing'
    button.click()
    return button.textContent
  })()`,
  awaitPromise: false,
})
console.log(`Exportación iniciada: ${clickResult?.result?.value || 'sin estado'}`)
if (clickResult?.result?.value === 'button-missing') {
  socket.close()
  throw new Error('La página de la guía no mostró el botón de exportación.')
}

const deadline = Date.now() + 300000
while (!fs.existsSync(outputFile) && Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 500))
}

socket.close()

if (!fs.existsSync(outputFile)) {
  throw new Error('La descarga del PDF no terminó dentro del tiempo esperado.')
}

console.log(outputFile)
