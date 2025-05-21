import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
export const pluginRoot = path.dirname(path.dirname(__filename))