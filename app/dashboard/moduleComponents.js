import styles from './module.module.css'

export function LoadingState() {
  return (
    <div className={styles.loading}>
      <p className={styles.loadingText}>Cargando</p>
    </div>
  )
}

export function ModuleShell({ restaurante, eyebrow, title, subtitle, actions, topActions, children, narrow = false }) {
  return (
    <main className={styles.shell}>
      <div className={styles.topbar}>
        <div className={styles.topLeft}>
          <a href="/dashboard" className={styles.backLink}>Inicio</a>
          <div className={styles.topDivider} />
          <div>
            <p className={styles.restaurantName}>{restaurante?.nombre || 'Restaurante'}</p>
            <p className={styles.restaurantMeta}>{restaurante?.ciudad || 'Panel de gestión'}</p>
          </div>
        </div>
        {topActions && <div className={styles.topActions}>{topActions}</div>}
      </div>

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
