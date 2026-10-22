import * as THREE from 'three'
import type { Place } from '../../shared/dungeon'

const origin = new THREE.Vector3()
const dir = new THREE.Vector3()
const raycaster = new THREE.Raycaster()

/** 跟 InstanceChunk 同一套：零件矩陣再乘上擺放。測試和畫面共用這一步。 */
export function writeInstanceMatrices(mesh: THREE.InstancedMesh, places: Place[], partMatrix: THREE.Matrix4) {
  const dummy = new THREE.Object3D()
  const matrix = new THREE.Matrix4()
  for (let i = 0; i < places.length; i++) {
    const place = places[i]
    dummy.position.set(place.x, place.y, place.z)
    dummy.rotation.set(0, place.rotY, 0)
    dummy.scale.setScalar(place.scale ?? 1)
    dummy.updateMatrix()
    matrix.multiplyMatrices(dummy.matrix, partMatrix)
    mesh.setMatrixAt(i, matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
  mesh.frustumCulled = true
}

/**
 * 射向地城模型。打中代表這段穿進牆、樓梯或樓板。
 * near / far 跟畫面 CameraRig 用的是同一組，測試不能再自寫一套射線。
 */
export function meshSegmentBlocked(
  root: THREE.Object3D | null,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
) {
  if (!root) return false
  const dx = x1 - x0
  const dy = y1 - y0
  const dz = z1 - z0
  const dist = Math.hypot(dx, dy, dz)
  if (dist < 0.05) return false
  origin.set(x0, y0, z0)
  dir.set(dx / dist, dy / dist, dz / dist)
  raycaster.set(origin, dir)
  raycaster.near = 0.12
  raycaster.far = dist - 0.02
  const hits = raycaster.intersectObject(root, true)
  // 骷髏、木桶、箱子會擋在出生點和鏡頭之間，把距離縮到只剩身體。牆和地板仍要擋。
  return hits.some((hit) => !decorCameraMesh(hit.object))
}

const DECOR_CAMERA = /skeleton|barrel|box_|coin_|banner|torch|crate|chest|spike|detail|table/

function decorCameraMesh(obj: THREE.Object3D) {
  let cur: THREE.Object3D | null = obj
  while (cur) {
    const model = typeof cur.userData?.model === 'string' ? cur.userData.model : ''
    if (model && DECOR_CAMERA.test(model)) return true
    cur = cur.parent
  }
  return false
}
