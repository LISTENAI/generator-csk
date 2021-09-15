import lisa from '@listenai/lisa_core'
import {loadPackageJSON, load, loadPreRunTask} from '@listenai/lisa_core'

import * as path from 'path'
import { CliUx } from './ux'
import * as Configstore from 'configstore'
import eventLog from './util/eventLog'
import task from "./task"
const { application, runner, fs } = lisa

// 功能在本方法中实现
export async function main() {
  loadPackageJSON(path.join(__dirname, "../package.json"))

  const cliUx = new CliUx()
  application.root = path.resolve('.')
  const firmware = await cliUx.getFirmware()
  application.addGlobalContext({'source':`${firmware.chip}@~${firmware.version}`})

  application.packageJSON.name = cliUx.getProjectName(application.root)

  application.addGlobalContext({
    cskConfigPath: './config'
  })

  task(lisa)

  await runner(['generate:create', 'generate:install-source'].join(',')).then(async (ctx) => {
    await initElseDeps();
    (ctx as {[key: string]: any}).dep = application.packageJSON.dep || []
    await runner(['generate:install'].join(','), ctx as {[key: string]: any}).then(async () => {
      await lisa.cmd('lisa', ['task', 'source:init', 'board:init', 'algo:init'], {
        cwd: application.root,
        shell: true,
        stdio: 'inherit',
      })
    })
  })
}

async function initElseDeps() {
  await Promise.all([
    load()
  ])
  const context = application.context
  const aiwrap = context?.cskBuild?.respakList?.WRAP ? true : false
  const algoWrapVersion = context?.cskBuild?.algoWrapVersion ? `aiwrap@${context?.cskBuild?.algoWrapVersion}` : 'aiwrap@v1000.2.0.3'
  const config = new Configstore('lisa')
  application.log(JSON.stringify(context?.cskBuild))
  const createCacheFirmware = config.get('createCacheFirmware') || {}
  config.set('createCacheFirmware', Object.assign(createCacheFirmware, {
    aiwrap,
    algoWrapVersion
  }))
  const cliUx = new CliUx()
  const board = await cliUx.getBoard()
  let algo
  while(!algo) {
    algo = await cliUx.getAlgo()
  }
  application.packageJSON.dep = [
    board,
    algo,
  ]

  application.addGlobalContext({'board':board,'algo':algo})
  await eventLog()
}

export async function miniEsrInfo() {
  const SUPORT = [1266]
  const {fs} = lisa
  let miniEsrVersion
  if (application.context?.algo?.esr_res) {
    miniEsrVersion = Number(application.context?.algo?.esr_res?.version || 1266);
  } else {
    await Promise.all([
      loadPreRunTask()
    ])
    miniEsrVersion = Number(application.context?.algo?.esr_res?.version || 1266);
  }
  if (SUPORT.includes(miniEsrVersion)) {
    return {
      suport: true
    }
  } else {
    let map = []
    try {
      if (application.context?.algo?.map_json) {
        map = fs.readJSONSync(application.context?.algo?.map_json?.file_path)
      }
    } catch (error) {
      
    }
    return {
      suport: false,
      map
    }
  }
}

// 这个不要修改
export default (lisa?: any) => {
  main().then().catch(err => {
    console.log(err)
  })
}
