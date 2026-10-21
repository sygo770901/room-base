/** 目前這名玩家該播的步態。useFrame 直接讀，避免模型沒跟著父層重繪時還停在 Idle。 */
export const playerMotion = new Map<string, { moving: boolean; running: boolean }>()
