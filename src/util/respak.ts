import {Application} from '@listenai/lisa_core'
import lisa from '@listenai/lisa_core'
import * as path from 'path'
import * as crc from 'crc'
const {fs} = lisa

export default class Respak {
  _ctx: any;
  _log: any;
  _application: Application;
  _pconfig: any;
  _resItemCount: number = 10 + 250 + 250

  constructor(ctx: any, task: any, application: Application) {
    this._ctx = ctx
    this._log = task
    this._application = application
  }

  async start(pconfig: any) {
    this._pconfig = pconfig

    if (this._pconfig.business.sys_mode === 'private') {
      const demoRes = this._allResources('demo')
      this._packageFw(demoRes)
    } else {
      const defaultRes = this._allResources('public')
      this._packageFw(defaultRes)
    }

    return {event: 'success'}
  }

  
  _allResources(sys_mode: string) {
    const resources = []
    this._application.log(`respakList->${JSON.stringify(this._ctx.respakList || {})}`)
    for (let key in (this._ctx.respakList || {})) {
      if (this._ctx.respakList[key] === 'application.json') {
        resources.push([key, Buffer.from(this._getPrivateJson())])
      } else if (this._ctx.respakList[key] === 'keywords.txt') {
        resources.push([key, Buffer.from(this._newKeywords(sys_mode))])
      } else {
        resources.push([key, fs.readFileSync(this._getBuildingFile(this._ctx.respakList[key]))])
      }
    }
    // resources.push(['INFO', Buffer.from('Castor')])
    // resources.push(['BIAS', fs.readFileSync(this._getBuildingFile('bias.bin'))])
    // resources.push(['MLPR', fs.readFileSync(this._getBuildingFile('mlp.bin'))])
    // resources.push(['KEY1', fs.readFileSync(this._getBuildingFile('main.bin'))])
    // resources.push(['KEY2', fs.readFileSync(this._getBuildingFile('cmd.bin'))])

    // resources.push(['KMAP', Buffer.from(this._newKeywords(sys_mode))])
    // if (fs.existsSync(this._getBuildingFile('1KHz.mp3'))) {
    //   resources.push(['TEST', fs.readFileSync(this._getBuildingFile('1KHz.mp3'))])
    // } else {
    //   resources.push(['TEST', Buffer.from('TEST')])
    // }
    // resources.push(['R007', Buffer.from('R007')])
    // resources.push(['R008', Buffer.from(this._getHardwareJson())])
    // resources.push(['R009', Buffer.from(this._getPrivateJson())])

    for (let index = 0; index < 250; index++) {
      if (index < this._pconfig.tones.tts.length) {
        const tone = this._pconfig.tones.tts[index]
        resources.push(['G' + this._fillItemID(tone.id), fs.readFileSync(this._getBuildingFile('tones/' + tone.id + '.mp3'))])
      } else {
        resources.push(['G' + this._fillItemID(index + 1), Buffer.from('G' + (index + 1))])
      }
    }
    for (let index = 0; index < 250; index++) {
      if (index < this._pconfig.tones.include.length) {
        const tone = this._pconfig.tones.include[index]
        resources.push(['I' + this._fillItemID(tone.id - 250), fs.readFileSync(this._getBuildingFile('tones/' + tone.id + '.mp3'))])
      } else {
        resources.push(['I' + this._fillItemID(index + 1), Buffer.from('I' + (index + 1))])
      }
    }
    this._resItemCount = Object.keys(this._ctx.respakList).length + 250 + 250
    let result = {headers: [], resData: Buffer.from(''), offset: (resources.length * 16) + (2 * 16)}
    resources.forEach(res => {
      result = this._resConcat(result.headers, result.resData, result.offset, res[0], res[1])
    })
    return result
  }

  _newKeywords(sys_mode: string) {
    const fileName = 'keywords.txt'
    // if (fs.existsSync(this._getBuildingFile(fileName))) {
    //   return fs.readFileSync(this._getBuildingFile(fileName)).toString()
    // }

    let keywords: any = []
    const ctrlMode = this._pconfig.business.asr.cmd_send_mode
    const cmdsTypeHex = this._pconfig.cmds_config ? this._pconfig.cmds_config.type === 'hex' : true

    const words = [...this._totalCmd(), ...this._totalAwake()]
    const reg = /.{2}/g
    words.forEach(word => {
      const item = {
        key: word.pinyin,
        kid: word.id,
        txt: word.text,
        play: (sys_mode === 'demo' && word.play) ? [word.play] : [],
        cmds: [],
        infrared_cmds: [],
      }
      if (sys_mode === 'demo' && Boolean(word.cmds)) {
        if (ctrlMode === 2) {
          item.infrared_cmds = word.cmds.replace(/\s/g, '')
          .replace(/，/g, ',')
          .split(',')
          .filter((item: any) => item !== '')
          .map((item: any) => parseInt(item, 10))
        } else {
          item.cmds = cmdsTypeHex ?
            word.cmds.replace(/\s/g, '').match(reg) && word.cmds.replace(/\s/g, '').match(reg).map((item: any) => parseInt(item, 16)) :
            word.cmds.split('') && word.cmds.split('').map((item: any) => item.charCodeAt())
        }
      }
      keywords.push(JSON.stringify(item))
    })

    keywords = keywords.join('\n')

    fs.writeFileSync(this._getBuildingFile(fileName), keywords)
    return keywords
  }

  _totalCmd() {
    const cmds = (this._pconfig.cmds || []).map((cmd: any, index: any) => {
      return {
        id: index + 1,
        text: cmd.text,
        pinyin: cmd.pinyin,
        play: cmd.play,
        cmds: cmd.cmds,
      }
    })
    return cmds
  }

  _totalAwake() {
    const awakes = (this._pconfig.wakeup || []).map((wakeup: any, index: any) => {
      return {
        id: index + 501,
        text: wakeup.text,
        pinyin: wakeup.pinyin,
        play: wakeup.play,
        cmds: wakeup.cmds,
      }
    })
    return awakes
  }

  _getHardwareJson() {
    return fs.readFileSync(this._getBuildingFile('hardware.json')).toString()
  }

  _getPrivateJson() {
    const fileName = 'application.json'
    let privateJson: any = this._requireNoCache(this._getBuildingFile(fileName))
    const enterAsr: any = []
    this._totalAwake().forEach((word: any) => {
      enterAsr.push(word.id)
    })
    if (privateJson.business.sys_mode === 'private') {
      privateJson.business.welcome = this._pconfig.welcome
    }
    if (privateJson.business.asr) {
      privateJson.business.asr.enter_asr = enterAsr
    }
    fs.writeFileSync(this._getBuildingFile(fileName), JSON.stringify(privateJson, null, '\t'))
    return JSON.stringify(privateJson)
  }

  _requireNoCache(url: string) {
    delete require.cache[require.resolve(url)]
    return require(url)
  }

  _fillItemID(id: number) {
    if (id < 10) {
      return '00' + id
    }
    if (id < 100) {
      return '0' + id
    }
    return String(id)
  }


  _resConcat(headers: any, resData: any, offset: any, name: any, data: any) {
    headers.push(this._str2HexStrFill(name))
    headers.push(this._int2HexStrFill(resData.length + offset))
    headers.push(this._int2HexStrFill(data.length))
    headers.push(this._int2HexStrFill(crc.crc32(data)))
    // headers.push()
    // 每个数据内容，对齐4字节
    const fillData = Buffer.alloc(4 - (data.length % 4))
    return {headers: headers, resData: Buffer.concat([resData, data, fillData]), offset: offset}
  }

  _str2HexStrFill(value: any) {
    value = Buffer.from(value).toString('hex')
    let result = ''
    if (value.length % 2 !== 0) {
      value = '0' + value
    }
    for (let i = 0; i < 8 - value.length; i++) {
      result += '0'
    }
    return value + result
  }

  _int2HexStrFill(value: any) {
    const buf = Buffer.alloc(4)
    buf.writeUInt32LE(value, 0)
    return buf.toString('hex')
  }

  _packageFw(res: any) {
    const userId = ''
    const res_tag = this._str2HexStrFill('IFLY')
    let hdr_crc = null
    const protocol_ver = this._int2HexStrFill(parseInt('10000', 16))
    const date_time = this._int2HexStrFill(this._resDateTime())
    const item_cnt = this._int2HexStrFill(this._resItemCount)
    const item_offset = this._int2HexStrFill(2 * 16)
    const data_len = this._int2HexStrFill(res.resData.length)
    const user_id = this._int2HexStrFill(userId)
    let headers = null

    headers = [protocol_ver, date_time, item_cnt, item_offset, data_len, user_id].concat(res.headers)
    hdr_crc = this._int2HexStrFill(crc.crc32(Buffer.from(headers.join(''), 'hex')))
    headers = Buffer.from([res_tag, hdr_crc].concat(headers).join(''), 'hex')

    fs.writeFileSync(this._getBuildingFile('respak.bin'), Buffer.concat([headers, res.resData]))
  }

  _resDateTime() {
    const now = new Date()
    const yy = this._int2BitStrFill(now.getFullYear() - 2000, 6)
    const mm = this._int2BitStrFill(now.getMonth() + 1, 4)
    const dd = this._int2BitStrFill(now.getDate(), 5)
    const hh = this._int2BitStrFill(now.getHours(), 5)
    const min = this._int2BitStrFill(now.getMinutes(), 6)
    const ss = this._int2BitStrFill(now.getSeconds(), 6)
    return Buffer.from(parseInt(yy + mm + dd + hh + min + ss, 2).toString(16), 'hex').readInt32BE(0)
  }

  _int2BitStrFill(num: any, length: any) {
    const str = num.toString(2)
    let result = ''
    if (length && length > str.length) {
      for (let index = 0; index < length - str.length; index++) {
        result += '0'
      }
    }
    return result + str
  }

  _getBuildingFile(fileName?: string) {
    return fileName ? path.join(this._getCskBuildConfig('buildingPath'), fileName) : this._getCskBuildConfig('buildingPath')
  }

  _getCskBuildConfig(key: string) {
    return this._application.context.cskBuild[key]
  }
}