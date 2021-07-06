import {got} from '@listenai/lisa_core'
import cookie from '../libs/cookie'

async function getLogToken(id: number | string) {
  try {
    const { body } = await got.post(`https://api.iflyos.cn/external/ls_log/client/get_token`, {
      headers: {
        Authorization: `Bearer ${await cookie.getAccessToken()}`,
      },
      json: {
        project_id: id
      },
      responseType: 'json'
    });
    return (body as any)?.token
  } catch (error) {
    if (error.message.indexOf('code 400')) {
      console.log('该账号无该项目访问权限，请确认打包账号或LSCloud项目id')
    } else if (error.message.indexOf('code 400')) {
      console.log('登录态已过期，请重新登录')
    }
    
    return false
  }
}

export default getLogToken