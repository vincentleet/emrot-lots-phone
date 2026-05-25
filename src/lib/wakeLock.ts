export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  if (!('wakeLock' in navigator)) {
    return null
  }

  try {
    return await navigator.wakeLock.request('screen')
  } catch {
    return null
  }
}

export async function releaseWakeLock(sentinel: WakeLockSentinel | null): Promise<void> {
  if (!sentinel) {
    return
  }

  try {
    await sentinel.release()
  } catch {
    // Wake lock may already be released when the tab is hidden.
  }
}
