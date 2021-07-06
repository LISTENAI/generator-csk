import * as fs from 'fs'
import * as path from 'path'
import * as Configstore from 'configstore'

const cookie = {
  getAccessToken: async () => {
    const config = new Configstore('lisa')
    return (config.get('lisaUserInfo') || {}).accessToken
  },
  get: async (key: string) => {
    const cookiePath = path.join(process.env.ListenAiCachePath || '', 'cookie', 'cookie')
    if (!fs.existsSync(cookiePath)) {
      return null
    }
    const content = fs.readFileSync(cookiePath).toString()
    const cookies: any = {}
    content.split(';').forEach((item: string) => {
      const itemArr = item.split('=')
      if (itemArr[0] && itemArr[1]) {
        cookies[itemArr[0]] = itemArr[1]
      }
    })
    return cookies[key] || ''
  },
}

export default cookie
