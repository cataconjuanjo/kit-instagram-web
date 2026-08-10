import PrivateSessionTimeout from '../components/PrivateSessionTimeout'

export default function KioskoAdminLayout({ children }) {
  return (
    <>
      <PrivateSessionTimeout timeoutMinutes={60} />
      {children}
    </>
  )
}
