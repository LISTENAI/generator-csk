import { Application, fs, got } from '@listenai/lisa_core'
import { Itone } from './typings/data';
import cookie from './libs/cookie'
import { initConfig } from './util/project-config'
import { buildingFile, tonesIncludeFile } from './util/project-fs'
import download from './util/download'
import * as crypto from 'crypto'
import * as path from 'path'

export default class InitTones {
    _log: any;
    _application: Application;
    _cacheDir: string;
    _pconfig: any;
    _tones: any;

    _finishResolver: any

    constructor(task: any, application: Application) {
        this._log = task
        this._application = application
        this._cacheDir = application.cacheDir
    }

    async start() {
        let finishResolver: { (arg0: number): void; (value: unknown): void } | null = null
        const cmdDonePromise = new Promise(r => {
        finishResolver = r
        })

        this._finishResolver = finishResolver

        this._pconfig = initConfig(this._application)

        this._initTones()

        await cmdDonePromise
    }

    async _initTones() {
        this._log.output = '初始化音频'
        this._tones = []
    
        const tonesTts = this._pconfig.tones.tts || []
        const tonesInclude = this._pconfig.tones.include || []
    
        if (!fs.existsSync(buildingFile(this._application, 'tones'))) {
          await fs.mkdirp(buildingFile(this._application, 'tones'))
        }
    
        tonesInclude.forEach((include: Itone) => {
          if (!include.text) {
            fs.writeFileSync(buildingFile(this._application, `tones/${include.id}.mp3`), '')
          } else {
            fs.copyFileSync(tonesIncludeFile(this._application, `${include.text}`), buildingFile(this._application, `tones/${include.id}.mp3`))
          }
        })
        this._application.log(`cacheDir: ${this._cacheDir}`)
        tonesTts.forEach((tts: Itone) => {
          if (!tts.text) {
            fs.writeFileSync(buildingFile(this._application, `tones/${tts.id}.mp3`), '')
          } else {
            let md5 = crypto.createHash('md5');
            let result = md5.update(`${tts.text}-${this._pconfig.speaker.vcn}-${this._pconfig.speaker.volume}-${this._pconfig.speaker.speed}`).digest('hex');
            const ttsFileName = `${result}.mp3`
            if (fs.existsSync(path.join(this._cacheDir, ttsFileName))) {
              fs.copyFileSync(path.join(this._cacheDir, ttsFileName), buildingFile(this._application, `tones/${tts.id}.mp3`))
            } else {
              tts.cacheName = ttsFileName
              this._tones.push(tts)
            }
          }
        })
    
        this._application.log(JSON.stringify(this._tones))
        this._handleTones()
    }


    async _handleTones() {
        if (this._tones.length > 0) {
            let opt = {
                method: 'POST',
                url: '/soundTrial',
                body: {
                    speakerId: this._pconfig.speaker.vcn,
                    speed: this._pconfig.speaker.speed,
                    volume: this._pconfig.speaker.volume,
                    message: this._trimSpace(this._tones[0].text),
                },
            }
            try {
                const { body } = await got.post(`${this._application.apiHost}${this._application.apiPrefix}${opt.url}`, {
                    headers: {
                        Authorization: `Bearer ${await cookie.getAccessToken()}`,
                        'User-Agent': 'LStudio',
                    },
                    json: opt.body,
                    responseType: 'json'
                });
                this._application.log(JSON.stringify((body as any).data.url))
                await this._saveTone((body as any).data.url, this._tones[0])  
            } catch (error) {
                throw new Error(error.message)
            }
        } else {
            this._log.output = `音频准备完毕`
            this._finish()
        }
    }

    async _saveTone(uri: string, tts: Itone) {
        await download({
            uri: uri,
            name: tts.cacheName || 'unknown',
            targetDir: this._cacheDir,
            progress: (percentage, transferred, total) => {
                this._log.output = `正在下载:${tts.text} ${percentage}% ${transferred}/${total}`
            },
            errCb: () => {
                this._log.output = `下载${tts.text}失败...开始重试...`
            }
        })
        fs.copyFileSync(path.join(this._cacheDir, tts.cacheName || 'unknown'), buildingFile(this._application, `tones/${tts.id}.mp3`))
        this._tones.splice(0, 1)
        this._handleTones()
    }

    async _finish() {
        this._finishResolver(true)
    }

    _trimSpace(str: string) {
        return str
            .replace(/\s+([\u4e00-\u9fa5])/gi, '$1')
            .replace(/([\u4e00-\u9fa5])\s+/gi, '$1')
            .replace(/\s{2,}/g, ' ')
            .replace(/[\r\n]/g, '')
            .trim()
    }
}

