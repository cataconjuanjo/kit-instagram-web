'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'

export default function HerramientaAnalisis() {
  const [pdf, setPdf] = useState(null)
  const [pdfNombre, setPdfNombre] = useState('')
  const [analizando, setAnalizando] = useState(false)
  const [analisis, setAnalisis] = useState(null)
  const [email, setEmail] = useState('')
  const [restaurante, setRestaurante] = useState('')
  const [emailEnviado, setEmailEnviado] = useState(false)
  const [error, setError] = useState(false)
  const inputRef = useRef(null)

  function handlePdf(e) {
    const file = e.target.files[0]
    if (!file) return
    setPdfNombre(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]
      setPdf(base64)
    }
    reader.readAsDataURL(file)
  }

  async function analizar() {
    if (!pdf) return
    setAnalizando(true)
    setError(false)
    try {
      const res = await fetch('/api/analisis-carta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: pdf })
      })
      const data = await res.json()
      if (data.analisis) setAnalisis(data.analisis)
      else setError(true)
    } catch (e) {
      setError(true)
    }
    setAnalizando(false)
  }

  async function enviarEmail() {
    if (!email || !restaurante) return
    try {
      await fetch('/api/contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: restaurante,
          email,
          restaurante,
          mensaje: `Solicita informe completo desde la herramienta de análisis de carta.\n\nDiagnóstico generado:\n${analisis}`
        })
      })
      setEmailEnviado(true)
    } catch (e) {}
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', background: '#fff', minHeight: '100vh' }}>

      {/* Nav */}
      <nav style={{ padding: '0 40px', height: 64, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
        <Link href="/" style={{ fontSize: 16, fontWeight: 400, color: '#111', textDecoration: 'none', fontFamily: 'Georgia, serif' }}>Carta Viva</Link>
        <Link href="/cartavinos#modalidades" style={{ fontSize: 13, color: '#888', textDecoration: 'none' }}>Ver modalidades</Link>
      </nav>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '60px 40px' }}>

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: 'inline-block', background: '#f5f3ff', padding: '6px 16px', borderRadius: 20, marginBottom: 20 }}>
            <p style={{ fontSize: 12, color: '#534AB7', margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Herramienta gratuita</p>
          </div>
          <h1 style={{ fontSize: 40, fontWeight: 300, color: '#111', margin: '0 0 16px', fontFamily: 'Georgia, serif', lineHeight: 1.2 }}>Analiza tu carta de vinos</h1>
          <p style={{ fontSize: 16, color: '#888', margin: 0, lineHeight: 1.7 }}>Sube tu carta en PDF y recibe un diagnóstico profesional basado en tus vinos reales. Gratis, sin registro.</p>
        </div>

        {!analisis ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Zona subida PDF */}
            <div
              onClick={() => inputRef.current.click()}
              style={{
                border: `2px dashed ${pdf ? '#4A8C6F' : '#e8e8e8'}`,
                borderRadius: 12, padding: '48px 32px', textAlign: 'center',
                cursor: 'pointer', background: pdf ? '#f0faf5' : '#fafafa',
                transition: 'all 0.2s'
              }}
            >
              <input ref={inputRef} type="file" accept="application/pdf" onChange={handlePdf} style={{ display: 'none' }} />
              {pdf ? (
                <>
                  <p style={{ fontSize: 32, margin: '0 0 8px' }}>✓</p>
                  <p style={{ fontSize: 15, fontWeight: 500, color: '#4A8C6F', margin: '0 0 4px' }}>{pdfNombre}</p>
                  <p style={{ fontSize: 13, color: '#aaa', margin: 0 }}>Haz clic para cambiar el archivo</p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 40, margin: '0 0 12px' }}>📄</p>
                  <p style={{ fontSize: 15, fontWeight: 500, color: '#111', margin: '0 0 6px' }}>Sube tu carta de vinos en PDF</p>
                  <p style={{ fontSize: 13, color: '#bbb', margin: 0 }}>Haz clic aquí o arrastra el archivo</p>
                </>
              )}
            </div>

            {error && (
              <p style={{ fontSize: 13, color: '#c07070', textAlign: 'center', margin: 0 }}>
                Error al analizar el PDF. Asegúrate de que es un PDF legible e inténtalo de nuevo.
              </p>
            )}

            <button onClick={analizar} disabled={!pdf || analizando} style={{
              padding: '18px', background: !pdf || analizando ? '#ccc' : '#111',
              color: '#fff', border: 'none', borderRadius: 8, fontSize: 14,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              cursor: !pdf || analizando ? 'not-allowed' : 'pointer'
            }}>
              {analizando ? 'Analizando tu carta...' : 'Solicitar lectura inicial'}
            </button>

            <p style={{ fontSize: 12, color: '#bbb', textAlign: 'center', margin: 0 }}>
              Tu carta no se almacena ni se comparte. Solo se usa para generar el diagnóstico.
            </p>

          </div>
        ) : (
          <div>
            {/* Resultado */}
            <div style={{ background: '#fafafa', borderRadius: 12, border: '1px solid #f0f0f0', padding: '32px', marginBottom: 32 }}>
              <p style={{ fontSize: 11, color: '#bbb', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 20px' }}>Diagnóstico de tu carta · @cataconjuanjo</p>
              <p style={{ fontSize: 16, color: '#333', lineHeight: 1.9, margin: 0, whiteSpace: 'pre-wrap' }}>{analisis}</p>
            </div>

            {/* CTA email */}
            {!emailEnviado ? (
              <div style={{ background: '#111', borderRadius: 12, padding: '32px' }}>
                <p style={{ fontSize: 20, fontWeight: 300, color: '#fff', fontFamily: 'Georgia, serif', margin: '0 0 8px' }}>¿Quieres el informe completo?</p>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: '0 0 24px', lineHeight: 1.6 }}>
                  Te mando un análisis detallado con recomendaciones específicas, referencias sugeridas y propuestas de mejora. Sin coste, sin compromiso.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <input type="text" placeholder="Nombre del restaurante" value={restaurante}
                    onChange={e => setRestaurante(e.target.value)}
                    style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none' }}
                  />
                  <input type="email" placeholder="Tu email" value={email}
                    onChange={e => setEmail(e.target.value)}
                    style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none' }}
                  />
                  <button onClick={enviarEmail} disabled={!email || !restaurante} style={{
                    padding: '16px', background: !email || !restaurante ? 'rgba(255,255,255,0.2)' : '#fff',
                    color: '#111', border: 'none', borderRadius: 8, fontSize: 13,
                    letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer'
                  }}>
                    Recibir informe completo
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ background: '#111', borderRadius: 12, padding: '32px', textAlign: 'center' }}>
                <p style={{ fontSize: 20, color: '#fff', fontFamily: 'Georgia, serif', fontWeight: 300, margin: '0 0 8px' }}>Perfecto</p>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: '0 0 24px' }}>Te contacto en menos de 24 horas con el informe completo.</p>
                <Link href="/" style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>← Volver a Carta Viva</Link>
              </div>
            )}

            <button onClick={() => { setAnalisis(null); setPdf(null); setPdfNombre('') }} style={{
              width: '100%', marginTop: 16, background: 'none', border: '1px solid #f0f0f0',
              padding: '12px', fontSize: 12, color: '#bbb', cursor: 'pointer', borderRadius: 8
            }}>
              Analizar otra carta
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
