import DashboardShell from './DashboardShell'

export const metadata = {
  title: {
    default: 'Carta Viva',
    template: '%s · Carta Viva',
  },
}

export default function DashboardLayout({ children }) {
  return <DashboardShell>{children}</DashboardShell>
}
