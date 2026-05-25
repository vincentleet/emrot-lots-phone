import type { OrientationReading, OrientationTarget } from '../config/types'
import { angularDistance } from './orientation'

export const FOUND_OPACITY_THRESHOLD = 0.9

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

export function computeDualRevealOpacity(
  reading: OrientationReading,
  target: OrientationTarget,
  carTolerance: number,
  numberTolerance?: number,
): DualRevealOpacities {
  const distance = angularDistance(reading, target)
  return {
    car: opacityFromDistance(distance, carTolerance),
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
