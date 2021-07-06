import { Application, fs, got, cmd } from '@listenai/lisa_core'
import { IcmdWord, TomlConfig } from './typings/data';
import tomlHandler from './util/toml-handler'
import cookie from './libs/cookie'
import { initConfig } from './util/project-config'
import { buildingFile, thresholdsFile } from './util/project-fs'
import download from './util/download'

export default class InitAsr {
    _log: any;
    _application: Application;
    _pconfig: any;
    _asrRes: any

    _finishResolver: any

    constructor(task: any, application: Application) {
        this._log = task
        this._application = application
    }

    async start() {
        let finishResolver: { (arg0: number): void; (value: unknown): void } | null = null
        const cmdDonePromise = new Promise(r => {
        finishResolver = r
        })

        this._finishResolver = finishResolver

        fs.removeSync(buildingFile(this._application, 'cmd.txt'))
        fs.removeSync(buildingFile(this._application, 'cmd_finaly.txt'))
        fs.removeSync(buildingFile(this._application, 'cmd_train.txt'))
        fs.removeSync(buildingFile(this._application, 'cmd.bin'))

        fs.removeSync(buildingFile(this._application, 'main.txt'))
        fs.removeSync(buildingFile(this._application, 'main_finaly.txt'))
        fs.removeSync(buildingFile(this._application, 'main_train.txt'))
        fs.removeSync(buildingFile(this._application, 'main.bin'))
        
        this._pconfig = initConfig(this._application)

        this._initAsr()

        await cmdDonePromise
    }

    _thresholdJson(fileName: string) {
        const thresholdJson: any = {}
        if (fs.existsSync(thresholdsFile(this._application, fileName))) {
            const wordsThresholdStr = fs.readFileSync(thresholdsFile(this._application, fileName)).toString()
            const wordsThreshold = wordsThresholdStr.split('\r').join('').split('\n').filter(val => val !== '')
            wordsThreshold.forEach(threshold => {
                const thresholdArr = threshold.split(',')
                if (parseInt(String(thresholdArr[0] || 0), 10)) {
                    thresholdJson[thresholdArr[4]] = threshold
                }
            })
        }
        return thresholdJson
    }

    _writeMainToml(mainWords: IcmdWord[], cmdWords: IcmdWord[]) {
        const mainToml: TomlConfig = {
            wakeup: [],
            cmds: []
        };
        mainWords.forEach(item => {
            mainToml.wakeup.push({
                text: item.text,
                pinyin: item.pinyin,
            })
        })
        cmdWords.forEach(item => {
            mainToml.cmds.push({
                text: item.text,
                pinyin: item.pinyin,
            })
        })
        fs.writeFileSync(buildingFile(this._application, 'main.toml'), tomlHandler.stringify(mainToml))
    }

    _initAsr() {
        // 新增判断，是否需要冲击训练
        const mainWords: IcmdWord[] = this._pconfig.wakeup
        const cmdWords: IcmdWord[] = this._pconfig.cmds

        // write mainToml
        this._writeMainToml(mainWords, cmdWords)
        
        const wordsThresholdJson: any = this._thresholdJson('main_finaly.txt')
        const wordsTrainThresholdJson: any = this._thresholdJson('main_train.txt')
        const cmdsThresholdJson: any = this._thresholdJson('cmd_finaly.txt')
        const cmdsTrainThresholdJson: any = this._thresholdJson('cmd_train.txt')
        
        let allHas = true

        const mainTxtArr = []
        const mainTrainTxtArr = []
        if (allHas) {
            for (let i = 0; i <= mainWords.length - 1; i++) {
                const wakeup = mainWords[i]
                if (wordsTrainThresholdJson[wakeup.pinyin]) {
                    mainTrainTxtArr.push(wordsTrainThresholdJson[wakeup.pinyin])
                } else {
                    allHas = false
                    break
                }
                if (wordsThresholdJson[wakeup.pinyin]) {
                    mainTxtArr.push(wordsThresholdJson[wakeup.pinyin])
                } else {
                    allHas = false
                    break
                }
            }
        }

        const cmdTxtArr = []
        const cmdTrainTxtArr = []
        if (allHas) {
            for (let i = 0; i <= cmdWords.length - 1; i++) {
                const cmd = cmdWords[i]
                if (cmdsTrainThresholdJson[cmd.pinyin]) {
                    cmdTrainTxtArr.push(cmdsTrainThresholdJson[cmd.pinyin])
                } else {
                    allHas = false
                    break
                }
                if (cmdsThresholdJson[cmd.pinyin]) {
                    cmdTxtArr.push(cmdsThresholdJson[cmd.pinyin])
                } else {
                    allHas = false
                    break
                }
            }
        }

        if (allHas) {
            const mainTxt = mainTxtArr.join('\n')
            const cmdTxt = cmdTxtArr.join('\n')

            fs.writeFileSync(buildingFile(this._application, 'main.txt'), mainTxt)
            fs.writeFileSync(buildingFile(this._application, 'cmd.txt'), `${mainTxt}\n${cmdTxt}`)

            const mainTrainTxt = mainTrainTxtArr.join('\n')
            const cmdTrainTxt = cmdTrainTxtArr.join('\n')

            fs.writeFileSync(buildingFile(this._application, 'main_train.txt'), mainTrainTxt)
            fs.writeFileSync(buildingFile(this._application, 'cmd_train.txt'), `${mainTrainTxt}\n${cmdTrainTxt}`)

            this._finish()
        } else {
            
            this._reqAsr({
                mainWords,
                cmdWords,
            })
        }
    }

    async _reqAsr(data: { mainWords: any, cmdWords: any }) {
        const mlp = this._application.context?.algo?.esr_res?.name || undefined;
        if (!mlp) {
            throw new Error('缺少esr_res资源名，请检查是否依赖了算法包或算法包是否正确')
        }
        const miniEsrVersion = mlp === 'automl_3kword.priaux' ? 1266 :( mlp.split('_')[1] || 1266)
        this._asrRes = {
            taskId: '',
            urls: [],
        }
        const opt = {
            method: 'POST',
            url: '/runPackage',
            body: {
                mlp,
                miniEsrVersion,
                chipId: 1,
                firmwareId: 20,
                hardwareId: 15,
                scene: 1,
                micSpan: this._pconfig.applicationJson?.hw_config.mic.dist,
                micType: this._pconfig.applicationJson?.hw_config.mic.type === 'amic' ? '模拟麦克风' : '数字麦克风',
                highThresh: 50,
                lowThresh: 25,
                modelId: this._pconfig.template || '',
                wakeWordList: Array.prototype.map
                .call(
                    data.mainWords,
                    word => `${word.text}:${word.pinyin.replace(/\s/g, '_')}`
                )
                .join(';'),
                asrWordList: Array.prototype.map
                .call(
                    data.cmdWords,
                    word => `${word.text}:${word.pinyin.replace(/\s/g, '_')}`
                )
                .join(';'),
            },
        }
        this._application.log('冲击的参数:\n')
        this._application.log(`${JSON.stringify(opt)}\n`)
        try {
            const { body } = await got.post(`${this._application.apiHost}${this._application.apiPrefix}${opt.url}`, {
                headers: {
                    Authorization: `Bearer ${await cookie.getAccessToken()}`,
                    'User-Agent': 'LStudio',
                },
                json: opt.body,
                responseType: 'json'
            });
            this._asrRes.taskId = (body as any).data.taskid
            await this._handleAsr()
        } catch (error) {
            this._application.log(JSON.stringify(error.response))
            throw new Error('云端冲击失败，请查看.lisa/exce.log文件查看错误信息')
        }
    }

    async _handleAsr() {
        if (this._asrRes.taskId) {
            this._application.log(this._asrRes.taskId)
            this._asrCheck()
            return
        }
        if (this._asrRes.urls.length > 0) {
            await this._saveAsr()
        } else {
            this._log.output = 'asr资源准备完毕'
            this._finish()
        }
    }

    async _asrCheck() {
        let self = this
        const opt = {
            method: 'POST',
            url: '/checkPackage',
            body: {
                taskid: this._asrRes.taskId,
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
            this._application.log('冲击的结果:\n')
            this._application.log(`${(body as any).recode}\n`)
            this._application.log(`${JSON.stringify(body)}\n`)
            if ((body as any).recode === '000000') {
                if (this._asrRes.checkTimes) {
                    this._log.output = '[####################] 100%'
                }
                this._asrRes = {
                    urls: [
                        {
                            name: 'main.txt',
                            uri: (body as any).data.mainStatePath,
                            param: 'wakeupTxt',
                        },
                        {
                            name: 'cmd.txt',
                            uri: (body as any).data.asrStatePath,
                            param: 'commandTxt',
                        },
                    ],
                }
                this._handleAsr()
            } else {
                if ((body as any).recode === '200004') {
                    this._log.output = (body as any).data.message
                }
                if ((body as any).recode === '200001') {
                    if (this._asrRes.checkTimes) {
                        // eslint-disable-next-line max-depth
                        if (this._asrRes.checkTimes > 90) {
                            this._asrRes.checkTimes += 0.1
                        } else {
                            this._asrRes.checkTimes += 2
                        }
                    } else {
                        this._asrRes.checkTimes = 1
                        this._log.output = (body as any).data.message
                    }
                    let prossBar = ''
                    if (this._asrRes.checkTimes >= 99) {
                        this._asrRes.checkTimes = 99.9
                    }
                    for (let i = 0; i < this._asrRes.checkTimes; i += 5) {
                        prossBar += '#'
                    }
                    this._log.output = `当前云端训练进度: [${prossBar}] ${this._asrRes.checkTimes}%`
                }
                setTimeout(async function () {
                    await self._asrCheck()
                }, 10000)
            }
        } catch (error) {
            setTimeout(async function () {
                await self._asrCheck()
            }, 10000)
        }
    }

    async _saveAsr() {
        const res = this._asrRes.urls[0]
        this._application.log(JSON.stringify(res))

        await download({
            uri: res.uri,
            name: res.name,
            targetDir: buildingFile(this._application),
            progress: (percentage, transferred, total) => {
                this._log.output = `正在下载:${res.name} ${percentage}% ${transferred}/${total}`
            },
            errCb: () => {
                this._log.output = `下载${res.name}失败...开始重试...`
            }
        })

        this._asrRes.urls.splice(0, 1)
        this._handleAsr()
    }

    async _finish() {
        await this._handleWordsThreshold('main')
        await this._handleWordsThreshold('cmd')

        // 重新生成main_finaly/cmd_finaly.txt
        this._finishCopy('cmd')
        this._finishCopy('main')

        await this._buildMainCmdBin()

        this._finishResolver(true)
    }

    async _handleWordsThreshold (fileName: string) {
        const buildingTxtFile = buildingFile(this._application, `${fileName}.txt`)

        if (!fs.existsSync(buildingFile(this._application, `${fileName}_train.txt`))) {
            fs.copyFileSync(buildingTxtFile, buildingFile(this._application, `${fileName}_train.txt`))
        }

        let thresholdTxtFile = thresholdsFile(this._application, `${fileName}_finaly.txt`)
        if (!fs.existsSync(thresholdTxtFile)) {
            thresholdTxtFile = thresholdsFile(this._application, `${fileName}.txt`)
        }
        if (!fs.existsSync(thresholdTxtFile)) {
            // 如果原本没有阈值文件，返回
            return
        }

        const baseTxtArr = []
        
        const wordsThresholdStr = fs.readFileSync(buildingTxtFile).toString()
        const wordsThreshold = wordsThresholdStr.split('\r').join('').split('\n').filter(val => val !== '')
        
        const lastWordsThresholdStr = fs.readFileSync(thresholdTxtFile).toString()
        const lastWordsThreshold = lastWordsThresholdStr.split('\r').join('').split('\n').filter(val => val !== '')
    
        let change = false
    
        for (let i = 0; i <= wordsThreshold.length - 1; i++) {
          const tmp = wordsThreshold[i].split(',')
          for (let j = 0; j <= lastWordsThreshold.length - 1; j++) {
            const oldTmp = lastWordsThreshold[j].split(',')
            if (oldTmp[4] === tmp[4]) {
              if (tmp[1] !== oldTmp[1] || tmp[2] !== oldTmp[2]) {
                tmp[1] = parseInt(oldTmp[1], 10) > 0 ? oldTmp[1] : tmp[1]
                tmp[2] = oldTmp[2]
                change = true
              }
              break
            }
          }
          baseTxtArr.push(tmp)
        }
        const baseTxt = baseTxtArr.map(item => item.join(',')).join(';')
        fs.writeFileSync(buildingTxtFile, baseTxt.replace(/;/g, '\n'))
        return change
      }

    async _buildMainCmdBin() {
        const exe = this._application.context.cskBuild?.miniEsrTool.exe
        if (exe && fs.existsSync(exe)) {
            this._application.log(`${exe} ${['buildLanguageModel', this._application.context.cskBuild?.miniEsrTool.mainModelBin].join(' ')}`)
            await cmd(exe, ['buildLanguageModel', this._application.context.cskBuild?.miniEsrTool.mainModelBin], {
                cwd: buildingFile(this._application),
                timeout: 5000
            })
            this._application.log(`${exe} ${['buildLanguageModel', this._application.context.cskBuild?.miniEsrTool.asrModelBin].join(' ')}`)
            await cmd(exe, ['buildLanguageModel', this._application.context.cskBuild?.miniEsrTool.asrModelBin], {
                cwd: buildingFile(this._application),
                timeout: 5000
            })
        } else {
            throw new Error('无法生成main.bin/cmd.bin资源文件，请重新install @generator/csk或咨询FAE')
        }
    }

    _finishCopy(type: string) {
        fs.copyFileSync(buildingFile(this._application, `${type}.txt`), buildingFile(this._application, `${type}_finaly.txt`))

        fs.copyFileSync(buildingFile(this._application, `${type}.txt`), thresholdsFile(this._application, `${type}.txt`))
        fs.copyFileSync(buildingFile(this._application, `${type}_finaly.txt`), thresholdsFile(this._application, `${type}_finaly.txt`))
        fs.copyFileSync(buildingFile(this._application, `${type}_train.txt`), thresholdsFile(this._application, `${type}_train.txt`))
    }
}

