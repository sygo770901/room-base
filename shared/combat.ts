export interface MonsterState {
  id: string
  name: string
  model: 'knight' | 'barbarian' | 'rogue' | 'mage'
  x: number
  z: number
  rotationY: number
  hp: number
  maxHp: number
  alive: boolean
}

export const PLAYER_MAX_HP = 100
export const ATTACK_RANGE = 2.5
export const ATTACK_DAMAGE = 34
export const ATTACK_COOLDOWN_MS = 460
export const ATTACK_COS = Math.cos(1.15)
export const MONSTER_TOUCH = 1.2
export const MONSTER_DAMAGE = 12
export const MONSTER_HIT_CD = 850
export const SIGHT = 14
export const CHASE_SPEED = 4.1
export const PATROL_SPEED = 2.15
export const RESPAWN_MS = 9000
export const IFRAME_MS = 2000
export const MONSTER_RADIUS = 0.42
/** 玩家半徑 0.26 加上怪物半徑。身體重疊時直接算打中，避免貼身距離變成 0 被丟掉。 */
export const ATTACK_EMBED = 0.26 + MONSTER_RADIUS
