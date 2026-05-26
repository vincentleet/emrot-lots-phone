import { puzzles } from '../config/puzzles'
import { albumThumbUrl } from '../lib/assets'
import type { OrientationReading } from '../config/types'
import {
  computeTiltHintState,
  remapTiltReading,
  remapTiltTarget,
  shouldRemapTiltAxes,
  TILT_HINT_LABEL,
  type TiltHintSideState,
  formatOrientation,
  formatTarget,
  OrientationManager,
} from '../lib/orientation'
import {
  computeDualRevealOpacity,
  hintToleranceForDistance,
  isDigitFound,
  isWithinCarRevealRange,
  lerpLayerOpacity,
  opacityLerpForSensorSource,
  type DualRevealOpacities,
  type SmoothedLayerOpacity,
} from '../lib/reveal'
import { ProximityHaptics } from '../lib/haptics'
import {
  clearStoredSensorGrant,
  hasStoredSensorGrant,
  needsMotionPermissionPrompt,
} from '../lib/sensorPermission'
import { releaseWakeLock, requestWakeLock } from '../lib/wakeLock'
import { attachGallerySwipe } from './gallery'

type Screen = 'grid' | 'gallery' | 'calibrate'

const CALIBRATION_TAP_COUNT = 5
const CALIBRATION_TAP_WINDOW_MS = 2000

export class App {
  private root: HTMLElement
  private orientation = new OrientationManager()
  private screen: Screen = 'grid'
  private sensorsReady = false
  private sensorsRequestInFlight = false
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
  private preloadCache = new Map<string, Promise<void>>()
  private sensorPermissionOverlay: HTMLElement | null = null

  constructor(root: HTMLElement) {
    this.root = root
    this.render()
    this.warmAlbumCache()
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
            src="${albumThumbUrl(puzzle.car.image)}"
            data-full-src="${puzzle.car.image}"
            alt=""
            draggable="false"
            loading="eager"
            decoding="async"
            fetchpriority="${index < 4 ? 'high' : 'auto'}"
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
    this.attachAlbumThumbFallback(container)
    this.root.append(container)
    this.warmAlbumCache()
  }

  private warmAlbumCache(): void {
    for (const puzzle of puzzles) {
      void this.preloadImage(albumThumbUrl(puzzle.car.image), 30_000)
      void this.preloadImage(puzzle.car.image, 30_000)
    }
  }

  private attachAlbumThumbFallback(container: HTMLElement): void {
    for (const img of container.querySelectorAll<HTMLImageElement>('.album-grid-image')) {
      img.addEventListener('error', () => {
        const full = img.dataset.fullSrc
        if (!full || img.src.endsWith(full)) {
          return
        }
        img.removeAttribute('fetchpriority')
        img.src = full
      }, { once: true })
    }
  }

  private preloadImage(src: string, timeoutMs = 1200): Promise<void> {
    const existing = this.preloadCache.get(src)
    if (existing) {
      return existing
    }

    const promise = new Promise<void>((resolve) => {
      const img = new Image()
      const timer = window.setTimeout(() => resolve(), timeoutMs)

      const done = () => {
        window.clearTimeout(timer)
        resolve()
      }

      img.onload = () => {
        // decode() helps Android avoid a visible blank before first paint.
        void img.decode?.().then(done).catch(done)
        if (!img.decode) {
          done()
        }
      }
      img.onerror = done
      img.src = src
    })

    this.preloadCache.set(src, promise)
    return promise
  }

  private attachBackToGrid(container: HTMLElement): void {
    container.querySelector('[data-action="back-to-grid"]')?.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.setScreen('grid')
    })
  }

  private async ensureSensors(options: { requestPermission?: boolean } = {}): Promise<boolean> {
    if (this.sensorsReady) {
      return true
    }
    if (this.sensorsRequestInFlight) {
      return false
    }
    this.sensorsRequestInFlight = true

    const requestPermission = options.requestPermission ?? true
    const granted = await this.orientation.requestAccess({
      skipPermissionPrompt: !requestPermission,
    })
    if (!granted) {
      this.sensorsRequestInFlight = false
      if (!requestPermission) {
        clearStoredSensorGrant()
        this.showSensorPermissionOverlay()
      }
      return false
    }

    this.orientation.start((reading) => {
      this.latestReading = reading
    })
    this.sensorsReady = true
    this.sensorsRequestInFlight = false
    this.hideSensorPermissionOverlay()
    return true
  }

  /** iOS: prompt once on load; reuse saved grant on later visits. */
  initSensorAccess(): void {
    if (!needsMotionPermissionPrompt()) {
      return
    }

    if (hasStoredSensorGrant()) {
      void this.ensureSensors({ requestPermission: false })
      return
    }

    this.showSensorPermissionOverlay()
  }

  private showSensorPermissionOverlay(): void {
    if (this.sensorPermissionOverlay) {
      this.sensorPermissionOverlay.hidden = false
      return
    }

    const overlay = document.createElement('div')
    overlay.className = 'sensor-permission-overlay'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-labelledby', 'sensor-permission-title')
    overlay.innerHTML = `
      <div class="sensor-permission-card">
        <h2 id="sensor-permission-title" class="sensor-permission-title">Allow motion access</h2>
        <p class="sensor-permission-copy">
          Photos uses motion and orientation to reveal hidden details when you tilt your phone.
        </p>
        <button type="button" class="sensor-permission-button" data-action="enable-sensors">
          Continue
        </button>
        <p class="sensor-permission-denied" data-sensor-denied hidden>
          Motion access was denied. Open Settings → Safari → Motion &amp; Orientation Access, then try again.
        </p>
      </div>
    `

    overlay.querySelector('[data-action="enable-sensors"]')?.addEventListener('click', () => {
      void this.requestSensorPermissionFromOverlay()
    })

    document.body.append(overlay)
    this.sensorPermissionOverlay = overlay
  }

  private hideSensorPermissionOverlay(): void {
    if (this.sensorPermissionOverlay) {
      this.sensorPermissionOverlay.hidden = true
    }
  }

  private async requestSensorPermissionFromOverlay(): Promise<void> {
    const denied = this.sensorPermissionOverlay?.querySelector<HTMLElement>('[data-sensor-denied]')
    denied?.setAttribute('hidden', '')

    const granted = await this.ensureSensors({ requestPermission: true })
    if (!granted) {
      denied?.removeAttribute('hidden')
    }
  }

  private async openPhoto(index: number): Promise<void> {
    // Pre-decode the tapped photo (Android often delays first paint otherwise).
    const puzzle = puzzles[index]
    void this.preloadImage(puzzle.car.image)
    if (puzzle.number) {
      void this.preloadImage(puzzle.number.image)
    }

    this.puzzleIndex = index
    this.smoothedOpacity[index] = { car: 0, number: 0 }
    this.setScreen('gallery')
    void this.acquireWakeLock()

    // Fallback if iOS permission overlay was dismissed without granting.
    void this.ensureSensors({ requestPermission: !hasStoredSensorGrant() })
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
            <div class="tilt-edge-gradients" aria-hidden="true">
              <span class="tilt-edge-gradient tilt-edge-gradient--top" data-tilt-gradient="top"></span>
              <span class="tilt-edge-gradient tilt-edge-gradient--right" data-tilt-gradient="right"></span>
              <span class="tilt-edge-gradient tilt-edge-gradient--bottom" data-tilt-gradient="bottom"></span>
              <span class="tilt-edge-gradient tilt-edge-gradient--left" data-tilt-gradient="left"></span>
            </div>
            <div class="tilt-hints" aria-hidden="true">
              <span class="tilt-hint tilt-hint--top" data-tilt-hint="top" data-tilt-label="${TILT_HINT_LABEL}">
                <span class="tilt-hint-label">${TILT_HINT_LABEL}</span>
              </span>
              <span class="tilt-hint tilt-hint--right" data-tilt-hint="right" data-tilt-label="${TILT_HINT_LABEL}">
                <span class="tilt-hint-label">${TILT_HINT_LABEL}</span>
              </span>
              <span class="tilt-hint tilt-hint--bottom" data-tilt-hint="bottom" data-tilt-label="${TILT_HINT_LABEL}">
                <span class="tilt-hint-label">${TILT_HINT_LABEL}</span>
              </span>
              <span class="tilt-hint tilt-hint--left" data-tilt-hint="left" data-tilt-label="${TILT_HINT_LABEL}">
                <span class="tilt-hint-label">${TILT_HINT_LABEL}</span>
              </span>
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

    const slides = container.querySelectorAll<HTMLElement>('[data-slide]')
    this.updateGallerySlides(slides)
    this.startGalleryLoop(container, slides)

    this.galleryResizeObserver = new ResizeObserver(() => this.updateGalleryTransform(false))
    if (viewport) {
      this.galleryResizeObserver.observe(viewport)
    }
  }

  private goToSlide(index: number): void {
    this.puzzleIndex = index
    this.galleryDragPx = 0
    this.proximityHaptics.reset()
    this.syncSlideOpacityOnNavigate(index)
    this.updateGalleryChrome()
    this.updateGalleryTransform(true)

    const slides = this.galleryContainer?.querySelectorAll<HTMLElement>('[data-slide]')
    if (slides) {
      this.updateGallerySlides(slides)
    }
  }

  private getSlideRevealOpacities(index: number): DualRevealOpacities {
    const puzzle = puzzles[index]
    const remapAxes = shouldRemapTiltAxes(this.orientation.sensorSource)
    const reading = remapAxes ? remapTiltReading(this.latestReading) : this.latestReading
    const target = remapAxes ? remapTiltTarget(puzzle.target) : puzzle.target

    return computeDualRevealOpacity(
      reading,
      target,
      puzzle.car.tolerance,
      puzzle.number?.tolerance,
    )
  }

  /** Snap reveal state to current tilt when landing on a slide (avoids bleed from the previous photo). */
  private syncSlideOpacityOnNavigate(index: number): void {
    if (this.slideLocked[index]) {
      return
    }

    if (!this.sensorsReady) {
      this.smoothedOpacity[index] = { car: 0, number: 0 }
      return
    }

    const puzzle = puzzles[index]
    const { car, number, distance } = this.getSlideRevealOpacities(index)

    if (!isWithinCarRevealRange(distance, puzzle.car.tolerance)) {
      this.smoothedOpacity[index] = { car: 0, number: 0 }
      return
    }

    this.smoothedOpacity[index] = { car, number }
  }

  private slideUsesRevealOpacity(index: number): boolean {
    if (index === this.puzzleIndex) {
      return true
    }

    if (Math.abs(this.galleryDragPx) <= 1) {
      return false
    }

    if (this.galleryDragPx < 0 && index === this.puzzleIndex + 1) {
      return true
    }

    return this.galleryDragPx > 0 && index === this.puzzleIndex - 1
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

    this.galleryContainer.classList.toggle(
      'gallery-screen--accel',
      this.orientation.sensorSource === 'motion',
    )

    const dots = this.galleryContainer.querySelectorAll('[data-photo-dot]')
    dots.forEach((dot, index) => {
      dot.classList.toggle('is-active', index === this.puzzleIndex)
    })
  }

  private updateGallerySlides(slides: NodeListOf<HTMLElement>): void {
    slides.forEach((slide, index) => {
      const puzzle = puzzles[index]
      const carLayer = slide.querySelector('[data-car-layer]') as HTMLElement | null
      const numberLayer = slide.querySelector('[data-number-layer]') as HTMLElement | null
      const hintElements = slide.querySelectorAll<HTMLElement>('[data-tilt-hint]')
      const gradientElements = slide.querySelectorAll<HTMLElement>('[data-tilt-gradient]')

      if (this.slideLocked[index]) {
        if (carLayer) {
          carLayer.style.opacity = '1'
        }
        if (numberLayer) {
          numberLayer.style.opacity = '1'
        }
        for (const element of hintElements) {
          this.applyTiltHintElement(element, { strength: 0, locked: false })
        }
        for (const element of gradientElements) {
          this.applyTiltEdgeGradient(element, { strength: 0, locked: false })
        }
        return
      }

      const isActive = index === this.puzzleIndex
      const usesReveal = this.slideUsesRevealOpacity(index)

      if (!usesReveal) {
        this.smoothedOpacity[index] = { car: 0, number: 0 }
        if (carLayer) {
          carLayer.style.opacity = '0'
        }
        if (numberLayer) {
          numberLayer.style.opacity = '0'
        }
        return
      }

      const remapAxes = shouldRemapTiltAxes(this.orientation.sensorSource)
      const reading = remapAxes ? remapTiltReading(this.latestReading) : this.latestReading
      const target = remapAxes ? remapTiltTarget(puzzle.target) : puzzle.target

      const { car, number, distance } = computeDualRevealOpacity(
        reading,
        target,
        puzzle.car.tolerance,
        puzzle.number?.tolerance,
      )

      const hasReading = this.sensorsReady && distance !== null
      const inCarRange = isWithinCarRevealRange(distance, puzzle.car.tolerance)
      const liveTarget: SmoothedLayerOpacity =
        hasReading && inCarRange ? { car, number } : { car: 0, number: 0 }

      if (!isActive) {
        // During a swipe, preview the incoming photo for the current tilt only.
        this.smoothedOpacity[index] = liveTarget
      } else {
        const opacityLerp = opacityLerpForSensorSource(this.orientation.sensorSource)
        this.smoothedOpacity[index] = lerpLayerOpacity(
          this.smoothedOpacity[index],
          { car, number },
          hasReading,
          opacityLerp,
        )
      }

      const displayCar = this.smoothedOpacity[index].car
      const displayNumber = this.smoothedOpacity[index].number

      if (carLayer) {
        carLayer.style.opacity = String(displayCar)
      }
      if (numberLayer) {
        numberLayer.style.opacity = String(displayNumber)
      }

      if (isActive && this.sensorsReady) {
        this.proximityHaptics.update(
          distance,
          puzzle.car.tolerance,
          puzzle.number?.tolerance,
          { locked: false, active: true },
        )
      }

      if (!this.slideLocked[index] && isActive && this.sensorsReady) {
        const hintTolerance = hintToleranceForDistance(
          distance,
          puzzle.car.tolerance,
          puzzle.number?.tolerance,
        )
        const hintState = computeTiltHintState(reading, target, hintTolerance)
        for (const element of hintElements) {
          const side = element.dataset.tiltHint as keyof typeof hintState | undefined
          const sideState: TiltHintSideState = side ? hintState[side] : { strength: 0, locked: false }
          this.applyTiltHintElement(element, sideState)
        }
        for (const element of gradientElements) {
          const side = element.dataset.tiltGradient as keyof typeof hintState | undefined
          const sideState: TiltHintSideState = side ? hintState[side] : { strength: 0, locked: false }
          this.applyTiltEdgeGradient(element, sideState)
        }
      } else if (isActive) {
        for (const element of hintElements) {
          this.applyTiltHintElement(element, { strength: 0, locked: false })
        }
        for (const element of gradientElements) {
          this.applyTiltEdgeGradient(element, { strength: 0, locked: false })
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
          this.applyTiltHintElement(element, { strength: 0, locked: false })
        }
        for (const element of gradientElements) {
          this.applyTiltEdgeGradient(element, { strength: 0, locked: false })
        }
        this.updateGalleryChrome()
      }
    })
  }

  private startGalleryLoop(container: HTMLElement, slides: NodeListOf<HTMLElement>): void {
    let revealTransitionsEnabled = false

    const tick = () => {
      this.updateGalleryChrome()
      this.updateGallerySlides(slides)

      if (!revealTransitionsEnabled) {
        revealTransitionsEnabled = true
        container.classList.add('is-reveal-ready')
      }

      this.rafId = window.requestAnimationFrame(tick)
    }

    this.rafId = window.requestAnimationFrame(tick)
  }

  private applyTiltHintElement(element: HTMLElement, state: TiltHintSideState): void {
    const label = element.querySelector('.tilt-hint-label')
    const defaultLabel = element.dataset.tiltLabel ?? ''

    if (state.locked) {
      if (label) {
        label.textContent = '✓'
      }
      element.style.setProperty('--hint-scale', '1')
      element.style.opacity = '1'
      element.classList.add('is-axis-locked')
      element.classList.remove('is-active')
      return
    }

    element.classList.remove('is-axis-locked')
    if (label) {
      label.textContent = defaultLabel
    }

    if (state.strength <= 0) {
      element.style.setProperty('--hint-scale', '0')
      element.style.opacity = '0'
      element.classList.remove('is-active')
      return
    }

    const scale = 0.65 + 0.55 * state.strength
    element.style.setProperty('--hint-scale', String(scale))
    element.style.opacity = String(0.45 + 0.55 * state.strength)
    element.classList.toggle('is-active', state.strength > 0.45)
  }

  private applyTiltEdgeGradient(element: HTMLElement, state: TiltHintSideState): void {
    if (state.locked || state.strength <= 0) {
      element.style.opacity = '0'
      element.classList.remove('is-active')
      return
    }

    element.style.opacity = String(0.2 + 0.65 * state.strength)
    element.classList.toggle('is-active', state.strength > 0.35)
  }

  private stopGalleryLoop(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.proximityHaptics.cancel()
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
      this.setScreen(nextScreen)
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
    })
  }
}
