import { puzzles } from '../config/puzzles'
import type { OrientationReading, Puzzle } from '../config/types'
import {
  formatOrientation,
  formatTarget,
  OrientationManager,
} from '../lib/orientation'
import { computeRevealOpacity, isDigitFound } from '../lib/reveal'
import { releaseWakeLock, requestWakeLock } from '../lib/wakeLock'

type Screen = 'intro' | 'puzzle' | 'summary' | 'calibrate'

const CALIBRATION_TAP_COUNT = 5
const CALIBRATION_TAP_WINDOW_MS = 2000
const LOCKED_FEEDBACK_MS = 1000

export class App {
  private root: HTMLElement
  private orientation = new OrientationManager()
  private screen: Screen = 'intro'
  private puzzleIndex = 0
  private foundDigits: string[] = []
  private currentOpacity = 0
  private puzzleLocked = false
  private wakeLock: WakeLockSentinel | null = null
  private rafId: number | null = null
  private lockedTimer: number | null = null
  private calibrationTapCount = 0
  private calibrationTapTimer: number | null = null
  private returnScreen: Screen = 'intro'
  private latestReading: OrientationReading = { beta: null, gamma: null, alpha: null }

  constructor(root: HTMLElement) {
    this.root = root
    this.render()
  }

  private get currentPuzzle(): Puzzle {
    return puzzles[this.puzzleIndex]
  }

  private setScreen(screen: Screen): void {
    this.screen = screen
    this.render()
  }

  private render(): void {
    this.root.innerHTML = ''

    switch (this.screen) {
      case 'intro':
        this.renderIntro()
        break
      case 'puzzle':
        this.renderPuzzle()
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
        <p class="eyebrow">Classified</p>
        <h1>Legacy of the Spy Phone</h1>
        <p class="lede">Tilt the phone to reveal hidden numbers on each vehicle photo.</p>
        ${
          !this.orientation.isSecureContext
            ? '<p class="warning">Motion sensors require HTTPS or the installed app. Do not open this as a local file.</p>'
            : ''
        }
        <button type="button" class="btn btn-primary" data-action="enable-sensors">
          Enable motion sensors
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
      button.textContent = 'Enabling…'
    }

    const granted = await this.orientation.requestAccess()

    if (!granted) {
      if (button) {
        button.disabled = false
        button.textContent = 'Enable motion sensors'
      }
      if (status) {
        status.hidden = false
        status.textContent =
          'Sensors unavailable. Install via HTTPS or the APK, then tap again.'
      }
      return
    }

    this.orientation.start((reading) => {
      this.latestReading = reading
    })

    this.puzzleIndex = 0
    this.foundDigits = []
    this.setScreen('puzzle')
    void this.acquireWakeLock()
  }

  private renderPuzzle(): void {
    const puzzle = this.currentPuzzle
    const overlay = puzzle.overlay ?? { top: '45%', left: '50%' }
    const container = this.createScreen('puzzle-screen')

    container.innerHTML = `
      <div class="puzzle-header">
        <span class="puzzle-count">${this.puzzleIndex + 1} / ${puzzles.length}</span>
      </div>
      <div class="puzzle-stage">
        <img class="puzzle-image" src="${puzzle.image}" alt="Vehicle photo ${this.puzzleIndex + 1}" />
        <div
          class="digit-overlay ${this.puzzleLocked ? 'is-locked' : ''}"
          data-digit-overlay
          style="top: ${overlay.top}; left: ${overlay.left}; opacity: ${this.currentOpacity};"
        >
          ${puzzle.digit}
        </div>
        <div class="locked-banner" data-locked-banner hidden>Number locked</div>
      </div>
      <div class="puzzle-footer">
        <p class="puzzle-hint">Hold the phone at the correct angle to reveal the digit.</p>
        <button type="button" class="btn btn-primary" data-action="next" disabled>
          Next photo
        </button>
      </div>
    `

    this.attachCalibrationTrigger(container)
    this.root.append(container)

    this.puzzleLocked = false
    this.currentOpacity = 0
    this.startPuzzleLoop(container)
  }

  private startPuzzleLoop(container: HTMLElement): void {
    const overlay = container.querySelector('[data-digit-overlay]') as HTMLElement | null
    const nextButton = container.querySelector('[data-action="next"]') as HTMLButtonElement | null
    const lockedBanner = container.querySelector('[data-locked-banner]') as HTMLElement | null
    const puzzle = this.currentPuzzle

    const tick = () => {
      const opacity = computeRevealOpacity(this.latestReading, puzzle.target, puzzle.tolerance)
      this.currentOpacity = opacity

      if (overlay) {
        overlay.style.opacity = String(opacity)
      }

      if (!this.puzzleLocked && isDigitFound(opacity)) {
        this.puzzleLocked = true
        overlay?.classList.add('is-locked')
        if (lockedBanner) {
          lockedBanner.hidden = false
        }

        this.lockedTimer = window.setTimeout(() => {
          if (nextButton) {
            nextButton.disabled = false
          }
        }, LOCKED_FEEDBACK_MS)
      }

      this.rafId = window.requestAnimationFrame(tick)
    }

    this.rafId = window.requestAnimationFrame(tick)
  }

  private stopPuzzleLoop(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    if (this.lockedTimer !== null) {
      window.clearTimeout(this.lockedTimer)
      this.lockedTimer = null
    }
  }

  private renderSummary(): void {
    void this.releaseWakeLock()

    const container = this.createScreen('summary-screen')
    const code = this.foundDigits.join('-')

    container.innerHTML = `
      <div class="summary-content">
        <p class="eyebrow">Transmission complete</p>
        <h1>Recovered code</h1>
        <p class="code-display">${code}</p>
        <p class="lede">Use this code to continue the mission.</p>
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
        <button type="button" class="btn btn-primary" data-action="copy-target">
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
      if (nextScreen === 'puzzle') {
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
        status.textContent = `Copied ${snippet} — paste into puzzles.ts`
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
        this.stopPuzzleLoop()
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

      if (target.dataset.action === 'next') {
        this.stopPuzzleLoop()
        this.foundDigits.push(this.currentPuzzle.digit)

        if (this.puzzleIndex < puzzles.length - 1) {
          this.puzzleIndex += 1
          this.setScreen('puzzle')
        } else {
          this.setScreen('summary')
          this.orientation.stop()
        }
      }
    })
  }
}
