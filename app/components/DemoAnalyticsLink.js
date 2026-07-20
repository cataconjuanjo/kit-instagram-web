'use client'

import Link from 'next/link'
import { trackDemoEvent } from '../lib/demoAnalyticsClient'

export default function DemoAnalyticsLink({
  href,
  children,
  className,
  event = 'demo_landing_click',
  demo = 'taberna-del-puerto',
  role = 'landing',
  source = 'landing',
  target,
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => trackDemoEvent(event, { demo, role, source, target: target || href })}
    >
      {children}
    </Link>
  )
}
