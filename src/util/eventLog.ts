import lisa from '@listenai/lisa_core'
import * as Configstore from 'configstore'
const config = new Configstore('lisa')
const eventLog = async function () {
  lisa.application.debug('********************csk**********************')
    const accessToken = config.get('userInfo')?.accessToken
    const params = {
      event_type: 'generator-csk',
      command: 'create',
      arguments: {},
      flags: {},
      source: lisa.application.source, //芯片方案包
      board: lisa.application.board, //版型模版包
      algo: lisa.application.algo, //算法包
    }
    if (accessToken) {
      try {
        lisa.application.debug('>>> 获取request [create]：%s (%s)', JSON.stringify(params), accessToken)
        const response = await lisa.got.post('https://open.listenai.com/event_upload', {
          timeout: 1000,
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          json: params,
          responseType: 'json',
        })

        lisa.application.debug(`>>> 响应 : ${JSON.stringify(response.body)}`)
      } catch (error) {
        lisa.application.error(`错误:${error}`)
      }
    }
}

export default eventLog
