import type { OrientationReading, OrientationTarget } from '../config/types'

type OrientationListener = (reading: OrientationReading) => void

interface DeviceOrientationEventConstructorWithPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

export class OrientationManager {
  private listener: OrientationListener | null = null
  private boundHandler = (event: DeviceOrientationEvent) => {
    this.listener?.({
      beta: event.beta,
      gamma: event.gamma,
      alpha: event.alpha,
    })
  }

  get isSecureContext(): boolean {
    return window.isSecureContext
  }

  async requestAccess(): Promise<boolean> {
    const DeviceOrientation = DeviceOrientationEvent as unknown as DeviceOrientationEventConstructorWithPermission

    if (typeof DeviceOrientation.requestPermission === 'function') {
      const result = await DeviceOrientation.requestPermission()
      if (result !== 'granted') {
        return false
      }
    }

    return this.waitForFirstReading(3000)
  }

  start(listener: OrientationListener): void {
    this.listener = listener
    window.addEventListener('deviceorientation', this.boundHandler)
  }

  stop(): void {
    window.removeEventListener('deviceorientation', this.boundHandler)
    this.listener = null
  }

  private waitForFirstReading(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let resolved = false

      const handler = (event: DeviceOrientationEvent) => {
        if (event.beta === null && event.gamma === null) {
          return
        }
        if (resolved) {
          return
        }
        resolved = true
        window.removeEventListener('deviceorientation', handler)
        clearTimeout(timer)
        resolve(true)
      }

      const timer = window.setTimeout(() => {
        if (resolved) {
          return
        }
        resolved = true
        window.removeEventListener('deviceorientation', handler)
        resolve(false)
      }, timeoutMs)

      window.addEventListener('deviceorientation', handler)
    })
  }
}

export function angularDistance(
  reading: OrientationReading,
  target: OrientationTarget,
): number | null {
  if (reading.beta === null || reading.gamma === null) {
    return null
  }

  const betaDelta = reading.beta - target.beta
  const gammaDelta = reading.gamma - target.gamma
  return Math.sqrt(betaDelta * betaDelta + gammaDelta * gammaDelta)
}

export function formatOrientation(reading: OrientationReading): string {
  const beta = reading.beta === null ? '—' : reading.beta.toFixed(1)
  const gamma = reading.gamma === null ? '—' : reading.gamma.toFixed(1)
  return `beta: ${beta}°  gamma: ${gamma}°`
}

export function formatTarget(target: OrientationTarget): string {
  return `{ beta: ${target.beta}, gamma: ${target.gamma} }`
}
