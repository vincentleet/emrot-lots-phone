import type { Puzzle, PuzzleLayer } from '../config/types'

export function hasNumberLayer(
  puzzle: Puzzle,
): puzzle is Puzzle & { number: PuzzleLayer; digit: string } {
  return puzzle.number !== undefined && puzzle.digit !== undefined
}

/** Numeric suffix from `car3.png` in an image URL or puzzle id. */
export function carNumberFromPath(pathOrId: string): number {
  const match = /car(\d+)/i.exec(pathOrId)
  return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER
}

/** Album swipe order: car1.png, car2.png, car3.png, … */
export function compareAlbumOrder(a: Puzzle, b: Puzzle): number {
  const byImage = carNumberFromPath(a.car.image) - carNumberFromPath(b.car.image)
  if (byImage !== 0) {
    return byImage
  }
  return carNumberFromPath(a.id) - carNumberFromPath(b.id)
}

/** Final code order: 3, 4, 7, … */
export function compareDigitOrder(a: Puzzle, b: Puzzle): number {
  return Number(a.digit ?? 0) - Number(b.digit ?? 0)
}
