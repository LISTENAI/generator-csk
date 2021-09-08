import lisa from '@listenai/lisa_core'
import * as Configstore from 'configstore'
const config = new Configstore('lisa')
async function eventLog() {
  lisa.application.log('********************csk**********************')
    const accessToken = config.get('userInfo')?.accessToken
    const context = lisa.application.context
    const params = {
      event_type: 'generator-csk',
      command: 'create',
      arguments: {},
      flags: {},
      source: context.source, //芯片方案包
      board: context.board, //版型模版包
      algo: context.algo, //算法包
    } 
    if (accessToken) {
      try {
        lisa.application.log(`>>> 获取request [create]： ${JSON.stringify(params)}（${accessToken}）`)
        const response = await lisa.got.post('https://open.listenai.com/event_upload', {
          timeout: 1000,
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          json: params,
          responseType: 'json',
        })

        lisa.application.log(`>>> 响应 : ${JSON.stringify(response.body)}`)
      } catch (error:any) {
        lisa.application.errorLog((`错误:${error}`))
      }
    }
}

export default eventLog
