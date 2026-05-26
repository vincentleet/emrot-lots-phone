/** Public-folder path prefixed for Vite base (e.g. GitHub Pages subpath). */
export function assetUrl(path: string): string {
  const normalized = path.replace(/^\//, '')
  const base = import.meta.env.BASE_URL
  return `${base}${normalized}`
}

/** Small WebP for the album grid (see `npm run generate-thumbs`). */
export function albumThumbUrl(carImage: string): string {
  return carImage.replace(/\/cars\/(car\d+)\.png$/i, '/cars/thumbs/$1.webp')
}
