/** tiktok_shop listing: listFields · sizeChart (moved verbatim from ListModal.jsx) */
import SizeChartField from '../SizeChartField'

export default function SizeChart({ ctx }) {
  const { categoryRules, setSizeChart, shopId, sizeChart } = ctx
  return (
    <>
      <SizeChartField
        shopId={shopId}
        rules={categoryRules}
        value={sizeChart}
        onChange={setSizeChart}
      />
    </>
  )
}
