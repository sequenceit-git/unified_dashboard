/** tiktok_shop listing: listFields · certifications (moved verbatim from ListModal.jsx) */
import CertificationFields from '../CertificationFields'

export default function Certifications({ ctx }) {
  const { aspects, categoryRules, certificationFiles, setCertificationFiles, visibleAttributes } = ctx
  return (
    <>
      <CertificationFields
        rules={categoryRules.certifications}
        aspects={aspects}
        schema={visibleAttributes}
        files={certificationFiles}
        onChange={(id, value) => setCertificationFiles((current) => ({ ...current, [id]: value }))}
      />
    </>
  )
}
