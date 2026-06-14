export interface PlatformRule {
  name: string
  adapterKey: string
  hostnamePattern: RegExp
  applyPagePattern: RegExp
}

export const PLATFORM_RULES: PlatformRule[] = [
  {
    name: 'Boss直聘',
    adapterKey: 'boss',
    hostnamePattern: /boss\.zhipin\.com/,
    applyPagePattern: /\/chat\/|\/friend\/|\/geek\/interaction\/delivery/,
  },
  {
    name: '智联招聘',
    adapterKey: 'zhilian',
    hostnamePattern: /www\.zhaopin\.com/,
    applyPagePattern: /\/jobs\/.*apply|\/resume\/post/,
  },
  {
    name: '猎聘',
    adapterKey: 'liepin',
    hostnamePattern: /www\.liepin\.com/,
    applyPagePattern: /\/apply\/|\/delivery\//,
  },
]

export interface PlatformInfo {
  detected: boolean
  isApplyPage: boolean
  platform: PlatformRule | null
}

export function detectPlatform(): PlatformInfo {
  const hostname = location.hostname
  const pathname = location.pathname

  for (const rule of PLATFORM_RULES) {
    if (rule.hostnamePattern.test(hostname)) {
      return {
        detected: true,
        isApplyPage: rule.applyPagePattern.test(pathname),
        platform: rule,
      }
    }
  }

  return { detected: false, isApplyPage: false, platform: null }
}
