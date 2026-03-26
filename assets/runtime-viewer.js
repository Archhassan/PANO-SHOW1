import * as THREE from './three.module.js'
import { applyRuntimeSkin, resolveRuntimeSkin } from './runtime-skin.js'
import {
  getHotspotBaseTexture,
  getHotspotPulseTexture,
  getHotspotVisualDefinition,
} from './runtime-hotspot-visuals.js'

const PANORAMA_RADIUS = 500
const HOTSPOT_RADIUS = PANORAMA_RADIUS - 4
const DEFAULT_MIN_PITCH = THREE.MathUtils.degToRad(-88)
const DEFAULT_MAX_PITCH = THREE.MathUtils.degToRad(88)
const SCALE_MULTIPLIER = 1.8
const WORLD_UP = new THREE.Vector3(0, 1, 0)
const WORLD_RIGHT = new THREE.Vector3(1, 0, 0)
const INNER_PULSE_DURATION_MS = 800
const OUTER_PULSE_DURATION_MS = 1800
const OUTER_PULSE_DELAY_MS = 300
let sharedPlaneGeometry = null

function getPlaneGeometry() {
  if (!sharedPlaneGeometry) {
    sharedPlaneGeometry = new THREE.PlaneGeometry(1, 1)
  }
  return sharedPlaneGeometry
}

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
        ...hotspot,
        visualType: hotspot.visualType ?? 'floor',
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

function easeInOutSine(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2
}

function loop01(nowMs, durationMs, delayMs = 0) {
  const shifted = nowMs - delayMs
  const normalized = ((shifted % durationMs) + durationMs) % durationMs
  return normalized / durationMs
}

class HotspotLayer {
  constructor(rotationRoot) {
    this.group = new THREE.Group()
    this.group.name = 'RuntimeHotspots'
    this.group.renderOrder = 2
    rotationRoot.add(this.group)
    this.vector = new THREE.Vector3()
    this.inward = new THREE.Vector3()
    this.tangentUp = new THREE.Vector3()
    this.tangentRight = new THREE.Vector3()
    this.tangentMatrix = new THREE.Matrix4()
    this.markers = []
    this.animate = this.animate.bind(this)
    this.raf = requestAnimationFrame(this.animate)
  }

  sync(hotspots) {
    for (const marker of this.markers) {
      this.group.remove(marker.root)
      marker.baseMesh.material.dispose()
      marker.pulseMesh.material.dispose()
    }
    this.markers = []

    for (const hotspot of hotspots) {
      const visualType = hotspot.visualType || 'floor'
      const visual = getHotspotVisualDefinition(visualType)
      const root = new THREE.Group()
      yawPitchToVector(hotspot.yaw, hotspot.pitch, this.vector)
      root.position.copy(this.vector.multiplyScalar(HOTSPOT_RADIUS))

      this.inward.copy(root.position).normalize().multiplyScalar(-1)
      this.tangentUp.copy(WORLD_UP).projectOnPlane(this.inward)
      if (this.tangentUp.lengthSq() < 1e-6) {
        this.tangentUp.copy(WORLD_RIGHT).projectOnPlane(this.inward)
      }
      this.tangentUp.normalize()
      this.tangentRight.crossVectors(this.tangentUp, this.inward).normalize()
      this.tangentMatrix.makeBasis(this.tangentRight, this.tangentUp, this.inward)
      root.setRotationFromMatrix(this.tangentMatrix)

      const baseMesh = new THREE.Mesh(
        getPlaneGeometry(),
        new THREE.MeshBasicMaterial({
          map: getHotspotBaseTexture(visualType),
          transparent: true,
          depthTest: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      )
      baseMesh.userData.hotspot = hotspot
      baseMesh.renderOrder = 2

      const pulseMesh = new THREE.Mesh(
        getPlaneGeometry(),
        new THREE.MeshBasicMaterial({
          map: getHotspotPulseTexture(visualType),
          transparent: true,
          depthTest: true,
          depthWrite: false,
          opacity: visual.pulse ? visual.outerPulseOpacity : 0,
          side: THREE.DoubleSide,
        })
      )
      pulseMesh.userData.hotspot = hotspot
      pulseMesh.position.z = -0.01
      pulseMesh.visible = visual.pulse
      pulseMesh.renderOrder = 1

      root.add(pulseMesh)
      root.add(baseMesh)
      root.scale.set(
        visual.width * SCALE_MULTIPLIER,
        visual.height * SCALE_MULTIPLIER,
        1
      )
      this.group.add(root)
      this.markers.push({
        root,
        baseMesh,
        pulseMesh,
        pulseEnabled: visual.pulse,
        innerPulseScale: visual.innerPulseScale,
        outerPulseScale: visual.outerPulseScale,
        outerPulseOpacity: visual.outerPulseOpacity,
      })
    }
  }

  getPickables() {
    return this.markers.flatMap((marker) => [marker.baseMesh, marker.pulseMesh])
  }

  animate(now) {
    this.raf = requestAnimationFrame(this.animate)
    for (const marker of this.markers) {
      const innerPulsePhase = loop01(now, INNER_PULSE_DURATION_MS)
      const innerPulseValue = easeInOutSine(
        innerPulsePhase <= 0.5 ? innerPulsePhase * 2 : (1 - innerPulsePhase) * 2
      )
      const innerScale = 1 + innerPulseValue * marker.innerPulseScale
      marker.baseMesh.scale.set(innerScale, innerScale, 1)

      if (marker.pulseEnabled) {
        const outerPulsePhase = loop01(now, OUTER_PULSE_DURATION_MS, OUTER_PULSE_DELAY_MS)
        const outerPulseValue = easeInOutSine(outerPulsePhase)
        const outerScale = 1 + outerPulseValue * marker.outerPulseScale
        marker.pulseMesh.scale.set(outerScale, outerScale, 1)
        marker.pulseMesh.material.opacity = THREE.MathUtils.lerp(
          marker.outerPulseOpacity,
          0,
          outerPulseValue
        )
      }
    }
  }

  dispose() {
    this.sync([])
    cancelAnimationFrame(this.raf)
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
