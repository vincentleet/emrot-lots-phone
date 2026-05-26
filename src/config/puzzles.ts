import { assetUrl } from '../lib/assets'
import { carNumberFromPath, compareAlbumOrder } from '../lib/puzzle'
import type { Puzzle } from './types'

type PuzzleDraft = Omit<Puzzle, 'id'>

/**
 * Key = car number from filename (car1.png → 1).
 * Album order is always car1, car2, car3, … by file number.
 */
const puzzleByCarNumber: Record<number, PuzzleDraft> = {
  1: {
    target: { beta: 52, gamma: 0 },
    car: {
      image: assetUrl('assets/cars/car1.png'),
      tolerance: 50,
    },
  },
  2: {
    target: { beta: 50, gamma: 28 },
    car: {
      image: assetUrl('assets/cars/car2.png'),
      tolerance: 50,
    },
  },
  3: {
    digit: '3',
    target: { beta: 46, gamma: 62 },
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
    target: { beta: 54, gamma: -24 },
    car: {
      image: assetUrl('assets/cars/car4.png'),
      tolerance: 50,
    },
  },
  5: {
    target: { beta: 50, gamma: 0 },
    car: {
      image: assetUrl('assets/cars/car5.png'),
      tolerance: 50,
    },
  },
  6: {
    digit: '6',
    target: { beta: 44, gamma: -52 },
    car: {
      image: assetUrl('assets/cars/car6.png'),
      tolerance: 50,
    },
    number: {
      image: assetUrl('assets/cars/car6-number.png'),
      tolerance: 10,
    },
  },
  7: {
    target: { beta: 48, gamma: 18 },
    car: {
      image: assetUrl('assets/cars/car7.png'),
      tolerance: 50,
    },
  },
  8: {
    digit: '8',
    // Camera toward the floor — tip the top of the phone down
    target: { beta: 82, gamma: 0 },
    car: {
      image: assetUrl('assets/cars/car8.png'),
      tolerance: 50,
    },
    number: {
      image: assetUrl('assets/cars/car8-number.png'),
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
