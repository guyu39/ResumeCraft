// ============================================================
// CertificatesPreview — 证书资质预览
// ============================================================

import React from 'react'
import { CertificateItem } from '@/types/resume'
import ModuleSection from './ModuleSection'

interface CertificatesPreviewProps {
  items: CertificateItem[]
  themeColor: string
}

const CertificatesPreview: React.FC<CertificatesPreviewProps> = ({ items, themeColor }) => {
  const validItems = items.filter((item) => item.name)

  return (
    <ModuleSection title="证书资质" themeColor={themeColor}>
      {validItems.length === 0 ? (
        <p className="text-[9pt] text-gray-300 italic">请填写证书资质</p>
      ) : (
        <div className="space-y-2">
          {validItems.map((item) => (
            <div key={item.id} className="flex items-start gap-3">
              <span className="text-[9.5pt] text-gray-700 flex-1">
                📜 {item.name}
              </span>
              <div className="text-right flex-shrink-0">
                {item.date && (
                  <span className="text-[9pt] text-gray-900 font-semibold block">{item.date}</span>
                )}
                {item.issuer && (
                  <span className="text-[8pt] text-gray-400 block">{item.issuer}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </ModuleSection>
  )
}

export default CertificatesPreview
