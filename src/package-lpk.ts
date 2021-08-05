import {Application} from '@listenai/lisa_core'
import lisa from '@listenai/lisa_core'
import * as path from 'path'
import { KeyOType } from './typings/data';
import dateFormat from './util/dateFormat'
import * as crypto from 'crypto'

export default class PackageLpk {
  _log: any;
  _application: Application;

  constructor(task: any, application: Application) {
    this._log = task
    this._application = application
  }

  async start() {
    const _zip = lisa.fs.project.zip()
    const manifest = await this.getManifest(_zip);
    _zip.addFile(
      'manifest.json',
      Buffer.from(JSON.stringify(manifest, null, '\t'))
    )
    // _zip.addLocalFile(path.join(__dirname, '../templates/burner.img'))
    _zip.writeZip(this._getDebugLpkPath('burner.lpk'))
  }

  async getManifest(_zip: any) {
    const pconfig = this._application.packageJSON || {}
    const manifest = {
      version: pconfig.version || '',
      name: pconfig.name || '',
      build_date: dateFormat('yyyy-MM-dd hh:mm:ss'),
      chip_model: Object.keys(pconfig.dependencies || {}).find(item => item.indexOf('@source/')),
      app_ver: "",
      project_id: "",
	    project_name: "",
      license_key: "",
      images: {},
    }
    this._application.log(this._getPartsPath('flashboot.bin'))
    if (!lisa.fs.existsSync(this._getPartsPath('flashboot.bin'))) {
      // this.error('缺少固件的必要产品:flashboot.bin')
      throw new Error('缺少固件的必要产品:flashboot.bin')
    } else {
      const flashbootInfo = await this.binInfo(this._getPartsPath('flashboot.bin'));
      (manifest.images as KeyOType).flashboot = {
        addr: '0',
        file_size: flashbootInfo.size,
        md5: flashbootInfo.md5,
        file: './images/flashboot.bin',
      }
      _zip.addLocalFile(this._getPartsPath('flashboot.bin'), 'images')
    }
    if (!lisa.fs.existsSync(this._getPartsPath('master.bin'))) {
      // this.error('缺少固件的必要产品:master.bin')
      throw new Error('缺少固件的必要产品:master.bin')
    } else {
      let masterInfo = await this.binInfo(this._getPartsPath('master.bin'), "[CSK-VER]");
      if (!masterInfo.gregText) {
        masterInfo = await this.binInfo(this._getPartsPath('master.bin'), "[CSK-COMMIT]");
      }
      if (masterInfo.gregText) {
        manifest.app_ver = masterInfo.gregText
      }
      (manifest.images as KeyOType).master = {
        addr: '0x10000',
        file_size: masterInfo.size,
        md5: masterInfo.md5,
        file: './images/master.bin',
      }
      _zip.addLocalFile(this._getPartsPath('master.bin'), 'images')
    }
    if (lisa.fs.existsSync(this._getPartsPath('script.bin'))) {
      const scriptInfo = await this.binInfo(this._getPartsPath('script.bin'));
      (manifest.images as KeyOType).script = {
        addr: '0xf0000',
        file_size: scriptInfo.size,
        md5: scriptInfo.md5,
        file: './images/script.bin',
      }
      _zip.addLocalFile(this._getPartsPath('script.bin'), 'images')
    }
    if (!lisa.fs.existsSync(this._getPartsPath('respak.bin'))) {
      throw new Error('缺少固件的必要产品:respak.bin')
      // this.error('缺少固件的必要产品:respak.bin')
    } else {
      const respakInfo = await this.binInfo(this._getPartsPath('respak.bin'));
      (manifest.images as KeyOType).respak = {
        addr: '0x100000',
        file_size: respakInfo.size,
        md5: respakInfo.md5,
        file: './images/respak.bin',
      }
      _zip.addLocalFile(this._getPartsPath('respak.bin'), 'images')
    }
    return manifest
  }

  async binInfo(file: string, str?: string) {
    var info: {[key: string]: any} = {}
    var buffer = lisa.fs.readFileSync(file);
    var size = lisa.fs.statSync(file).size;
    var fsHash = crypto.createHash('md5');

    fsHash.update(buffer);
    var md5 = fsHash.digest('hex');

    info = {md5, size}
    if (str) {
      var start = buffer.indexOf(str) + str.length
      if (start - str.length >= 0) {
        var end = -1;
        for (let i = start; i < buffer.length; i++) {
          if (buffer[i] === 0) {
            break;
          }
          end = i;
        }
        info.gregText = buffer.slice(start, end).toString()
      }
    }
    return info
  }

  async release() {
    const _zip = lisa.fs.project.zip()
    _zip.addLocalFile(this._getDebugLpkPath('burner.lpk'))
    _zip.writeZip(this._getReleasePath('release.zip'))
  }

  async factory(projectInfo: {[key: string]: any}) {
    const _zip = lisa.fs.project.zip()
    const manifest = await this.getManifest(_zip)
    manifest.project_id = projectInfo.project_id
    manifest.project_name = projectInfo.project_name
    manifest.license_key = projectInfo.license_key
    _zip.addFile(
      'manifest.json',
      Buffer.from(JSON.stringify(manifest, null, '\t'))
    )
    _zip.writeZip(this._getFactoryPath(`${manifest.name}-${manifest.version}-factory.lpk`))
  }

  _getFactoryPath(fileName: string) {
    return path.join(this._getCskBuildConfig('factoryPath') || '', fileName)
  }

  _getReleasePath(fileName: string) {
    return path.join(this._getCskBuildConfig('releasePath') || '', fileName)
  }

  _getDebugLpkPath(fileName: string) {
    return path.join(this._getCskBuildConfig('debugLpkPath') || '', fileName)
  }

  _getPartsPath(fileName: string) {
    // return path.join(this._getCskBuildConfig('partsPath') || '', fileName)
    return path.join(this._getCskBuildConfig('buildingPath') || '', fileName)
  }

  _getCskBuildConfig(key: string) {
    return this._application.context.cskBuild[key]
  }
}

