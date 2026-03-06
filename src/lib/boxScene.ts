import * as THREE from 'three'
import RAPIER, { init as initRapier } from '@dimforge/rapier3d-compat'
import type { CutoutItem } from '@/types/section'

export interface BoxSceneHandle {
  renderer: THREE.WebGLRenderer
  camera: THREE.PerspectiveCamera
  scene: THREE.Scene
  boxGroup: THREE.Group
  setCameraOffset: (dx: number, dy: number) => void
  resize: (w: number, h: number) => void
  setCursorPosition: (screenX: number, screenY: number) => void
  pickCutoutAt: (screenX: number, screenY: number) => number | null
  startDragCutout: (index: number) => void
  moveDragCutout: (screenX: number, screenY: number) => void
  endDragCutout: () => void
  stepPhysics: () => void
  render: () => void
  destroy: () => void
}

// Match app background #FFF8F2 (beige/white). Slightly darker tints for box so it's visible.
const PAGE_BG = 0xfff8f2
const BOTTOM_COLOR = 0xeee8e0
const WALL_COLOR = 0xe8e2da
const WALL_SIDE_TINT = 0xe0dad2

const BOX_DEPTH = 1.2
const BOX_SCALE = 0.64
const CUTOUT_THICKNESS = 0.004
const GRAVITY = -12
const HOVER_SCALE = 1.06
const HOVER_EMISSIVE = 0x443322
const DRAG_HEIGHT = 0.02

/**
 * Create box scene with optional cutouts (textured planes inside box) and Rapier physics.
 * Async: compat package requires init() before using the API.
 */
export async function createBoxScene(
  container: HTMLElement,
  width: number,
  height: number,
  cutouts: CutoutItem[] = [],
): Promise<BoxSceneHandle> {
  await initRapier()
  const aspect = width / height
  const boxW = 2 * aspect
  const boxH = 2
  const depth = BOX_DEPTH

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(width, height)
  renderer.setClearColor(PAGE_BG)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.appendChild(renderer.domElement)

  const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 50)
  const baseCamY = depth + 1.8
  camera.position.set(0, baseCamY, 0)
  camera.lookAt(0, 0, 0)

  const scene = new THREE.Scene()
  const boxGroup = new THREE.Group()
  scene.add(boxGroup)

  const interiorGroup = new THREE.Group()
  interiorGroup.matrixAutoUpdate = false
  boxGroup.add(interiorGroup)

  // Bottom plane
  const bottomGeo = new THREE.PlaneGeometry(boxW, boxH)
  const bottomMat = new THREE.MeshLambertMaterial({ color: BOTTOM_COLOR, side: THREE.FrontSide })
  const bottom = new THREE.Mesh(bottomGeo, bottomMat)
  bottom.rotation.x = -Math.PI / 2
  bottom.position.y = 0
  bottom.receiveShadow = true
  interiorGroup.add(bottom)

  // Walls
  const backGeo = new THREE.PlaneGeometry(boxW, depth)
  const backMat = new THREE.MeshLambertMaterial({ color: WALL_COLOR, side: THREE.FrontSide })
  const back = new THREE.Mesh(backGeo, backMat)
  back.position.set(0, depth / 2, -boxH / 2)
  interiorGroup.add(back)

  const frontGeo = new THREE.PlaneGeometry(boxW, depth)
  const frontMat = new THREE.MeshLambertMaterial({ color: WALL_COLOR, side: THREE.BackSide })
  const front = new THREE.Mesh(frontGeo, frontMat)
  front.position.set(0, depth / 2, boxH / 2)
  interiorGroup.add(front)

  const leftGeo = new THREE.PlaneGeometry(boxH, depth)
  const leftMat = new THREE.MeshLambertMaterial({ color: WALL_SIDE_TINT, side: THREE.FrontSide })
  const leftWall = new THREE.Mesh(leftGeo, leftMat)
  leftWall.rotation.y = Math.PI / 2
  leftWall.position.set(-boxW / 2, depth / 2, 0)
  interiorGroup.add(leftWall)

  const rightGeo = new THREE.PlaneGeometry(boxH, depth)
  const rightMat = new THREE.MeshLambertMaterial({ color: WALL_SIDE_TINT, side: THREE.BackSide })
  const rightWall = new THREE.Mesh(rightGeo, rightMat)
  rightWall.rotation.y = Math.PI / 2
  rightWall.position.set(boxW / 2, depth / 2, 0)
  interiorGroup.add(rightWall)

  boxGroup.scale.setScalar(BOX_SCALE)

  // Lights: ambient + directional with shadow
  const ambient = new THREE.AmbientLight(0xffffff, 0.7)
  scene.add(ambient)
  const dir = new THREE.DirectionalLight(0xffffff, 0.5)
  dir.position.set(0.5, 3, 0.8)
  dir.castShadow = true
  dir.shadow.mapSize.set(1024, 1024)
  dir.shadow.camera.near = 0.1
  dir.shadow.camera.far = 10
  dir.shadow.camera.left = -2
  dir.shadow.camera.right = 2
  dir.shadow.camera.top = 2
  dir.shadow.camera.bottom = -2
  dir.shadow.bias = -1e-4
  dir.shadow.normalBias = 0.02
  scene.add(dir)

  const textureLoader = new THREE.TextureLoader()
  const cutoutMeshes: THREE.Mesh[] = []
  const cutoutBodies: RAPIER.RigidBody[] = []
  const cutoutHalfSizes: { w: number; h: number }[] = []
  const flatQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)

  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const floorIntersect = new THREE.Vector3()
  let lastCursor: { x: number; y: number } | null = null
  let hoveredCutoutIndex: number | null = null
  let dragCutoutIndex: number | null = null
  const dragWorldPos = new THREE.Vector3()

  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 })
  world.timestep = 1 / 60
  const scaledBoxW = boxW * BOX_SCALE
  const scaledBoxH = boxH * BOX_SCALE
  const groundBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.05, 0)
  const groundBody = world.createRigidBody(groundBodyDesc)
  const groundColliderDesc = RAPIER.ColliderDesc.cuboid(scaledBoxW / 2, 0.05, scaledBoxH / 2)
  world.createCollider(groundColliderDesc, groundBody)

  for (const item of cutouts) {
    const w = item.width
    const h = item.height
    const pos = item.position ?? { x: 0, y: 0.02, z: 0 }
    const rotY = item.rotationY ?? 0
    const yPos = pos.y + CUTOUT_THICKNESS / 2

    const geo = new THREE.PlaneGeometry(w, h)
    const mat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.05,
      depthWrite: true,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.rotation.y = rotY
    mesh.position.set(pos.x, yPos, pos.z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    ;(mesh.userData as Record<string, number>).cutoutIndex = cutoutMeshes.length
    interiorGroup.add(mesh)
    cutoutMeshes.push(mesh)
    cutoutHalfSizes.push({ w: w / 2, h: h / 2 })

    textureLoader.load(
      item.src,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        mat.map = tex
        mat.needsUpdate = true
      },
      undefined,
      () => {},
    )

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, yPos, pos.z)
      .setRotation(new RAPIER.Quaternion(0, Math.sin(rotY / 2), 0, Math.cos(rotY / 2)))
    const body = world.createRigidBody(bodyDesc)
    const halfW = w / 2
    const halfH = h / 2
    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfW, CUTOUT_THICKNESS / 2, halfH)
      .setDensity(0.5)
    world.createCollider(colliderDesc, body)
    cutoutBodies.push(body)
  }

  let camOffX = 0
  let camOffZ = 0

  function setCameraOffset(dx: number, dy: number) {
    camOffX = dx
    camOffZ = dy
  }

  const lookAtY = depth
  const d = depth

  function applyInteriorMatrix() {
    interiorGroup.matrix.set(
      1, camOffX / d, 0, -camOffX,
      0, 1, 0, 0,
      0, camOffZ / d, 1, -camOffZ,
      0, 0, 0, 1,
    )
  }

  function screenToNdc(screenX: number, screenY: number): { x: number; y: number } | null {
    const rect = container.getBoundingClientRect()
    const localX = screenX - rect.left
    const localY = screenY - rect.top
    if (localX < 0 || localX > rect.width || localY < 0 || localY > rect.height) return null
    return {
      x: (localX / rect.width) * 2 - 1,
      y: (1 - localY / rect.height) * 2 - 1,
    }
  }

  function raycastCutouts(ndcX: number, ndcY: number): number | null {
    mouse.set(ndcX, ndcY)
    raycaster.setFromCamera(mouse, camera)
    raycaster.layers.set(0)
    const hits = raycaster.intersectObjects(cutoutMeshes, false)
    if (hits.length === 0) return null
    const first = hits[0]
    const idx = (first.object.userData as Record<string, number>).cutoutIndex
    return typeof idx === 'number' ? idx : null
  }

  function projectCursorOnFloor(screenX: number, screenY: number): THREE.Vector3 | null {
    const ndc = screenToNdc(screenX, screenY)
    if (!ndc) return null
    mouse.set(ndc.x, ndc.y)
    raycaster.setFromCamera(mouse, camera)
    raycaster.ray.intersectPlane(floorPlane, floorIntersect)
    return floorIntersect.clone()
  }

  function setCursorPosition(screenX: number, screenY: number) {
    lastCursor = { x: screenX, y: screenY }
  }

  // Offsets in screen px to retry when hand-reported position barely misses the cutout (forgiving pinch pick).
  const PICK_TOLERANCE_PX = 28
  const PICK_OFFSETS: [number, number][] = [
    [0, 0],
    [PICK_TOLERANCE_PX, 0],
    [-PICK_TOLERANCE_PX, 0],
    [0, PICK_TOLERANCE_PX],
    [0, -PICK_TOLERANCE_PX],
    [PICK_TOLERANCE_PX, PICK_TOLERANCE_PX],
    [-PICK_TOLERANCE_PX, -PICK_TOLERANCE_PX],
    [PICK_TOLERANCE_PX, -PICK_TOLERANCE_PX],
    [-PICK_TOLERANCE_PX, PICK_TOLERANCE_PX],
  ]

  function pickCutoutAt(screenX: number, screenY: number): number | null {
    camera.position.set(0, baseCamY, 0)
    camera.lookAt(0, lookAtY, 0)
    applyInteriorMatrix()
    scene.updateMatrixWorld(true)
    for (const [dx, dy] of PICK_OFFSETS) {
      const sx = screenX + dx
      const sy = screenY + dy
      const ndc = screenToNdc(sx, sy)
      if (!ndc) continue
      const result = raycastCutouts(ndc.x, ndc.y)
      if (result !== null) return result
    }
    return null
  }

  function startDragCutout(index: number) {
    if (index < 0 || index >= cutoutBodies.length) return
    dragCutoutIndex = index
    const body = cutoutBodies[index]
    const t = body.translation()
    dragWorldPos.set(t.x, DRAG_HEIGHT, t.z)
    body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true)
  }

  function moveDragCutout(screenX: number, screenY: number) {
    if (dragCutoutIndex === null) return
    camera.position.set(0, baseCamY, 0)
    camera.lookAt(0, lookAtY, 0)
    const p = projectCursorOnFloor(screenX, screenY)
    if (!p) return
    const { w: halfW, h: halfH } = cutoutHalfSizes[dragCutoutIndex]
    const maxX = scaledBoxW / 2 - halfW
    const maxZ = scaledBoxH / 2 - halfH
    dragWorldPos.x = THREE.MathUtils.clamp(p.x, -maxX, maxX)
    dragWorldPos.z = THREE.MathUtils.clamp(p.z, -maxZ, maxZ)
    dragWorldPos.y = DRAG_HEIGHT
  }

  function endDragCutout() {
    if (dragCutoutIndex === null) return
    const body = cutoutBodies[dragCutoutIndex]
    body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
    body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    dragCutoutIndex = null
  }

  function applyHighlight() {
    for (let i = 0; i < cutoutMeshes.length; i++) {
      const mesh = cutoutMeshes[i]
      const mat = mesh.material as THREE.MeshLambertMaterial
      const isHighlight = i === hoveredCutoutIndex || i === dragCutoutIndex
      mesh.scale.setScalar(isHighlight ? HOVER_SCALE : 1)
      if (mat.emissive) {
        mat.emissive.setHex(isHighlight ? HOVER_EMISSIVE : 0x000000)
      }
    }
  }

  function stepPhysics() {
    applyInteriorMatrix()
    if (dragCutoutIndex !== null) {
      const body = cutoutBodies[dragCutoutIndex]
      body.setTranslation({ x: dragWorldPos.x, y: dragWorldPos.y, z: dragWorldPos.z }, true)
      body.setRotation(new RAPIER.Quaternion(0, 0, 0, 1), true)
    }
    world.step()
    if (lastCursor && dragCutoutIndex === null) {
      const ndc = screenToNdc(lastCursor.x, lastCursor.y)
      if (ndc) {
        scene.updateMatrixWorld(true)
        hoveredCutoutIndex = raycastCutouts(ndc.x, ndc.y)
      } else {
        hoveredCutoutIndex = null
      }
    } else {
      hoveredCutoutIndex = null
    }
    applyHighlight()
    for (let i = 0; i < cutoutBodies.length; i++) {
      const body = cutoutBodies[i]
      const mesh = cutoutMeshes[i]
      const t = body.translation()
      const r = body.rotation()
      mesh.position.set(t.x, t.y, t.z)
      mesh.quaternion.copy(flatQuat).multiply(new THREE.Quaternion(r.x, r.y, r.z, r.w))
    }
  }

  function render() {
    camera.position.set(0, baseCamY, 0)
    camera.lookAt(0, lookAtY, 0)

    interiorGroup.matrix.set(
      1, camOffX / d, 0, -camOffX,
      0, 1, 0, 0,
      0, camOffZ / d, 1, -camOffZ,
      0, 0, 0, 1,
    )
    renderer.render(scene, camera)
  }

  function resize(w: number, h: number) {
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }

  function destroy() {
    world.free()
    renderer.dispose()
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose())
        } else {
          obj.material.dispose()
        }
      }
    })
    renderer.domElement.remove()
  }

  return {
    renderer,
    camera,
    scene,
    boxGroup,
    setCameraOffset,
    resize,
    setCursorPosition,
    pickCutoutAt,
    startDragCutout,
    moveDragCutout,
    endDragCutout,
    stepPhysics,
    render,
    destroy,
  }
}
