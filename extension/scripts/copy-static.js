import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const distDir = path.resolve(rootDir, 'dist')

const copies = [
  { src: 'manifest.json', dest: 'manifest.json' },
  { src: 'popup/index.html', dest: 'popup/index.html' },
  { src: 'popup/popup.js', dest: 'popup/popup.js' },
  { src: 'popup/styles.css', dest: 'popup/styles.css' },
  { src: 'icons/icon16.png', dest: 'icons/icon16.png' },
  { src: 'icons/icon48.png', dest: 'icons/icon48.png' },
  { src: 'icons/icon128.png', dest: 'icons/icon128.png' },
]

for (const { src, dest } of copies) {
  const srcPath = path.resolve(rootDir, src)
  const destPath = path.resolve(distDir, dest)
  if (fs.existsSync(srcPath)) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    fs.copyFileSync(srcPath, destPath)
  }
}

console.log('Static files copied to dist/')
