import lisa from '@listenai/lisa_core'
import * as path from 'path'

module.exports = (core = lisa) => {
  const {application} = core

  application.configuration(config => {

    if (config.context?.cskBuild?.respakList) {
      config.pipeline.build.tasks = ['build:patch', 'build:source', 'build:pre_respak', 'build:newrespak', 'build:package']
    } else {
      config.pipeline.build.tasks = ['build:patch', 'build:source', 'build:pre_respak', 'build:respak', 'build:package']
    }

    // cskBuild的相关路径配置
    config.addContext('cskBuild', {
      appDir: path.join(application.root, 'app'),
      configPath: path.join(application.root, 'config'),
      depsPath: path.join(application.root, 'deps'),
      aliasPath: path.join(application.root, 'deps/alias'),
      thresholdsPath: path.join(application.root, 'deps/thresholds'),
      tonesIncludePath: path.join(application.root, 'deps/tones_include'),
      buildingPath: path.join(application.root, 'target/building'),
      masterBin: path.join(application.root, 'target/building/master.bin'),
      flashbootBin: path.join(application.root, 'target/building/flashboot.bin'),
      scriptBin: path.join(application.root, 'target/building/script.bin'),
      partsPath: path.join(application.root, 'target/output/parts'),
      debugLpkPath: path.join(application.root, 'target/output/debug'),
      releasePath: path.join(application.root, 'target/output/release'),
      factoryPath: path.join(application.root, 'target/output/factory'),
      miniEsrTool: {
        root: path.join(__dirname, '../templates/miniEsrTool/'),
        exe: path.join(__dirname, '../templates/miniEsrTool/mini_esr_tool_bridge.exe'),
        mainModelBin: path.join(__dirname, '../templates/miniEsrTool/mainModelBinCfg.json'),
        asrModelBin: path.join(__dirname, '../templates/miniEsrTool/asrModelBinCfg.json'),
        triphoneState: path.join(__dirname, '../templates/miniEsrTool/buildTriphoneState.json'),
      }
    })
  })
}
