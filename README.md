@generator/csk
====

csk开发项目 Framework，包含生成器、以及build相关task

* [Usage](#usage)
* [Commands](#commands)

# Usage
```sh-session
$ lisa create cskDevProject --template @generator/csk
```

create完成后，该项目具有@generator/csk的所有功能，在项目目录下执行lisa相关命令。

### 常用命令：

```sh-session
// 打包
$ lisa build
```

```sh-session
// 效果测试
$ lisa task optimize:test
```

```sh-session
// 自动测试
$ lisa task optimize:auto
```

# Tasks

## 编译打包相关

* [`build:respak`](#build:respak)
* [`build:package`](#build:package)
* [`build:factory`](#build:factory)

## 效果测试自动调优

* [`optimize:test`](#optimize:test)
* [`optimize:auto`](#optimize:auto)

### optimize相关task
* [`optimize:adaptionThreshold`](#optimize:adaptionThreshold)
* [`optimize:audioToDat`](#optimize:audioToDat)
* [`optimize:testSet`](#optimize:testSet)
* [`optimize:ready`](#optimize:ready)
* [`optimize:mergeDat`](#optimize:mergeDat)
* [`optimize:optimumReport`](#optimize:optimumReport)
* [`optimize:testReport`](#optimize:testReport)
* [`optimize:process`](#optimize:process)


## `build:respak`

编译respak.bin，完整task流程。该task存在于 `lisa build`，当执行 `lisa build` 时，会执行csk工程的打包，并在准备respak.bin资源时，执行该task。

该task会根据基础固件所支持的respak资源的分区表，进行资源准备，按分区表的地址进行打包出respak.bin。

### 资源准备相关task:

* [`respak:resv`](#respak:resv) 准备resv.txt，通常为空文件。          
* [`respak:info`](#respak:info) 准备info.txt，通常为空文件。        
* [`respak:cae`](#respak:cae) 准备cae.bin，通常为依赖的算法包的cae资源，详细可查看该task的相关描述。  
* [`respak:esr`](#respak:esr) 准备esr.bin，通常为依赖的算法包的esr资源，详细可查看该task的相关描述。   
* [`respak:wrap`](#respak:wrap) 准备wrap.json，通常为依赖的算法包的wrap.json资源。      
* [`respak:wakelist`](#respak:wakelist) 准备wake.txt，通常为空文件。
* [`respak:test`](#respak:test) 准备test.mp3，测试音频。     
* [`respak:hardware`](#respak:hardware) 准备hardware.json，硬件引脚等配置。  
* [`respak:application`](#respak:application)  准备application.json，软件配置。  
* [`respak:keywords`](#respak:keywords)  准备keywords.json，唤醒命令词信息。
* [`respak:language`](#respak:language) 准备main.bin、cmd.bin。  
* [`respak:tones`](#respak:tones)  准备音频文件。

### 打包respak：

* [`respak:package`](#respak:package)

## `respak:package`

编译respak.bin的最后一步，当资源准备完毕后，执行该task，将target/building下的资源，按照源码respak分区地址，进行打包。将资源扔target/building下，可单独执行该task打包出respak.bin。

## `build:package`

将target/building下的资源(master.bin、flashboot.bin、respak.bin)，打包成烧录包(lpk格式)。

## `build:factory`

将target/building下的资源(master.bin、flashboot.bin、respak.bin)，打包成量产烧录包(量产lpk格式)。

## `optimize:test`

效果测试，准备好测试音频等资源后，执行该task，可输出测试报告。(该task只支持使用三期@algo包的工程项目)

## `optimize:auto`

自动调优，准备好测试音频等资源后，执行该task，可输出调优报告。(该task只支持使用三期@algo包的工程项目)
