// ============================================================
// aiCacheKey — 为 JD 类 AI 请求生成稳定缓存键
// 相同简历版本 + 相同 JD/参数 命中缓存，避免重复烧 token（H4）。
// ============================================================

/** djb2 32 位哈希（用于压缩长文本，仅作缓存键，不用于安全场景） */
function djb2(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  // 附带长度降低碰撞概率
  return `${(hash >>> 0).toString(36)}_${str.length}`
}

/**
 * 按 简历id + 简历更新时间 + 快照 + 长文本/参数 生成缓存键。
 * resumeUpdatedAt 变化（简历被编辑）会使旧缓存自动失效。
 */
export function buildAICacheKey(parts: {
  resumeId: string
  resumeUpdatedAt?: number
  snapshotVersionId?: string | null
  text?: string
  extra?: Record<string, string | undefined>
}): string {
  const { resumeId, resumeUpdatedAt = 0, snapshotVersionId = '', text = '', extra = {} } = parts
  const extraStr = Object.entries(extra)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  return [resumeId, resumeUpdatedAt, snapshotVersionId || '-', djb2(text), djb2(extraStr)].join('|')
}
