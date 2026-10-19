export type MonsterKind = 'grunt' | 'duck-king' | 'dispenser'

export type MonsterModel = 'knight' | 'barbarian' | 'rogue' | 'mage' | 'ranger'

export interface MonsterState {
  id: string
  name: string
  model: MonsterModel
  kind: MonsterKind
  x: number
  z: number
  rotationY: number
  hp: number
  maxHp: number
  alive: boolean
  /** 飲水機正在衝撞玩家 */
  pouncing?: boolean
  phase?: 1 | 2
  /** 法師蓄力發光 */
  casting?: boolean
}

export interface ProjectileState {
  id: string
  x: number
  z: number
  vx: number
  vz: number
  until: number
}

export interface TelegraphCue {
  id: string
  x: number
  z: number
  r: number
  ms: number
}

export interface DamageRank {
  id: string
  name: string
  dmg: number
  surviveSec?: number
  catches?: number
  team?: 'ghost' | 'hider' | 'spectator'
}

export interface MatchOver {
  teamWin: boolean
  reason?: 'timeout' | 'cleared'
  ranking: DamageRank[]
  winner?: 'hiders' | 'ghosts'
}

export interface DuckSpeech {
  text: string
  until: number
  shout?: boolean
}

export const PLAYER_MAX_HP = 100
export const ROOM_MAX_PLAYERS = 10
export const MATCH_TIME_LIMIT_SEC = 300
export const BOSS_COUNTDOWN_MS = 5000
export function duckKingHp(n: number) {
  const count = Math.max(1, n)
  return 3300 + 4500 * (count - 1)
}
export function dispenserHp(n: number) {
  return 160 * Math.max(1, n)
}
export const ATTACK_RANGE = 2.5
export const ATTACK_DAMAGE = 34
export const ATTACK_COOLDOWN_MS = 460
export const ATTACK_COS = Math.cos(1.15)
export const MONSTER_TOUCH = 1.2
export const MONSTER_DAMAGE = 12
export const MONSTER_HIT_CD = 850
/** 被打中後短暫無敵；復活仍用 IFRAME_MS（先定，昱豪可改） */
export const PLAYER_HURT_IFRAME_MS = 600
export const KNIGHT_SPEED = 4.1
export const KNIGHT_DAMAGE = 12
export const KNIGHT_HP = 120
export const ROGUE_SPEED = 5.6
export const ROGUE_DAMAGE = 8
export const ROGUE_RETREAT_MS = 1500
export const ROGUE_HP = 80
export const BARB_SPEED = 3.2
export const BARB_DAMAGE = 30
export const BARB_WINDUP_MS = 900
export const BARB_HP = 160
export const BARB_TELEGRAPH_R = 1.8
export const MAGE_KEEP_MIN = 6
export const MAGE_KEEP_MAX = 8
export const MAGE_CAST_CD_MS = 2500
export const MAGE_WINDUP_MS = 600
export const MAGE_ORB_SPEED = 9
export const MAGE_ORB_DAMAGE = 10
export const MAGE_ORB_RADIUS = 0.4
export const MAGE_ORB_TTL_MS = 4000
export const MAGE_HP = 90
export const SIGHT = 14
export const BOSS_SIGHT = 16
export const CHASE_SPEED = 4.1
export const PATROL_SPEED = 2.15
export const FLEE_SPEED = 5.6
export const FLEE_SPEED_RAGE = 6.0
export const SLAM_RANGE = 8
export const SLAM_RADIUS = 3
export const SLAM_WINDUP_MS = 1000
export const SLAM_DAMAGE = 25
export const SLAM_CD_MS = 6000
export const SLAM_RADIUS_RAGE = 3.5
export const SLAM_WINDUP_RAGE_MS = 800
export const SLAM_CD_RAGE_MS = 4000
export const PET_FOLLOW_SPEED = 3.7
export const PET_POUNCE_SPEED = 6.4
export const PET_DAMAGE = 18
export const PET_SKILL_CD_MS = 7800
export const PET_SKILL_CD_RAGE_MS = 5000
export const PET_POUNCE_MS = 4200
/** 倒數結束後每 30 秒多召喚一台，場上最多 10 台（先定，昱豪可改） */
export const DUCK_SUMMON_INTERVAL_MS = 30000
export const DUCK_MAX_DISPENSERS = 10
export const DUCK_SPEECH_RANGE = 8
export const DUCK_SPEECH_HOLD_MS = 3000
export const DUCK_SPEECH_GAP_MS = 2500
export const DUCK_SUMMON_SHOUT = '出來吧~阿克縫~讓世界看見台灣!!'
export const DUCK_CHAT_LINES = [
  '你們這些自以為是的顧客，一點都不懂的審美。',
  '我的飲水機才不是除濕機，這可是空氣取水呢。',
  '你知道我是誰嗎？我可是工業教父 洩聾鴨，曾獲得無數紅點設計大獎。',
] as const
export const RAGE_PAUSE_MS = 1000
export const RESPAWN_MS = 9000
export const IFRAME_MS = 2000
export const MONSTER_RADIUS = 0.42
export const DUCK_KING_RADIUS = 0.32
export const DISPENSER_RADIUS = 0.46
/** 玩家半徑 0.26 加上怪物半徑。身體重疊時直接算打中，避免貼身距離變成 0 被丟掉。 */
export const ATTACK_EMBED = 0.26 + MONSTER_RADIUS

export function monsterRadius(kind: MonsterKind | undefined) {
  if (kind === 'duck-king') return DUCK_KING_RADIUS
  if (kind === 'dispenser') return DISPENSER_RADIUS
  return MONSTER_RADIUS
}
