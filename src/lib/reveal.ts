import type { OrientationReading, OrientationTarget } from '../config/types'
import { angularDistance } from './orientation'

export const FOUND_OPACITY_THRESHOLD = 0.9

/** Visibility at the outer edge of the wide car zone (keeps dark photos from looking “off”). */
const CAR_EDGE_OPACITY = 0.38

export interface DualRevealOpacities {
  car: number
  number: number
  distance: number | null
}

export function opacityFromDistance(distance: number | null, tolerance: number): number {
  if (distance === null) {
    return 0
  }

  if (distance > tolerance) {
    return 0
  }

  return 1 - distance / tolerance
}

export function isDigitFound(opacity: number): boolean {
  return opacity >= FOUND_OPACITY_THRESHOLD
}

export function computeRevealOpacity(
  reading: OrientationReading,
  target: OrientationTarget,
  tolerance: number,
): number {
  const distance = angularDistance(reading, target)
  return opacityFromDistance(distance, tolerance)
}

/**
 * Car fades in across the wide zone and reaches 100% at the inner (number) edge.
 * Number still uses the narrow tolerance on top.
 */
export function carOpacityFromDistance(
  distance: number | null,
  carTolerance: number,
  numberTolerance?: number,
): number {
  if (distance === null || distance > carTolerance) {
    return 0
  }

  if (numberTolerance === undefined) {
    return opacityFromDistance(distance, carTolerance)
  }

  if (distance <= numberTolerance) {
    return 1
  }

  const span = carTolerance - numberTolerance
  if (span <= 0) {
    return opacityFromDistance(distance, carTolerance)
  }

  const t = (distance - numberTolerance) / span
  return 1 - t * (1 - CAR_EDGE_OPACITY)
}

export function computeDualRevealOpacity(
  reading: OrientationReading,
  target: OrientationTarget,
  carTolerance: number,
  numberTolerance?: number,
): DualRevealOpacities {
  const distance = angularDistance(reading, target)
  return {
    car: carOpacityFromDistance(distance, carTolerance, numberTolerance),
    number:
      numberTolerance === undefined
        ? 0
        : opacityFromDistance(distance, numberTolerance),
    distance,
  }
}

/** Coarse hints for the car zone; fine hints when lining up the number. */
export function hintToleranceForDistance(
  distance: number | null,
  carTolerance: number,
  numberTolerance?: number,
): number {
  if (numberTolerance === undefined) {
    return carTolerance
  }

  if (distance === null) {
    return carTolerance
  }

  if (distance > numberTolerance * 1.25) {
    return carTolerance
  }

  return numberTolerance
}
