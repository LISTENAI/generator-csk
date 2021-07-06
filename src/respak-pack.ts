import {Application, fs} from '@listenai/lisa_core'
import * as crc from 'crc'
import { initConfig } from './util/project-config'
import { buildingFile } from './util/project-fs'

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

  async start() {
    this._pconfig = initConfig(this._application)
    const res = this._allResources()
    this._packageFw(res)

    return {event: 'success'}
  }
  
  _allResources() {
    const resources = []
    this._application.log(`respakList->${JSON.stringify(this._ctx.respakList || {})}`)
    for (let key in (this._ctx.respakList || {})) {
      resources.push([key, fs.readFileSync(buildingFile(this._application, this._ctx.respakList[key]))])

    }

    for (let index = 0; index < 250; index++) {
      if (index < this._pconfig.tones.tts.length) {
        const tone = this._pconfig.tones.tts[index]
        resources.push(['G' + this._fillItemID(tone.id), fs.readFileSync(buildingFile(this._application, `tones/${tone.id}.mp3`))])
      } else {
        resources.push(['G' + this._fillItemID(index + 1), Buffer.from('G' + (index + 1))])
      }
    }
    for (let index = 0; index < 250; index++) {
      if (index < this._pconfig.tones.include.length) {
        const tone = this._pconfig.tones.include[index]
        resources.push(['I' + this._fillItemID(tone.id - 250), fs.readFileSync(buildingFile(this._application, `tones/${tone.id}.mp3`))])
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

    fs.writeFileSync(buildingFile(this._application, 'respak.bin'), Buffer.concat([headers, res.resData]))
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
}