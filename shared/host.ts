/** 房主只交給目前連線中的人。 */
export function pickLiveHost(
  playerIds: string[],
  awayIds: Iterable<string>,
  current: string | null | undefined,
  prefer?: string,
) {
  const away = new Set(awayIds)
  const live = playerIds.filter((id) => !away.has(id))
  if (current && live.includes(current)) return current
  if (prefer && live.includes(prefer)) return prefer
  return live[0] ?? null
}
