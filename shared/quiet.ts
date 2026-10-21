/** 正式環境不接受 quiet。開發用 ?shot=1 關怪，上線之後這面旗標沒有作用。 */
export function serverAcceptsQuiet(flag: boolean | undefined, nodeEnv = process.env.NODE_ENV) {
  return Boolean(flag) && nodeEnv !== 'production'
}

/** 正式打包不送 quiet。prod 為 true 時就算網址帶 shot 也當沒有。 */
export function clientSendsQuiet(prod: boolean, search: string) {
  if (prod) return false
  const raw = search.startsWith('?') ? search : `?${search}`
  return new URLSearchParams(raw).has('shot')
}
