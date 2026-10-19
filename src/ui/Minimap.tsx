import { useEffect, useRef } from 'react'
import { BOSS_ROOM, CELL, MAP_H, MAP_W, MAP_WORLD, isFloorCell } from '../../shared/dungeon'
import { MINIMAP_DESKTOP_PX, MINIMAP_FOV_RAD, MINIMAP_FOV_REACH, MINIMAP_MOBILE_PX } from '../../shared/minimap'
import { isMobileDevice } from '../perf/device'
import { useAppStore } from '../store'

function worldToMap(x: number, z: number, size: number, pad: number) {
  const sx = (size - pad * 2) / (MAP_WORLD.maxX - MAP_WORLD.minX)
  const sz = (size - pad * 2) / (MAP_WORLD.maxZ - MAP_WORLD.minZ)
  const s = Math.min(sx, sz)
  return {
    x: pad + (x - MAP_WORLD.minX) * s,
    y: pad + (z - MAP_WORLD.minZ) * s,
    s,
  }
}

function drawFloor(ctx: CanvasRenderingContext2D, size: number, pad: number) {
  const origin = worldToMap(0, 0, size, pad)
  const cell = origin.s * CELL
  ctx.fillStyle = '#2c2824'
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      if (!isFloorCell(x, z)) continue
      const p = worldToMap(x * CELL, z * CELL, size, pad)
      ctx.fillRect(p.x, p.y, cell + 0.4, cell + 0.4)
    }
  }
  const room = worldToMap(BOSS_ROOM.minX, BOSS_ROOM.minZ, size, pad)
  const rw = origin.s * (BOSS_ROOM.maxX - BOSS_ROOM.minX)
  const rh = origin.s * (BOSS_ROOM.maxZ - BOSS_ROOM.minZ)
  ctx.fillStyle = 'rgba(232, 196, 124, 0.22)'
  ctx.fillRect(room.x, room.y, rw, rh)
  ctx.strokeStyle = '#e8c47c'
  ctx.lineWidth = 1.5
  ctx.strokeRect(room.x + 0.75, room.y + 0.75, rw - 1.5, rh - 1.5)
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
      drawFloor(ctx, size, pad)
      const state = useAppStore.getState()
      const selfId = state.selfId
      for (const p of Object.values(state.players)) {
        if (!p.position || p.team === 'spectator') continue
        const self = p.id === selfId
        const wx = self ? state.localX : p.position[0]
        const wz = self ? state.localZ : p.position[2]
        const pos = worldToMap(wx, wz, size, pad)
        ctx.fillStyle = p.color || '#fff'
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, self ? 4.2 : 3.1, 0, Math.PI * 2)
        ctx.fill()
        if (self) {
          const yaw = state.lookYaw
          const fov = MINIMAP_FOV_RAD
          const reach = MINIMAP_FOV_REACH
          ctx.beginPath()
          ctx.moveTo(pos.x, pos.y)
          ctx.arc(pos.x, pos.y, reach, yaw - fov / 2 + Math.PI / 2, yaw + fov / 2 + Math.PI / 2)
          ctx.closePath()
          ctx.fillStyle = 'rgba(255, 214, 120, 0.28)'
          ctx.fill()
          ctx.strokeStyle = '#fff6e8'
          ctx.lineWidth = 1.4
          ctx.stroke()
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [size])

  return <canvas ref={canvasRef} className="minimap" width={size} height={size} aria-label="小地圖" />
}
