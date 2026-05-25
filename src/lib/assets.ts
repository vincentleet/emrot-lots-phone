/** Public-folder path prefixed for Vite base (e.g. GitHub Pages subpath). */
export function assetUrl(path: string): string {
  const normalized = path.replace(/^\//, '')
  const base = import.meta.env.BASE_URL
  return `${base}${normalized}`
}
