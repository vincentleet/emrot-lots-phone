export interface GallerySwipeOptions {
  getIndex: () => number
  setIndex: (index: number) => void
  slideCount: number
  onDrag?: (dragPx: number) => void
}

export function attachGallerySwipe(
  viewport: HTMLElement,
  track: HTMLElement,
  options: GallerySwipeOptions,
): () => void {
  const { getIndex, setIndex, slideCount, onDrag } = options
  let startX = 0
  let dragging = false
  let dragPx = 0
  let activePointerId: number | null = null

  const snap = (): void => {
    const width = viewport.clientWidth
    const threshold = width * 0.18
    let index = getIndex()

    if (dragPx < -threshold && index < slideCount - 1) {
      index += 1
    } else if (dragPx > threshold && index > 0) {
      index -= 1
    }

    dragPx = 0
    onDrag?.(0)
    track.style.transition = 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)'
    setIndex(index)
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return
    }

    dragging = true
    activePointerId = event.pointerId
    startX = event.clientX
    dragPx = 0
    track.style.transition = 'none'
    viewport.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (!dragging || event.pointerId !== activePointerId) {
      return
    }

    dragPx = event.clientX - startX
    onDrag?.(dragPx)
  }

  const endDrag = (event: PointerEvent): void => {
    if (!dragging || event.pointerId !== activePointerId) {
      return
    }

    dragging = false
    activePointerId = null

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
