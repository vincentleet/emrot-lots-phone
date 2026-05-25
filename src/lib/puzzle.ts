import type { Puzzle, PuzzleLayer } from '../config/types'

export function hasNumberLayer(
  puzzle: Puzzle,
): puzzle is Puzzle & { number: PuzzleLayer; digit: string } {
  return puzzle.number !== undefined && puzzle.digit !== undefined
}

export function carNumberFromId(id: string): number {
  return Number.parseInt(id.replace('car', ''), 10)
}

/** Album swipe order: car1, car2, car3, … */
export function compareAlbumOrder(a: Puzzle, b: Puzzle): number {
  return carNumberFromId(a.id) - carNumberFromId(b.id)
}

/** Final code order: 3, 4, 7, … */
export function compareDigitOrder(a: Puzzle, b: Puzzle): number {
  return Number(a.digit ?? 0) - Number(b.digit ?? 0)
}
