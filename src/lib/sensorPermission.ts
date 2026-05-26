const STORAGE_KEY = 'emrot-lots-phone:sensors-granted'

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }

  const ua = navigator.userAgent
  return (
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function needsMotionPermissionPrompt(): boolean {
  if (!isIOSDevice()) {
    return false
  }

  const DeviceOrientation = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>
  }
  const DeviceMotion = DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>
  }

  return (
    typeof DeviceOrientation.requestPermission === 'function' ||
    typeof DeviceMotion.requestPermission === 'function'
  )
}

export function hasStoredSensorGrant(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function markStoredSensorGrant(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // Private browsing or storage blocked — permission still works this session.
  }
}

export function clearStoredSensorGrant(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore.
  }
}
