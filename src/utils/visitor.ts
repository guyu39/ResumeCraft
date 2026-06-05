// ============================================================
// Visitor ID — 分享页访客匿名标识管理
// ============================================================

const VISITOR_KEY = (token: string) => `rc_visitor_${token}`

/**
 * 获取当前分享链接的访客标识。
 * 首次访问时生成 UUID，存入 localStorage，后续复用。
 */
export function getVisitorId(token: string): string {
  let id = localStorage.getItem(VISITOR_KEY(token))
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(VISITOR_KEY(token), id)
  }
  return id
}

/**
 * 清除当前分享链接的访客标识（调试用）
 */
export function clearVisitorId(token: string): void {
  localStorage.removeItem(VISITOR_KEY(token))
}
