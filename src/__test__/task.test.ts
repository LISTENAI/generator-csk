import task from '../task'
import * as lisa from '@listenai/lisa_core'
import * as path from 'path'
import "./test_helper"

test('lisa_template_generate:init_project', async () => {
  // lisa.loadPackageJSON(path.join(__dirname, "../../package.json"))
  // const rootPath = "./out"
  // lisa.application.root = rootPath
  // await lisa.fs.remove(rootPath)

  task(lisa)
  await lisa.runner("build:respak")
  // expect("tsconfig.json").toBePathExists()
  // expect("package.json").toBePathExists()
  // expect("jest.config.js").toBePathExists()
  // expect("src").toBePathExists()
  // expect("templates").toBePathExists()
  // expect(".gitignore").toBePathExists()
  // expect("README.md").toBePathExists()

  // await lisa.fs.remove(rootPath)
})