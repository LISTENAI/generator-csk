import lisa from '@listenai/lisa_core'
import {loadPackageJSON, TaskObject} from '@listenai/lisa_core'
import cli from 'cli-ux'
import * as path from 'path'
import PreBuildRes from './pre-build-res'
import PosBuildRes from './pos-build-res'
import PackageLpk from './package-lpk'
import { CliUx } from './ux'
import RespakList from './util/respakList'

import respak from './tasks/respak'
import { main } from '.'

export default (core = lisa) => {
  const {job, fs, application, Tasks} = core
  respak(core)
  job('generate:create', {
    title: '创建csk开发项目目录/文件',
    task: async (ctx) => {
      fs.project.template_path = path.join(__dirname, '../templates')
      const projectDirTree = [
        'assets',
        'config',
        'deps/tones_include',
        'deps/alias',
        'deps/thresholds',
        'optimize/audio_record',
        'optimize/audio_record_dat',
        'spec/dataset/audio_addon',
        'spec/dataset/audio_original',
        'target/log',
        'target/building',
        'target/output/parts',
        'target/output/debug',
        'target/output/release',
        
      ]
      await fs.project.mkdir(...projectDirTree)
      await fs.project.copy('config/interact.lini', 'config/interact.lini')
      await fs.project.copy('config/tones.lini', 'config/tones.lini')
      await fs.project.copy('config/keywords.lini', 'config/keywords.lini')
      await fs.project.copy('config.js', 'config.js')
      await fs.project.copy('task.js', 'task.js')
      await fs.project.template('spec/test.csk.ejs', 'spec/test.csk', {projectName: application.packageJSON.name})
      // await fs.project.template('package.json.ejs', 'package.json', {projectName: application.packageJSON.name})
      ctx.dep = application.packageJSON.dep || []
      loadPackageJSON()
      const packageJson = fs.readJSONSync(path.join(fs.project.template_path, 'package-demo.json'))
      packageJson.name = application.packageJSON.name
      packageJson.dependencies = application.packageJSON?.dependencies || {}

      fs.writeFileSync(path.join(fs.project.root, 'package.json'), JSON.stringify(packageJson, null, '\t'))

      application.gitignore('./.gitignore', [
        'node_modules',
        '.DS_Store',
        '.lisa',
        'target',
        'optimize/audio_record/**',
        'spec/dataset/audio_original/**'
      ])
    },
  })
  job('generate:install-source', {
    title: '安装源码',
    task: async (ctx) => {
      const res = await core.cmd('lisa', ['install', ...(ctx.dep || [])], {
        cwd: application.root,
      })
      if (res.stdout.indexOf('成功') < 0) {
        throw new Error('安装依赖失败')
      }
    },
  })
  job('generate:install', {
    title: '安装必要依赖',
    task: async (ctx) => {
      const res = await core.cmd('lisa', ['install', ...(ctx.dep || [])], {
        cwd: application.root,
      })
      if (res.stdout.indexOf('成功') < 0) {
        throw new Error('安装依赖失败')
      }
    },
  })
  job('build:respak', {
    title: '编译respak.bin',
    task: async (ctx, task) => {


      if (application.context?.cskBuild?.respakList) {
  
        const targetRespakList: {[key: string]: string} = RespakList()
        ctx.respakList = targetRespakList
  
        const tasks = Array.from(new Set(Object.values(targetRespakList).map(item => {
          let task = 'respak:'
          switch(item) {
            case 'info.txt':
              task += 'info'
              break
            case 'resv.txt':
              task += 'resv'
              break
            case 'cae.bin':
              task += 'cae'
              break
            case 'esr.bin':
              task += 'esr'
              break
            case 'main.bin':
            case 'cmd.bin':
              task += 'language'
              break
            case 'wakelist.txt':
              task += 'wakelist'
              break
            case 'wrap.json':
              task += 'wrap'
              break
            case 'keywords.txt':
              task += 'keywords'
              break
            case 'hardware.json':
              task += 'hardware'
              break
            case 'application.json':
              task += 'application'
              break
            case 'test.mp3':
              task += 'test'
              break
            default:
              task += 'resv'
              break
          }
          return task
        })))
  
        const _tasks: TaskObject[] = []
        tasks.forEach(task => {
          if (application.tasks.hasOwnProperty(task)) {
            _tasks.push(application.tasks[task])
          }
        });
  
        if (application.tasks.hasOwnProperty('respak:tones')) {
          _tasks.push(application.tasks['respak:tones'])
        }
  
        return new Tasks([{
          title: '资源准备',
          task: () => {
            return new Tasks(_tasks, {concurrent: true})
          }
        }, application.tasks['respak:package']])
      } else {
        let respakList: {
          [key: string]: string
        } = {
          'INFO': 'resv.txt',
          'BIAS': 'bias.bin',
          'MLPR': 'mlp.bin',
          'KEY1': 'main.bin',
          'KEY2': 'cmd.bin',
          'KMAP': 'keywords.txt',
          'TEST': '1KHz.mp3',
          'R007': 'resv.txt',
          'R008': 'hardware.json',
          'R009': 'application.json',
        }
  
        if (application.context.algo) {
          respakList = {
            'INFO': 'resv.txt',
            'BIAS': 'bias.bin',
            'MLPR': 'mlp.bin',
            'KEY1': 'main.bin',
            'KEY2': 'cmd.bin',
            'WAKE': 'wakelist.txt',
            'WRAP': 'wrap.json',
            'KMAP': 'keywords.txt',
            'HARD': 'hardware.json',
            'CONF': 'application.json',
            'TEST': '1KHz.mp3',
            'R011': 'resv.txt',
            'R012': 'resv.txt',
            'R013': 'resv.txt',
            'R014': 'resv.txt',
            'R015': 'resv.txt',
            'R016': 'resv.txt',
            'R017': 'resv.txt',
            'R018': 'resv.txt',
            'R019': 'resv.txt',
          }
        }
  
        loadPackageJSON()
  
        if (Object.keys(application.packageJSON?.dependencies || {}).includes('@source/csk4002nc')) {
          respakList = Object.assign(respakList, {
            'KEY1': 'resv.txt',
            'KEY2': 'resv.txt',
            'KMAP': 'resv.txt',
            'R007': 'eq_default.bin',
          })
        }
  
        ctx.respakList = respakList
  
        const _preBuildRes = new PreBuildRes(ctx, task, application, core.got)
        const pconfig = await _preBuildRes.start()
        application.log(JSON.stringify(pconfig))
        await cli.wait(3000)
  
        const _posBuildRes = new PosBuildRes(ctx, task, application)
        await _posBuildRes.start(pconfig)
      }


      

    }
  })
  job('build:package', {
    title: '打包lpk包',
    task: async (ctx, task) => {
      const _packageLpk = new PackageLpk(task, application)
      await _packageLpk.start()
    },
  })
  job('build:release', {
    title: '打包release包',
    task: async (ctx, task) => {
      const _packageLpk = new PackageLpk(task, application)
      await _packageLpk.release()
    },
  })
  job('build:factory', {
    title: '打包factory包',
    task: async (ctx, task) => {
      const cliUx = new CliUx()
      const projectInfo = await cliUx.getLSCloudProjectInfo()
      const _packageLpk = new PackageLpk(task, application)
      await _packageLpk.factory(projectInfo)
    },
  })
}