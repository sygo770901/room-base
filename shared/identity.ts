/** 公開 id 與私密識別碼規則（先定，昱豪可改）。 */
export const SECRET_LEN_MIN = 8
export const SECRET_LEN_MAX = 64

export function normalizeToken(raw: unknown, fallback: string) {
  if (typeof raw !== 'string') return fallback
  const id = raw.trim().slice(0, SECRET_LEN_MAX)
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return fallback
  return id
}

export function resolveJoinPlayerId(opts: {
  claimedId: string
  secret: string
  storedSecret?: string
  existing: boolean
  fallbackId: string
}) {
  if (opts.existing && opts.storedSecret && opts.storedSecret !== opts.secret) {
    return { playerId: opts.fallbackId, impersonation: true as const }
  }
  return { playerId: opts.claimedId, impersonation: false as const }
}
