// ============================================================
// avatarUrl — 将 MinIO 直接 URL 转换为后端代理 URL
// ============================================================

/**
 * 将 MinIO 直链 URL 转换为后端代理 URL，避免 403
 * 输入: http://host:9000/resumecraft/avatars/{userID}/{filename}.png
 * 输出: /api/avatars/{userID}/{filename}.png
 */
export function avatarProxyUrl(rawUrl: string | undefined | null): string {
  if (!rawUrl) return ''
  const m = rawUrl.match(/\/avatars\/([^/]+)\/([^/?]+)/)
  if (m) {
    return `/api/avatars/${m[1]}/${m[2]}`
  }
  return rawUrl
}
