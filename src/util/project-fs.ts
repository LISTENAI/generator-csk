import * as path from 'path'
import {Application} from '@listenai/lisa_core'

function buildingFile(application: Application, fileName?: string) {
    const _buildingPath = application.context?.cskBuild?.buildingPath || process.cwd()
    return fileName ? path.join(_buildingPath, fileName) : _buildingPath
}

function aliasFile(application: Application, fileName?: string) {
    const _aliasPath = application.context?.cskBuild?.aliasPath || process.cwd()
    return fileName ? path.join(_aliasPath, fileName) : _aliasPath
}

function configFile(application: Application, fileName?: string) {
    const _configPath = application.context?.cskBuild?.configPath || process.cwd()
    return fileName ? path.join(_configPath, fileName) : _configPath
}

function thresholdsFile(application: Application, fileName?: string) {
    const _thresholdsPath = application.context?.cskBuild?.thresholdsPath || process.cwd()
    return fileName ? path.join(_thresholdsPath, fileName) : _thresholdsPath
}

function tonesIncludeFile(application: Application, fileName?: string) {
    const _tonesIncludePath = application.context?.cskBuild?.tonesIncludePath || process.cwd()
    return fileName ? path.join(_tonesIncludePath, fileName) : _tonesIncludePath
}

export {
    buildingFile,
    aliasFile,
    configFile,
    thresholdsFile,
    tonesIncludeFile,
}