/** Which label buttons a result allows: never Buy while Temu is still buying (that could buy twice). */
export function labelButtons(result) {
  const status = result?.status
  return { buy: !status, retry: status === 'failed', check: status === 'pending', open: status === 'bought' }
}
