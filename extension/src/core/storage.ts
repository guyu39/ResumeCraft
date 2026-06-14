const API_BASE_KEY = 'rc_api_base'
const TOKEN_KEY = 'rc_jwt_token'
const SELECTED_RESUME_KEY = 'rc_selected_resume'

export const storage = {
  async getJwt(): Promise<string | null> {
    const result = await chrome.storage.session.get(TOKEN_KEY)
    return result[TOKEN_KEY] ?? null
  },

  async setJwt(token: string): Promise<void> {
    await chrome.storage.session.set({ [TOKEN_KEY]: token })
  },

  async clearJwt(): Promise<void> {
    await chrome.storage.session.remove(TOKEN_KEY)
  },

  async getApiBase(): Promise<string> {
    const result = await chrome.storage.local.get(API_BASE_KEY)
    return result[API_BASE_KEY] ?? 'https://api.resumecraft.app'
  },

  async setApiBase(url: string): Promise<void> {
    await chrome.storage.local.set({ [API_BASE_KEY]: url })
  },

  async getSelectedResumeId(): Promise<string | null> {
    const result = await chrome.storage.local.get(SELECTED_RESUME_KEY)
    return result[SELECTED_RESUME_KEY] ?? null
  },

  async setSelectedResumeId(id: string): Promise<void> {
    await chrome.storage.local.set({ [SELECTED_RESUME_KEY]: id })
  },
}
