import styles from './module.module.css'

export function LoadingState() {
  return (
    <div className={styles.loading}>
      <p className={styles.loadingText}>Cargando</p>
    </div>
  )
}

export function ModuleShell({ restaurante, eyebrow, title, subtitle, actions, children, narrow = false }) {
  return (
    <main className={styles.shell}>
      <div className={`${styles.wrap} ${narrow ? styles.narrow : ''}`}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <p className={styles.lead}>{subtitle}</p>}
          </div>
          {actions && <div className={styles.heroActions}>{actions}</div>}
        </section>
        {children}
      </div>
    </main>
  )
}
