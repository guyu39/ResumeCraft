// ============================================================
// 导出 API
// ============================================================

import { apiClient } from './client'
import type { CreateExportRequest, ExportTask } from './types'

export const exportApi = {
  create: (resumeId: string, data: CreateExportRequest) =>
    apiClient.post<ExportTask>(`/resumes/${resumeId}/exports`, data),

  getStatus: (taskId: string) =>
    apiClient.get<ExportTask>(`/exports/${taskId}`),
}