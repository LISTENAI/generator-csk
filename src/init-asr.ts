import lisa from '@listenai/lisa_core'
import {Application} from '@listenai/lisa_core'
import { IcmdWord, TomlConfig } from './typings/data';
import tomlHandler from './util/toml-handler'
import cookie from './libs/cookie'
import { initConfig } from './util/project-config'
import { buildingFile, thresholdsFile } from './util/project-fs'
import download from './util/download'
import * as path from 'path'

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

        lisa.fs.removeSync(buildingFile(this._application, 'cmd.txt'))
        lisa.fs.removeSync(buildingFile(this._application, 'cmd_finaly.txt'))
        lisa.fs.removeSync(buildingFile(this._application, 'cmd_train.txt'))
        lisa.fs.removeSync(buildingFile(this._application, 'cmd.bin'))

        lisa.fs.removeSync(buildingFile(this._application, 'main.txt'))
        lisa.fs.removeSync(buildingFile(this._application, 'main_finaly.txt'))
        lisa.fs.removeSync(buildingFile(this._application, 'main_train.txt'))
        lisa.fs.removeSync(buildingFile(this._application, 'main.bin'))
        
        this._pconfig = initConfig(this._application)

        this._initAsr()

        await cmdDonePromise
    }

    _thresholdJson(fileName: string) {
        const thresholdJson: any = {}
        if (lisa.fs.existsSync(thresholdsFile(this._application, fileName))) {
            const wordsThresholdStr = lisa.fs.readFileSync(thresholdsFile(this._application, fileName)).toString()
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
        lisa.fs.writeFileSync(buildingFile(this._application, 'main.toml'), tomlHandler.stringify(mainToml))
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

            lisa.fs.writeFileSync(buildingFile(this._application, 'main.txt'), mainTxt)
            lisa.fs.writeFileSync(buildingFile(this._application, 'cmd.txt'), `${mainTxt}\n${cmdTxt}`)

            const mainTrainTxt = mainTrainTxtArr.join('\n')
            const cmdTrainTxt = cmdTrainTxtArr.join('\n')

            lisa.fs.writeFileSync(buildingFile(this._application, 'main_train.txt'), mainTrainTxt)
            lisa.fs.writeFileSync(buildingFile(this._application, 'cmd_train.txt'), `${mainTrainTxt}\n${cmdTrainTxt}`)

            this._finish()
        } else {
            const mlp = this._application.context?.algo?.esr_res?.name || undefined;
            if (mlp) {
                this._reqAsr(mlp, {
                    mainWords,
                    cmdWords,
                })
            } else {
                this._triphoneAsr({
                    mainWords,
                    cmdWords,
                })
            }
            
        }
    }

    async _triphoneAsr(data: { mainWords: any, cmdWords: any }) {
        // "si2 liu4 du4|si2 qi1 du4|si2 ba1 du4|si2 jiu3 du4"
        const mainKeyword = Array.prototype.map
            .call(data.mainWords, word => word.pinyin)
            .join('|')
        const cmdKeyword = Array.prototype.map
            .call(data.mainWords.concat(data.cmdWords), word => word.pinyin)
            .join('|')
        await this._buildTriphoneState(mainKeyword, 'main.txt')
        await this._buildTriphoneState(cmdKeyword, 'cmd.txt')

        this._finish()
    }

    async _reqAsr(mlp: string, data: { mainWords: any, cmdWords: any }) {
        if (!mlp) {
            throw new Error('缺少esr_res资源名，请检查是否依赖了算法包或算法包是否正确')
        }
        // const miniEsrVersion = mlp === 'automl_3kword.priaux' ? 1266 :( mlp.split('_')[1] || 1266)
        const miniEsrVersion = Number(this._application.context?.algo?.esr_res?.version || 1266);
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
            const { body } = await lisa.got.post(`${this._application.apiHost}${this._application.apiPrefix}${opt.url}`, {
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
            const { body } = await lisa.got.post(`${this._application.apiHost}${this._application.apiPrefix}${opt.url}`, {
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
        // 词
        const words: IcmdWord[] = fileName === 'main' ? this._pconfig.wakeup : this._pconfig.wakeup.concat(this._pconfig.cmds)

        // building里的阈值文件
        const buildingTxtFile = buildingFile(this._application, `${fileName}.txt`)
        let buildingThreshold: string[] = []
        if (lisa.fs.existsSync(buildingTxtFile)) {
            buildingThreshold = lisa.fs.readFileSync(buildingTxtFile).toString().split('\r').join('').split('\n').filter(val => val !== '')
        }
        
        // @algo包的阈值文件
        const algoConfig = this._application.context?.algo || {}
        const algoTxtFile = algoConfig[`${fileName}_txt`] || ''
        let algoThreshold: string[] = []
        if (algoTxtFile && lisa.fs.existsSync(algoTxtFile)) {
            algoThreshold = lisa.fs.readFileSync(algoTxtFile).toString().split('\r').join('').split('\n').filter(val => val !== '')
        }

        // 项目里的阈值文件
        let thresholdTxtFile = thresholdsFile(this._application, `${fileName}_finaly.txt`)
        if (!lisa.fs.existsSync(thresholdTxtFile)) {
            thresholdTxtFile = thresholdsFile(this._application, `${fileName}.txt`)
        }
        let projectThreshold: string[] = []
        if (lisa.fs.existsSync(thresholdTxtFile)) {
            projectThreshold = lisa.fs.readFileSync(thresholdTxtFile).toString().split('\r').join('').split('\n').filter(val => val !== '')
        }

        // 逻辑：根据词，找阈值，顺序为：项目里的阈值文件 > @algo包的阈值文件 > building里的阈值文件
        
        const baseTxtArr: string[] = []
        // 单条阈值例子： -1 614 1154 -1 966 904 -1 2224 2463 ,500,0 -10000,10000,di1 feng1 su4
        words.forEach(word => {
            const pinyin = word.pinyin
            // 标记
            let tag = false

            // 遍历时，可减掉数组长度，但数组长度较小，并没有太大的性能问题。

            // 遍历项目里的阈值
            projectThreshold.forEach(thresholdStr => {
                const threshold = thresholdStr.split(',')
                if (threshold[4] === pinyin) {
                    // 当拼音一样，该阈值可以保存
                    baseTxtArr.push(thresholdStr)
                    tag = true
                }
            })

            // 该词已找到优先级高的阈值，进入下一个词
            if (tag) return

            // 遍历@algo包的阈值
            algoThreshold.forEach(thresholdStr => {
                const threshold = thresholdStr.split(',')
                if (threshold[4] === pinyin) {
                    // 当拼音一样，该阈值可以保存
                    baseTxtArr.push(thresholdStr)
                    tag = true
                }
            })

            // 该词已找到优先级高的阈值，进入下一个词
            if (tag) return

            // 遍历building里的阈值
            buildingThreshold.forEach(thresholdStr => {
                const threshold = thresholdStr.split(',')
                if (threshold[4] === pinyin) {
                    // 当拼音一样，该阈值可以保存
                    baseTxtArr.push(thresholdStr)
                    tag = true
                }
            })
        })

        // 保存到building
        lisa.fs.writeFileSync(buildingTxtFile, baseTxtArr.join('\n'))

        if (!lisa.fs.existsSync(buildingFile(this._application, `${fileName}_train.txt`))) {
            lisa.fs.copyFileSync(buildingTxtFile, buildingFile(this._application, `${fileName}_train.txt`))
        }
    }

    async _buildMainCmdBin() {
        const exe = this._application.context.cskBuild?.miniEsrTool.exe
        if (exe && lisa.fs.existsSync(exe)) {
            this._application.log(`${exe} ${['buildLanguageModel', this._application.context.cskBuild?.miniEsrTool.mainModelBin].join(' ')}`)
            await lisa.cmd(exe, ['buildLanguageModel', this._application.context.cskBuild?.miniEsrTool.mainModelBin], {
                cwd: buildingFile(this._application),
                timeout: 5000
            })
            this._application.log(`${exe} ${['buildLanguageModel', this._application.context.cskBuild?.miniEsrTool.asrModelBin].join(' ')}`)
            await lisa.cmd(exe, ['buildLanguageModel', this._application.context.cskBuild?.miniEsrTool.asrModelBin], {
                cwd: buildingFile(this._application),
                timeout: 5000
            })
        } else {
            throw new Error('无法生成main.bin/cmd.bin资源文件，请重新install @generator/csk或咨询FAE')
        }
    }

    async _buildTriphoneState(keyword: string, targetPath: string) {
        const exe = this._application.context.cskBuild?.miniEsrTool.exe
        if (exe && lisa.fs.existsSync(exe)) {
            delete require.cache[require.resolve(this._application.context.cskBuild?.miniEsrTool.triphoneState)];
            const targetJson = require(this._application.context.cskBuild?.miniEsrTool.triphoneState)
            targetJson.buildTriphoneState.keyword = keyword
            lisa.fs.writeFileSync(this._application.context.cskBuild?.miniEsrTool.triphoneState, JSON.stringify(targetJson))
            this._application.log(`${exe} ${['buildTriphoneState', this._application.context.cskBuild?.miniEsrTool.triphoneState].join(' ')}`)
            await lisa.cmd(exe, ['buildTriphoneState', this._application.context.cskBuild?.miniEsrTool.triphoneState], {
                cwd: this._application.context.cskBuild?.miniEsrTool.root,
                timeout: 5000
            })
            lisa.fs.copyFileSync(path.join(this._application.context.cskBuild?.miniEsrTool.root, 'keywordState/keywords.txt'), buildingFile(this._application, targetPath))
        } else {
            throw new Error('无法生成main.bin/cmd.bin资源文件，请重新install @generator/csk或咨询FAE')
        }
    }

    _finishCopy(type: string) {
        lisa.fs.copyFileSync(buildingFile(this._application, `${type}.txt`), buildingFile(this._application, `${type}_finaly.txt`))

        lisa.fs.copyFileSync(buildingFile(this._application, `${type}.txt`), thresholdsFile(this._application, `${type}.txt`))
        lisa.fs.copyFileSync(buildingFile(this._application, `${type}_finaly.txt`), thresholdsFile(this._application, `${type}_finaly.txt`))
        lisa.fs.copyFileSync(buildingFile(this._application, `${type}_train.txt`), thresholdsFile(this._application, `${type}_train.txt`))
    }
}

