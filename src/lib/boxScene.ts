import * as THREE from 'three'
import RAPIER, { init as initRapier } from '@dimforge/rapier3d-compat'
import type { CutoutItem } from '@/types/section'

export interface BoxSceneHandle {
  renderer: THREE.WebGLRenderer
  camera: THREE.PerspectiveCamera
  scene: THREE.Scene
  boxGroup: THREE.Group
  /** Horizontal plane with hole (opening); use for placing cutouts outside the box. */
  outerPlane: THREE.Mesh
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
const WALL_COLOR = 0xf2dfb8
const WALL_SIDE_TINT = 0xf2dfb8

const PAGE_TEXTURE_URL = '/texture.jpg'
const TEXTURE_TILE_SIZE = 400

/** Creates a canvas texture with base color + texture (multiply) for scene background. */
function createBakedBackgroundTexture(
  textureUrl: string,
  baseColor: number,
  size: number = 1024,
): Promise<THREE.CanvasTexture> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('No 2d context'))
      return
    }
    const r = ((baseColor >> 16) & 0xff) / 255
    const g = ((baseColor >> 8) & 0xff) / 255
    const b = (baseColor & 0xff) / 255
    ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`
    ctx.fillRect(0, 0, size, size)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      ctx.globalCompositeOperation = 'multiply'
      const tiles = Math.ceil(size / TEXTURE_TILE_SIZE) + 1
      for (let i = 0; i < tiles; i++) {
        for (let j = 0; j < tiles; j++) {
          ctx.drawImage(img, i * TEXTURE_TILE_SIZE, j * TEXTURE_TILE_SIZE, TEXTURE_TILE_SIZE, TEXTURE_TILE_SIZE)
        }
      }
      const tex = new THREE.CanvasTexture(canvas)
      tex.colorSpace = THREE.SRGBColorSpace
      resolve(tex)
    }
    img.onerror = () => reject(new Error('Failed to load texture'))
    img.src = textureUrl
  })
}

const BOX_DEPTH = 0.4
/** Scale of the 3D box inside the scene; scene canvas is full-page, box stays proportionally smaller. */
const BOX_SCALE = 0.448 // 70% of previous 0.64
/** Half-size of the outer plane (area outside opening) in local x/z; user can place cutouts here later. */
const OUTER_PLANE_HALF = 2.5
const CUTOUT_THICKNESS = 0.004
/** Bottom plane is offset below cutouts so they don't z-fight (cutouts sit at CUTOUT_THICKNESS/2). */
const BOTTOM_PLANE_OFFSET_Y = -(CUTOUT_THICKNESS / 2 + 0.002)
/** Bottom plane matches wall edges exactly so it never peeks past them during parallax. */
const BOTTOM_PLANE_MARGIN = 0
/** Target screen-space thickness (px) for the box opening stroke. */
const STROKE_PX = 10
const GRAVITY = -12
const HOVER_SCALE = 1.06
const HOVER_EMISSIVE = 0x443322
const DRAG_HEIGHT = 0.02

/**
 * Create box scene with optional cutouts (textured planes inside box) and Rapier physics.
 * Async: compat package requires init() before using the API.
 * When boxAspect is provided, the box geometry uses it so the box is unchanged when the canvas is full size.
 */
export async function createBoxScene(
  container: HTMLElement,
  width: number,
  height: number,
  cutouts: CutoutItem[] = [],
  boxAspect?: number,
  sectionId?: string,
): Promise<BoxSceneHandle> {
  await initRapier()
  const aspect = width / height
  const boxAspectUsed = boxAspect ?? aspect
  const boxW = 2 * boxAspectUsed
  const boxH = 2
  const depth = BOX_DEPTH

  // Canvas size is only from container's intended dimensions (width/height); independent of box scale.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(width, height)
  const canvas = renderer.domElement
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  canvas.style.display = 'block'
  renderer.setClearColor(PAGE_BG)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.appendChild(canvas)

  const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 50)
  const baseCamY = depth + 2.2
  camera.position.set(0, baseCamY, 0)
  camera.lookAt(0, 0, 0)

  const scene = new THREE.Scene()
  const boxGroup = new THREE.Group()
  scene.add(boxGroup)

  const interiorGroup = new THREE.Group()
  interiorGroup.matrixAutoUpdate = false
  boxGroup.add(interiorGroup)

  const sceneBgTex = await createBakedBackgroundTexture(PAGE_TEXTURE_URL, PAGE_BG)
  scene.background = sceneBgTex

  const textureLoader = new THREE.TextureLoader()
  textureLoader.setCrossOrigin('anonymous')
  const pageTexture = await new Promise<THREE.Texture>((res, rej) => {
    textureLoader.load(
      PAGE_TEXTURE_URL,
      (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        t.repeat.set(1, 1)
        t.colorSpace = THREE.SRGBColorSpace
        res(t)
      },
      undefined,
      rej,
    )
  })

  const bottomGeo = new THREE.PlaneGeometry(
    boxW + 2 * BOTTOM_PLANE_MARGIN,
    boxH + 2 * BOTTOM_PLANE_MARGIN,
  )
  const bottomMat = new THREE.MeshLambertMaterial({
    color: BOTTOM_COLOR,
    map: pageTexture.clone(),
    side: THREE.FrontSide,
  })
  const bottom = new THREE.Mesh(bottomGeo, bottomMat)
  bottom.rotation.x = -Math.PI / 2
  bottom.position.y = BOTTOM_PLANE_OFFSET_Y
  bottom.receiveShadow = true
  interiorGroup.add(bottom)

  if (sectionId) {
    const sectionImageUrl = `/sections/${sectionId}.png`
    const sectionImg = new Image()
    sectionImg.crossOrigin = 'anonymous'
    sectionImg.onload = () => {
      if (destroyed) return
      const iw = sectionImg.naturalWidth
      const ih = sectionImg.naturalHeight

      const tmpCvs = document.createElement('canvas')
      tmpCvs.width = iw
      tmpCvs.height = ih
      const tmpCtx = tmpCvs.getContext('2d')!
      tmpCtx.drawImage(sectionImg, 0, 0)
      const pxData = tmpCtx.getImageData(0, 0, iw, ih).data

      const ALPHA_THRESH = 128
      const FILL_THRESH = 0.9

      let top = 0
      for (let y = 0; y < ih; y++) {
        let opaque = 0
        for (let x = 0; x < iw; x++) if (pxData[(y * iw + x) * 4 + 3] >= ALPHA_THRESH) opaque++
        if (opaque / iw >= FILL_THRESH) { top = y; break }
      }
      let btm = ih - 1
      for (let y = ih - 1; y >= top; y--) {
        let opaque = 0
        for (let x = 0; x < iw; x++) if (pxData[(y * iw + x) * 4 + 3] >= ALPHA_THRESH) opaque++
        if (opaque / iw >= FILL_THRESH) { btm = y; break }
      }
      let left = 0
      for (let x = 0; x < iw; x++) {
        let opaque = 0
        for (let y = top; y <= btm; y++) if (pxData[(y * iw + x) * 4 + 3] >= ALPHA_THRESH) opaque++
        if (opaque / (btm - top + 1) >= FILL_THRESH) { left = x; break }
      }
      let right = iw - 1
      for (let x = iw - 1; x >= left; x--) {
        let opaque = 0
        for (let y = top; y <= btm; y++) if (pxData[(y * iw + x) * 4 + 3] >= ALPHA_THRESH) opaque++
        if (opaque / (btm - top + 1) >= FILL_THRESH) { right = x; break }
      }

      const cw = right - left + 1
      const ch = btm - top + 1
      const contentAspect = cw / ch
      const planeW = boxW + 2 * BOTTOM_PLANE_MARGIN
      const planeH = boxH + 2 * BOTTOM_PLANE_MARGIN
      const planeAspect = planeW / planeH

      let sx = left, sy = top, sw = cw, sh = ch
      if (contentAspect > planeAspect) {
        sw = ch * planeAspect
        sx = left + (cw - sw) / 2
      } else {
        sh = cw / planeAspect
        sy = top + (ch - sh) / 2
      }

      const canvasRes = 1024
      const canvasW = planeAspect >= 1 ? canvasRes : Math.round(canvasRes * planeAspect)
      const canvasH = planeAspect >= 1 ? Math.round(canvasRes / planeAspect) : canvasRes

      const cvs = document.createElement('canvas')
      cvs.width = canvasW
      cvs.height = canvasH
      const ctx = cvs.getContext('2d')!
      ctx.drawImage(sectionImg, sx, sy, sw, sh, 0, 0, canvasW, canvasH)

      const texImage = pageTexture.image as HTMLImageElement
      if (texImage) {
        ctx.globalCompositeOperation = 'multiply'
        const tiles = Math.ceil(Math.max(canvasW, canvasH) / TEXTURE_TILE_SIZE) + 1
        for (let i = 0; i < tiles; i++) {
          for (let j = 0; j < tiles; j++) {
            ctx.drawImage(texImage, i * TEXTURE_TILE_SIZE, j * TEXTURE_TILE_SIZE, TEXTURE_TILE_SIZE, TEXTURE_TILE_SIZE)
          }
        }
      }

      const tex = new THREE.CanvasTexture(cvs)
      tex.colorSpace = THREE.SRGBColorSpace

      bottomMat.map = tex
      bottomMat.color.setHex(0xffffff)
      bottomMat.needsUpdate = true
    }
    sectionImg.src = sectionImageUrl
  }

  const backGeo = new THREE.PlaneGeometry(boxW, depth)
  const backMat = new THREE.MeshLambertMaterial({
    color: WALL_COLOR,
    map: pageTexture.clone(),
    side: THREE.FrontSide,
  })
  const back = new THREE.Mesh(backGeo, backMat)
  back.position.set(0, depth / 2, -boxH / 2)
  interiorGroup.add(back)

  const frontGeo = new THREE.PlaneGeometry(boxW, depth)
  const frontMat = new THREE.MeshLambertMaterial({
    color: WALL_COLOR,
    map: pageTexture.clone(),
    side: THREE.BackSide,
    transparent: false,
  })
  const front = new THREE.Mesh(frontGeo, frontMat)
  front.position.set(0, depth / 2, boxH / 2)
  interiorGroup.add(front)

  const leftGeo = new THREE.PlaneGeometry(boxH, depth)
  const leftMat = new THREE.MeshLambertMaterial({
    color: WALL_SIDE_TINT,
    map: pageTexture.clone(),
    side: THREE.FrontSide,
  })
  const leftWall = new THREE.Mesh(leftGeo, leftMat)
  leftWall.rotation.y = Math.PI / 2
  leftWall.position.set(-boxW / 2, depth / 2, 0)
  interiorGroup.add(leftWall)

  const rightGeo = new THREE.PlaneGeometry(boxH, depth)
  const rightMat = new THREE.MeshLambertMaterial({
    color: WALL_SIDE_TINT,
    map: pageTexture.clone(),
    side: THREE.BackSide,
  })
  const rightWall = new THREE.Mesh(rightGeo, rightMat)
  rightWall.rotation.y = Math.PI / 2
  rightWall.position.set(boxW / 2, depth / 2, 0)
  interiorGroup.add(rightWall)

  // Box stroke: rounded outline on opening edges + vertical wall-to-wall edges (≈STROKE_PX screen-space)
  const hw = boxW / 2
  const hh = boxH / 2
  const strokeFov = (camera.fov / 2) * Math.PI / 180
  const strokeDist = baseCamY - depth * BOX_SCALE
  const visibleH = 2 * strokeDist * Math.tan(strokeFov)
  const sr = (STROKE_PX * visibleH / height) / BOX_SCALE * 0.5
  const strokeY = depth + sr * 0.5
  const strokeSegs = 16

  const strokeMat = new THREE.MeshBasicMaterial({ color: 0x000000 })
  const capGeo = new THREE.SphereGeometry(sr, strokeSegs, strokeSegs / 2)

  // Opening edges (horizontal, fixed in boxGroup)
  const cylGeoX = new THREE.CylinderGeometry(sr, sr, boxW, strokeSegs, 1)
  cylGeoX.rotateZ(Math.PI / 2)
  const cylGeoZ = new THREE.CylinderGeometry(sr, sr, boxH, strokeSegs, 1)
  cylGeoZ.rotateX(Math.PI / 2)

  for (const z of [-hh, hh]) {
    const m = new THREE.Mesh(cylGeoX, strokeMat)
    m.position.set(0, strokeY, z)
    boxGroup.add(m)
  }
  for (const x of [-hw, hw]) {
    const m = new THREE.Mesh(cylGeoZ, strokeMat)
    m.position.set(x, strokeY, 0)
    boxGroup.add(m)
  }
  for (const x of [-hw, hw]) {
    for (const z of [-hh, hh]) {
      const cap = new THREE.Mesh(capGeo, strokeMat)
      cap.position.set(x, strokeY, z)
      boxGroup.add(cap)
    }
  }

  // Vertical corner edges (wall-to-wall, follows interior parallax)
  const cylGeoY = new THREE.CylinderGeometry(sr, sr, depth, strokeSegs, 1)
  for (const x of [-hw, hw]) {
    for (const z of [-hh, hh]) {
      const m = new THREE.Mesh(cylGeoY, strokeMat)
      m.position.set(x, depth / 2, z)
      interiorGroup.add(m)
    }
  }
  // Bottom edges (wall-to-floor, follows interior parallax)
  for (const z of [-hh, hh]) {
    const m = new THREE.Mesh(cylGeoX.clone(), strokeMat)
    m.position.set(0, 0, z)
    interiorGroup.add(m)
  }
  for (const x of [-hw, hw]) {
    const m = new THREE.Mesh(cylGeoZ.clone(), strokeMat)
    m.position.set(x, 0, 0)
    interiorGroup.add(m)
  }
  // Bottom corner caps
  for (const x of [-hw, hw]) {
    for (const z of [-hh, hh]) {
      const cap = new THREE.Mesh(capGeo, strokeMat)
      cap.position.set(x, 0, z)
      interiorGroup.add(cap)
    }
  }

  // Outer plane lives in scene space (not boxGroup) so it always fills the camera frustum
  // regardless of BOX_SCALE. The hole matches the scaled box opening.
  const openingWorldY = depth * BOX_SCALE
  const distCamToOpening = baseCamY - openingWorldY
  const halfFovRad = (camera.fov / 2) * Math.PI / 180
  const frustumHalfHeight = distCamToOpening * Math.tan(halfFovRad)
  const outerPlaneWorldHalf = Math.max(frustumHalfHeight * 3, OUTER_PLANE_HALF)

  const scaledHoleW = (boxW * BOX_SCALE) / 2
  const scaledHoleH = (boxH * BOX_SCALE) / 2

  const outerShape = new THREE.Shape()
  outerShape.moveTo(-outerPlaneWorldHalf, -outerPlaneWorldHalf)
  outerShape.lineTo(outerPlaneWorldHalf, -outerPlaneWorldHalf)
  outerShape.lineTo(outerPlaneWorldHalf, outerPlaneWorldHalf)
  outerShape.lineTo(-outerPlaneWorldHalf, outerPlaneWorldHalf)
  outerShape.closePath()
  const openingHole = new THREE.Path()
  openingHole.moveTo(-scaledHoleW, -scaledHoleH)
  openingHole.lineTo(scaledHoleW, -scaledHoleH)
  openingHole.lineTo(scaledHoleW, scaledHoleH)
  openingHole.lineTo(-scaledHoleW, scaledHoleH)
  openingHole.closePath()
  outerShape.holes.push(openingHole)
  const outerPlaneGeo = new THREE.ShapeGeometry(outerShape)
  outerPlaneGeo.rotateX(-Math.PI / 2)
  const outerPlaneMat = new THREE.MeshLambertMaterial({
    color: PAGE_BG,
    map: pageTexture.clone(),
    side: THREE.FrontSide,
    transparent: false,
    depthTest: true,
    depthWrite: true,
  })
  const outerPlane = new THREE.Mesh(outerPlaneGeo, outerPlaneMat)
  outerPlane.position.set(0, openingWorldY, 0)
  outerPlane.renderOrder = 1
  outerPlane.receiveShadow = true
  scene.add(outerPlane)

  // Section pattern overlay on outer plane (transparent, staggered tiling with spacing)
  if (sectionId) {
    const letter = sectionId.replace(/^section-/, '')
    const patternUrl = `/section-back/${letter}.png`
    const patternImg = new Image()
    patternImg.crossOrigin = 'anonymous'
    patternImg.onload = () => {
      if (destroyed) return
      const iw = patternImg.naturalWidth
      const ih = patternImg.naturalHeight
      const cellW = Math.round(iw * 1.5)
      const cellH = Math.round(ih * 1.5)
      const canvas = document.createElement('canvas')
      canvas.width = cellW
      canvas.height = cellH * 2
      const ctx = canvas.getContext('2d')!
      const imgX = Math.round((cellW - iw) / 2)
      const imgY = Math.round((cellH - ih) / 2)
      ctx.drawImage(patternImg, imgX, imgY)
      const shiftX = Math.round(cellW / 2)
      ctx.drawImage(patternImg, imgX + shiftX, cellH + imgY)
      ctx.drawImage(patternImg, imgX + shiftX - cellW, cellH + imgY)

      const tex = new THREE.CanvasTexture(canvas)
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.colorSpace = THREE.SRGBColorSpace
      const cellWorldSize = Math.max(scaledHoleW, scaledHoleH) * 10.0
      const planeSize = 2 * outerPlaneWorldHalf
      tex.repeat.set(planeSize / cellWorldSize, planeSize / (cellWorldSize * 2))

      const overlayMat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
      })
      const overlay = new THREE.Mesh(outerPlaneGeo, overlayMat)
      overlay.position.set(0, openingWorldY + 0.001, 0)
      overlay.renderOrder = 2
      scene.add(overlay)
    }
    patternImg.onerror = () => { /* image not found for this section, skip */ }
    patternImg.src = patternUrl
  }

  // Drop zone plane: horizontal plane at opening level; cutouts placed here when lifted out (subtle visual)
  const dropZoneGeo = new THREE.PlaneGeometry(boxW, boxH)
  dropZoneGeo.rotateX(-Math.PI / 2)
  const dropZoneMat = new THREE.MeshLambertMaterial({
    color: PAGE_BG,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const dropZonePlane = new THREE.Mesh(dropZoneGeo, dropZoneMat)
  dropZonePlane.position.set(0, depth, 0)
  dropZonePlane.renderOrder = 0.5
  boxGroup.add(dropZonePlane)

  boxGroup.scale.setScalar(BOX_SCALE)

  // Lights: warm ambient + warm directional (shadow) + warm camera fill
  const ambient = new THREE.AmbientLight(0xfff9ef, 1.3)
  scene.add(ambient)
  const dir = new THREE.DirectionalLight(0xfff9ef, 1.6)
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
  const camLight = new THREE.PointLight(0xfff0d6, 1.6, 8)
  camLight.position.set(0, baseCamY, 0)
  scene.add(camLight)

  let destroyed = false
  const cutoutMeshes: THREE.Mesh[] = []
  const cutoutBodies: RAPIER.RigidBody[] = []
  const cutoutHalfSizes: { w: number; h: number }[] = []
  const flatQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)

  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const floorIntersect = new THREE.Vector3()
  // Drop zone: plane at opening level; cutouts can be placed here when lifted out (world-space y = depth * BOX_SCALE)
  const dropPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)
  const dropIntersect = new THREE.Vector3()
  const dropPlaneY = depth * BOX_SCALE
  dropPlane.constant = dropPlaneY // plane eq: -y + constant = 0 => y = constant
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

  // Drop zone: static collider at opening level and over the outer plane so cutouts can rest there when placed
  const outerPlaneHalfScaled = outerPlaneWorldHalf
  const dropZoneBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, dropPlaneY + 0.01, 0)
  const dropZoneBody = world.createRigidBody(dropZoneBodyDesc)
  const dropZoneColliderDesc = RAPIER.ColliderDesc.cuboid(outerPlaneHalfScaled, 0.01, outerPlaneHalfScaled)
  world.createCollider(dropZoneColliderDesc, dropZoneBody)

  // Interior box walls: colliders so cutouts cannot pass through and stay inside (rigid body physics)
  const wallThickness = 0.02
  const scaledDepth = depth * BOX_SCALE
  const wallHalfHeight = scaledDepth / 2

  const backWallBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, wallHalfHeight, -scaledBoxH / 2 - wallThickness / 2),
  )
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(scaledBoxW / 2 + wallThickness, wallHalfHeight, wallThickness / 2),
    backWallBody,
  )

  const frontWallBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, wallHalfHeight, scaledBoxH / 2 + wallThickness / 2),
  )
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(scaledBoxW / 2 + wallThickness, wallHalfHeight, wallThickness / 2),
    frontWallBody,
  )

  const leftWallBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(-scaledBoxW / 2 - wallThickness / 2, wallHalfHeight, 0),
  )
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(wallThickness / 2, wallHalfHeight, scaledBoxH / 2 + wallThickness),
    leftWallBody,
  )

  const rightWallBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(scaledBoxW / 2 + wallThickness / 2, wallHalfHeight, 0),
  )
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(wallThickness / 2, wallHalfHeight, scaledBoxH / 2 + wallThickness),
    rightWallBody,
  )

  const floorY = CUTOUT_THICKNESS / 2
  for (let i = 0; i < cutouts.length; i++) {
    const item = cutouts[i]
    const w = item.width * 1.5
    const h = item.height * 1.5
    const pos = item.position ?? { x: 0, y: 0.02, z: 0 }
    const rotY = item.rotationY ?? 0
    // Place cutouts on the floor in world space so they obey physics and are obstructed by box walls
    const worldY = floorY * BOX_SCALE
    const localX = pos.x
    const localZ = pos.z
    const worldX = pos.x * BOX_SCALE
    const worldZ = pos.z * BOX_SCALE

    const geo = new THREE.PlaneGeometry(w, h)
    const mat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: true,
      depthTest: true,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.rotation.y = rotY
    mesh.position.set(localX, floorY, localZ)
    mesh.castShadow = true
    mesh.receiveShadow = true
    const cutoutIndex = cutoutMeshes.length
    ;(mesh.userData as Record<string, number>).cutoutIndex = cutoutIndex
    interiorGroup.add(mesh)
    cutoutMeshes.push(mesh)
    cutoutHalfSizes.push({ w: w / 2, h: h / 2 })

    if (item.src) {
      const meshIndex = cutoutIndex
      const absoluteUrl =
        item.src.startsWith('http') || item.src.startsWith('//')
          ? item.src
          : new URL(item.src, window.location.origin).href
      textureLoader.load(
        absoluteUrl,
        (tex) => {
          if (destroyed) return
          tex.colorSpace = THREE.SRGBColorSpace
          tex.needsUpdate = true
          const targetMesh = cutoutMeshes[meshIndex]
          if (targetMesh?.material && targetMesh.material instanceof THREE.MeshLambertMaterial) {
            targetMesh.material.map = tex
            targetMesh.material.needsUpdate = true
          }
        },
        undefined,
        (err) => {
          console.warn('Cutout texture failed to load:', item.src, err)
        },
      )
    }

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(worldX, worldY, worldZ)
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
  const maxParallaxOff = depth * 0.3

  function setCameraOffset(dx: number, dy: number) {
    camOffX = Math.max(-maxParallaxOff, Math.min(maxParallaxOff, dx))
    camOffZ = Math.max(-maxParallaxOff, Math.min(maxParallaxOff, dy))
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

  /** Project cursor onto drop plane (y = depth). Returns null if ray does not hit. */
  function projectCursorOnDropPlane(screenX: number, screenY: number): THREE.Vector3 | null {
    const ndc = screenToNdc(screenX, screenY)
    if (!ndc) return null
    mouse.set(ndc.x, ndc.y)
    raycaster.setFromCamera(mouse, camera)
    const hit = raycaster.ray.intersectPlane(dropPlane, dropIntersect)
    return hit ? dropIntersect.clone() : null
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
    const { w: halfW, h: halfH } = cutoutHalfSizes[dragCutoutIndex]
    const maxXFloor = scaledBoxW / 2 - halfW
    const maxZFloor = scaledBoxH / 2 - halfH
    const maxXOuter = outerPlaneHalfScaled - halfW
    const maxZOuter = outerPlaneHalfScaled - halfH

    const pFloor = projectCursorOnFloor(screenX, screenY)
    const onFloor =
      pFloor &&
      pFloor.x >= -maxXFloor &&
      pFloor.x <= maxXFloor &&
      pFloor.z >= -maxZFloor &&
      pFloor.z <= maxZFloor

    if (onFloor && pFloor) {
      dragWorldPos.x = pFloor.x
      dragWorldPos.z = pFloor.z
      dragWorldPos.y = DRAG_HEIGHT
      return
    }

    const pDrop = projectCursorOnDropPlane(screenX, screenY)
    if (pDrop) {
      dragWorldPos.x = THREE.MathUtils.clamp(pDrop.x, -maxXOuter, maxXOuter)
      dragWorldPos.z = THREE.MathUtils.clamp(pDrop.z, -maxZOuter, maxZOuter)
      dragWorldPos.y = dropPlaneY + 0.02 + CUTOUT_THICKNESS / 2
    }
  }

  function endDragCutout() {
    if (dragCutoutIndex === null) return
    const body = cutoutBodies[dragCutoutIndex]
    body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
    body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    const randAngle = (Math.random() * 40 - 20) * Math.PI / 180
    body.setRotation(new RAPIER.Quaternion(0, Math.sin(randAngle / 2), 0, Math.cos(randAngle / 2)), true)
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
      mesh.position.set(t.x / BOX_SCALE, t.y / BOX_SCALE, t.z / BOX_SCALE)
      mesh.quaternion.set(r.x, r.y, r.z, r.w).multiply(flatQuat)
    }
  }

  const cutoutSortRef = { camPos: new THREE.Vector3(), worldPos: new THREE.Vector3() }

  function render() {
    camera.position.set(0, baseCamY, 0)
    camera.lookAt(0, lookAtY, 0)

    applyInteriorMatrix()
    cutoutSortRef.camPos.copy(camera.position)
    const CUTOUT_RENDER_ORDER_BASE = 10
    cutoutMeshes
      .map((mesh) => ({
        mesh,
        dist: mesh.getWorldPosition(cutoutSortRef.worldPos).distanceTo(cutoutSortRef.camPos),
      }))
      .sort((a, b) => b.dist - a.dist)
      .forEach(({ mesh }, i) => {
        mesh.renderOrder = CUTOUT_RENDER_ORDER_BASE + i
      })
    renderer.render(scene, camera)
  }

  function resize(w: number, h: number) {
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    const el = renderer.domElement
    el.style.width = `${w}px`
    el.style.height = `${h}px`
  }

  function destroy() {
    destroyed = true
    world.free()
    if (scene.background && scene.background instanceof THREE.Texture) {
      scene.background.dispose()
    }
    renderer.dispose()
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        const mat = obj.material
        if (Array.isArray(mat)) {
          mat.forEach((m) => {
            if (m.map) m.map.dispose()
            m.dispose()
          })
        } else {
          if (mat.map) mat.map.dispose()
          mat.dispose()
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
    outerPlane,
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
