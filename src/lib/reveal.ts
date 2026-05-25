import type { OrientationReading, OrientationTarget } from '../config/types'
import { angularDistance } from './orientation'

export const FOUND_OPACITY_THRESHOLD = 0.9

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
