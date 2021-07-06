import * as lisa from '@listenai/lisa_core'

import * as path from 'path'
import { CliUx } from './ux'
import * as Configstore from 'configstore'

import task from "./task"
const { application, loadPackageJSON, runner } = lisa

// 功能在本方法中实现
export async function main() {

  loadPackageJSON(path.join(__dirname, "../package.json"))

  const cliUx = new CliUx()
  application.root = path.resolve('.')
  const firmware = await cliUx.getFirmware()
  application.packageJSON.dep = [
    `${firmware.chip}@~${firmware.version}`,
  ]

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
  const context = lisa.load().application.context
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
}

// 这个不要修改
export default (lisa?: any) => {
  main().then().catch(err => {
    console.log(err)
  })
}
