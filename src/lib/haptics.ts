/** Matches reveal fade tail so haptics begin as the car starts appearing. */
const FADE_TAIL_RATIO = 1.6

const MIN_PROXIMITY = 0.1

export function isVibrationAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

/** iOS 17.4+ Safari — hidden switch toggle triggers the Taptic Engine. */
export function isIosHapticAvailable(): boolean {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') {
    return false
  }

  const ua = navigator.userAgent
  const isAppleMobile =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  return isAppleMobile
}

export function isHapticsAvailable(): boolean {
  return isVibrationAvailable() || isIosHapticAvailable()
}

let iosSwitchInput: HTMLInputElement | null = null

function iosHapticTick(): void {
  if (!isIosHapticAvailable()) {
    return
  }

  if (!iosSwitchInput) {
    const label = document.createElement('label')
    label.setAttribute('aria-hidden', 'true')
    label.style.cssText =
      'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;'

    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    label.appendChild(input)
    document.body.appendChild(label)
    iosSwitchInput = input
  }

  iosSwitchInput.checked = !iosSwitchInput.checked
}

function iosPulseBurst(count: number, gapMs: number): void {
  for (let i = 0; i < count; i++) {
    window.setTimeout(() => iosHapticTick(), i * gapMs)
  }
}

export class ProximityHaptics {
  private lastPulseAt = 0

  reset(): void {
    this.lastPulseAt = 0
    this.cancel()
  }

  cancel(): void {
    if (isVibrationAvailable()) {
      navigator.vibrate(0)
    }
  }

  /**
   * Pulse more often as the phone nears the target (Android: longer pulses too).
   * iOS uses the switch hack — intensity is fixed, frequency increases with proximity.
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

    if (isVibrationAvailable()) {
      const durationMs = Math.round(12 + proximity * 42)
      navigator.vibrate(durationMs)
    } else {
      iosHapticTick()
    }

    this.lastPulseAt = now
  }

  /** Short pattern when a hidden digit locks in. */
  success(): void {
    if (isVibrationAvailable()) {
      navigator.vibrate([30, 50, 70])
    } else if (isIosHapticAvailable()) {
      iosPulseBurst(3, 55)
    }
    this.lastPulseAt = performance.now()
  }
}
