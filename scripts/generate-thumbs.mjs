import { mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const carsDir = path.resolve('public/assets/cars')
const thumbDir = path.join(carsDir, 'thumbs')
const THUMB_WIDTH = 320

const files = await readdir(carsDir)
const carImages = files.filter((name) => /^car\d+\.png$/i.test(name))

await mkdir(thumbDir, { recursive: true })

for (const name of carImages) {
  const input = path.join(carsDir, name)
  const output = path.join(thumbDir, name.replace(/\.png$/i, '.webp'))
  await sharp(input)
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(output)
  console.info(`Wrote ${path.relative(process.cwd(), output)}`)
}

console.info(`Generated ${carImages.length} thumbnails.`)
