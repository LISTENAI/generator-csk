import lisa from '@listenai/lisa_core'
import cli from 'cli-ux'

async function download(res: {
    uri: string;
    name: string;
    targetDir: string;
    progress?: ((percentage: number, transferred: number, total: number) => void) | undefined;
    errCb?: (() => void) | undefined;
}): Promise<boolean> {
    const {fs} = lisa
    const downRes = await fs.project.downloadFile({
        url: res.uri, // 'https://cdn.iflyos.cn/public/lstudio/mlpDir/mlp.bin',
        fileName: res.name, //'esr.bin',
        targetDir: res.targetDir, //buildingFile(application),
        progress: res.progress
        // progress: (percentage, transferred, total) => {
        //   task.output = `正在下载: ${percentage}% ${transferred}/${total}`
        // }
    })
    if (downRes.err) {
        res.errCb && res.errCb()
        await cli.wait(3000)
        return download(res)
    }
    return true
}

export default download