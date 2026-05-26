/** Matches reveal fade tail so haptics begin as the car starts appearing. */
const FADE_TAIL_RATIO = 1.6

const MIN_PROXIMITY = 0.1

export function isHapticsAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

export class ProximityHaptics {
  private lastPulseAt = 0

  reset(): void {
    this.lastPulseAt = 0
    this.cancel()
  }

  cancel(): void {
    if (isHapticsAvailable()) {
      navigator.vibrate(0)
    }
  }

  /**
   * Pulse more often and longer as the phone nears the target angle.
   * Strongest in the narrow number zone when present.
   */
  update(
    distance: number | null,
    carTolerance: number,
    numberTolerance?: number,
    options: { locked?: boolean; active?: boolean } = {},
  ): void {
    if (!isHapticsAvailable() || options.locked || options.active === false) {
      return
    }

    if (distance === null) {
      return
    }

    const outer = carTolerance * FADE_TAIL_RATIO
    if (distance > outer) {
      return
    }

    let proximity = Math.max(0, 1 - distance / carTolerance)

    if (numberTolerance !== undefined && distance <= carTolerance) {
      const numberProximity = Math.max(0, 1 - distance / numberTolerance)
      proximity = Math.max(proximity, numberProximity)
    }

    if (proximity < MIN_PROXIMITY) {
      return
    }

    const now = performance.now()
    const intervalMs = 200 - proximity * 145
    if (now - this.lastPulseAt < intervalMs) {
      return
    }

    const durationMs = Math.round(12 + proximity * 42)
    navigator.vibrate(durationMs)
    this.lastPulseAt = now
  }

  /** Short pattern when a hidden digit locks in. */
  success(): void {
    if (!isHapticsAvailable()) {
      return
    }
    navigator.vibrate([30, 50, 70])
    this.lastPulseAt = performance.now()
  }
}
