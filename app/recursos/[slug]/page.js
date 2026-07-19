import Link from 'next/link'
import { notFound } from 'next/navigation'
import PublicNav from '../../components/PublicNav'
import PublicFooter from '../../components/PublicFooter'
import { getRecursoBySlug, recursos } from '../content'

export function generateStaticParams() {
  return recursos.map((recurso) => ({ slug: recurso.slug }))
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const recurso = getRecursoBySlug(slug)
  if (!recurso) return {}

  return {
    title: recurso.title,
    description: recurso.description,
    keywords: recurso.keywords,
    alternates: {
      canonical: `/recursos/${recurso.slug}`,
    },
    openGraph: {
      title: `${recurso.title} · Cata con Juanjo`,
      description: recurso.description,
      url: `/recursos/${recurso.slug}`,
      type: 'article',
      publishedTime: recurso.published,
      modifiedTime: recurso.updated,
      images: [{ url: '/assets/og-carta-viva-2026.jpg', width: 1200, height: 630 }],
    },
  }
}

export default async function RecursoPage({ params }) {
  const { slug } = await params
  const recurso = getRecursoBySlug(slug)
  if (!recurso) notFound()

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: recurso.title,
    description: recurso.description,
    datePublished: recurso.published,
    dateModified: recurso.updated,
    inLanguage: 'es',
    mainEntityOfPage: `https://cataconjuanjo.com/recursos/${recurso.slug}`,
    author: {
      '@type': 'Person',
      name: 'Juanjo Garcia',
      jobTitle: 'Consultor de vino WSET Level 3',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Cata con Juanjo',
      url: 'https://cataconjuanjo.com',
    },
  }

  return (
    <main className="site-shell article-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <PublicNav active="recursos" eyebrow={recurso.category} />

      <article>
        <header className="article-hero">
          <Link href="/recursos" className="article-back">Recursos</Link>
          <p className="eyebrow">{recurso.category}</p>
          <h1>{recurso.title}</h1>
          <p className="lead">{recurso.intro}</p>
          <div className="article-meta">
            <span>{recurso.intent}</span>
            <span>{recurso.readingTime}</span>
            <span>Actualizado el 19 de julio de 2026</span>
          </div>
        </header>

        <div className="article-layout">
          <div className="article-content">
            {recurso.sections.map((section) => (
              <section key={section.heading}>
                <h2>{section.heading}</h2>
                <p>{section.body}</p>
              </section>
            ))}

            <section className="article-checklist">
              <h2>Checklist rápida</h2>
              <ul>
                {recurso.checklist.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>

            {recurso.sourceNotes?.length > 0 && (
              <section className="article-source-notes">
                <h2>Criterio de trabajo</h2>
                <p>Esta guía resume criterios prácticos que utilizo al revisar cartas, bodegas y rutinas de sala.</p>
                <ul>
                  {recurso.sourceNotes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              </section>
            )}

            <section className="article-final-cta">
              <h2>Aplícalo a tu restaurante</h2>
              <p>{recurso.cta}</p>
              <div className="hero-actions">
                <Link href="/#contacto" className="btn btn-primary">Solicitar diagnóstico</Link>
                <Link href="/cartavinos" className="btn btn-secondary">Ver Carta Viva</Link>
              </div>
            </section>
          </div>

          <aside className="article-sidebar">
            <strong>Temas</strong>
            <div>
              {recurso.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}
            </div>
          </aside>
        </div>
      </article>

      <PublicFooter />
    </main>
  )
}
