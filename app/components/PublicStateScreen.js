'use client'

export default function PublicStateScreen({
  styles,
  title,
  text,
  eyebrow = 'Carta Viva',
  loadingState = false,
  retryable = false,
  retryLabel = 'Reintentar',
  onRetry,
  secondaryHref = '',
  secondaryLabel = '',
  homeHref = '/cartavinos',
  homeLabel = 'Carta Viva',
}) {
  return (
    <main className={styles.stateScreen}>
      <section className={styles.stateCard} aria-live="polite">
        {loadingState && <span className={styles.stateSpinner} aria-hidden="true" />}
        <p className={styles.stateEyebrow}>{eyebrow}</p>
        <h1 className={styles.stateTitle}>{title}</h1>
        {text && <p className={styles.stateText}>{text}</p>}
        <div className={styles.stateActions}>
          {retryable && onRetry && (
            <button type="button" className={styles.stateButton} onClick={onRetry}>
              {retryLabel}
            </button>
          )}
          {secondaryHref && (
            <a className={styles.stateButton} href={secondaryHref}>
              {secondaryLabel}
            </a>
          )}
          <a className={styles.stateLink} href={homeHref}>
            {homeLabel}
          </a>
        </div>
      </section>
    </main>
  )
}
