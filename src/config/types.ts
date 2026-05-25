export interface OrientationTarget {
  beta: number
  gamma: number
}

export interface OverlayPosition {
  top: string
  left: string
}

export interface Puzzle {
  id: string
  image: string
  digit: string
  target: OrientationTarget
  tolerance: number
  overlay?: OverlayPosition
}

export interface OrientationReading {
  beta: number | null
  gamma: number | null
  alpha: number | null
}
