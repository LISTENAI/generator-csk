/**
 * 和用户交互的界面，注意本代码必须经过自动化测试，不要想当然不写测试代码
 */

import { application, cmd, flags } from '@listenai/lisa_core';
import cli from 'cli-ux'
import * as path from 'path'
import * as inquirer from 'inquirer'
import * as Configstore from 'configstore'
import compare from './util/compare'
import getLogToken from './util/getLogToken'

const UNPROD = ['dev', 'debug']

export class CliUx {

  // 如果需要命令行输入的，请注入对应的flag，方便测试
  @flags("project_path")
  async getProjectPath() {
    const projectPath = await cli.prompt("请输入项目路径", {default: '.'})
    return path.resolve(projectPath)
  }

  @flags('firmware')
  async getFirmware() {
    const firmware: {
      chip: string;
      version: string;
    } = {
      chip: '',
      version: ''
    }
    const config = new Configstore('lisa')
    try {
      const sourceSearchRes = await cmd('npm', ['search', '@source/csk', '--long', '--json', config.get('lpmRc')])
      let sourceList = JSON.parse(sourceSearchRes.stdout)
      if (sourceList.length > 0) {
        const response: any = await inquirer.prompt(
            [
                {
                    name: 'chip',
                    message: '选择芯片方案',
                    type: 'list',
                    choices: sourceList.map((source: any) => source.name),
                },
            ]
        )
        firmware.chip = response.chip
      }
    } catch (error) {
      
    }
    if (firmware.chip) {
      try {
        const firmwareVersionSearchRes = await cmd('npm', ['view', firmware.chip, 'versions', config.get('lpmRc')])
        const listStr = firmwareVersionSearchRes.stdout.split('\n').join('').replace(/'/g, '"');
        let firmwareVersionList = JSON.parse(listStr)

        if (!UNPROD.includes(process.env.LISA_ENV || '')) {
          firmwareVersionList = firmwareVersionList.filter((item: string) => item.match(/^([1-9]\d|[1-9])(\.([1-9]\d|\d)){2}$/))
        }

        firmwareVersionList = firmwareVersionList.sort(function(item1: any, item2: any) {
          return compare(item2, item1)
        })

        if (firmwareVersionList.length > 0) {
            const response: any = await inquirer.prompt(
                [
                    {
                        name: 'firmwareVersion',
                        message: '选择基础固件版本',
                        type: 'list',
                        choices: firmwareVersionList,
                    },
                ]
            )
            firmware.version = response.firmwareVersion
        }
      } catch (error) {
        console.log(error) 
      }
    }

    config.set('createCacheFirmware', firmware)

    return firmware
  }

  @flags('board')
  async getBoard() {
    const config = new Configstore('lisa')
    try {
      const boardSearchRes = await cmd('npm', ['search', '@board', '--long', '--json', config.get('lpmRc')])
      let boardList = JSON.parse(boardSearchRes.stdout)
      if (boardList.length > 0) {
        boardList = boardList.filter((algo: any) => algo.keywords.includes(config.get('createCacheFirmware').chip))
        const response: any = await inquirer.prompt(
            [
                {
                    name: 'board',
                    message: '选择板型模版',
                    type: 'list',
                    choices: boardList.map((board: any) => board.name),
                },
            ]
        )
        return response.board
      }
    } catch (error) {
      return '@board/ls-kit'
    }
    return '@board/ls-kit'
  }

  @flags('algo')
  async getAlgo() {
    const config = new Configstore('lisa')
    try {
      const algoSearchRes = await cmd('npm', ['search', '@algo', '--long', '--json', config.get('lpmRc')])
      let algoList = JSON.parse(algoSearchRes.stdout)
      if (algoList.length > 0) {
        algoList = algoList.filter((algo: any) => algo.keywords.includes(config.get('createCacheFirmware').chip) && 
          (config.get('createCacheFirmware')?.aiwrap ?
            algo.keywords.includes('aiwrap') : !algo.keywords.includes('aiwrap')))

        const response: any = await inquirer.prompt(
            [
                {
                    name: 'algo',
                    message: '选择算法模型',
                    type: 'list',
                    choices: algoList.map((bias: any) => bias.name),
                },
            ]
        )
        const algo = response.algo

        if (UNPROD.includes(process.env.LISA_ENV || '')) {
          const firmwareVersionSearchRes = await cmd('npm', ['view', algo, 'dist-tags', config.get('lpmRc')])
          const listStr = firmwareVersionSearchRes.stdout.replace(/(\s*?{\s*?|\s*?,\s*?)(['"])?([a-zA-Z0-9]+)(['"])?:/g, '$1"$3":').replace(/'/g, '"')

          let algoTagsList = JSON.parse(listStr)

          if (Object.keys(algoTagsList).includes('beta')) {
            return `${algo}@beta`
          }
        }

        
        const algoVersionSearchRes = await cmd('npm', ['view', algo, 'versions', config.get('lpmRc')])
        const listStr = algoVersionSearchRes.stdout.split('\n').join('').replace(/'/g, '"');
        let algoVersionList = JSON.parse(listStr)

        algoVersionList = algoVersionList.filter((item: string) => item.match(/^([1-9]\d|[1-9])(\.([1-9]\d|\d)){2}$/))

        algoVersionList = algoVersionList.sort(function(item1: any, item2: any) {
          return compare(item2, item1)
        })

        let algoVersion = ''
        const algoWrapVersion = config.get('createCacheFirmware')?.algoWrapVersion

        for (let i = 0; i <= algoVersionList.length - 1; i++) {
          const algoKeywordsSearchRes = await cmd('npm', ['view', `${algo}@${algoVersionList[i]}`, 'keywords', '--json', config.get('lpmRc')])
          const listStr = algoKeywordsSearchRes.stdout.split('\n').join('').replace(/'/g, '"');
          const algoKeywordsList = JSON.parse(listStr)
          if (algoKeywordsList.includes(algoWrapVersion)) {
            algoVersion = algoVersionList[i]
            break
          }
        }

        if (algoVersion) {
          return `${algo}@~${algoVersion}`
        }
        console.log(`该算法包${algo}没有支持当前固件的版本，请选择其他算法包`)
        return
      }
    } catch (error) {
      application.log(JSON.stringify(error))
      return '@algo/csk4002-cae-mlp'
    }
    return '@algo/csk4002-cae-mlp'
  }

  async getLSCloudProjectInfo() {
    
    let id, name;
    let license_key = false

    while(!license_key) {
      id = await cli.prompt("请输入LSCloud项目id")
      name = await cli.prompt("请输入LSCloud项目名称")
      license_key = await getLogToken(id)
      // if (!license_key) {
      //   console.log('该账号无该项目访问权限，请确认打包账号或LSCloud项目id')
      // }
    }

    return {
      project_id: id,
      project_name: name,
      license_key: license_key
    }
  }

  getProjectName(projectPath: string) {
    return path.basename(projectPath)
  }
}