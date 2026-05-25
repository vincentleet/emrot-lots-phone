import { assetUrl } from '../lib/assets'
import type { Puzzle } from './types'

export const puzzles: Puzzle[] = [
  {
    id: 'car1',
    digit: '4',
    target: { beta: 45, gamma: -20 },
    car: {
      image: assetUrl('assets/cars/car1.png'),
      tolerance: 18,
    },
    number: {
      image: assetUrl('assets/cars/car1-number.png'),
      tolerance: 8,
    },
  },
  {
    id: 'car6',
    target: { beta: 30, gamma: 25 },
    car: {
      image: assetUrl('assets/cars/car6.png'),
      tolerance: 18,
    },
  },
  {
    id: 'car3',
    digit: '2',
    target: { beta: 60, gamma: -10 },
    car: {
      image: assetUrl('assets/cars/car3.png'),
      tolerance: 18,
    },
    number: {
      image: assetUrl('assets/cars/car3-number.png'),
      tolerance: 8,
    },
  },
  {
    id: 'car7',
    digit: '9',
    target: { beta: 20, gamma: -35 },
    car: {
      image: assetUrl('assets/cars/car7.png'),
      tolerance: 18,
    },
    number: {
      image: assetUrl('assets/cars/car7-number.png'),
      tolerance: 8,
    },
  },
]
