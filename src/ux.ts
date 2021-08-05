/**
 * 和用户交互的界面，注意本代码必须经过自动化测试，不要想当然不写测试代码
 */

import { flags } from '@listenai/lisa_core';
import lisa from '@listenai/lisa_core';
import cli from 'cli-ux'
import * as path from 'path'
import * as inquirer from 'inquirer'
import * as Configstore from 'configstore'
import compare from './util/compare'
import getLogToken from './util/getLogToken'
import cookie from './libs/cookie'

const UNPROD = ['dev', 'debug']
const {cmd, got} = lisa

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
    const aiwrap = config.get('createCacheFirmware')?.aiwrap || false
    try {
      let language, type, algo = ''

      if (aiwrap) {
        {
          const { body } = await got('https://admin.iflyos.cn/api/v1/ai_resources/client/product_options', {
            headers: {
              Authorization: `Bearer ${await cookie.getAccessToken()}`,
            },
            responseType: 'json'
          })
          const {language: languages, product_type: types } = body as { language: Array<string>; product_type: Array<string>;}
          const languageSel: any = await inquirer.prompt(
            [
                {
                    name: 'val',
                    message: '选择项目语言',
                    type: 'list',
                    choices: languages,
                },
            ]
          )
          const typeSel: any = await inquirer.prompt(
            [
                {
                    name: 'val',
                    message: '选择项目品类',
                    type: 'list',
                    choices: types,
                },
            ]
          )
          language = languageSel.val
          type = typeSel.val
        }
        {
          const { body } = await got(`https://admin.iflyos.cn/api/v1/ai_resources/client/products?language=${language}&product_type=${type}&tag=${UNPROD.includes(process.env.LISA_ENV || '') ? 'beta' : 'latest'}`, {
            headers: {
              Authorization: `Bearer ${await cookie.getAccessToken()}`,
            },
            responseType: 'json'
          })
          const { products } = body as { products: Array<{
            name: string;
            versions: Array<string>;
          }> }
  
          while(!algo) {
            algo = await this.propAlgo(products)
          }
  
        }
      } else {
        {
          const algoSearchRes = await cmd('npm', ['search', '@algo', '--long', '--json', config.get('lpmRc')])
          let algoList = JSON.parse(algoSearchRes.stdout)
          if (algoList.length > 0) {
            algoList = algoList.filter((algo: any) => algo.keywords.includes(config.get('createCacheFirmware').chip) && 
              (config.get('createCacheFirmware')?.aiwrap ?
                algo.keywords.includes('aiwrap') : !algo.keywords.includes('aiwrap')))
          }
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
          algo = response.algo
        }
      }

      return algo

    } catch(e) {
      console.log(e)
    }
    
    return ''
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

  async propAlgo(products: Array<{
    name: string;
    versions: Array<string>;
  }>) {
    const config = new Configstore('lisa')
    const algoSel: any = await inquirer.prompt(
      [
          {
              name: 'val',
              message: '选择算法模型',
              type: 'list',
              choices: products.map((algo: any) => algo.name),
          },
      ]
    )
    const algo = algoSel.val
    // let versions = products.find(item => item.name === algo)?.versions || []
    try {
      let algoVersion: string | undefined = ''
      const algoWrapVersion = config.get('createCacheFirmware')?.algoWrapVersion
      const { body } = await got.post(`https://web-lpm.listenai.com/cloud/packages/advanceSearch`, {
        json: {
          name: algo,
          keywords: [algoWrapVersion]
        },
        responseType: 'json'
      })
      const { result } = body as { result: Array<{
        name: string;
        version: string;
        keywords: Array<string>;
      }> }
      if (!UNPROD.includes(process.env.LISA_ENV || '')) {
        algoVersion = result.find(item => item.version.match(/^([1-9]\d|[1-9])(\.([1-9]\d|\d)){2}$/))?.version
      } else {
        algoVersion = result.find(item => !item.version.match(/^([1-9]\d|[1-9])(\.([1-9]\d|\d)){2}$/))?.version
      }
      if (algoVersion) {
        lisa.application.debug(`${algo}@~${algoVersion}`)
        return `${algo}@~${algoVersion}`
      }
      console.log(`该算法包${algo}没有支持当前固件的版本，请选择其他算法包`)
      return ''
    } catch (error) {
      console.log(error.message)
      return ''
    }
  }

  getProjectName(projectPath: string) {
    return path.basename(projectPath)
  }
}