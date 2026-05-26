import { puzzles } from '../config/puzzles'
import type { OrientationReading } from '../config/types'
import { compareDigitOrder, hasNumberLayer } from '../lib/puzzle'
import {
  computeTiltHints,
  formatOrientation,
  formatTarget,
  OrientationManager,
} from '../lib/orientation'
import {
  computeDualRevealOpacity,
  hintToleranceForDistance,
  isDigitFound,
  lerpLayerOpacity,
  type SmoothedLayerOpacity,
} from '../lib/reveal'
import { ProximityHaptics } from '../lib/haptics'
import { releaseWakeLock, requestWakeLock } from '../lib/wakeLock'
import { attachGallerySwipe } from './gallery'

type Screen = 'grid' | 'gallery' | 'summary' | 'calibrate'

const CALIBRATION_TAP_COUNT = 5
const CALIBRATION_TAP_WINDOW_MS = 2000

export class App {
  private root: HTMLElement
  private orientation = new OrientationManager()
  private screen: Screen = 'grid'
  private sensorsReady = false
  private puzzleIndex = 0
  private slideLocked: boolean[] = puzzles.map(() => false)
  private smoothedOpacity: SmoothedLayerOpacity[] = puzzles.map(() => ({ car: 0, number: 0 }))
  private galleryContainer: HTMLElement | null = null
  private galleryTrack: HTMLElement | null = null
  private galleryDragPx = 0
  private detachGallerySwipe: (() => void) | null = null
  private galleryResizeObserver: ResizeObserver | null = null
  private wakeLock: WakeLockSentinel | null = null
  private rafId: number | null = null
  private calibrationTapCount = 0
  private calibrationTapTimer: number | null = null
  private returnScreen: Screen = 'grid'
  private latestReading: OrientationReading = { beta: null, gamma: null, alpha: null }
  private proximityHaptics = new ProximityHaptics()

  constructor(root: HTMLElement) {
    this.root = root
    this.render()
  }

  private allCodeSlidesLocked(): boolean {
    return puzzles.every(
      (puzzle, index) => !hasNumberLayer(puzzle) || this.slideLocked[index],
    )
  }

  private setScreen(screen: Screen): void {
    this.stopGalleryLoop()
    this.proximityHaptics.reset()
    this.detachGallerySwipe?.()
    this.detachGallerySwipe = null
    this.galleryResizeObserver?.disconnect()
    this.galleryResizeObserver = null
    this.galleryContainer = null
    this.galleryTrack = null
    this.screen = screen
    this.render()
  }

  private render(): void {
    this.root.innerHTML = ''

    switch (this.screen) {
      case 'grid':
        this.renderGrid()
        break
      case 'gallery':
        this.renderGallery()
        break
      case 'summary':
        this.renderSummary()
        break
      case 'calibrate':
        this.renderCalibrate()
        break
    }
  }

  private renderGrid(): void {
    void this.releaseWakeLock()

    const container = this.createScreen('album-grid-screen')
    const cellsHtml = puzzles
      .map(
        (puzzle, index) => `
        <button
          type="button"
          class="album-grid-cell"
          data-action="open-photo"
          data-photo-index="${index}"
          aria-label="Open photo ${index + 1}"
        >
          <img
            class="album-grid-image"
            src="${puzzle.car.image}"
            alt=""
            draggable="false"
            loading="lazy"
          />
        </button>
      `,
      )
      .join('')

    container.innerHTML = `
      <header class="album-grid-header">
        <h1 class="album-grid-title">Photos</h1>
      </header>
      <div class="album-grid-scroll">
        <div class="album-grid" data-album-grid>
          ${cellsHtml}
        </div>
      </div>
    `

    this.attachCalibrationTrigger(container)
    this.root.append(container)
  }

  private attachBackToGrid(container: HTMLElement): void {
    container.querySelector('[data-action="back-to-grid"]')?.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.setScreen('grid')
    })
  }

  private async ensureSensors(): Promise<boolean> {
    if (this.sensorsReady) {
      return true
    }

    const granted = await this.orientation.requestAccess()
    if (!granted) {
      return false
    }

    this.orientation.start((reading) => {
      this.latestReading = reading
    })
    this.sensorsReady = true
    return true
  }

  private async openPhoto(index: number): Promise<void> {
    await this.ensureSensors()
    this.puzzleIndex = index
    this.setScreen('gallery')
    void this.acquireWakeLock()
  }

  private renderGallery(): void {
    const container = this.createScreen('gallery-screen')
    const slidesHtml = puzzles
      .map((puzzle, index) => {
        const numberLayer = puzzle.number
          ? `<img
                class="photos-image photos-image--number ${this.slideLocked[index] ? 'is-locked' : ''}"
                data-number-layer
                src="${puzzle.number.image}"
                alt=""
                draggable="false"
              />`
          : ''

        return `
          <article class="photos-slide" data-slide data-slide-index="${index}">
            <div class="photo-stack">
              <img
                class="photos-image photos-image--car"
                data-car-layer
                src="${puzzle.car.image}"
                alt="Photo ${index + 1}"
                draggable="false"
              />
              ${numberLayer}
            </div>
            <div class="tilt-hints" aria-hidden="true">
              <span class="tilt-hint tilt-hint--top" data-tilt-hint="top"></span>
              <span class="tilt-hint tilt-hint--right" data-tilt-hint="right"></span>
              <span class="tilt-hint tilt-hint--bottom" data-tilt-hint="bottom"></span>
              <span class="tilt-hint tilt-hint--left" data-tilt-hint="left"></span>
            </div>
          </article>
        `
      })
      .join('')

    const dotsHtml = puzzles
      .map(
        (_, index) =>
          `<span class="photos-dot ${index === this.puzzleIndex ? 'is-active' : ''}" data-photo-dot="${index}"></span>`,
      )
      .join('')

    container.innerHTML = `
      <header class="photos-toolbar">
        <button type="button" class="photos-toolbar-btn photos-toolbar-btn--back" data-action="back-to-grid" aria-label="Back to album">
          <svg class="photos-toolbar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
          <span>Album</span>
        </button>
        <span class="photos-toolbar-title" data-photo-counter>${this.puzzleIndex + 1} / ${puzzles.length}</span>
        <button
          type="button"
          class="photos-toolbar-btn photos-toolbar-btn--icon"
          data-action="view-code"
          aria-label="View recovered code"
          ${this.allCodeSlidesLocked() ? '' : 'hidden'}
        >
          <svg class="photos-toolbar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
          </svg>
        </button>
      </header>
      <div class="photos-viewport" data-gallery-viewport>
        <div class="photos-track" data-gallery-track>
          ${slidesHtml}
        </div>
      </div>
      <footer class="photos-chrome">
        <div class="photos-dots" data-photo-dots>${dotsHtml}</div>
      </footer>
    `

    this.galleryContainer = container
    this.galleryTrack = container.querySelector('[data-gallery-track]')

    const viewport = container.querySelector('[data-gallery-viewport]') as HTMLElement | null
    if (viewport && this.galleryTrack) {
      this.detachGallerySwipe = attachGallerySwipe(viewport, this.galleryTrack, {
        slideCount: puzzles.length,
        getIndex: () => this.puzzleIndex,
        setIndex: (index) => this.goToSlide(index),
        onDrag: (dragPx) => {
          this.galleryDragPx = dragPx
          this.updateGalleryTransform(false)
        },
      })
    }

    this.attachCalibrationTrigger(container)
    this.attachBackToGrid(container)
    this.root.append(container)
    this.updateGalleryTransform(false)
    this.startGalleryLoop(container)

    this.galleryResizeObserver = new ResizeObserver(() => this.updateGalleryTransform(false))
    if (viewport) {
      this.galleryResizeObserver.observe(viewport)
    }
  }

  private goToSlide(index: number): void {
    this.puzzleIndex = index
    this.galleryDragPx = 0
    this.proximityHaptics.reset()
    this.updateGalleryChrome()
    this.updateGalleryTransform(true)
  }

  private updateGalleryTransform(animate: boolean): void {
    if (!this.galleryTrack) {
      return
    }

    const viewport = this.galleryContainer?.querySelector('[data-gallery-viewport]') as HTMLElement | null
    const viewportWidth = viewport?.clientWidth ?? 0

    this.galleryTrack.style.transition = animate
      ? 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)'
      : 'none'
    const x = -this.puzzleIndex * viewportWidth + this.galleryDragPx
    this.galleryTrack.style.transform = `translate3d(${x}px, 0, 0)`
  }

  private updateGalleryChrome(): void {
    if (!this.galleryContainer) {
      return
    }

    const counter = this.galleryContainer.querySelector('[data-photo-counter]')
    if (counter) {
      counter.textContent = `${this.puzzleIndex + 1} / ${puzzles.length}`
    }

    const codeButton = this.galleryContainer.querySelector('[data-action="view-code"]') as HTMLElement | null
    if (codeButton) {
      codeButton.hidden = !this.allCodeSlidesLocked()
    }

    const dots = this.galleryContainer.querySelectorAll('[data-photo-dot]')
    dots.forEach((dot, index) => {
      dot.classList.toggle('is-active', index === this.puzzleIndex)
    })
  }

  private startGalleryLoop(container: HTMLElement): void {
    const slides = container.querySelectorAll<HTMLElement>('[data-slide]')

    const tick = () => {
      slides.forEach((slide, index) => {
        // If sensors never became ready (e.g. Android with motion sensors disabled),
        // fall back to showing static photos instead of a black screen.
        if (!this.sensorsReady) {
          const carLayer = slide.querySelector('[data-car-layer]') as HTMLElement | null
          const numberLayer = slide.querySelector('[data-number-layer]') as HTMLElement | null
          const hintElements = slide.querySelectorAll<HTMLElement>('[data-tilt-hint]')

          if (carLayer) {
            carLayer.style.opacity = '1'
          }
          if (numberLayer && !this.slideLocked[index]) {
            numberLayer.style.opacity = '0'
          }
          for (const element of hintElements) {
            element.style.opacity = '0'
            element.classList.remove('is-active')
          }
          return
        }

        const puzzle = puzzles[index]
        const carLayer = slide.querySelector('[data-car-layer]') as HTMLElement | null
        const numberLayer = slide.querySelector('[data-number-layer]') as HTMLElement | null
        const hintElements = slide.querySelectorAll<HTMLElement>('[data-tilt-hint]')
        const { car, number, distance } = computeDualRevealOpacity(
          this.latestReading,
          puzzle.target,
          puzzle.car.tolerance,
          puzzle.number?.tolerance,
        )

        const hasReading = distance !== null
        this.smoothedOpacity[index] = lerpLayerOpacity(
          this.smoothedOpacity[index],
          { car, number },
          hasReading,
        )
        const displayCar = this.slideLocked[index] ? 1 : this.smoothedOpacity[index].car
        const displayNumber = this.slideLocked[index] ? 1 : this.smoothedOpacity[index].number

        if (carLayer) {
          carLayer.style.opacity = String(displayCar)
        }
        if (numberLayer) {
          numberLayer.style.opacity = String(displayNumber)
        }
        const isActive = index === this.puzzleIndex

        if (isActive) {
          this.proximityHaptics.update(
            distance,
            puzzle.car.tolerance,
            puzzle.number?.tolerance,
            { locked: this.slideLocked[index], active: true },
          )
        }

        if (!this.slideLocked[index] && isActive) {
          const hintTolerance = hintToleranceForDistance(
            distance,
            puzzle.car.tolerance,
            puzzle.number?.tolerance,
          )
          const hints = computeTiltHints(this.latestReading, puzzle.target, hintTolerance)
          for (const element of hintElements) {
            const side = element.dataset.tiltHint as keyof typeof hints | undefined
            const strength = side ? hints[side] : 0
            element.style.opacity = String(strength)
            element.classList.toggle('is-active', strength > 0)
          }
        } else if (isActive) {
          for (const element of hintElements) {
            element.style.opacity = '0'
            element.classList.remove('is-active')
          }
        }

        if (!this.slideLocked[index] && puzzle.number && isDigitFound(displayNumber)) {
          this.slideLocked[index] = true
          if (isActive) {
            this.proximityHaptics.success()
          }
          numberLayer?.classList.add('is-locked')
          if (carLayer) {
            carLayer.style.opacity = '1'
          }
          if (numberLayer) {
            numberLayer.style.opacity = '1'
          }
          for (const element of hintElements) {
            element.style.opacity = '0'
            element.classList.remove('is-active')
          }
          this.updateGalleryChrome()
        }
      })

      this.rafId = window.requestAnimationFrame(tick)
    }

    this.rafId = window.requestAnimationFrame(tick)
  }

  private stopGalleryLoop(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.proximityHaptics.cancel()
  }

  private renderSummary(): void {
    void this.releaseWakeLock()

    const container = this.createScreen('summary-screen')
    const code = puzzles
      .filter(hasNumberLayer)
      .sort(compareDigitOrder)
      .map((puzzle) => puzzle.digit)
      .join('-')

    container.innerHTML = `
      <div class="sheet-backdrop" data-action="close-summary"></div>
      <div class="info-sheet" role="dialog" aria-labelledby="sheet-title">
        <div class="info-sheet-handle" aria-hidden="true"></div>
        <h2 id="sheet-title" class="info-sheet-title">Photo information</h2>
        <p class="info-sheet-label">Recovered code</p>
        <p class="code-display">${code}</p>
        <button type="button" class="btn btn-photos" data-action="close-summary">Done</button>
      </div>
    `

    this.attachCalibrationTrigger(container)
    this.root.append(container)
  }

  private renderCalibrate(): void {
    const container = this.createScreen('calibrate-screen')

    container.innerHTML = `
      <div class="calibrate-content">
        <p class="eyebrow">Staff mode</p>
        <h1>Calibration</h1>
        <p class="live-readout" data-live-readout>${formatOrientation(this.latestReading)}</p>
        <p class="calibrate-photo-label">Photo ${this.puzzleIndex + 1} of ${puzzles.length}</p>
        <button type="button" class="btn btn-photos" data-action="copy-target">
          Set as target
        </button>
        <p class="hint" data-copy-status hidden></p>
        <button type="button" class="btn btn-secondary" data-action="exit-calibrate">
          Back
        </button>
      </div>
    `

    const updateReadout = () => {
      const readout = container.querySelector('[data-live-readout]')
      if (readout) {
        readout.textContent = formatOrientation(this.latestReading)
      }
      if (this.screen === 'calibrate') {
        window.requestAnimationFrame(updateReadout)
      }
    }

    window.requestAnimationFrame(updateReadout)

    container.querySelector('[data-action="copy-target"]')?.addEventListener('click', () => {
      void this.copyCurrentTarget(container)
    })

    container.querySelector('[data-action="exit-calibrate"]')?.addEventListener('click', () => {
      const nextScreen = this.returnScreen
      this.setScreen(nextScreen === 'summary' ? 'gallery' : nextScreen)
      if (nextScreen === 'gallery') {
        void this.acquireWakeLock()
      }
    })

    this.root.append(container)
  }

  private async copyCurrentTarget(container: HTMLElement): Promise<void> {
    const status = container.querySelector('[data-copy-status]') as HTMLElement | null

    if (this.latestReading.beta === null || this.latestReading.gamma === null) {
      if (status) {
        status.hidden = false
        status.textContent = 'Waiting for sensor data…'
      }
      return
    }

    const target = {
      beta: Math.round(this.latestReading.beta),
      gamma: Math.round(this.latestReading.gamma),
    }
    const puzzle = puzzles[this.puzzleIndex]
    const lines = [
      `target: ${formatTarget(target)},`,
      `car: { tolerance: ${puzzle.car.tolerance} },`,
    ]
    if (puzzle.number) {
      lines.push(`number: { tolerance: ${puzzle.number.tolerance} },`)
    }
    const snippet = lines.join('\n  ')

    try {
      await navigator.clipboard.writeText(snippet)
      if (status) {
        status.hidden = false
        status.textContent = `Copied target for photo ${this.puzzleIndex + 1} — paste into puzzles.ts`
      }
    } catch {
      if (status) {
        status.hidden = false
        status.textContent = snippet
      }
    }
  }

  private attachCalibrationTrigger(container: HTMLElement): void {
    const trigger = document.createElement('button')
    trigger.type = 'button'
    trigger.className = 'calibration-trigger'
    trigger.setAttribute('aria-label', 'Staff calibration trigger')
    trigger.addEventListener('click', () => {
      this.calibrationTapCount += 1

      if (this.calibrationTapTimer !== null) {
        window.clearTimeout(this.calibrationTapTimer)
      }

      this.calibrationTapTimer = window.setTimeout(() => {
        this.calibrationTapCount = 0
      }, CALIBRATION_TAP_WINDOW_MS)

      if (this.calibrationTapCount >= CALIBRATION_TAP_COUNT) {
        this.calibrationTapCount = 0
        this.stopGalleryLoop()
        void this.releaseWakeLock()
        this.returnScreen = this.screen
        this.setScreen('calibrate')
      }
    })

    container.append(trigger)
  }

  private createScreen(className: string): HTMLElement {
    const screen = document.createElement('section')
    screen.className = `screen ${className}`
    return screen
  }

  private async acquireWakeLock(): Promise<void> {
    this.wakeLock = await requestWakeLock()
  }

  private async releaseWakeLock(): Promise<void> {
    await releaseWakeLock(this.wakeLock)
    this.wakeLock = null
  }

  bindNavigation(): void {
    this.root.addEventListener('click', (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }

      const actionTarget = target.closest<HTMLElement>('[data-action]')
      const action = actionTarget?.dataset.action

      if (action === 'open-photo') {
        const index = Number(actionTarget?.dataset.photoIndex)
        if (!Number.isNaN(index)) {
          void this.openPhoto(index)
        }
        return
      }

      if (action === 'back-to-grid') {
        this.setScreen('grid')
        return
      }

      if (action === 'view-code') {
        this.setScreen('summary')
        return
      }

      if (action === 'close-summary') {
        this.setScreen('gallery')
        void this.acquireWakeLock()
      }
    })
  }
}
