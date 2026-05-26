import './styles/main.css'
import { puzzles } from './config/puzzles'
import { albumThumbUrl } from './lib/assets'
import { App } from './ui/screens'
import { registerSW } from 'virtual:pwa-register'

for (const puzzle of puzzles) {
  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'image'
  link.href = albumThumbUrl(puzzle.car.image)
  document.head.append(link)
}

const root = document.querySelector<HTMLElement>('#app')

if (!root) {
  throw new Error('App root element not found')
}

const app = new App(root)
app.bindNavigation()

registerSW({
  immediate: true,
  onOfflineReady() {
    console.info('Spy Phone is ready to work offline.')
  },
})

void lockPortraitIfSupported()

async function lockPortraitIfSupported(): Promise<void> {
  try {
    await screen.orientation?.lock?.('portrait')
  } catch {
    // Orientation lock is optional and often blocked until fullscreen.
  }
}
