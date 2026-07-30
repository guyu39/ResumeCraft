import { authenticatedFetch } from './authenticatedFetch'

export async function uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await authenticatedFetch('/api/users/avatar', {
    method: 'POST',
    body: formData,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || json?.code !== 'OK') {
    throw new Error(json?.message || '头像上传失败')
  }
  return json.data
}
