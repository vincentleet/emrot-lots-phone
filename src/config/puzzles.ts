import { assetUrl } from '../lib/assets'
import { compareAlbumOrder } from '../lib/puzzle'
import type { Puzzle } from './types'

const puzzleDefs: Puzzle[] = [
  {
    id: 'car1',
    target: { beta: 42, gamma: -18 },
    car: {
      image: assetUrl('assets/cars/car1.png'),
      tolerance: 32,
    },
  },
  {
    id: 'car2',
    target: { beta: 36, gamma: 12 },
    car: {
      image: assetUrl('assets/cars/car2.png'),
      tolerance: 32,
    },
  },
  {
    id: 'car3',
    digit: '3',
    target: { beta: 48, gamma: 58 },
    car: {
      image: assetUrl('assets/cars/car3.png'),
      tolerance: 32,
    },
    number: {
      image: assetUrl('assets/cars/car3-number.png'),
      tolerance: 8,
    },
  },
  {
    id: 'car4',
    digit: '4',
    target: { beta: 42, gamma: -18 },
    car: {
      image: assetUrl('assets/cars/car4.png'),
      tolerance: 32,
    },
    number: {
      image: assetUrl('assets/cars/car4-number.png'),
      tolerance: 8,
    },
  },
  {
    id: 'car5',
    target: { beta: 34, gamma: -8 },
    car: {
      image: assetUrl('assets/cars/car5.png'),
      tolerance: 32,
    },
  },
  {
    id: 'car6',
    target: { beta: 38, gamma: 22 },
    car: {
      image: assetUrl('assets/cars/car6.png'),
      tolerance: 32,
    },
  },
  {
    id: 'car7',
    digit: '7',
    target: { beta: 8, gamma: 2 },
    car: {
      image: assetUrl('assets/cars/car7.png'),
      tolerance: 32,
    },
    number: {
      image: assetUrl('assets/cars/car7-number.png'),
      tolerance: 8,
    },
  },
]

/** Sorted car1 → car7 for the photo album carousel. */
export const puzzles: Puzzle[] = [...puzzleDefs].sort(compareAlbumOrder)
