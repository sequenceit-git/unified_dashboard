/** A file chosen in a Temu action dialog, as `{ name, type, size, dataUrl }` (the API passes it on to Temu, never stores it). */
export function readFileValue(file, Reader = globalThis.FileReader) {
  return new Promise((resolve, reject) => {
    const reader = new Reader()
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: reader.result })
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })
}
