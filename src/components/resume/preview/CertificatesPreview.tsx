// ============================================================
// CertificatesPreview — 证书资质预览
// ============================================================

import React from 'react'
import { CertificateItem } from '@/types/resume'
import ModuleSection from './ModuleSection'
import { useI18n } from '@/hooks/useI18n'

interface CertificatesPreviewProps {
  items: CertificateItem[]
  themeColor: string
  title?: string
  moduleId?: string
}

const CertificatesPreview: React.FC<CertificatesPreviewProps> = ({ items, themeColor, title = '证书资质', moduleId }) => {
  const { t } = useI18n()
  const validItems = items.filter((item) => item.name)

  return (
    <ModuleSection title={title} themeColor={themeColor} moduleId={moduleId}>
      {validItems.length === 0 ? (
        <p className="text-[9pt] text-gray-300 italic">{t('certificates.fillCerts')}</p>
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
