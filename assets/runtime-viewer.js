import * as THREE from './three.module.js'
import { applyRuntimeSkin, resolveRuntimeSkin } from './runtime-skin.js'

const PANORAMA_RADIUS = 500
const HOTSPOT_RADIUS = PANORAMA_RADIUS - 4
const DEFAULT_MIN_PITCH = THREE.MathUtils.degToRad(-88)
const DEFAULT_MAX_PITCH = THREE.MathUtils.degToRad(88)

const viewerHost = document.getElementById('runtime-viewer')
const fadeEl = document.getElementById('runtime-fade')
const loadingEl = document.getElementById('runtime-loading')
const errorEl = document.getElementById('runtime-error')
const brandingEl = document.getElementById('runtime-branding')
const brandingOfficeCardEl = document.getElementById('runtime-branding-office-card')
const brandingProjectCardEl = document.getElementById('runtime-branding-project-card')
const brandingLogoEl = document.getElementById('runtime-branding-logo')
const brandingOfficeEl = document.getElementById('runtime-branding-office')
const brandingProjectEl = document.getElementById('runtime-branding-project')
const brandingDesignerEl = document.getElementById('runtime-branding-designer')
const controlsBar = document.querySelector('.runtime-controls')
const fullscreenBtn = document.getElementById('runtime-fullscreen')
const resetViewBtn = document.getElementById('runtime-reset-view')
const zoomInBtn = document.getElementById('runtime-zoom-in')
const zoomOutBtn = document.getElementById('runtime-zoom-out')
const TRANSITION_MS = 400

function showLoading(message = 'Loading panorama...') {
  loadingEl.textContent = message
  loadingEl.hidden = false
}

function hideLoading() {
  loadingEl.hidden = true
}

function showError(message) {
  errorEl.textContent = message
  errorEl.hidden = false
}

function clearError() {
  errorEl.hidden = true
  errorEl.textContent = ''
}

function updateFullscreenButton() {
  if (!fullscreenBtn) return
  const active = Boolean(document.fullscreenElement)
  fullscreenBtn.textContent = active ? 'Exit' : 'Fullscreen'
  fullscreenBtn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen')
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function setFade(active) {
  if (!fadeEl) return
  fadeEl.classList.toggle('runtime-fade--active', active)
  await wait(TRANSITION_MS)
}

function normalizeProject(project) {
  const sceneSettings = project.settings?.scenes ?? {}
  return {
    ...project,
    branding: {
      projectName: project.branding?.projectName ?? '',
      designerName: project.branding?.designerName ?? '',
      officeName: project.branding?.officeName ?? '',
      officeLogoSrc: project.branding?.officeLogoSrc ?? '',
    },
    skin: {
      brandingPosition: project.skin?.brandingPosition ?? 'top-left',
      showProjectTitle: project.skin?.showProjectTitle ?? true,
      showOfficeBranding: project.skin?.showOfficeBranding ?? true,
      theme: project.skin?.theme ?? 'dark',
      controlBarPosition: project.skin?.controlBarPosition ?? 'top-right',
    },
    scenes: (project.scenes ?? []).map((scene) => ({
      ...scene,
      hotspots: (scene.hotspots ?? []).map((hotspot) => ({
        visualType: 'floor',
        ...hotspot,
      })),
      ...sceneSettings[scene.id],
    })),
  }
}

function applyProjectBranding(branding, skin) {
  if (
    !brandingEl ||
    !brandingOfficeCardEl ||
    !brandingProjectCardEl ||
    !brandingProjectEl ||
    !brandingOfficeEl ||
    !brandingDesignerEl ||
    !brandingLogoEl
  ) {
    return
  }

  const projectName = branding.projectName?.trim() ?? ''
  const officeName = branding.officeName?.trim() ?? ''
  const designerName = branding.designerName?.trim() ?? ''
  const officeLogoSrc = branding.officeLogoSrc?.trim() ?? ''
  const hasOfficeBranding =
    skin.showOfficeBranding && Boolean(officeName || officeLogoSrc)
  const hasProjectBranding =
    skin.showProjectTitle && Boolean(projectName || designerName)
  const hasBranding = hasOfficeBranding || hasProjectBranding

  if (!hasBranding) {
    brandingEl.hidden = true
    brandingOfficeCardEl.hidden = true
    brandingProjectCardEl.hidden = true
    brandingOfficeEl.hidden = true
    brandingProjectEl.hidden = true
    brandingDesignerEl.hidden = true
    brandingLogoEl.hidden = true
    brandingLogoEl.removeAttribute('src')
    brandingProjectEl.textContent = ''
    brandingOfficeEl.textContent = ''
    brandingDesignerEl.textContent = ''
    return
  }

  brandingOfficeCardEl.hidden = !hasOfficeBranding
  brandingProjectCardEl.hidden = !hasProjectBranding

  brandingProjectEl.textContent = projectName
  brandingProjectEl.hidden = projectName.length === 0
  if (projectName) {
    document.title = projectName
  }

  brandingOfficeEl.textContent = officeName
  brandingOfficeEl.hidden = officeName.length === 0

  brandingDesignerEl.textContent = designerName ? `Designed by ${designerName}` : ''
  brandingDesignerEl.hidden = designerName.length === 0

  if (officeLogoSrc) {
    brandingLogoEl.src = officeLogoSrc
    brandingLogoEl.alt = officeName ? `${officeName} logo` : 'Office logo'
    brandingLogoEl.hidden = false
  } else {
    brandingLogoEl.hidden = true
    brandingLogoEl.removeAttribute('src')
  }

  brandingEl.hidden = false
}

class PanoramaControls {
  constructor(camera, domElement, pitchRoot, yawRoot, scene) {
    this.camera = camera
    this.domElement = domElement
    this.pitchRoot = pitchRoot
    this.yawRoot = yawRoot
    this.yawQuaternion = new THREE.Quaternion()
    this.pitchQuaternion = new THREE.Quaternion()
    this.minFov = 35
    this.maxFov = 95
    this.minPitch = DEFAULT_MIN_PITCH
    this.maxPitch = DEFAULT_MAX_PITCH
    this.dragging = false
    this.lastX = 0
    this.lastY = 0
    this.applyScene(scene)
    domElement.addEventListener('pointerdown', this.onPointerDown)
    domElement.addEventListener('pointermove', this.onPointerMove)
    domElement.addEventListener('pointerup', this.onPointerUp)
    domElement.addEventListener('pointercancel', this.onPointerUp)
    domElement.addEventListener('wheel', this.onWheel, { passive: false })
  }

  applyScene(scene) {
    this.yawSensitivity = scene.dragSensitivity
    this.pitchSensitivity = scene.pitchSensitivity
    this.zoomSpeed = scene.zoomSpeed
    this.autoRotateRadPerSec = THREE.MathUtils.degToRad(scene.autoRotateSpeed)
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.domElement.removeEventListener('pointermove', this.onPointerMove)
    this.domElement.removeEventListener('pointerup', this.onPointerUp)
    this.domElement.removeEventListener('pointercancel', this.onPointerUp)
    this.domElement.removeEventListener('wheel', this.onWheel)
  }

  tick(deltaSeconds) {
    if (this.dragging || this.autoRotateRadPerSec === 0) return
    this.yaw -= this.autoRotateRadPerSec * deltaSeconds
    this.applyRotation()
  }

  applyRotation() {
    this.pitchQuaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -this.pitch)
    this.yawQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.yaw)
    this.pitchRoot.quaternion.copy(this.pitchQuaternion)
    this.yawRoot.quaternion.copy(this.yawQuaternion)
  }

  setYawPitch(yaw, pitch) {
    this.yaw = yaw
    this.pitch = THREE.MathUtils.clamp(pitch, this.minPitch, this.maxPitch)
    this.applyRotation()
  }

  setFov(degrees) {
    this.camera.fov = THREE.MathUtils.clamp(degrees, this.minFov, this.maxFov)
    this.camera.updateProjectionMatrix()
  }

  getViewState() {
    return {
      yawDeg: THREE.MathUtils.radToDeg(this.yaw),
      pitchDeg: THREE.MathUtils.radToDeg(this.pitch),
      fov: this.camera.fov,
    }
  }

  onPointerDown = (event) => {
    if (event.button !== 0) return
    this.dragging = true
    this.lastX = event.clientX
    this.lastY = event.clientY
    this.domElement.setPointerCapture(event.pointerId)
  }

  onPointerMove = (event) => {
    if (!this.dragging) return
    const dx = event.clientX - this.lastX
    const dy = event.clientY - this.lastY
    this.lastX = event.clientX
    this.lastY = event.clientY
    this.yaw += dx * this.yawSensitivity
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + dy * this.pitchSensitivity,
      this.minPitch,
      this.maxPitch
    )
    this.applyRotation()
  }

  onPointerUp = (event) => {
    if (!this.dragging) return
    this.dragging = false
    if (this.domElement.hasPointerCapture(event.pointerId)) {
      this.domElement.releasePointerCapture(event.pointerId)
    }
  }

  onWheel = (event) => {
    event.preventDefault()
    this.setFov(this.camera.fov + event.deltaY * this.zoomSpeed)
  }
}

function createMarkerTexture(type) {
  const key = `marker:${type}`
  if (!createMarkerTexture.cache.has(key)) {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')
    const cx = 64
    const cy = 64

    ctx.clearRect(0, 0, 128, 128)
    ctx.beginPath()
    ctx.arc(cx, cy, 40, 0, Math.PI * 2)
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 44)
    glow.addColorStop(0, 'rgba(255,243,196,0.34)')
    glow.addColorStop(0.6, 'rgba(255,243,196,0.12)')
    glow.addColorStop(1, 'rgba(255,243,196,0)')
    ctx.fillStyle = glow
    ctx.fill()

    ctx.beginPath()
    ctx.arc(cx, cy, 30, 0, Math.PI * 2)
    const fill = ctx.createRadialGradient(cx, cy - 4, 4, cx, cy, 32)
    fill.addColorStop(0, '#ffffff')
    fill.addColorStop(0.65, '#fff3c6')
    fill.addColorStop(1, '#f0c24b')
    ctx.fillStyle = fill
    ctx.fill()
    ctx.lineWidth = 5
    ctx.strokeStyle = 'rgba(14,16,22,0.95)'
    ctx.stroke()

    ctx.fillStyle = 'rgba(20,22,30,0.92)'
    ctx.strokeStyle = 'rgba(20,22,30,0.92)'
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (type === 'pin') {
      ctx.beginPath()
      ctx.moveTo(cx, cy + 28)
      ctx.bezierCurveTo(cx + 18, cy + 8, cx + 18, cy - 18, cx, cy - 18)
      ctx.bezierCurveTo(cx - 18, cy - 18, cx - 18, cy + 8, cx, cy + 28)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(cx, cy, 7, 0, Math.PI * 2)
      ctx.fill()
    } else if (type === 'info') {
      ctx.beginPath()
      ctx.arc(cx, cy - 12, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx, cy + 18)
      ctx.stroke()
    } else {
      const drawArrow = (rotationDeg, curved = false, double = false) => {
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(THREE.MathUtils.degToRad(rotationDeg))
        if (curved) {
          ctx.beginPath()
          ctx.arc(0, 6, 16, Math.PI * 0.15, Math.PI * 1.2, rotationDeg < 0)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(4, -18)
          ctx.lineTo(18, -14)
          ctx.lineTo(8, -2)
          ctx.closePath()
          ctx.fill()
        } else {
          const offsets = double ? [-11, 11] : [0]
          for (const offset of offsets) {
            ctx.beginPath()
            ctx.moveTo(offset, -18)
            ctx.lineTo(offset + 16, 4)
            ctx.lineTo(offset + 6, 4)
            ctx.lineTo(offset + 6, 18)
            ctx.lineTo(offset - 6, 18)
            ctx.lineTo(offset - 6, 4)
            ctx.lineTo(offset - 16, 4)
            ctx.closePath()
            ctx.fill()
          }
        }
        ctx.restore()
      }

      if (type === 'arrow-left') drawArrow(-90)
      else if (type === 'arrow-right') drawArrow(90)
      else if (type === 'turn-left') drawArrow(-90, true)
      else if (type === 'turn-right') drawArrow(90, true)
      else if (type === 'double') drawArrow(0, false, true)
      else drawArrow(0)
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.needsUpdate = true
    createMarkerTexture.cache.set(key, texture)
  }
  return createMarkerTexture.cache.get(key)
}
createMarkerTexture.cache = new Map()

class HotspotLayer {
  constructor(rotationRoot) {
    this.group = new THREE.Group()
    this.group.name = 'RuntimeHotspots'
    this.group.renderOrder = 2
    rotationRoot.add(this.group)
    this.vector = new THREE.Vector3()
    this.sprites = []
  }

  sync(hotspots) {
    for (const sprite of this.sprites) {
      this.group.remove(sprite)
      sprite.material.dispose()
    }
    this.sprites = []

    for (const hotspot of hotspots) {
      const material = new THREE.SpriteMaterial({
        map: createMarkerTexture(hotspot.visualType || 'floor'),
        transparent: true,
        depthTest: true,
        depthWrite: false,
      })
      const sprite = new THREE.Sprite(material)
      sprite.userData.hotspot = hotspot
      yawPitchToVector(hotspot.yaw, hotspot.pitch, this.vector)
      sprite.position.copy(this.vector.multiplyScalar(HOTSPOT_RADIUS))
      const isPin = hotspot.visualType === 'pin'
      sprite.scale.setScalar(isPin ? 28 : 22)
      sprite.renderOrder = 2
      this.group.add(sprite)
      this.sprites.push(sprite)
    }
  }

  getPickables() {
    return this.sprites
  }

  dispose() {
    this.sync([])
    this.group.parent?.remove(this.group)
  }
}

function yawPitchToVector(yawDeg, pitchDeg, target = new THREE.Vector3()) {
  const yaw = THREE.MathUtils.degToRad(yawDeg)
  const pitch = THREE.MathUtils.degToRad(pitchDeg)
  return target
    .set(
      Math.cos(pitch) * Math.sin(yaw),
      Math.sin(pitch),
      Math.cos(pitch) * Math.cos(yaw)
    )
    .normalize()
}

async function loadTextureMesh(textureUrl, renderer) {
  const loader = new THREE.TextureLoader()
  let texture
  try {
    texture = await loader.loadAsync(textureUrl)
  } catch (error) {
    throw new Error(
      `Failed to load panorama image "${textureUrl}".`
    )
  }
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.repeat.x = -1
  texture.offset.x = 1
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  return new THREE.Mesh(
    new THREE.SphereGeometry(PANORAMA_RADIUS, 64, 64),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide })
  )
}

async function bootstrap() {
  try {
    const response = await fetch('./runtime-project.json', { cache: 'no-store' })
    if (!response.ok) throw new Error('Failed to load runtime-project.json')
    const rawProject = await response.json()
    const project = normalizeProject(rawProject)
    const runtimeSkin = resolveRuntimeSkin({
      theme: project.skin.theme,
      branding: {
        position: project.skin.brandingPosition,
        showProjectTitle: project.skin.showProjectTitle,
        showOfficeBranding: project.skin.showOfficeBranding,
      },
      controls: {
        position: project.skin.controlBarPosition,
      },
    })
    applyRuntimeSkin(runtimeSkin, {
      brandingRoot: brandingEl,
      controlsBar,
      fullscreenBtn,
      resetViewBtn,
      zoomInBtn,
      zoomOutBtn,
    })
    applyProjectBranding(project.branding, project.skin)
    if (!viewerHost || project.scenes.length === 0) throw new Error('Project has no scenes.')

    const sceneMap = new Map(project.scenes.map((scene) => [scene.id, scene]))
    let currentScene = sceneMap.get(project.currentSceneId) ?? project.scenes[0]

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    viewerHost.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000)
    const rotationRoot = new THREE.Group()
    const pitchRoot = new THREE.Group()
    const yawRoot = new THREE.Group()
    scene.add(pitchRoot)
    pitchRoot.add(yawRoot)
    yawRoot.add(rotationRoot)

    const controls = new PanoramaControls(camera, renderer.domElement, pitchRoot, yawRoot, currentScene)
    const hotspotLayer = new HotspotLayer(rotationRoot)
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    let panoramaMesh = null
    let raf = 0
    let lastTime = performance.now()

    const applySize = () => {
      const width = Math.max(1, viewerHost.clientWidth)
      const height = Math.max(1, viewerHost.clientHeight)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    const activateScene = async (nextScene, viewOverride) => {
      clearError()
      showLoading('Loading panorama...')
      await setFade(true)
      controls.applyScene(nextScene)
      const mesh = await loadTextureMesh(nextScene.panoramaSrc, renderer)
      if (panoramaMesh) {
        rotationRoot.remove(panoramaMesh)
        panoramaMesh.material.map?.dispose()
        panoramaMesh.material.dispose()
        panoramaMesh.geometry.dispose()
      }
      panoramaMesh = mesh
      rotationRoot.add(mesh)
      controls.setYawPitch(
        THREE.MathUtils.degToRad(viewOverride?.yaw ?? nextScene.initialYaw),
        THREE.MathUtils.degToRad(viewOverride?.pitch ?? nextScene.initialPitch)
      )
      controls.setFov(viewOverride?.fov ?? nextScene.initialFov)
      hotspotLayer.sync(nextScene.hotspots)
      currentScene = nextScene
      await setFade(false)
      hideLoading()
    }

    const resetCurrentSceneView = () => {
      controls.setYawPitch(
        THREE.MathUtils.degToRad(currentScene.initialYaw),
        THREE.MathUtils.degToRad(currentScene.initialPitch)
      )
      controls.setFov(currentScene.initialFov)
    }

    const animate = (now) => {
      raf = requestAnimationFrame(animate)
      const delta = Math.min(0.1, (now - lastTime) / 1000)
      lastTime = now
      controls.tick(delta)
      renderer.render(scene, camera)
    }

    renderer.domElement.addEventListener('pointermove', (event) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(hotspotLayer.getPickables(), false)
      renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : ''
    })

    renderer.domElement.addEventListener('pointerdown', async (event) => {
      if (event.button !== 0) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(hotspotLayer.getPickables(), false)
      if (hits.length === 0) return
      const hotspot = hits[0].object.userData.hotspot
      const targetScene = sceneMap.get(hotspot.targetSceneId)
      if (!targetScene) return
      try {
        await activateScene(targetScene, {
          yaw: hotspot.targetYaw ?? targetScene.initialYaw,
          pitch: hotspot.targetPitch ?? targetScene.initialPitch,
          fov: hotspot.targetFov ?? targetScene.initialFov,
        })
      } catch (error) {
        hideLoading()
        showError(
          error instanceof Error ? error.message : 'Failed to change scene.'
        )
        console.error(error)
      }
    }, { capture: true })

    fullscreenBtn?.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen()
        } else {
          await viewerHost.requestFullscreen()
        }
      } catch (error) {
        console.error(error)
      } finally {
        updateFullscreenButton()
      }
    })

    resetViewBtn?.addEventListener('click', () => {
      resetCurrentSceneView()
    })

    zoomInBtn?.addEventListener('click', () => {
      controls.setFov(controls.getViewState().fov - 8)
    })

    zoomOutBtn?.addEventListener('click', () => {
      controls.setFov(controls.getViewState().fov + 8)
    })

    document.addEventListener('fullscreenchange', updateFullscreenButton)

    const resizeObserver = new ResizeObserver(() => applySize())
    resizeObserver.observe(viewerHost)
    window.addEventListener('resize', applySize)
    applySize()
    updateFullscreenButton()
    await activateScene(currentScene)
    raf = requestAnimationFrame(animate)

    window.addEventListener('beforeunload', () => {
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      window.removeEventListener('resize', applySize)
      document.removeEventListener('fullscreenchange', updateFullscreenButton)
      controls.dispose()
      hotspotLayer.dispose()
      if (panoramaMesh) {
        panoramaMesh.material.map?.dispose()
        panoramaMesh.material.dispose()
        panoramaMesh.geometry.dispose()
      }
      renderer.dispose()
    }, { once: true })
  } catch (error) {
    hideLoading()
    showError(error instanceof Error ? error.message : 'Failed to load runtime.')
    console.error(error)
  }
}

bootstrap()
