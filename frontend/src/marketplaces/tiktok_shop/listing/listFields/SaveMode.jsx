/** tiktok_shop listing: listFields · saveMode (moved verbatim from ListModal.jsx) */
import { SAVE_MODES } from '../rules'
import { Select } from '../../../../components/ui/Input'

export default function SaveMode({ ctx }) {
  const { saveMode, setSaveMode } = ctx
  return (
    <>
      <div className="border-t border-indigo-100 pt-2">
        <Select
          label="TikTok save mode"
          value={saveMode}
          onChange={(e) => setSaveMode(e.target.value)}
          options={SAVE_MODES}
        />
      </div>
    </>
  )
}
