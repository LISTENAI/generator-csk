import * as lisa from '@listenai/lisa_core'
import * as path from 'path'
import { buildingFile, aliasFile, configFile } from '../util/project-fs'
import download from '../util/download'
import { initConfig } from '../util/project-config'
import tomlHandler from '../util/toml-handler'
import InitAsr from '../init-asr'
import InitTones from '../init-tones'
import Respak from '../respak-pack'

export default (core = lisa) => {
  const {job, fs, application} = core
  job('respak:resv', {
    title: '准备resv.txt资源',
    task: async (ctx, task) => {
      await fs.copy(path.join(__dirname, '../../templates/resv.txt'), buildingFile(application, 'resv.txt'))
    },
  })

  job('respak:info', {
    title: '准备info.txt资源',
    task: async (ctx, task) => {
      await fs.copy(path.join(__dirname, '../../templates/resv.txt'), buildingFile(application, 'info.txt'))
    },
  })

  job('respak:cae', {
    title: '准备cae.bin资源',
    task: async (ctx, task) => {
      const caeFile = buildingFile(application, 'cae.bin')
      fs.removeSync(caeFile)
      if (application.context.algo) {
        const algoCae = application.context.algo?.cae_res?.file_path || ''
        await fs.copy(algoCae, caeFile)
      } else {
        if (fs.existsSync(aliasFile(application, 'bias.bin'))) {
          await fs.copy(aliasFile(application, 'bias.bin'), caeFile)
        }
        if (fs.existsSync(aliasFile(application, 'cae.bin'))) {
          await fs.copy(aliasFile(application, 'cae.bin'), caeFile)
        }
      }
      if (!fs.existsSync(caeFile)) {
        throw new Error('缺少bias.bin资源，检查是否已经安装了algo算法包，或alias文件夹中是否存在该资源')
      }

    },
  })

  job('respak:esr', {
    title: '准备esr.bin资源',
    task: async (ctx, task) => {
      const esrFile = buildingFile(application, 'esr.bin')
      const mlpFile = buildingFile(application, 'mlp.bin')
      fs.removeSync(esrFile)
      if (application.context.algo) {
        const algoCae = application.context.algo?.esr_res?.file_path || ''
        await fs.copy(algoCae, esrFile)
      } else {
        if (fs.existsSync(aliasFile(application, 'mlp.bin'))) {
          await fs.copy(aliasFile(application, 'mlp.bin'), esrFile)
        }
        if (fs.existsSync(aliasFile(application, 'esr.bin'))) {
          await fs.copy(aliasFile(application, 'esr.bin'), esrFile)
        }
      }
      if (!fs.existsSync(esrFile)) {
        await download({
          uri: 'https://cdn.iflyos.cn/public/lstudio/mlpDir/mlp.bin',
          name: 'esr.bin',
          targetDir: buildingFile(application),
          progress: (percentage, transferred, total) => {
            task.output = `正在下载: ${percentage}% ${transferred}/${total}`
          },
          errCb: () => {
            task.output = `下载失败...开始重试...`
          }
        })
      }
      await fs.copy(esrFile, mlpFile)
    },
  })

  job('respak:wrap', {
    title: '准备wrap.json资源',
    task: async (ctx, task) => {
      const wrapFile = buildingFile(application, 'wrap.json')
      fs.removeSync(wrapFile)

      const wrapJsonFile = application.context.algo?.wrap_json?.file_path
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
        await fs.writeFileSync(wrapFile, JSON.stringify(wrapJson))
      }

      if (!fs.existsSync(wrapFile)) {
        throw new Error(`当前算法包缺少wrap.json文件`)
      }

    },
  })

  job('respak:wakelist', {
    title: '准备wakelist.txt资源',
    task: async (ctx, task) => {
      const wakelistFile = buildingFile(application, 'wakelist.txt')
      await fs.copy(path.join(__dirname, '../../templates/wakelist.txt'), wakelistFile)
    },
  })

  job('respak:test', {
    title: '准备测试音频资源',
    task: async (ctx, task) => {
      const testAudioFile = buildingFile(application, 'test.mp3')
      await fs.copy(path.join(__dirname, '../../templates/1KHz.mp3'), testAudioFile)
    },
  })

  job('respak:hardware', {
    title: '准备hardware.json资源',
    task: async (ctx, task) => {
      const hardwareFile = buildingFile(application, 'hardware.json')
      fs.removeSync(hardwareFile)

      if (fs.existsSync(configFile(application, 'hardware.lini'))) {
        const hardwareJson = tomlHandler.load(configFile(application, 'hardware.lini'))
        fs.writeFileSync(hardwareFile, JSON.stringify(hardwareJson, null, '\t'))
      }
  
      if (!fs.existsSync(hardwareFile)) {
        throw new Error(`该项目下未找到${configFile(application, 'hardware.lini')}`)
      }
    },
  })

  job('respak:application', {
    title: '准备application.json资源',
    task: async (ctx, task) => {
      const applicationFile = buildingFile(application, 'application.json')
      fs.removeSync(applicationFile)
      const applicationJson = initConfig(application).applicationJson
      fs.writeFileSync(applicationFile, JSON.stringify(applicationJson, null, '\t'))
    },
  })

  job('respak:keywords', {
    title: '准备keywords.txt资源',
    task: async (ctx, task) => {
      const keywordsFile = buildingFile(application, 'keywords.txt')
      fs.removeSync(keywordsFile)
      const _pconfig = initConfig(application)

      let keywords: any = []
      const ctrlMode = _pconfig.applicationJson.business.asr.cmd_send_mode
      const cmdsTypeHex = _pconfig.cmds_config ? _pconfig.cmds_config.type === 'hex' : true

      const words = [..._pconfig.cmds, ..._pconfig.wakeup]
      const reg = /.{2}/g
      words.forEach(word => {
        const item = {
          key: word.pinyin,
          kid: word.id,
          txt: word.text,
          play: (_pconfig.applicationJson.business.sys_mode === 'private' && word.play) ? [word.play] : [],
          cmds: [],
          infrared_cmds: [],
        }
        if (_pconfig.applicationJson.business.sys_mode === 'private' && Boolean(word.cmds)) {
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

      fs.writeFileSync(keywordsFile, keywords)
    },
  })

  job('respak:language', {
    title: '准备唤醒/识别资源',
    task: async (ctx, task) => {
      const initAsr = new InitAsr(task, application)
      await initAsr.start()
    },
  })

  job('respak:tones', {
    title: '准备tts音频资源',
    task: async (ctx, task) => {
      const initTones = new InitTones(task, application)
      await initTones.start()
    },
  })

  job('respak:package', {
    title: '编译打包',
    task: async (ctx, task) => {
      const _respak = new Respak(ctx, task, application)
      const packResult = await _respak.start()
    },
  })
}