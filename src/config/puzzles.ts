import { assetUrl } from '../lib/assets'
import { compareAlbumOrder } from '../lib/puzzle'
import type { Puzzle } from './types'

const puzzleDefs: Puzzle[] = [
  {
    id: 'car1',
    target: { beta: 48, gamma: 0 },
    car: {
      image: assetUrl('assets/cars/car1.png'),
      tolerance: 45,
    },
  },
  {
    id: 'car2',
    target: { beta: 48, gamma: 0 },
    car: {
      image: assetUrl('assets/cars/car2.png'),
      tolerance: 45,
    },
  },
  {
    id: 'car3',
    digit: '3',
    target: { beta: 45, gamma: 42 },
    car: {
      image: assetUrl('assets/cars/car3.png'),
      tolerance: 45,
    },
    number: {
      image: assetUrl('assets/cars/car3-number.png'),
      tolerance: 10,
    },
  },
  {
    id: 'car4',
    digit: '4',
    target: { beta: 48, gamma: 0 },
    car: {
      image: assetUrl('assets/cars/car4.png'),
      tolerance: 45,
    },
    number: {
      image: assetUrl('assets/cars/car4-number.png'),
      tolerance: 10,
    },
  },
  {
    id: 'car5',
    target: { beta: 48, gamma: 0 },
    car: {
      image: assetUrl('assets/cars/car5.png'),
      tolerance: 45,
    },
  },
  {
    id: 'car6',
    target: { beta: 48, gamma: 0 },
    car: {
      image: assetUrl('assets/cars/car6.png'),
      tolerance: 45,
    },
  },
  {
    id: 'car7',
    digit: '7',
    target: { beta: 18, gamma: 0 },
    car: {
      image: assetUrl('assets/cars/car7.png'),
      tolerance: 45,
    },
    number: {
      image: assetUrl('assets/cars/car7-number.png'),
      tolerance: 10,
    },
  },
]

/** Sorted car1 → car7 for the photo album carousel. */
export const puzzles: Puzzle[] = [...puzzleDefs].sort(compareAlbumOrder)
