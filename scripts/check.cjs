const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
const files = [...manifest.content_scripts.flatMap(entry => entry.js), manifest.background.service_worker, 'popup.js']
for (const file of files) new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file })
for (const file of [manifest.action.default_popup, ...Object.values(manifest.icons)]) {
    if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing extension asset: ${file}`)
}
console.log(`Manifest/assets and syntax checked for ${files.length} scripts.`)
