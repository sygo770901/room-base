import { useAppStore } from '../store'

export function ReconnectBanner() {
  const connection = useAppStore((s) => s.connection)
  const joinError = useAppStore((s) => s.joinError)
  if (joinError) {
    return (
      <div className="reconnect-banner" role="status" aria-live="polite">
        {joinError}
      </div>
    )
  }
  if (connection === 'online') return null

  return (
    <div className="reconnect-banner" role="status" aria-live="polite">
      {connection === 'booting' ? '伺服器啟動中，請稍候…' : '重新連線中…'}
    </div>
  )
}
