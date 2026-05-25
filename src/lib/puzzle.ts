import type { Puzzle, PuzzleLayer } from '../config/types'

export function hasNumberLayer(
  puzzle: Puzzle,
): puzzle is Puzzle & { number: PuzzleLayer; digit: string } {
  return puzzle.number !== undefined && puzzle.digit !== undefined
}
