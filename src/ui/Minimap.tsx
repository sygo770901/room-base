import { useEffect, useRef } from 'react'
import { BOSS_ROOM, CELL, MAP_H, MAP_W, isFloorCell } from '../../shared/dungeon'
import {
  MINIMAP_DESKTOP_PX,
  MINIMAP_FOV_RAD,
  MINIMAP_FOV_REACH,
  MINIMAP_MOBILE_PX,
  headingUpRotation,
  worldToMinimap,
} from '../../shared/minimap'
import { isMobileDevice } from '../perf/device'
import { useAppStore } from '../store'

function drawFloor(ctx: CanvasRenderingContext2D, size: number, pad: number) {
  const origin = worldToMinimap(0, 0, size, pad)
  const cell = origin.s * CELL
  ctx.fillStyle = '#2c2824'
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      if (!isFloorCell(x, z)) continue
      const p = worldToMinimap(x * CELL, (z + 1) * CELL, size, pad)
      ctx.fillRect(p.x, p.y, cell + 0.4, cell + 0.4)
    }
  }
  const room = worldToMinimap(BOSS_ROOM.minX, BOSS_ROOM.maxZ, size, pad)
  const rw = origin.s * (BOSS_ROOM.maxX - BOSS_ROOM.minX)
  const rh = origin.s * (BOSS_ROOM.maxZ - BOSS_ROOM.minZ)
  ctx.fillStyle = 'rgba(232, 196, 124, 0.22)'
  ctx.fillRect(room.x, room.y, rw, rh)
  ctx.strokeStyle = '#e8c47c'
  ctx.lineWidth = 1.5
  ctx.strokeRect(room.x + 0.75, room.y + 0.75, rw - 1.5, rh - 1.5)
}

function drawCone(ctx: CanvasRenderingContext2D, x: number, y: number, start: number, end: number) {
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.arc(x, y, MINIMAP_FOV_REACH, start, end)
  ctx.closePath()
  ctx.fillStyle = 'rgba(255, 214, 120, 0.28)'
  ctx.fill()
  ctx.strokeStyle = '#fff6e8'
  ctx.lineWidth = 1.4
  ctx.stroke()
}

export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = isMobileDevice() ? MINIMAP_MOBILE_PX : MINIMAP_DESKTOP_PX

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = size * dpr
    canvas.height = size * dpr
    let raf = 0
    const pad = 5
    const tick = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)
      ctx.fillStyle = 'rgba(12, 10, 12, 0.92)'
      ctx.fillRect(0, 0, size, size)
      const state = useAppStore.getState()
      const headingUp = state.minimapHeadingUp
      const selfId = state.selfId
      const self = selfId ? state.players[selfId] : null
      const sx = self ? state.localX || self.position?.[0] || 0 : 0
      const sz = self ? state.localZ || self.position?.[2] || 0 : 0
      const selfMap = worldToMinimap(sx, sz, size, pad)
      const yaw = state.lookYaw
      const fov = MINIMAP_FOV_RAD

      ctx.save()
      if (headingUp) {
        ctx.translate(size / 2, size / 2)
        ctx.rotate(headingUpRotation(yaw))
        ctx.translate(-selfMap.x, -selfMap.y)
      }
      drawFloor(ctx, size, pad)
      for (const p of Object.values(state.players)) {
        if (!p.position || p.team === 'spectator') continue
        const isSelf = p.id === selfId
        const wx = isSelf ? sx : p.position[0]
        const wz = isSelf ? sz : p.position[2]
        const pos = worldToMinimap(wx, wz, size, pad)
        ctx.fillStyle = p.color || '#fff'
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, isSelf ? 4.2 : 3.1, 0, Math.PI * 2)
        ctx.fill()
      }
      if (headingUp) {
        ctx.restore()
        drawCone(ctx, size / 2, size / 2, -Math.PI / 2 - fov / 2, -Math.PI / 2 + fov / 2)
      } else {
        ctx.restore()
        drawCone(ctx, selfMap.x, selfMap.y, yaw - fov / 2, yaw + fov / 2)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [size])

  return <canvas ref={canvasRef} className="minimap" width={size} height={size} aria-label="小地圖" />
}
