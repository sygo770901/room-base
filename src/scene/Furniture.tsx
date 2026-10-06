import { useEffect, useMemo, useRef } from 'react'
import { ThreeEvent, useLoader } from '@react-three/fiber'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import * as THREE from 'three'
import type { FurnitureItem } from '../../shared/furniture'
import { emitFurnitureMove } from '../net/socket'
import { useAppStore } from '../store'

const MODEL_BASE = '/assets/kenney/Models'
const KENNEY_UNIT = 0.18

type ModelProps = {
  name: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number
  color?: string
  draggable?: boolean
  furnitureId?: string
}

function paintObject(root: THREE.Object3D, color?: string) {
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.material = new THREE.MeshStandardMaterial({
        color: color || '#d9d2c5',
        roughness: 0.75,
        metalness: 0.05,
      })
    }
  })
}

function normalizeKenney(source: THREE.Object3D) {
  const root = source.clone(true)
  root.position.set(0, 0, 0)
  root.rotation.set(0, 0, 0)
  root.scale.set(1, 1, 1)
  root.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(root)
  const center = box.getCenter(new THREE.Vector3())
  root.position.set(-center.x, -box.min.y, -center.z)

  const group = new THREE.Group()
  group.add(root)
  group.scale.setScalar(KENNEY_UNIT)
  return group
}

export function KenneyModel({
  name,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  color,
  draggable = false,
  furnitureId,
}: ModelProps) {
  const obj = useLoader(OBJLoader, `${MODEL_BASE}/${name}.obj`)
  const model = useMemo(() => {
    const painted = obj.clone(true)
    paintObject(painted, color)
    return normalizeKenney(painted)
  }, [obj, color])

  const groupRef = useRef<THREE.Group>(null)
  const dragging = useRef(false)
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  const selfId = useAppStore((s) => s.selfId)
  const hostId = useAppStore((s) => s.hostId)
  const isHost = !!selfId && selfId === hostId
  const canDrag = draggable && isHost && !!furnitureId

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!canDrag) return
    e.stopPropagation()
    dragging.current = true
    ;(e.target as HTMLElement)?.setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current || !canDrag || !furnitureId) return
    e.stopPropagation()
    e.ray.intersectPlane(plane, hit)
    const next: [number, number, number] = [
      Math.max(-2.2, Math.min(2.2, hit.x)),
      position[1],
      Math.max(-1.9, Math.min(1.9, hit.z)),
    ]
    useAppStore.getState().patchFurniture(furnitureId, { position: next })
  }

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current || !furnitureId) return
    e.stopPropagation()
    dragging.current = false
    const item = useAppStore.getState().furniture.find((f) => f.id === furnitureId)
    if (item) void emitFurnitureMove(item.id, item.position, item.rotationY)
  }

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={rotation}
      scale={scale}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <primitive object={model} />
    </group>
  )
}

export function RoomShell() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[5.2, 4.4]} />
        <meshStandardMaterial color="#c9b59a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.35, -2.2]} castShadow receiveShadow>
        <boxGeometry args={[5.2, 2.7, 0.12]} />
        <meshStandardMaterial color="#ebe6df" />
      </mesh>
      <mesh position={[-2.6, 1.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.12, 2.7, 4.4]} />
        <meshStandardMaterial color="#e4dfd7" />
      </mesh>
      <mesh position={[2.6, 1.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.12, 2.7, 4.4]} />
        <meshStandardMaterial color="#e4dfd7" />
      </mesh>
      <mesh position={[0, 1.55, -2.13]}>
        <boxGeometry args={[2.2, 1.1, 0.04]} />
        <meshStandardMaterial color="#a8c8d8" transparent opacity={0.45} roughness={0.1} metalness={0.2} />
      </mesh>
    </group>
  )
}

export function BedroomFurniture() {
  const furniture = useAppStore((s) => s.furniture)
  return (
    <group>
      {furniture.map((item) => (
        <KenneyModel
          key={item.id}
          furnitureId={item.id}
          name={item.model}
          position={item.position}
          rotation={[0, item.rotationY, 0]}
          scale={item.scale}
          color={item.color}
          draggable={item.draggable}
        />
      ))}
    </group>
  )
}

export function SeatMarkers({
  seats,
  furniture,
  selfId,
  onSit,
}: {
  seats: Record<string, string | null>
  furniture: FurnitureItem[]
  selfId: string | null
  onSit: (seatId: 'bed' | 'chair' | 'desk') => void
}) {
  const markers = (['bed', 'chair', 'desk'] as const).map((id) => {
    const item = furniture.find((f) => f.seat === id)
    const pos: [number, number, number] = item
      ? [item.position[0], 0.05, id === 'bed' ? item.position[2] + 0.35 : item.position[2] - (id === 'desk' ? 0.35 : 0)]
      : [0, 0.05, 0]
    return { id, pos }
  })

  return (
    <group>
      {markers.map((m) => {
        const taken = seats[m.id] && seats[m.id] !== selfId
        return (
          <mesh
            key={m.id}
            position={m.pos}
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={(e) => {
              e.stopPropagation()
              if (!taken) onSit(m.id)
            }}
          >
            <circleGeometry args={[0.28, 24]} />
            <meshBasicMaterial color={taken ? '#e07a5f' : '#81b29a'} transparent opacity={0.55} depthWrite={false} />
          </mesh>
        )
      })}
    </group>
  )
}

export function StickyNotes3D({
  notes,
  selfId,
  isHost,
  onRemove,
}: {
  notes: import('../types').StickyNote[]
  selfId: string | null
  isHost: boolean
  onRemove: (id: string) => void
}) {
  return (
    <group>
      {notes.map((note) => (
        <group key={note.id} position={note.position}>
          <mesh
            onClick={(e) => {
              e.stopPropagation()
              if (note.authorId === selfId || isHost) onRemove(note.id)
            }}
          >
            <planeGeometry args={[0.45, 0.35]} />
            <meshStandardMaterial color={note.color} />
          </mesh>
          <NoteLabel text={`${note.author}: ${note.text}`} />
        </group>
      ))}
    </group>
  )
}

function NoteLabel({ text }: { text: string }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#111'
    ctx.font = 'bold 36px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    wrapText(ctx, text, 256, 128, 460, 42)
    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    return tex
  }, [text])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <sprite position={[0, 0, 0.02]} scale={[0.45, 0.22, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  )
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const chars = [...text]
  let line = ''
  const lines: string[] = []
  for (const ch of chars) {
    const test = line + ch
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = ch
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  const startY = y - ((lines.length - 1) * lineHeight) / 2
  lines.slice(0, 4).forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight))
}
