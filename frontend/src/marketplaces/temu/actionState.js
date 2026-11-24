/** Temu actions in flight, by "<row>:<action>", so a double click sends one request. */
export function actionState() {
  const inFlight = new Set()
  return {
    start: (key) => (inFlight.has(key) ? false : Boolean(inFlight.add(key))),
    done: (key) => inFlight.delete(key),
    isBusy: (key) => inFlight.has(key),
  }
}
