import lisa from '@listenai/lisa_core'

function RespakList(application = lisa.application): {[key: string]: string} {
    // const {application} = lisa

    if (application.context?.cskBuild?.respakList) {
        let respakList: {
            [key: string]: string
        } = application.context?.cskBuild?.respakList

        const targetRespakList: {[key: string]: string} = {}

        for (let key in respakList) {
            let value = respakList[key]
            switch(key) {
                case 'BIAS':
                    key = 'CAEM'
                    value = 'cae.bin'
                    break
                case 'MLPR':
                    key = 'ESRM'
                    value = 'esr.bin'
                    break
                case 'TEST':
                    value = 'test.mp3'
                    break
                case 'CONF':
                    value = 'application.json'
                    break
                default:
                    break
            }
            switch(value) {
                case 'cmds.bin':
                    value = 'cmd.bin'
                    break
                default:
                    break
            }
            targetRespakList[key] = value
        }
        return targetRespakList
    }
    return {}
}

export default RespakList