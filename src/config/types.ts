export interface OrientationTarget {
  beta: number
  gamma: number
}

export interface PuzzleLayer {
  image: string
  tolerance: number
}

export interface Puzzle {
  id: string
  target: OrientationTarget
  car: PuzzleLayer
  /** Transparent number PNG; omit for decoy photos (car + wide tilt only). */
  number?: PuzzleLayer
  /** Code character; required when `number` is set. */
  digit?: string
}

export interface OrientationReading {
  beta: number | null
  gamma: number | null
  alpha: number | null
}
