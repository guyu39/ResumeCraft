export async function uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const token = localStorage.getItem('accessToken')
  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch('/api/users/avatar', {
    method: 'POST',
    headers,
    body: formData,
  })
  const json = await res.json()
  if (json.code !== 'OK') {
    throw new Error(json.message || '头像上传失败')
  }
  return json.data
}
