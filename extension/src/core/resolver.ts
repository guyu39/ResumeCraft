import type { Module } from './api-client'

export interface WorkItem {
  company: string
  position: string
  startDate: string
  endDate: string
  description: string
}

export interface EducationItem {
  school: string
  major: string
  degree: string
  startDate: string
  endDate: string
  honors?: string
}

export interface ProjectItem {
  name: string
  role: string
  startDate: string
  endDate: string
  description: string
  techStack?: string[]
}

export interface PersonalData {
  name: string
  targetPosition: string
  phone: string
  email: string
  gender: string
  age: string
  hometown: string
  education: string
  workYears: string
  politics: string
  city: string
  github: string
  website: string
  linkedin: string
  personalAccount: { platform: string; url: string }
  extraInfos: Array<{ id: string; title: string; value: string }>
}

export interface ResolvedResumeData {
  personal: PersonalData
  summary: string
  work: WorkItem[]
  education: EducationItem[]
  project: ProjectItem[]
  skills: string
  awards: Array<{ name: string; level: string; date: string }>
  certificates: Array<{ name: string; issuer: string; date: string }>
  languages: Array<{ language: string; level: string }>
}

function str(data: Record<string, unknown>, key: string): string {
  return (data[key] as string) ?? ''
}

function arr<T>(data: Record<string, unknown>, key: string): T[] {
  return (data[key] as T[]) ?? []
}

export function resolveModules(modules: Module[]): ResolvedResumeData {
  const result: ResolvedResumeData = {
    personal: {
      name: '', targetPosition: '', phone: '', email: '',
      gender: '', age: '', hometown: '', education: '',
      workYears: '', politics: '', city: '',
      github: '', website: '', linkedin: '',
      personalAccount: { platform: '', url: '' },
      extraInfos: [],
    },
    summary: '',
    work: [],
    education: [],
    project: [],
    skills: '',
    awards: [],
    certificates: [],
    languages: [],
  }

  for (const mod of modules) {
    const d = mod.data
    switch (mod.type) {
      case 'personal':
        result.personal = {
          name: str(d, 'name'),
          targetPosition: str(d, 'targetPosition'),
          phone: str(d, 'phone'),
          email: str(d, 'email'),
          gender: str(d, 'gender'),
          age: str(d, 'age'),
          hometown: str(d, 'hometown'),
          education: str(d, 'education'),
          workYears: str(d, 'workYears'),
          politics: str(d, 'politics'),
          city: str(d, 'city'),
          github: str(d, 'github'),
          website: str(d, 'website'),
          linkedin: str(d, 'linkedin'),
          personalAccount: (d.personalAccount as { platform: string; url: string }) ?? { platform: '', url: '' },
          extraInfos: arr(d, 'extraInfos'),
        }
        break

      case 'summary':
        result.summary = str(d, 'content')
        break

      case 'work':
        result.work = arr<WorkItem>(d, 'items')
        break

      case 'education':
        result.education = arr<EducationItem>(d, 'items')
        break

      case 'project':
        result.project = arr<ProjectItem>(d, 'items')
        break

      case 'skills':
        result.skills = str(d, 'content')
        break

      case 'awards':
        result.awards = arr(d, 'items')
        break

      case 'certificates':
        result.certificates = arr(d, 'items')
        break

      case 'languages':
        result.languages = arr(d, 'items')
        break
    }
  }

  return result
}

export function getResumeValue(data: ResolvedResumeData, key: string): string {
  const parts = key.split('.')
  let current: unknown = data

  for (const part of parts) {
    if (current == null || typeof current !== 'object') return ''
    current = (current as Record<string, unknown>)[part]
  }

  if (current == null) return ''
  if (typeof current === 'string') return current
  return String(current)
}
