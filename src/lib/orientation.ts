import type { OrientationReading, OrientationTarget } from '../config/types'

type OrientationListener = (reading: OrientationReading) => void

export type SensorSource = 'orientation' | 'motion' | null

interface DeviceOrientationEventConstructorWithPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

const ORIENTATION_EVENTS = ['deviceorientation', 'deviceorientationabsolute'] as const
const MOTION_EVENT = 'devicemotion' as const
type OrientationEventName = (typeof ORIENTATION_EVENTS)[number] | typeof MOTION_EVENT
const ORIENTATION_STALE_MS = 900

function hasUsableAngles(reading: OrientationReading): boolean {
  return reading.beta !== null && reading.gamma !== null
}

function deriveReadingFromMotion(event: DeviceMotionEvent): OrientationReading | null {
  const gravity = event.accelerationIncludingGravity
  if (!gravity) {
    return null
  }

  const x = gravity.x ?? null
  const y = gravity.y ?? null
  const z = gravity.z ?? null
  if (x === null || y === null || z === null) {
    return null
  }

  // Accelerometer fallback when deviceorientation is unavailable.
  // Uses gravity vector (tilt), not gyro integration — feels slightly different from iOS gyro.
  const beta = (Math.atan2(-x, Math.hypot(y, z)) * 180) / Math.PI
  const gamma = (Math.atan2(y, Math.hypot(x, z)) * 180) / Math.PI
  return { beta, gamma, alpha: null }
}

export class OrientationManager {
  private listener: OrientationListener | null = null
  private lastEvent: OrientationEventName | null = null
  private lastReadingMs: number | null = null
  private lastOrientationMs: number | null = null
  private source: SensorSource = null
  private handlers: Partial<Record<OrientationEventName, (event: DeviceOrientationEvent) => void>> =
    {}

  get isSecureContext(): boolean {
    return window.isSecureContext
  }

  get lastEventName(): OrientationEventName | null {
    return this.lastEvent
  }

  get lastReadingAtMs(): number | null {
    return this.lastReadingMs
  }

  get sensorSource(): SensorSource {
    return this.source
  }

  async requestAccess(): Promise<boolean> {
    const DeviceOrientation = DeviceOrientationEvent as unknown as DeviceOrientationEventConstructorWithPermission

    if (typeof DeviceOrientation.requestPermission === 'function') {
      const result = await DeviceOrientation.requestPermission()
      if (result !== 'granted') {
        return false
      }
    }

    return this.waitForFirstReading(5000)
  }

  start(listener: OrientationListener): void {
    this.listener = listener
    for (const eventName of ORIENTATION_EVENTS) {
      const handler = (event: DeviceOrientationEvent) => {
        const reading: OrientationReading = {
          beta: event.beta,
          gamma: event.gamma,
          alpha: event.alpha,
        }
        if (!hasUsableAngles(reading)) {
          return
        }

        this.lastEvent = eventName
        this.lastReadingMs = Date.now()
        this.lastOrientationMs = this.lastReadingMs
        this.source = 'orientation'
        this.listener?.(reading)
      }
      this.handlers[eventName] = handler
      window.addEventListener(eventName, handler as EventListener)
    }

    const motionHandler = (event: DeviceMotionEvent) => {
      const now = Date.now()
      const orientationIsFresh =
        this.lastOrientationMs !== null && now - this.lastOrientationMs < ORIENTATION_STALE_MS
      if (orientationIsFresh) {
        return
      }

      const reading = deriveReadingFromMotion(event)
      if (!reading) {
        return
      }

      this.lastEvent = MOTION_EVENT
      this.lastReadingMs = now
      this.source = 'motion'
      this.listener?.(reading)
    }
    this.handlers[MOTION_EVENT] = motionHandler as unknown as (event: DeviceOrientationEvent) => void
    window.addEventListener(MOTION_EVENT, motionHandler as EventListener)
  }

  stop(): void {
    for (const eventName of [...ORIENTATION_EVENTS, MOTION_EVENT] as const) {
      const handler = this.handlers[eventName]
      if (handler) {
        window.removeEventListener(eventName, handler as EventListener)
      }
    }
    this.listener = null
    this.handlers = {}
    this.source = null
    this.lastOrientationMs = null
  }

  private waitForFirstReading(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let resolved = false

      const handler = (event: DeviceOrientationEvent) => {
        if (event.beta === null && event.gamma === null && event.alpha === null) {
          return
        }
        if (resolved) {
          return
        }
        resolved = true
        for (const eventName of ORIENTATION_EVENTS) {
          window.removeEventListener(eventName, handler as EventListener)
        }
        window.removeEventListener(MOTION_EVENT, motionHandler as EventListener)
        clearTimeout(timer)
        resolve(true)
      }

      const motionHandler = (event: DeviceMotionEvent) => {
        if (resolved) {
          return
        }
        if (!deriveReadingFromMotion(event)) {
          return
        }
        resolved = true
        for (const eventName of ORIENTATION_EVENTS) {
          window.removeEventListener(eventName, handler as EventListener)
        }
        window.removeEventListener(MOTION_EVENT, motionHandler as EventListener)
        clearTimeout(timer)
        resolve(true)
      }

      const timer = window.setTimeout(() => {
        if (resolved) {
          return
        }
        resolved = true
        for (const eventName of ORIENTATION_EVENTS) {
          window.removeEventListener(eventName, handler as EventListener)
        }
        window.removeEventListener(MOTION_EVENT, motionHandler as EventListener)
        resolve(false)
      }, timeoutMs)

      for (const eventName of ORIENTATION_EVENTS) {
        window.addEventListener(eventName, handler as EventListener)
      }
      window.addEventListener(MOTION_EVENT, motionHandler as EventListener)
    })
  }
}

/** Shortest signed difference between two angles in degrees. */
export function normalizeAngleDelta(reading: number, target: number): number {
  let delta = reading - target
  while (delta > 180) {
    delta -= 360
  }
  while (delta < -180) {
    delta += 360
  }
  return delta
}

export function angularDistance(
  reading: OrientationReading,
  target: OrientationTarget,
): number | null {
  if (reading.beta === null || reading.gamma === null) {
    return null
  }

  const betaDelta = normalizeAngleDelta(reading.beta, target.beta)
  const gammaDelta = normalizeAngleDelta(reading.gamma, target.gamma)
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

export interface TiltHintSideState {
  /** 0–1 scales arrow size; farther from target on this axis → larger. */
  strength: number
  /** This axis (up/down or left/right) is aligned with the target. */
  locked: boolean
}

export interface TiltHintsState {
  top: TiltHintSideState
  right: TiltHintSideState
  bottom: TiltHintSideState
  left: TiltHintSideState
}

const EMPTY_SIDE: TiltHintSideState = { strength: 0, locked: false }

/** True for Android phones/tablets (accel fallback uses inverted tilt axes). */
export function isAndroidDevice(): boolean {
  return /android/i.test(navigator.userAgent)
}

export type TiltHintSide = keyof TiltHintsState

const TILT_LABELS: Record<TiltHintSide, string> = {
  top: 'Tilt up',
  bottom: 'Tilt down',
  left: 'Tilt left',
  right: 'Tilt right',
}

/** Label for each screen edge; position never changes (Android only inverts which hint lights up). */
export function tiltHintLabel(side: TiltHintSide): string {
  return TILT_LABELS[side]
}

/** Swap edge hints — used when accelerometer tilt axes are inverted vs iOS gyro. */
export function invertTiltHintState(state: TiltHintsState): TiltHintsState {
  const betaLocked = state.top.locked || state.bottom.locked
  const gammaLocked = state.left.locked || state.right.locked
  return {
    top: { strength: state.bottom.strength, locked: betaLocked },
    bottom: { strength: state.top.strength, locked: betaLocked },
    left: { strength: state.right.strength, locked: gammaLocked },
    right: { strength: state.left.strength, locked: gammaLocked },
  }
}

const MIN_HINT_DELTA_DEG = 2
const AXIS_LOCK_DEG = 5

/** Farther from target → higher strength (bigger arrow). */
function directionalStrength(delta: number, tolerance: number): number {
  const magnitude = Math.abs(delta)
  if (magnitude <= MIN_HINT_DELTA_DEG) {
    return 0
  }

  const t = Math.min(1, magnitude / Math.max(tolerance, 1))
  return 0.35 + 0.65 * t
}

/**
 * Edge arrows show which way to lean the phone (not the correction vector).
 * Up arrow → tilt the top of the phone toward the top of the screen / ceiling.
 */
export function computeTiltHintState(
  reading: OrientationReading,
  target: OrientationTarget,
  tolerance: number,
): TiltHintsState {
  if (reading.beta === null || reading.gamma === null) {
    return {
      top: { ...EMPTY_SIDE },
      right: { ...EMPTY_SIDE },
      bottom: { ...EMPTY_SIDE },
      left: { ...EMPTY_SIDE },
    }
  }

  const betaCorrection = normalizeAngleDelta(target.beta, reading.beta)
  const gammaCorrection = normalizeAngleDelta(target.gamma, reading.gamma)
  const lockThreshold = Math.max(AXIS_LOCK_DEG, tolerance * 0.1)
  const betaLocked = Math.abs(betaCorrection) <= lockThreshold
  const gammaLocked = Math.abs(gammaCorrection) <= lockThreshold

  return {
    top: {
      strength:
        betaLocked || betaCorrection >= -MIN_HINT_DELTA_DEG
          ? 0
          : directionalStrength(betaCorrection, tolerance),
      locked: betaLocked,
    },
    bottom: {
      strength:
        betaLocked || betaCorrection <= MIN_HINT_DELTA_DEG
          ? 0
          : directionalStrength(betaCorrection, tolerance),
      locked: betaLocked,
    },
    left: {
      strength:
        gammaLocked || gammaCorrection >= -MIN_HINT_DELTA_DEG
          ? 0
          : directionalStrength(gammaCorrection, tolerance),
      locked: gammaLocked,
    },
    right: {
      strength:
        gammaLocked || gammaCorrection <= MIN_HINT_DELTA_DEG
          ? 0
          : directionalStrength(gammaCorrection, tolerance),
      locked: gammaLocked,
    },
  }
}
