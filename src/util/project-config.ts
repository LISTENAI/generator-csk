import {Application} from '@listenai/lisa_core'
import lisa from '@listenai/lisa_core'
import { Interact, InteractConfig, ItonesConfig, Tones } from '../typings/data';
import {configFile} from './project-fs'
import tomlHandler from './toml-handler'

const {fs} = lisa

function initConfig(application: Application): any {
    let config: any = {}

    let interactConfig: InteractConfig = {
      template: '',
      interact: [],
    }
    if (fs.existsSync(configFile(application, 'interact.lini'))) {
      interactConfig = (tomlHandler.load(configFile(application, 'interact.lini')) as unknown as InteractConfig)
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
    
    let extonesConfig = (tomlHandler.load(configFile(application, 'tones.lini')) as unknown as ItonesConfig)

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
      cmds: cmds.map((cmd: any, index: any) => {
        return {
          id: index + 1,
          text: cmd.text,
          pinyin: cmd.pinyin,
          play: cmd.play,
          cmds: cmd.cmds,
        }
      }),
      wakeup: wakeup.map((item: any, index: any) => {
        return {
          id: index + 501,
          text: item.text,
          pinyin: item.pinyin,
          play: item.play,
          cmds: item.cmds,
        }
      }),
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

    const applicationJson = initApplication(application)
    const enterAsr: any[] = [];
    (config?.wakeup || []).forEach((word: any) => {
      enterAsr.push(word.id)
    })
    if (applicationJson.business.sys_mode === 'private') {
      applicationJson.business.welcome = config.welcome
    }
    if (applicationJson.business.asr) {
      applicationJson.business.asr.enter_asr = enterAsr
    }

    config = Object.assign(config, {applicationJson: applicationJson})
    return config
}

function initApplication(application: Application): any {
  const {fs} = lisa
  const applicationFile = configFile(application, 'application.lini')
  if (fs.existsSync(applicationFile)) {
    const applicationJson = tomlHandler.load(applicationFile)
    // fs.writeFileSync(buildingFile(application, 'application.json'), JSON.stringify(applicationJson, null, '\t'))
    return applicationJson
  }
  throw new Error(`该项目下未找到${applicationFile}`)
}

export {
    initConfig
}