/**
 * System permission prompts are shown on top of the app, which Android reports as the app going to
 * the background. Auto-lock is paused while one is open, so granting a permission does not throw the
 * user back to the calculator in the middle of a setup step.
 */
let pending = 0;

export async function withoutAutoLock<T>(fn: () => Promise<T>): Promise<T> {
  pending += 1;
  try {
    return await fn();
  } finally {
    pending -= 1;
  }
}

export function autoLockPaused(): boolean {
  return pending > 0;
}
