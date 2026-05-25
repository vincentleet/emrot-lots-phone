import type { OrientationReading, OrientationTarget } from '../config/types'
import { angularDistance } from './orientation'

export const FOUND_OPACITY_THRESHOLD = 0.9

/** How far beyond tolerance opacity eases to zero (avoids hard black snaps). */
const FADE_TAIL_RATIO = 1.6

export interface DualRevealOpacities {
  car: number
  number: number
  distance: number | null
}

function smoothstep(value: number): number {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

/**
 * Soft falloff: invisible at the outer edge, fully visible at the target.
 * Same curve for every photo so black → full spans the whole wide zone.
 */
export function opacityFromDistance(distance: number | null, tolerance: number): number {
  if (distance === null) {
    return 0
  }

  const outer = tolerance * FADE_TAIL_RATIO
  if (distance >= outer) {
    return 0
  }

  const t = 1 - distance / outer
  return smoothstep(t)
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

/** Car always uses the full wide fade; number uses the narrow zone on top. */
export function carOpacityFromDistance(
  distance: number | null,
  carTolerance: number,
): number {
  return opacityFromDistance(distance, carTolerance)
}

export function computeDualRevealOpacity(
  reading: OrientationReading,
  target: OrientationTarget,
  carTolerance: number,
  numberTolerance?: number,
): DualRevealOpacities {
  const distance = angularDistance(reading, target)
  return {
    car: carOpacityFromDistance(distance, carTolerance),
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

const OPACITY_LERP = 0.2

export interface SmoothedLayerOpacity {
  car: number
  number: number
}

/** Ease toward target opacity to absorb sensor spikes (e.g. near gimbal lock). */
export function lerpLayerOpacity(
  current: SmoothedLayerOpacity,
  target: SmoothedLayerOpacity,
  hasReading: boolean,
): SmoothedLayerOpacity {
  if (!hasReading) {
    return {
      car: current.car * 0.9,
      number: current.number * 0.9,
    }
  }

  return {
    car: current.car + (target.car - current.car) * OPACITY_LERP,
    number: current.number + (target.number - current.number) * OPACITY_LERP,
  }
}
