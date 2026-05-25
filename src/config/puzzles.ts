import type { Puzzle } from './types'

export const puzzles: Puzzle[] = [
  {
    id: 'car1',
    image: '/assets/cars/car1.png',
    digit: '4',
    target: { beta: 45, gamma: -20 },
    tolerance: 12,
    overlay: { top: '42%', left: '58%' },
  },
  {
    id: 'car6',
    image: '/assets/cars/car6.png',
    digit: '7',
    target: { beta: 30, gamma: 25 },
    tolerance: 12,
    overlay: { top: '38%', left: '35%' },
  },
  {
    id: 'car3',
    image: '/assets/cars/car3.png',
    digit: '2',
    target: { beta: 60, gamma: -10 },
    tolerance: 12,
    overlay: { top: '55%', left: '50%' },
  },
  {
    id: 'car7',
    image: '/assets/cars/car7.png',
    digit: '9',
    target: { beta: 20, gamma: -35 },
    tolerance: 12,
    overlay: { top: '45%', left: '62%' },
  },
]
