import { puzzles } from '../config/puzzles'
import type { OrientationReading } from '../config/types'
import {
  computeTiltHints,
  formatOrientation,
  formatTarget,
  OrientationManager,
} from '../lib/orientation'
import { computeRevealOpacity, isDigitFound } from '../lib/reveal'
import { releaseWakeLock, requestWakeLock } from '../lib/wakeLock'
import { attachGallerySwipe } from './gallery'

type Screen = 'intro' | 'gallery' | 'summary' | 'calibrate'

const CALIBRATION_TAP_COUNT = 5
const CALIBRATION_TAP_WINDOW_MS = 2000

export class App {
  private root: HTMLElement
  private orientation = new OrientationManager()
  private screen: Screen = 'intro'
  private puzzleIndex = 0
  private slideLocked: boolean[] = puzzles.map(() => false)
  private galleryContainer: HTMLElement | null = null
  private galleryTrack: HTMLElement | null = null
  private galleryDragPx = 0
  private detachGallerySwipe: (() => void) | null = null
  private wakeLock: WakeLockSentinel | null = null
  private rafId: number | null = null
  private calibrationTapCount = 0
  private calibrationTapTimer: number | null = null
  private returnScreen: Screen = 'intro'
  private latestReading: OrientationReading = { beta: null, gamma: null, alpha: null }

  constructor(root: HTMLElement) {
    this.root = root
    this.render()
  }

  private allSlidesLocked(): boolean {
    return this.slideLocked.every(Boolean)
  }

  private setScreen(screen: Screen): void {
    this.stopGalleryLoop()
    this.detachGallerySwipe?.()
    this.detachGallerySwipe = null
    this.galleryContainer = null
    this.galleryTrack = null
    this.screen = screen
    this.render()
  }

  private render(): void {
    this.root.innerHTML = ''

    switch (this.screen) {
      case 'intro':
        this.renderIntro()
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

  private renderIntro(): void {
    const container = this.createScreen('intro-screen')
    container.innerHTML = `
      <div class="intro-content">
        <div class="photos-app-icon" aria-hidden="true"></div>
        <h1>Photos</h1>
        <p class="lede">Allow motion access to view your library.</p>
        ${
          !this.orientation.isSecureContext
            ? '<p class="warning">Open via HTTPS or the installed app — not as a local file.</p>'
            : ''
        }
        <button type="button" class="btn btn-photos" data-action="enable-sensors">
          Continue
        </button>
        <p class="hint" data-sensor-status hidden></p>
      </div>
    `

    container.querySelector('[data-action="enable-sensors"]')?.addEventListener('click', () => {
      void this.enableSensors(container)
    })

    this.attachCalibrationTrigger(container)
    this.root.append(container)
  }

  private async enableSensors(container: HTMLElement): Promise<void> {
    const button = container.querySelector('[data-action="enable-sensors"]') as HTMLButtonElement | null
    const status = container.querySelector('[data-sensor-status]') as HTMLElement | null

    if (button) {
      button.disabled = true
      button.textContent = 'Loading…'
    }

    const granted = await this.orientation.requestAccess()

    if (!granted) {
      if (button) {
        button.disabled = false
        button.textContent = 'Continue'
      }
      if (status) {
        status.hidden = false
        status.textContent =
          'Motion access unavailable. Install via HTTPS or the APK, then try again.'
      }
      return
    }

    this.orientation.start((reading) => {
      this.latestReading = reading
    })

    this.puzzleIndex = 0
    this.slideLocked = puzzles.map(() => false)
    this.setScreen('gallery')
    void this.acquireWakeLock()
  }

  private renderGallery(): void {
    const container = this.createScreen('gallery-screen')
    const slidesHtml = puzzles
      .map((puzzle, index) => {
        const overlay = puzzle.overlay ?? { top: '45%', left: '50%' }
        return `
          <article class="photos-slide" data-slide data-slide-index="${index}">
            <img
              class="photos-image"
              src="${puzzle.image}"
              alt="Photo ${index + 1}"
              draggable="false"
            />
            <div
              class="digit-overlay ${this.slideLocked[index] ? 'is-locked' : ''}"
              data-digit-overlay
              style="top: ${overlay.top}; left: ${overlay.left};"
            >
              ${puzzle.digit}
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
          `<span class="photos-dot ${index === this.puzzleIndex ? 'is-active' : ''} ${this.slideLocked[index] ? 'is-found' : ''}" data-photo-dot="${index}"></span>`,
      )
      .join('')

    container.innerHTML = `
      <header class="photos-toolbar">
        <button type="button" class="photos-toolbar-btn" data-action="albums" aria-label="Albums">
          <span class="photos-toolbar-chevron" aria-hidden="true">‹</span>
          <span>Albums</span>
        </button>
        <span class="photos-toolbar-title" data-photo-counter>${this.puzzleIndex + 1} of ${puzzles.length}</span>
        <button
          type="button"
          class="photos-toolbar-btn photos-toolbar-btn--icon"
          data-action="view-code"
          aria-label="View recovered code"
          ${this.allSlidesLocked() ? '' : 'hidden'}
        >
          <span aria-hidden="true">ⓘ</span>
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
    this.root.append(container)
    this.updateGalleryTransform(false)
    this.startGalleryLoop(container)
  }

  private goToSlide(index: number): void {
    this.puzzleIndex = index
    this.galleryDragPx = 0
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
      counter.textContent = `${this.puzzleIndex + 1} of ${puzzles.length}`
    }

    const codeButton = this.galleryContainer.querySelector('[data-action="view-code"]') as HTMLElement | null
    if (codeButton) {
      codeButton.hidden = !this.allSlidesLocked()
    }

    const dots = this.galleryContainer.querySelectorAll('[data-photo-dot]')
    dots.forEach((dot, index) => {
      dot.classList.toggle('is-active', index === this.puzzleIndex)
      dot.classList.toggle('is-found', this.slideLocked[index])
    })
  }

  private startGalleryLoop(container: HTMLElement): void {
    const slides = container.querySelectorAll<HTMLElement>('[data-slide]')

    const tick = () => {
      slides.forEach((slide, index) => {
        const puzzle = puzzles[index]
        const overlay = slide.querySelector('[data-digit-overlay]') as HTMLElement | null
        const hintElements = slide.querySelectorAll<HTMLElement>('[data-tilt-hint]')
        const opacity = computeRevealOpacity(
          this.latestReading,
          puzzle.target,
          puzzle.tolerance,
        )

        if (overlay) {
          overlay.style.opacity = String(opacity)
        }

        const isActive = index === this.puzzleIndex

        if (!this.slideLocked[index] && isActive) {
          const hints = computeTiltHints(this.latestReading, puzzle.target, puzzle.tolerance)
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

        if (!this.slideLocked[index] && isDigitFound(opacity)) {
          this.slideLocked[index] = true
          overlay?.classList.add('is-locked')
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
  }

  private renderSummary(): void {
    void this.releaseWakeLock()

    const container = this.createScreen('summary-screen')
    const code = puzzles.map((puzzle) => puzzle.digit).join('-')

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
    const snippet = formatTarget(target)

    try {
      await navigator.clipboard.writeText(snippet)
      if (status) {
        status.hidden = false
        status.textContent = `Copied ${snippet} — paste into puzzles.ts for photo ${this.puzzleIndex + 1}`
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
        this.returnScreen = this.screen === 'gallery' ? 'gallery' : this.screen
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

      if (action === 'view-code') {
        this.setScreen('summary')
      }

      if (action === 'close-summary') {
        this.setScreen('gallery')
        void this.acquireWakeLock()
      }

      if (action === 'albums') {
        // Decorative — stays in gallery
      }
    })
  }
}
