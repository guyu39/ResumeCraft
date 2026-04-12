// ============================================================
// PreviewPage — 独立预览页面
// 仅展示简历内容，不触发打印
// ============================================================

import React from 'react'
import { useResumeStore } from '@/store/resumeStore'
import PagedResumePaper from '@/components/resume/PagedResumePaper'

const PreviewPage: React.FC = () => {
    const { resume } = useResumeStore()

    return (
        <div className="min-h-screen bg-[#E8EAED] flex items-start justify-center py-8 px-6 overflow-auto">
            <PagedResumePaper resume={resume} />
        </div>
    )
}

export default PreviewPage
