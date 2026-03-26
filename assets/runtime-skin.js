const defaultRuntimeSkin = {
  branding: {
    position: 'top-left',
    showProjectTitle: true,
    showOfficeBranding: true,
  },
  controls: {
    position: 'top-right',
    showFullscreen: true,
    showReset: true,
    showZoomIn: true,
    showZoomOut: true,
  },
  colors: {
    background: '#090b10',
    buttonBackground: 'rgba(17, 20, 28, 0.8)',
    buttonText: '#f4f2ff',
    buttonBorder: 'rgba(255, 255, 255, 0.14)',
    buttonHoverBackground: 'rgba(30, 36, 50, 0.92)',
    brandingBackground: 'rgba(15, 18, 26, 0.76)',
    brandingText: '#f7f5ff',
    brandingMuted: 'rgba(233, 228, 246, 0.8)',
  },
}

function normalizePosition(position) {
  const allowed = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
  return allowed.has(position) ? position : defaultRuntimeSkin.controls.position
}

function normalizeBrandingPosition(position) {
  const allowed = new Set(['top-left', 'top-right', 'top-center'])
  return allowed.has(position) ? position : defaultRuntimeSkin.branding.position
}

export function resolveRuntimeSkin(customSkin = globalThis.RUNTIME_SKIN) {
  const theme = customSkin?.theme === 'light' ? 'light' : 'dark'
  const colors =
    theme === 'light'
      ? {
          background: '#eef2f7',
          buttonBackground: 'rgba(255, 255, 255, 0.86)',
          buttonText: '#17202c',
          buttonBorder: 'rgba(23, 32, 44, 0.14)',
          buttonHoverBackground: 'rgba(244, 248, 252, 0.98)',
          brandingBackground: 'rgba(255, 255, 255, 0.84)',
          brandingText: '#17202c',
          brandingMuted: 'rgba(23, 32, 44, 0.68)',
        }
      : defaultRuntimeSkin.colors

  return {
    theme,
    branding: {
      ...defaultRuntimeSkin.branding,
      ...(customSkin?.branding ?? {}),
      position: normalizeBrandingPosition(customSkin?.branding?.position),
    },
    controls: {
      ...defaultRuntimeSkin.controls,
      ...(customSkin?.controls ?? {}),
      position: normalizePosition(customSkin?.controls?.position),
    },
    colors: {
      ...colors,
      ...(customSkin?.colors ?? {}),
    },
  }
}

export function applyRuntimeSkin(skin, elements) {
  const root = document.documentElement
  root.style.setProperty('--runtime-background', skin.colors.background)
  root.style.setProperty('--runtime-button-bg', skin.colors.buttonBackground)
  root.style.setProperty('--runtime-button-text', skin.colors.buttonText)
  root.style.setProperty('--runtime-button-border', skin.colors.buttonBorder)
  root.style.setProperty('--runtime-button-hover-bg', skin.colors.buttonHoverBackground)
  root.style.setProperty('--runtime-branding-bg', skin.colors.brandingBackground)
  root.style.setProperty('--runtime-branding-text', skin.colors.brandingText)
  root.style.setProperty('--runtime-branding-muted', skin.colors.brandingMuted)

  elements.controlsBar?.setAttribute('data-position', skin.controls.position)
  elements.brandingRoot?.setAttribute('data-position', skin.branding.position)
  if (elements.fullscreenBtn) elements.fullscreenBtn.hidden = !skin.controls.showFullscreen
  if (elements.resetViewBtn) elements.resetViewBtn.hidden = !skin.controls.showReset
  if (elements.zoomInBtn) elements.zoomInBtn.hidden = !skin.controls.showZoomIn
  if (elements.zoomOutBtn) elements.zoomOutBtn.hidden = !skin.controls.showZoomOut
}

export { defaultRuntimeSkin }
