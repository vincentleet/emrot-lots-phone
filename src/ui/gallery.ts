export interface GallerySwipeOptions {
  getIndex: () => number
  setIndex: (index: number) => void
  slideCount: number
  onDrag?: (dragPx: number) => void
}

/** Min horizontal drag (fraction of width) to change photo. */
const SWIPE_COMMIT_RATIO = 0.1

/** Past this fraction, always snap to the next/previous slide. */
const SWIPE_HALF_RATIO = 0.28

/** Fast flick: px/ms with a little movement commits a page turn. */
const FLICK_VELOCITY_PX_MS = 0.22
const MIN_FLICK_DRAG_PX = 20

export function attachGallerySwipe(
  viewport: HTMLElement,
  track: HTMLElement,
  options: GallerySwipeOptions,
): () => void {
  const { getIndex, setIndex, slideCount, onDrag } = options
  let startX = 0
  let startTime = 0
  let lastX = 0
  let lastTime = 0
  let dragging = false
  let dragPx = 0
  let activePointerId: number | null = null

  const resolveTargetIndex = (width: number, releaseVelocity: number): number => {
    const index = getIndex()
    if (width <= 0 || slideCount <= 1) {
      return index
    }

    const threshold = width * SWIPE_COMMIT_RATIO
    const half = width * SWIPE_HALF_RATIO

    if (
      releaseVelocity <= -FLICK_VELOCITY_PX_MS &&
      dragPx <= -MIN_FLICK_DRAG_PX &&
      index < slideCount - 1
    ) {
      return index + 1
    }

    if (
      releaseVelocity >= FLICK_VELOCITY_PX_MS &&
      dragPx >= MIN_FLICK_DRAG_PX &&
      index > 0
    ) {
      return index - 1
    }

    if (dragPx <= -half && index < slideCount - 1) {
      return index + 1
    }
    if (dragPx >= half && index > 0) {
      return index - 1
    }

    if (dragPx <= -threshold && index < slideCount - 1) {
      return index + 1
    }
    if (dragPx >= threshold && index > 0) {
      return index - 1
    }

    return index
  }

  const snap = (): void => {
    const width = viewport.clientWidth
    const elapsed = Math.max(lastTime - startTime, 1)
    const releaseVelocity = (lastX - startX) / elapsed
    const targetIndex = resolveTargetIndex(width, releaseVelocity)

    dragPx = 0
    onDrag?.(0)
    track.style.transition = 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)'
    setIndex(targetIndex)
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return
    }

    dragging = true
    activePointerId = event.pointerId
    const now = performance.now()
    startX = event.clientX
    startTime = now
    lastX = event.clientX
    lastTime = now
    dragPx = 0
    track.style.transition = 'none'
    viewport.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (!dragging || event.pointerId !== activePointerId) {
      return
    }

    lastX = event.clientX
    lastTime = performance.now()
    dragPx = event.clientX - startX
    onDrag?.(dragPx)
  }

  const endDrag = (event: PointerEvent): void => {
    if (!dragging || event.pointerId !== activePointerId) {
      return
    }

    dragging = false
    activePointerId = null
    lastX = event.clientX
    lastTime = performance.now()

    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId)
    }

    snap()
  }

  viewport.addEventListener('pointerdown', onPointerDown)
  viewport.addEventListener('pointermove', onPointerMove)
  viewport.addEventListener('pointerup', endDrag)
  viewport.addEventListener('pointercancel', endDrag)

  return () => {
    viewport.removeEventListener('pointerdown', onPointerDown)
    viewport.removeEventListener('pointermove', onPointerMove)
    viewport.removeEventListener('pointerup', endDrag)
    viewport.removeEventListener('pointercancel', endDrag)
  }
}
