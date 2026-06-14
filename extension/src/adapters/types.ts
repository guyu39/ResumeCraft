export interface FieldSelectorMap {
  [resumeKey: string]: string
}

export interface PlatformAdapter {
  isApplyPage(): boolean
  getFieldSelectors(): FieldSelectorMap
  getFormContainer(): HTMLElement | null
}
