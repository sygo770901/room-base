import { useEffect, useMemo, useRef } from 'react'
import { ThreeEvent, useLoader, useThree } from '@react-three/fiber'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import * as THREE from 'three'
import { INNER_WALLS, ROOM_BOUNDS, type FurnitureItem } from '../../shared/furniture'
import { emitAddNote, emitFurnitureMove } from '../net/socket'
import { resolveFurniturePlace } from '../physics/collision'
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

function enableShadows(root: THREE.Object3D) {
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh
      mesh.castShadow = true
      mesh.receiveShadow = true
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
  const materials = useLoader(MTLLoader, `${MODEL_BASE}/${name}.mtl`)
  const obj = useLoader(OBJLoader, `${MODEL_BASE}/${name}.obj`, (loader) => {
    materials.preload()
    loader.setMaterials(materials)
  })
  const model = useMemo(() => {
    const cloned = obj.clone(true)
    enableShadows(cloned)
    return normalizeKenney(cloned)
  }, [obj])

  const dragging = useRef(false)
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])
  const { camera, raycaster, gl, controls } = useThree()
  const canDrag = draggable && !!furnitureId

  const placeAt = (clientX: number, clientY: number) => {
    if (!furnitureId) return
    const rect = gl.domElement.getBoundingClientRect()
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    if (!raycaster.ray.intersectPlane(plane, hit)) return
    const list = useAppStore.getState().furniture
    const item = list.find((f) => f.id === furnitureId)
    if (!item) return
    let placed = resolveFurniturePlace(list, item, hit.x, hit.z)
    if (!placed.ok) placed = resolveFurniturePlace(list, item, hit.x, item.position[2])
    if (!placed.ok) placed = resolveFurniturePlace(list, item, item.position[0], hit.z)
    useAppStore.getState().patchFurniture(furnitureId, {
      position: [placed.x, item.position[1], placed.z],
    })
  }

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!canDrag || e.button !== 0 || !furnitureId) return
    e.stopPropagation()
    dragging.current = true
    const orbit = controls as { enabled?: boolean } | null
    if (orbit) orbit.enabled = false

    const move = (ev: PointerEvent) => placeAt(ev.clientX, ev.clientY)
    const up = () => {
      dragging.current = false
      if (orbit) orbit.enabled = true
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const item = useAppStore.getState().furniture.find((f) => f.id === furnitureId)
      if (item) void emitFurnitureMove(item.id, item.position, item.rotationY)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!canDrag || !furnitureId) return
    e.stopPropagation()
    const item = useAppStore.getState().furniture.find((f) => f.id === furnitureId)
    if (!item) return
    const rotationY = item.rotationY + Math.PI / 2
    useAppStore.getState().patchFurniture(furnitureId, { rotationY })
    void emitFurnitureMove(item.id, item.position, rotationY)
  }

  return (
    <group
      position={position}
      rotation={rotation}
      scale={scale}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      <primitive object={model} />
    </group>
  )
}

function WallSegment({
  position,
  size,
  color = '#ebe6df',
}: {
  position: [number, number, number]
  size: [number, number, number]
  color?: string
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

function useWoodFloor() {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#c9a36a'
    ctx.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#d7b57c' : '#c49a62'
      ctx.fillRect(0, i * 64, 512, 60)
      ctx.strokeStyle = 'rgba(90, 55, 25, 0.28)'
      ctx.strokeRect(0.5, i * 64 + 0.5, 511, 63)
      for (let g = 0; g < 18; g++) {
        ctx.strokeStyle = `rgba(120, 75, 30, ${0.04 + (g % 3) * 0.03})`
        ctx.beginPath()
        ctx.moveTo(0, i * 64 + 8 + g * 3)
        ctx.lineTo(512, i * 64 + 6 + g * 3)
        ctx.stroke()
      }
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(8, 6)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])
}

export function RoomShell() {
  const wood = useWoodFloor()
  const w = ROOM_BOUNDS.maxX - ROOM_BOUNDS.minX
  const d = ROOM_BOUNDS.maxZ - ROOM_BOUNDS.minZ
  const cx = (ROOM_BOUNDS.minX + ROOM_BOUNDS.maxX) / 2
  const cz = (ROOM_BOUNDS.minZ + ROOM_BOUNDS.maxZ) / 2
  const wallH = 2.7

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]} receiveShadow>
        <planeGeometry args={[w + 0.4, d + 0.4]} />
        <meshStandardMaterial map={wood} roughness={0.86} metalness={0.02} />
      </mesh>

      <WallSegment position={[cx, wallH / 2, ROOM_BOUNDS.minZ - 0.08]} size={[w + 0.3, wallH, 0.16]} color="#f4efe6" />
      <WallSegment position={[ROOM_BOUNDS.minX - 0.08, wallH / 2, cz]} size={[0.16, wallH, d + 0.3]} color="#efe8dc" />
      <WallSegment position={[ROOM_BOUNDS.maxX + 0.08, wallH / 2, cz]} size={[0.16, wallH, d + 0.3]} color="#efe8dc" />

      {INNER_WALLS.map((wall, i) => (
        <WallSegment
          key={i}
          position={[wall.cx, wallH / 2, wall.cz]}
          size={[Math.max(wall.hx * 2, 0.16), wallH, Math.max(wall.hz * 2, 0.16)]}
          color="#f7f3ec"
        />
      ))}

      {/* 踢腳板 */}
      <mesh position={[cx, 0.06, ROOM_BOUNDS.minZ + 0.02]}>
        <boxGeometry args={[w, 0.12, 0.04]} />
        <meshStandardMaterial color="#8d7356" />
      </mesh>

      <mesh position={[-5.2, 1.6, ROOM_BOUNDS.minZ + 0.02]}>
        <boxGeometry args={[2.2, 1.15, 0.05]} />
        <meshStandardMaterial color="#9ec4d6" transparent opacity={0.55} roughness={0.05} />
      </mesh>
      <mesh position={[0.1, 1.6, ROOM_BOUNDS.minZ + 0.02]}>
        <boxGeometry args={[1.8, 1.15, 0.05]} />
        <meshStandardMaterial color="#9ec4d6" transparent opacity={0.55} roughness={0.05} />
      </mesh>
      <mesh position={[5.2, 1.6, ROOM_BOUNDS.minZ + 0.02]}>
        <boxGeometry args={[1.8, 1.15, 0.05]} />
        <meshStandardMaterial color="#9ec4d6" transparent opacity={0.55} roughness={0.05} />
      </mesh>

      <FloorLabel text="主臥" position={[-5.2, 0.03, -3.2]} />
      <FloorLabel text="次臥" position={[0.1, 0.03, -3.2]} />
      <FloorLabel text="客房" position={[5.2, 0.03, -3.2]} />
      <FloorLabel text="客廳" position={[-4.2, 0.03, 0.2]} />
      <FloorLabel text="餐廳" position={[4.2, 0.03, 0.2]} />
    </group>
  )
}

function FloorLabel({ text, position }: { text: string; position: [number, number, number] }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.font = 'bold 48px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 128, 64)
    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    return tex
  }, [text])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1.6, 0.8]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
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
  onSit: (seatId: string) => void
}) {
  const markers = furniture
    .filter((f) => f.seat)
    .map((item) => ({
      id: item.seat!,
      pos: [
        item.position[0],
        0.05,
        item.seat!.startsWith('bed') ? item.position[2] + 0.4 : item.position[2],
      ] as [number, number, number],
    }))

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

/** 點地板貼便籤 */
export function NotePlacementPlane() {
  const pending = useAppStore((s) => s.pendingNote)
  const setPendingNote = useAppStore((s) => s.setPendingNote)
  const setToast = useAppStore((s) => s.setToast)
  const { raycaster, camera, gl } = useThree()
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const hit = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    if (!pending) return
    const onClick = (ev: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
      const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera)
      if (!raycaster.ray.intersectPlane(plane, hit)) return
      const pos: [number, number, number] = [
        Math.max(ROOM_BOUNDS.minX, Math.min(ROOM_BOUNDS.maxX, hit.x)),
        0.9 + pending.fontSize,
        Math.max(ROOM_BOUNDS.minZ, Math.min(ROOM_BOUNDS.maxZ, hit.z)),
      ]
      void emitAddNote(pending.text, pos, pending.fontSize).then(() => {
        setPendingNote(null)
        setToast('便籤已貼上')
        setTimeout(() => setToast(null), 1600)
      })
    }
    window.addEventListener('pointerdown', onClick)
    return () => window.removeEventListener('pointerdown', onClick)
  }, [pending, camera, gl, plane, hit, raycaster, setPendingNote, setToast])

  if (!pending) return null
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <planeGeometry args={[20, 16]} />
      <meshBasicMaterial color="#81b29a" transparent opacity={0.08} depthWrite={false} />
    </mesh>
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
            <planeGeometry args={[note.fontSize * 4.2, note.fontSize * 3.2]} />
            <meshStandardMaterial color={note.color} />
          </mesh>
          <NoteLabel text={`${note.author}: ${note.text}`} fontSize={note.fontSize} />
        </group>
      ))}
    </group>
  )
}

function NoteLabel({ text, fontSize }: { text: string; fontSize: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#111'
    const px = Math.max(22, Math.min(64, fontSize * 280))
    ctx.font = `bold ${px}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    wrapText(ctx, text, 256, 128, 460, px * 1.15)
    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    return tex
  }, [text, fontSize])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <sprite position={[0, 0, 0.02]} scale={[fontSize * 4.2, fontSize * 2.1, 1]}>
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
