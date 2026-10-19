/** 結算獎項（先定，昱豪可改）。 */

export type AwardCard = {
  id: string
  title: string
  names: string[]
}

function tops(scores: Record<string, number>, names: Record<string, string>, min = 1): string[] {
  let best = min
  const ids: string[] = []
  for (const [id, n] of Object.entries(scores)) {
    if (n < min) continue
    if (n > best) {
      best = n
      ids.length = 0
      ids.push(id)
    } else if (n === best) ids.push(id)
  }
  return ids.map((id) => names[id] ?? id)
}

function card(id: string, title: string, names: string[]): AwardCard | null {
  if (!names.length) return null
  return { id, title, names }
}

export function computeAwards(input: {
  mode?: string
  names: Record<string, string>
  damage?: Record<string, number>
  taken?: Record<string, number>
  dispenserKills?: Record<string, number>
  rescues?: Record<string, number>
  catches?: Record<string, number>
  surviveSec?: Record<string, number>
  hideMs?: Record<string, number>
}): AwardCard[] {
  const names = input.names
  const out: AwardCard[] = []
  const add = (c: AwardCard | null) => {
    if (c) out.push(c)
  }
  if (input.mode === 'tag') {
    add(card('last', '最後倖存者', tops(input.surviveSec ?? {}, names, 1)))
    add(card('catcher', '抓人王', tops(input.catches ?? {}, names, 1)))
    add(card('hide', '藏鏡人', tops(input.hideMs ?? {}, names, 1)))
    return out
  }
  add(card('dps', '輸出王', tops(input.damage ?? {}, names, 1)))
  add(card('tank', '鐵壁', tops(input.taken ?? {}, names, 1)))
  add(card('disp', '飲水機剋星', tops(input.dispenserKills ?? {}, names, 1)))
  add(card('rescue', '救援英雄', tops(input.rescues ?? {}, names, 1)))
  return out
}
