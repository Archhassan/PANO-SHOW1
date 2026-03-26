import * as THREE from './three.module.js'

const textureCache = new Map()

function createTexture(key, draw) {
  const existing = textureCache.get(key)
  if (existing) return existing

  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  draw(ctx, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  textureCache.set(key, texture)
  return texture
}

function drawGroundShadow(ctx, cx, cy, rx, ry) {
  const shadowGradient = ctx.createRadialGradient(cx, cy + 10, 8, cx, cy + 10, rx + 14)
  shadowGradient.addColorStop(0, 'rgba(0,0,0,0.18)')
  shadowGradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = shadowGradient
  ctx.beginPath()
  ctx.ellipse(cx, cy + 10, rx + 8, ry + 4, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawGroundGlow(ctx, cx, cy, rx, ry, color) {
  const glowGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx + 12)
  glowGradient.addColorStop(0, color)
  glowGradient.addColorStop(0.55, color.replace(/[\d.]+\)$/, '0.12)'))
  glowGradient.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'))
  ctx.fillStyle = glowGradient
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx + 6, ry + 5, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawEllipseBase(ctx, cx, cy, rx, ry, fillStyle) {
  ctx.fillStyle = fillStyle
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = 'rgba(22,24,30,0.94)'
  ctx.stroke()
}

function drawArrowSymbol(ctx, cx, cy, rotationDeg, curved = false, double = false) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(THREE.MathUtils.degToRad(rotationDeg))
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 8
  ctx.strokeStyle = 'rgba(16,18,24,0.95)'
  ctx.fillStyle = 'rgba(16,18,24,0.95)'
  if (curved) {
    ctx.beginPath()
    ctx.arc(0, 4, 18, Math.PI * 0.1, Math.PI * 1.2, rotationDeg < 0)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(double ? -2 : 2, -20)
    ctx.lineTo(18, -16)
    ctx.lineTo(7, -2)
    ctx.closePath()
    ctx.fill()
  } else {
    const arrows = double ? [-11, 11] : [0]
    for (const offset of arrows) {
      ctx.beginPath()
      ctx.moveTo(offset, -20)
      ctx.lineTo(offset + 18, 6)
      ctx.lineTo(offset + 7, 6)
      ctx.lineTo(offset + 7, 22)
      ctx.lineTo(offset - 7, 22)
      ctx.lineTo(offset - 7, 6)
      ctx.lineTo(offset - 18, 6)
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.restore()
}

function drawInfoSymbol(ctx, cx, cy) {
  ctx.fillStyle = 'rgba(16,18,24,0.95)'
  ctx.beginPath()
  ctx.arc(cx, cy - 16, 4.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(16,18,24,0.95)'
  ctx.beginPath()
  ctx.moveTo(cx, cy - 4)
  ctx.lineTo(cx, cy + 18)
  ctx.stroke()
}

function drawPinSymbol(ctx, cx, cy) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.fillStyle = 'rgba(16,18,24,0.95)'
  ctx.beginPath()
  ctx.moveTo(0, 26)
  ctx.bezierCurveTo(18, 10, 18, -20, 0, -20)
  ctx.bezierCurveTo(-18, -20, -18, 10, 0, 26)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.beginPath()
  ctx.arc(0, -2, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function createFloorBaseTexture() {
  return createTexture('base:floor', (ctx, size) => {
    const cx = size / 2
    const cy = size / 2
    drawGroundShadow(ctx, cx, cy, 34, 21)
    drawGroundGlow(ctx, cx, cy, 34, 21, 'rgba(255,245,196,0.26)')
    const fillGradient = ctx.createRadialGradient(cx, cy - 5, 4, cx, cy, 34)
    fillGradient.addColorStop(0, 'rgba(255,255,255,1)')
    fillGradient.addColorStop(0.58, 'rgba(255,247,214,0.98)')
    fillGradient.addColorStop(1, 'rgba(241,229,188,0.96)')
    drawEllipseBase(ctx, cx, cy, 34, 21, fillGradient)
    ctx.fillStyle = 'rgba(24,26,34,0.94)'
    ctx.beginPath()
    ctx.arc(cx, cy, 5, 0, Math.PI * 2)
    ctx.fill()
  })
}

function createDirectionalBaseTexture(type) {
  return createTexture(`base:${type}`, (ctx, size) => {
    const cx = size / 2
    const cy = size / 2
    drawGroundShadow(ctx, cx, cy, 32, 20)
    drawGroundGlow(ctx, cx, cy, 32, 20, 'rgba(255,235,170,0.24)')
    const fillGradient = ctx.createRadialGradient(cx, cy - 4, 4, cx, cy, 34)
    fillGradient.addColorStop(0, 'rgba(255,255,255,1)')
    fillGradient.addColorStop(0.6, 'rgba(255,248,220,0.98)')
    fillGradient.addColorStop(1, 'rgba(242,224,170,0.94)')
    drawEllipseBase(ctx, cx, cy, 32, 20, fillGradient)

    if (type === 'arrow-forward') drawArrowSymbol(ctx, cx, cy, 0)
    if (type === 'arrow-left') drawArrowSymbol(ctx, cx, cy, -90)
    if (type === 'arrow-right') drawArrowSymbol(ctx, cx, cy, 90)
    if (type === 'turn-left') drawArrowSymbol(ctx, cx, cy, -90, true)
    if (type === 'turn-right') drawArrowSymbol(ctx, cx, cy, 90, true)
    if (type === 'double') drawArrowSymbol(ctx, cx, cy, 0, false, true)
  })
}

function createInfoBaseTexture() {
  return createTexture('base:info', (ctx, size) => {
    const cx = size / 2
    const cy = size / 2
    drawGroundShadow(ctx, cx, cy, 28, 20)
    drawGroundGlow(ctx, cx, cy, 28, 20, 'rgba(136,206,255,0.22)')
    const fillGradient = ctx.createRadialGradient(cx, cy - 6, 4, cx, cy, 30)
    fillGradient.addColorStop(0, 'rgba(255,255,255,1)')
    fillGradient.addColorStop(0.6, 'rgba(225,244,255,0.98)')
    fillGradient.addColorStop(1, 'rgba(176,222,252,0.95)')
    drawEllipseBase(ctx, cx, cy, 28, 20, fillGradient)
    drawInfoSymbol(ctx, cx, cy)
  })
}

function createPinBaseTexture() {
  return createTexture('base:pin', (ctx, size) => {
    const cx = size / 2
    const cy = size / 2 + 2
    drawGroundShadow(ctx, cx, cy + 10, 22, 16)
    drawGroundGlow(ctx, cx, cy - 4, 22, 16, 'rgba(255,205,132,0.22)')
    drawPinSymbol(ctx, cx, cy)
  })
}

function createPulseTexture(type) {
  return createTexture(`pulse:${type}`, (ctx, size) => {
    const cx = size / 2
    const cy = size / 2
    ctx.clearRect(0, 0, size, size)
    ctx.lineWidth = type === 'info' ? 3 : 4
    ctx.strokeStyle =
      type === 'info'
        ? 'rgba(120,205,255,0.75)'
        : type === 'pin'
          ? 'rgba(255,208,142,0.72)'
          : 'rgba(255,255,255,0.78)'
    ctx.beginPath()
    ctx.ellipse(cx, cy, 42, 24, 0, 0, Math.PI * 2)
    ctx.stroke()
  })
}

export function getHotspotVisualDefinition(type) {
  switch (type) {
    case 'floor':
      return {
        width: 46,
        height: 23,
        pulse: true,
        innerPulseScale: 0.2,
        outerPulseScale: 0.5,
        outerPulseOpacity: 0.6,
      }
    case 'info':
      return {
        width: 40,
        height: 28,
        pulse: false,
        innerPulseScale: 0.08,
        outerPulseScale: 0,
        outerPulseOpacity: 0,
      }
    case 'pin':
      return {
        width: 36,
        height: 42,
        pulse: false,
        innerPulseScale: 0.06,
        outerPulseScale: 0,
        outerPulseOpacity: 0,
      }
    default:
      return {
        width: 44,
        height: 24,
        pulse: true,
        innerPulseScale: 0.16,
        outerPulseScale: 0.38,
        outerPulseOpacity: 0.42,
      }
  }
}

export function getHotspotBaseTexture(type) {
  switch (type) {
    case 'floor':
      return createFloorBaseTexture()
    case 'info':
      return createInfoBaseTexture()
    case 'pin':
      return createPinBaseTexture()
    default:
      return createDirectionalBaseTexture(type)
  }
}

export function getHotspotPulseTexture(type) {
  return createPulseTexture(type)
}
