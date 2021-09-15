import { Application } from '@listenai/lisa_core'
import lisa from '@listenai/lisa_core'
import * as path from 'path'
import { IcmdWord, Interact, InteractConfig, Itone, ItonesConfig, Tones, TomlConfig } from './typings/data';
import tomlHandler from './util/toml-handler'
import cookie from './libs/cookie'

const {fs} = lisa 

export default class PreBuildRes {
  _ctx: any;
  _log: any;
  _application: Application;
  _cacheDir: string;
  _got: any;

  _pconfig: any;
  _firmwareConfiguration: any;
  _manifest: any;
  _tones: any;
  _asrRes: any

  _finishCode: any

  _finishResolver: any

  constructor(ctx: any, task: any, application: Application, got: any) {
    this._ctx = ctx
    this._log = task
    this._application = application
    this._cacheDir = application.cacheDir
    this._got = got
  }

  async start() {
    this._finishCode = {
      tones: false,
      asr: false,
    }

    this._log.output = 'start!'

    let finishResolver: { (arg0: number): void; (value: unknown): void } | null = null
    const cmdDonePromise = new Promise(r => {
      finishResolver = r
    })

    this._finishResolver = finishResolver

    await this._getPconf()
    await this._initManifest()
    await this._initFirmware()
    await this._initHardware()
    await this._checkOtherBin()
    this._application.log(JSON.stringify(this._manifest))
    this._application.log(JSON.stringify(this._application.context))
    if (this._manifest.tones.total !== this._manifest.tones.finish) {
      // this.log('正在获取tones音频')
      this._initTones()
    }

    // this._asrRes = {
    //   taskId: 'ee1fc2499793889d09dec3ef5e1aaa42',
    //   urls: [],
    // }
    // this._handleAsr()
    this._initAsr()

    await cmdDonePromise
    return this._pconfig
  }

  async _getPconf() {
    this._log.output = '初始化config'
    let config = {}

    let interactConfig: InteractConfig = {
      template: '',
      interact: [],
    }
    if (fs.existsSync(this._getConfigFile('interact.lini'))) {
      interactConfig = (tomlHandler.load(this._getConfigFile('interact.lini')) as unknown as InteractConfig)
    }

    const needTts:any = [];

    (interactConfig.interact || []).forEach(item => {
      if (item.play && item.play !== 1001) {
        if (!needTts.includes(item.play)) {
          needTts.push(item.play)
        }
      }
    })

    let tonesConfig: ItonesConfig = interactConfig.tones || {
      include: [],
      tts: []
    }
    
    let extonesConfig = (tomlHandler.load(this._getConfigFile('tones.lini')) as unknown as ItonesConfig)

    let tts = [...(tonesConfig.tts.filter(item => needTts.includes(item.id))), ...(extonesConfig.tts.map(item => {
      return {
        id: -1,
        text: item.text
      }
    }))]
    
    //去重
    const temp: any = {};
    const uniqueTts:any = [];
    tts.forEach(item => {
      temp[item.text] ? '' : (temp[item.text] = true && uniqueTts.push(item));
    });
    const interactPlayTts: any = {}
    tts = uniqueTts.map((toneItem: any, index: number) => {
      let res = {
        id: index + 1,
        text: toneItem.text
      };
      interactPlayTts[toneItem.id] = res.id
      return res;
    });

    tonesConfig.tts = tts

    let maxTtsId = tonesConfig.tts.length > 0 ?
      tonesConfig.tts.reduce((p: Tones, v: Tones) => (p.id < v.id ? v : p)).id :
      0

    const welcome: number[] = []
    const cmds: Interact[] = []
    const wakeup: Interact[] = []
    const entityTts: Tones[] = [];
    (interactConfig.interact || []).forEach(item => {
      switch (item.action) {
      case 'welcome':
        if (item.play && item.play !== 1001) {
          item.play = interactPlayTts[item.play] || item.play || ''
          welcome.push(parseInt(String(item.play), 10))
        }
        break
      case 'cmd':
        if (item.text) {
          if (item.play && item.play === 1001) {
            maxTtsId += 1
            entityTts.push({
              id: maxTtsId,
              text: `将为您${item.text}`,
            })
            item.play = maxTtsId
          }
          if (item.play && item.play !== 1001) {
            item.play = interactPlayTts[item.play] || item.play || ''
          }
          cmds.push(item)
        }
        break
      case 'wakeup':
        if (item.text) {
          if (item.play && item.play === 1001) {
            maxTtsId += 1
            entityTts.push({
              id: maxTtsId,
              text: `将为您${item.text}`,
            })
            item.play = maxTtsId
          }
          if (item.play && item.play !== 1001) {
            item.play = interactPlayTts[item.play] || item.play || ''
          }
          wakeup.push(item)
        }
        break
      default:
        break
      }
    })
    config = Object.assign(config, {
      template: interactConfig.template,
      welcome,
      cmds,
      wakeup,
    })

    tonesConfig.tts = [...tonesConfig.tts, ...entityTts]

    config = Object.assign(config, {
      speaker: interactConfig.speaker || {
        speed: 1.08,
        vcn: "x2_yezi",
        volume: 10
      }
    })
    config = Object.assign(config, {tones: tonesConfig})
    this._log.output = '初始化config完毕'
    this._application.log(JSON.stringify(this._pconfig))
    this._pconfig = config
  }

  async _initManifest() {
    this._log.output = '初始化manifest'
    const manifest = {
      startTime: new Date().getTime(),
      tones: {
        total: this._pconfig.tones.tts.length + this._pconfig.tones.include.length,
      },
      asrResources: {
        taskId: '',
        state: '等待提交训练',
        wakeupBin: false,
        commandBin: false,
        mlpBin: false,
        mlpVsBin: false,
        wakeupTxt: false,
        commandTxt: false,
      },
      applicationJson: false,
      hardwareJson: false,
      biasBin: false,
      state: '开始打包...',
      stateCode: 1,
    }
    this._log.output = '初始化manifest完毕'
    this._manifest = manifest
  }

  async _initFirmware() {
    this._log.output = '初始化applicationConfigration'
    if (fs.existsSync(this._getConfigFile('application.lini'))) {
      const applicationJson = tomlHandler.load(this._getConfigFile('application.lini'))
      this._firmwareConfiguration = applicationJson
      fs.writeFileSync(this._getBuildingFile('application.json'), JSON.stringify(applicationJson, null, '\t'))
      this._manifest.applicationJson = true
      this._pconfig = Object.assign(this._pconfig, applicationJson)
    }

    if (!this._manifest.applicationJson) {
      throw new Error('请先配置application.lini')
    }

    this._log.output = '初始化applicationConfigration完毕'
    this._application.log(JSON.stringify(this._pconfig))
  }

  async _initHardware() {
    this._log.output = '初始化hardwareConfigration'
    if (fs.existsSync(this._getConfigFile('hardware.lini'))) {
      const hardwareJson = tomlHandler.load(this._getConfigFile('hardware.lini'))
      fs.writeFileSync(this._getBuildingFile('hardware.json'), JSON.stringify(hardwareJson, null, '\t'))
      this._manifest.hardwareJson = true
    }

    if (!this._manifest.hardwareJson) {
      throw new Error('请先配置hardwareConfiguration')
    }
    this._log.output = '初始化hardwareConfigration完毕'
  }

  async _checkOtherBin() {

    if (Object.values(this._ctx.respakList || {}).includes('1KHz.mp3')) {
      await fs.copy(path.join(__dirname, '../templates/1KHz.mp3'), this._getBuildingFile('1KHz.mp3'))
    }

    if (Object.values(this._ctx.respakList || {}).includes('wakelist.txt')) {
      await fs.copy(path.join(__dirname, '../templates/wakelist.txt'), this._getBuildingFile('wakelist.txt'))
    }

    if (Object.values(this._ctx.respakList || {}).includes('wrap.json')) {
      const wrapJsonFile = this._application.context.algo?.wrap_json?.file_path
      if (wrapJsonFile && fs.existsSync(wrapJsonFile)) {
        const wrapJson = fs.readJSONSync(wrapJsonFile)
        const wrapJsonCaeParam = (wrapJson.cae?.param || []).map((item: any) => {
          if (item?.key === 'textdep') {
            item.val = 0
          }
          return item
        })
        if (wrapJson.cae?.param) {
          wrapJson.cae.param = wrapJsonCaeParam
        }
        await fs.writeFileSync(this._getBuildingFile('wrap.json'), JSON.stringify(wrapJson))
      } else {
        throw new Error(`当前算法包缺少wrap.json文件`)
      }
    }

    if (Object.values(this._ctx.respakList || {}).includes('resv.txt')) {
      await fs.copy(path.join(__dirname, '../templates/resv.txt'), this._getBuildingFile('resv.txt'))
    }

    if (Object.values(this._ctx.respakList || {}).includes('eq_default.bin')) {
      await fs.copy(path.join(__dirname, '../templates/eq_default.bin'), this._getBuildingFile('eq_default.bin'))
      if (fs.existsSync(this._getAliasFile('eq_default.bin'))) {
        // eslint-disable-next-line node/no-unsupported-features/node-builtins
        await fs.copy(this._getAliasFile('eq_default.bin'), this._getBuildingFile('eq_default.bin'))
      }
    }
    
    this._log.output = '初始化cae mlp'

    if (this._application.context.algo) {
      const dir = path.dirname(this._application.context.algo?.esr_res?.file_path)
      await fs.copy(path.join(dir, 'cae.bin'), this._getBuildingFile('bias.bin'))
      this._manifest.asrResources.mlpBin = true
      this._manifest.asrResources.mlpVsBin = true
      await fs.copy(path.join(dir, 'esr.bin'), this._getBuildingFile('mlp.bin'))
    } else {
      if (fs.existsSync(this._getAliasFile('bias.bin'))) {
        this._manifest.biasBin = true
        // eslint-disable-next-line node/no-unsupported-features/node-builtins
        await fs.copy(this._getAliasFile('bias.bin'), this._getBuildingFile('bias.bin'))
      }
      if (!this._manifest.biasBin) {
        throw new Error(`缺少${this._getAliasFile('bias.bin')}`)
      }
    }

    this._log.output = '初始化cae mlp完毕'

    if (fs.existsSync(this._getAliasFile('mlp.bin'))) {
      this._manifest.asrResources.mlpBin = true
      // eslint-disable-next-line node/no-unsupported-features/node-builtins
      await fs.copy(this._getAliasFile('mlp.bin'), this._getBuildingFile('mlp.bin'))
    }
    if (fs.existsSync(this._getAliasFile('mlp_vs.bin'))) {
      this._manifest.asrResources.mlpVsBin = true
      // eslint-disable-next-line node/no-unsupported-features/node-builtins
      await fs.copy(this._getAliasFile('mlp_vs.bin'), this._getBuildingFile('mlp_vs.bin'))
    }

    if (fs.existsSync(this._getAliasFile('master.bin'))) {
      // eslint-disable-next-line node/no-unsupported-features/node-builtins
      await fs.copy(this._getAliasFile('master.bin'), this._getBuildingFile('master.bin'))
    }

    if (fs.existsSync(this._getAliasFile('script.bin'))) {
      // eslint-disable-next-line node/no-unsupported-features/node-builtins
      await fs.copy(this._getAliasFile('script.bin'), this._getBuildingFile('script.bin'))
    }

    if (fs.existsSync(this._getAliasFile('flashboot.bin'))) {
      // eslint-disable-next-line node/no-unsupported-features/node-builtins
      await fs.copy(this._getAliasFile('flashboot.bin'), this._getBuildingFile('flashboot.bin'))
    }

  }

  async _initDefaultBin() {
    // await this._req('defaultBin')
  }

  async _initTones() {
    this._log.output = '初始化音频'
    this._tones = []

    const tonesTts = this._pconfig.tones.tts || []
    const tonesInclude = this._pconfig.tones.include || []

    if (!fs.existsSync(this._getBuildingFile('tones'))) {
      await fs.mkdirp(this._getBuildingFile('tones'))
    }

    tonesInclude.forEach((include: Itone) => {
      if (!include.text) {
        fs.writeFileSync(this._getBuildingFile(`tones/${include.id}.mp3`), '')
      } else {
        // eslint-disable-next-line node/no-unsupported-features/node-builtins
        fs.copyFileSync(this._getTonesIncludeFile(`${include.text}`), this._getBuildingFile(`tones/${include.id}.mp3`))
      }
    })
    this._application.log(`cacheDir: ${this._cacheDir}`)
    tonesTts.forEach((tts: Itone) => {
      if (!tts.text) {
        fs.writeFileSync(this._getBuildingFile(`tones/${tts.id}.mp3`), '')
      } else {
        const ttsFileName = `${tts.text}-${this._pconfig.speaker.vcn}-${this._pconfig.speaker.volume}-${this._pconfig.speaker.speed}.mp3`
        if (fs.existsSync(path.join(this._cacheDir, ttsFileName))) {
          // eslint-disable-next-line node/no-unsupported-features/node-builtins
          fs.copyFileSync(path.join(this._cacheDir, ttsFileName), this._getBuildingFile(`tones/${tts.id}.mp3`))
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
      const self = this
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
        const { body } = await this._got.post(`${this._application.apiHost}${this._application.apiPrefix}${opt.url}`, {
          headers: {
            Authorization: `Bearer ${await cookie.getAccessToken()}`,
            'User-Agent': 'LStudio',
          },
          json: opt.body,
          responseType: 'json'
        });
        this._application.log(JSON.stringify(body.data.url))
        await this._saveTone(body.data.url, this._tones[0])  
      } catch (error: any) {
        throw new Error(error.message)
      }
    } else {
      this._log.output = `音频准备完毕`
      this._finish('tones')
    }
  }

  async _saveTone(uri: string, tts: Itone) {
    const self = this
    const downRes = await fs.project.downloadFile({
      url: uri,
      fileName: tts.cacheName || 'unknown',
      targetDir: this._cacheDir,
      progress: (percentage, transferred, total) => {
        self._log.output = `正在下载音频[${tts.cacheName}]:${percentage}% ${transferred}/${total}`
      }
    })
    // eslint-disable-next-line node/no-unsupported-features/node-builtins
    fs.copyFileSync(path.join(this._cacheDir, tts.cacheName || 'unknown'), this._getBuildingFile(`tones/${tts.id}.mp3`))
    if (!downRes.err) {
      this._tones.splice(0, 1)
      this._handleTones()
    } else {
      this._log.output = `下载${tts.text}失败...${downRes.msg}`
      setTimeout(function () {
        self._saveTone(uri, tts)
      }, 5000)
    }
  }

  async _initAsr() {
    // this.log('正在获取asr资源')

    if (!Object.values(this._ctx.respakList || {}).includes('main.bin') && !Object.values(this._ctx.respakList || {}).includes('cmd.bin')) {

      fs.writeFileSync(this._getBuildingFile('main.txt'), '')
      fs.writeFileSync(this._getBuildingFile('cmd.txt'), '')

      this._manifest.asrResources.wakeupTxt = true
      this._manifest.asrResources.commandTxt = true
      this._manifest.asrResources.wakeupBin = true
      this._manifest.asrResources.commandBin = true
      this._manifest.asrResources.state = '正在下载资源'

      this._asrRes = {
        urls: [
          {
            name: 'mlp.bin',
            uri: 'https://cdn.iflyos.cn/public/lstudio/mlpDir/mlp.bin',
            param: 'mlpBin',
          },
          {
            name: 'mlp_vs.bin',
            uri: 'https://cdn.iflyos.cn/public/lstudio/mlpDir/mlp_vs.bin',
            param: 'mlpVsBin',
          },
        ],
      }
      this._handleAsr()

    } else {
      this._asrRes = {
        taskId: '',
        urls: [],
      }
      // 新增判断，是否需要冲击训练
      const mainWords: IcmdWord[] = this._pconfig.wakeup
      const cmdWords: IcmdWord[] = this._pconfig.cmds.map((cmd: IcmdWord, index: number) => {
        return {
          id: index + 1,
          text: cmd.text,
          pinyin: cmd.pinyin,
          play: cmd.play,
          cmds: cmd.cmds,
        }
      })
  
      // write mainToml
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
      fs.writeFileSync(this._getBuildingFile('main.toml'), tomlHandler.stringify(mainToml))
  
      const wordsThresholdJson: any = {}
      if (fs.existsSync(this._getThresholdsPath('main_finaly.txt'))) {
        const wordsThresholdStr = fs.readFileSync(this._getThresholdsPath('main_finaly.txt')).toString()
        const wordsThreshold = wordsThresholdStr.split('\r').join('').split('\n').filter(val => val !== '')
        wordsThreshold.forEach(threshold => {
          const thresholdArr = threshold.split(',')
          if (parseInt(String(thresholdArr[0] || 0), 10)) {
            wordsThresholdJson[thresholdArr[4]] = threshold
          }
        })
      }
  
      const cmdsThresholdJson: any = {}
      if (fs.existsSync(this._getThresholdsPath('cmd_finaly.txt'))) {
        const cmdsThresholdStr = fs.readFileSync(this._getThresholdsPath('cmd_finaly.txt')).toString()
        const cmdsThreshold = cmdsThresholdStr.split('\r').join('').split('\n').filter(val => val !== '')
        cmdsThreshold.forEach(threshold => {
          const thresholdArr = threshold.split(',')
          if (thresholdArr[0]) {
            cmdsThresholdJson[thresholdArr[4]] = threshold
          }
        })
      }
      let allHas = true
  
      const mainTxtArr = []
      if (allHas) {
        for (let i = 0; i <= mainWords.length - 1; i++) {
          const wakeup = mainWords[i]
          if (wordsThresholdJson[wakeup.pinyin]) {
            mainTxtArr.push(wordsThresholdJson[wakeup.pinyin])
          } else {
            allHas = false
            break
          }
        }
      }
  
      const cmdTxtArr = []
      if (allHas) {
        for (let i = 0; i <= cmdWords.length - 1; i++) {
          const cmd = cmdWords[i]
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
  
        fs.writeFileSync(this._getBuildingFile('main.txt'), mainTxt)
        fs.writeFileSync(this._getBuildingFile('cmd.txt'), `${mainTxt}\n${cmdTxt}`)
  
        this._manifest.asrResources.wakeupTxt = true
        this._manifest.asrResources.commandTxt = true
        this._manifest.asrResources.wakeupBin = true
        this._manifest.asrResources.commandBin = true
        this._manifest.asrResources.state = '正在下载资源'
  
        this._asrRes = {
          urls: [
            {
              name: 'mlp.bin',
              uri: 'https://cdn.iflyos.cn/public/lstudio/mlpDir/mlp.bin',
              param: 'mlpBin',
            },
            {
              name: 'mlp_vs.bin',
              uri: 'https://cdn.iflyos.cn/public/lstudio/mlpDir/mlp_vs.bin',
              param: 'mlpVsBin',
            },
          ],
        }
        this._handleAsr()
      } else {
        await this._reqAsr({
          mainWords,
          cmdWords,
        })
      }
    }
  }

  async _reqAsr(data: { mainWords: any, cmdWords: any }) {
    const mlp = this._application.context?.algo?.esr_res?.name || undefined;

    const opt = {
      method: 'POST',
      url: '/runPackage',
      body: {
        mlp,
        chipId: 1,
        firmwareId: 20,
        hardwareId: 15,
        scene: 1,
        micSpan: this._firmwareConfiguration.hw_config.mic.dist,
        micType: this._firmwareConfiguration.hw_config.mic.type === 'amic' ? '模拟麦克风' : '数字麦克风',
        highThresh: 50,
        lowThresh: 25,
        miniEsrVersion: this._application.context.miniEsrVersion || 1156,
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
      const { body } = await this._got.post(`${this._application.apiHost}${this._application.apiPrefix}${opt.url}`, {
        headers: {
          Authorization: `Bearer ${await cookie.getAccessToken()}`,
          'User-Agent': 'LStudio',
        },
        json: opt.body,
        responseType: 'json'
      });
      this._asrRes.taskId = body.data.taskid
      await this._handleAsr()
    } catch (error: any) {
      this._application.log(JSON.stringify(error.response))
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
      this._finish('asr')
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

      const { body } = await this._got.post(`${this._application.apiHost}${this._application.apiPrefix}${opt.url}`, {
        headers: {
          Authorization: `Bearer ${await cookie.getAccessToken()}`,
          'User-Agent': 'LStudio',
        },
        json: opt.body,
        responseType: 'json'
      });
      this._application.log('冲击的结果:\n')
      this._application.log(`${body.recode}\n`)
      this._application.log(`${JSON.stringify(body)}\n`)

      if (body.recode === '000000') {
        if (this._asrRes.checkTimes) {
          this._log.output = '[####################] 100%'
        }
        this._asrRes = {
          urls: [
            {
              name: 'main.bin',
              uri: body.data.mainResPath,
              param: 'wakeupBin',
            },
            {
              name: 'cmd.bin',
              uri: body.data.asrResPath,
              param: 'commandBin',
            },
            {
              name: 'mlp.bin',
              uri: body.data.mlpResPath,
              param: 'mlpBin',
            },
            {
              name: 'mlp_vs.bin',
              uri: body.data.mlpVsResPath,
              param: 'mlpVsBin',
            },
            {
              name: 'main.txt',
              uri: body.data.mainStatePath,
              param: 'wakeupTxt',
            },
            {
              name: 'cmd.txt',
              uri: body.data.asrStatePath,
              param: 'commandTxt',
            },
          ],
        }
        this._handleAsr()
      } else {
        if (body.recode === '200004') {
          this._log.output = body.data.message
        }
        if (body.recode === '200001') {
          if (this._asrRes.checkTimes) {
            // eslint-disable-next-line max-depth
            if (this._asrRes.checkTimes > 90) {
              this._asrRes.checkTimes += 0.1
            } else {
              this._asrRes.checkTimes += 2
            }
          } else {
            this._asrRes.checkTimes = 1
            this._log.output = body.data.message
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
    const self = this
    const res = this._asrRes.urls[0]
    this._application.log(JSON.stringify(res))
    if (!this._manifest.asrResources[res.param]) {
      const downRes = await fs.project.downloadFile({
        url: res.uri,
        fileName: res.name || 'unknown',
        targetDir: this._getBuildingFile(),
        progress: (percentage, transferred, total) => {
          self._log.output = `正在下载[${res.name}]: ${percentage}% ${transferred}/${total}`
        }
      })
  
      if (!downRes.err) {
        this._manifest.asrResources[res.param] = true
        this._asrRes.urls.splice(0, 1)
        this._handleAsr()
      } else {
        this._log.output = `下载${res.name}失败...开始重试...`
        setTimeout(function () {
          self._saveAsr()
        }, 5000)
      }
    } else {
      this._asrRes.urls.splice(0, 1)
      this._handleAsr()
    }

    
  }

  async _finish(type: string) {
    this._finishCode[type] = true
    if (Object.keys(this._finishCode).every(key => this._finishCode[key])) {
      this._finishResolver(true)
    }
    // 重新生成main_finaly/cmd_finaly.txt
    if (fs.existsSync(this._getBuildingFile('cmd.txt'))) {
      fs.copyFileSync(this._getBuildingFile('cmd.txt'), this._getBuildingFile('cmd_finaly.txt'))
    }
    if (fs.existsSync(this._getBuildingFile('main.txt'))) {
      fs.copyFileSync(this._getBuildingFile('main.txt'), this._getBuildingFile('main_finaly.txt'))
    }
  }

  _getBuildingFile(fileName?: string) {
    return fileName ? path.join(this._getCskBuildConfig('buildingPath'), fileName) : this._getCskBuildConfig('buildingPath')
  }

  _getConfigFile(fileName: string) {
    return path.join(this._getCskBuildConfig('configPath'), fileName)
  }

  _getTonesIncludeFile(fileName: string) {
    return path.join(this._getCskBuildConfig('tonesIncludePath'), fileName)
  }

  _getAliasFile(fileName: string) {
    return path.join(this._getCskBuildConfig('aliasPath'), fileName)
  }

  _getThresholdsPath(fileName: string) {
    return path.join(this._getCskBuildConfig('thresholdsPath'), fileName)
  }

  _getCskBuildConfig(key: string) {
    return this._application.context.cskBuild[key]
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

