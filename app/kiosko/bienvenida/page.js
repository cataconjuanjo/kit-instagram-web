'use client'

import Link from 'next/link'
import styles from './bienvenida.module.css'

export default function BienvenidaKioskoPage() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon}>🎉</div>
        <h1 className={styles.titulo}>¡Pago completado!</h1>
        <p className={styles.desc}>
          Tu kiosko digital ya está en marcha. En unos minutos recibirás un email
          con el enlace para crear tu contraseña y acceder al panel.
        </p>
        <p className={styles.desc}>
          Si no ves el email en tu bandeja de entrada, revisa la carpeta de spam.
        </p>
        <div className={styles.pasos}>
          <div className={styles.paso}>
            <span className={styles.pasoNum}>1</span>
            <span>Abre el email de bienvenida</span>
          </div>
          <div className={styles.paso}>
            <span className={styles.pasoNum}>2</span>
            <span>Pulsa &quot;Crear contraseña&quot;</span>
          </div>
          <div className={styles.paso}>
            <span className={styles.pasoNum}>3</span>
            <span>Entra a tu panel y añade tus vinos</span>
          </div>
        </div>
        <Link href="/login" className={styles.btnLogin}>
          Ir al login
        </Link>
      </div>
    </main>
  )
}
