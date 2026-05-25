import { assetUrl } from '../lib/assets'
import { carNumberFromPath, compareAlbumOrder } from '../lib/puzzle'
import type { Puzzle } from './types'

type PuzzleDraft = Omit<Puzzle, 'id'>

/** Key = car number from filename (car1.png → 1). Exported in that order. */
const puzzleByCarNumber: Record<number, PuzzleDraft> = {
  1: {
    target: { beta: 48, gamma: 0 },
    car: {
      image: assetUrl('assets/cars/car1.png'),
      tolerance: 50,
    },
  },
  2: {
    target: { beta: 48, gamma: 0 },
    car: {
      image: assetUrl('assets/cars/car2.png'),
      tolerance: 50,
    },
  },
  3: {
    digit: '3',
    target: { beta: 45, gamma: 38 },
    car: {
      image: assetUrl('assets/cars/car3.png'),
      tolerance: 50,
    },
    number: {
      image: assetUrl('assets/cars/car3-number.png'),
      tolerance: 10,
    },
  },
  4: {
    digit: '4',
    target: { beta: 48, gamma: 0 },
    car: {
      image: assetUrl('assets/cars/car4.png'),
      tolerance: 50,
    },
    number: {
      image: assetUrl('assets/cars/car4-number.png'),
      tolerance: 10,
    },
  },
  5: {
    target: { beta: 48, gamma: 0 },
    car: {
      image: assetUrl('assets/cars/car5.png'),
      tolerance: 50,
    },
  },
  6: {
    target: { beta: 48, gamma: 0 },
    car: {
      image: assetUrl('assets/cars/car6.png'),
      tolerance: 50,
    },
  },
  7: {
    digit: '7',
    target: { beta: 18, gamma: 0 },
    car: {
      image: assetUrl('assets/cars/car7.png'),
      tolerance: 50,
    },
    number: {
      image: assetUrl('assets/cars/car7-number.png'),
      tolerance: 10,
    },
  },
}

function buildPuzzles(): Puzzle[] {
  return Object.keys(puzzleByCarNumber)
    .map((key) => Number(key))
    .sort((a, b) => a - b)
    .map((carNumber) => ({
      id: `car${carNumber}`,
      ...puzzleByCarNumber[carNumber],
    }))
    .sort(compareAlbumOrder)
}

export const puzzles: Puzzle[] = buildPuzzles()

/** Dev guard: album index must match car filename number. */
if (import.meta.env.DEV) {
  for (const [index, puzzle] of puzzles.entries()) {
    const fileNum = carNumberFromPath(puzzle.car.image)
    if (fileNum !== index + 1) {
      console.warn(
        `Album position ${index + 1} has ${puzzle.car.image} (car${fileNum}) — expected car${index + 1}.png`,
      )
    }
  }
}
