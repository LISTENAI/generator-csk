import {Application} from '@listenai/lisa_core'
import lisa from '@listenai/lisa_core'
import * as path from 'path'
import Respak from './util/respak'

const {fs, cmd} = lisa

export default class PosBuildRes {
  _ctx: any;
  _log: any;
  _application: Application;

  constructor(ctx: any, task: any, application: Application) {
    this._ctx = ctx
    this._log = task
    this._application = application
  }

  async start(pconfig: any) {
    await this._handleWordsThreshold('main')
    await this._handleWordsThreshold('cmd')
    if (process.platform !== 'darwin') {
      // 生成main.bin cmd.bin
      // 修改阈值之后重新生成bin
      if (this._application.context?.algo) {
        await this._buildMainCmdBin(true)
      } else {
        try {
          const hasInstall = await cmd(
            'mini-esr-tool', ['test', 'test'],
            {
              cwd: this._application.root,
            }
          )
          if (!hasInstall.failed) {
            await this._buildMainCmdBin()
          }
        } catch (error) {
          const installRes = await cmd('lisa', ['install', '@tool/mini-esr-tool', '-g'], {
            cwd: this._application.root
          })
          if (!installRes.failed) {
            await this._buildMainCmdBin()
          }
        }
      }
    }
    const _respak = new Respak(this._ctx, this._log, this._application)
    const packResult = await _respak.start(pconfig)
    const thresholdsPath = this._application.context.cskBuild.thresholdsPath
    fs.writeFileSync(
      path.join(thresholdsPath, 'main.txt'),
      fs.readFileSync(this._getBuildingFile('main.txt')).toString()
    )
    fs.writeFileSync(
      path.join(thresholdsPath, 'main_finaly.txt'),
      fs.readFileSync(this._getBuildingFile('main_finaly.txt')).toString()
    )
    fs.writeFileSync(
      path.join(thresholdsPath, 'cmd.txt'),
      fs.readFileSync(this._getBuildingFile('cmd.txt')).toString()
    )
    fs.writeFileSync(
      path.join(thresholdsPath, 'cmd_finaly.txt'),
      fs.readFileSync(this._getBuildingFile('cmd_finaly.txt')).toString()
    )
    this._application.log(JSON.stringify(packResult))
    if (packResult.event === 'success') {
      // fs.copyFileSync(
      //   this._getBuildingFile('master.bin'),
      //   this._getPartsPath('master.bin')
      // )
      // if (fs.existsSync(this._getBuildingFile('script.bin'))) {
      //   fs.copyFileSync(
      //     this._getBuildingFile('script.bin'),
      //     this._getPartsPath('script.bin')
      //   )
      // }
      // fs.copyFileSync(
      //   this._getBuildingFile('respak.bin'),
      //   this._getPartsPath('respak.bin')
      // )
      // fs.copyFileSync(
      //   this._getBuildingFile('flashboot.bin'),
      //   this._getPartsPath('flashboot.bin')
      // )
    } else {
      throw new Error('资源编译失败')
    }
  }

  async _handleWordsThreshold (fileName: string) {
    const thresholdsPath = this._application.context.cskBuild.thresholdsPath
    const basePackPath = this._application.context.cskBuild.buildingPath
    if (!fs.existsSync(path.join(thresholdsPath, `${fileName}_finaly.txt`)) && !fs.existsSync(path.join(thresholdsPath, `${fileName}.txt`))) {
      return
    }

    const baseTxtArr = []

    let wordsThreshold = []
    let wordsThresholdStr = ''
    if (fs.existsSync(path.join(basePackPath, `${fileName}_finaly.txt`))) {
      wordsThresholdStr = fs.readFileSync(path.join(basePackPath, `${fileName}_finaly.txt`)).toString()
    } else if (fs.existsSync(path.join(basePackPath, `${fileName}.txt`))) {
      wordsThresholdStr = fs.readFileSync(path.join(basePackPath, `${fileName}.txt`)).toString()
    }
    wordsThreshold = wordsThresholdStr.split('\r').join('').split('\n').filter(val => val !== '')
    
    let lastWordsThreshold = []
    let lastWordsThresholdStr = ''
    if (fs.existsSync(path.join(thresholdsPath, `${fileName}_finaly.txt`))) {
      lastWordsThresholdStr = fs.readFileSync(path.join(thresholdsPath, `${fileName}_finaly.txt`)).toString()
    } else if (fs.existsSync(path.join(thresholdsPath, `${fileName}.txt`))) {
      lastWordsThresholdStr = fs.readFileSync(path.join(thresholdsPath, `${fileName}.txt`)).toString()
    }
    lastWordsThreshold = lastWordsThresholdStr.split('\r').join('').split('\n').filter(val => val !== '')

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
    fs.writeFileSync(path.join(basePackPath, `${fileName}.txt`), baseTxt.replace(/;/g, '\n'))
    fs.writeFileSync(path.join(basePackPath, `${fileName}_finaly.txt`), baseTxt.replace(/;/g, '\n'))
    return change
  }

  async _buildMainCmdBin(isAlgo3?: boolean) {
    if (isAlgo3) {
      const exe = this._application.context.cskBuild?.miniEsrTool.exe
      if (exe && fs.existsSync(exe)) {
        this._application.log(`${exe} ${['buildLanguageModel', this._application.context.cskBuild?.miniEsrTool.mainModelBin].join(' ')}`)
        await cmd(exe, ['buildLanguageModel', this._application.context.cskBuild?.miniEsrTool.mainModelBin], {
          cwd: this._getBuildingFile(),
          timeout: 5000
        })
        this._application.log(`${exe} ${['buildLanguageModel', this._application.context.cskBuild?.miniEsrTool.asrModelBin].join(' ')}`)
        await cmd(exe, ['buildLanguageModel', this._application.context.cskBuild?.miniEsrTool.asrModelBin], {
          cwd: this._getBuildingFile(),
          timeout: 5000
        })
      } else {
        throw new Error('无法生成main.bin/cmd.bin资源文件，请重新install @generator/csk或咨询FAE')
      }
    } else {
      await cmd('mini-esr-tool', ['main_finaly.txt', 'main.bin'], {
        cwd: this._getBuildingFile()
      })
      await cmd('mini-esr-tool', ['cmd_finaly.txt', 'cmd.bin'], {
        cwd: this._getBuildingFile()
      })
    }
  }

  _getReleasePath(fileName: string) {
    return path.join(this._getCskBuildConfig('releasePath') || '', fileName)
  }

  _getDebugLpkPath(fileName: string) {
    return path.join(this._getCskBuildConfig('debugLpkPath') || '', fileName)
  }

  _getPartsPath(fileName: string) {
    return path.join(this._getCskBuildConfig('partsPath') || '', fileName)
  }

  _getBuildingFile(fileName?: string) {
    return fileName ? path.join(this._getCskBuildConfig('buildingPath'), fileName) : this._getCskBuildConfig('buildingPath')
  }

  _getCskBuildConfig(key: string) {
    return this._application.context.cskBuild[key]
  }
}

