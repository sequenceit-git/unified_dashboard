/** Which TikTok Shop actions are running, so a double click sends one request. */
export function actionState() {
  const running = new Set()
  return {
    start(key) {
      if (running.has(key)) return false
      running.add(key)
      return true
    },
    done(key) { running.delete(key) },
    isBusy(key) { return running.has(key) },
  }
}
