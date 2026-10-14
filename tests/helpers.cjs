const { JSDOM } = require('jsdom')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const modules = ['services/core.js', 'youtube/selectors.js', 'youtube/adapter.js', 'services/diagnostics.js', 'main.js', 'content.js']
const source = file => fs.readFileSync(path.join(root, file), 'utf8')

function page(fixture = 'legacy.html', files = modules) {
    const dom = new JSDOM(source(`tests/fixtures/${fixture}`), { url: 'https://www.youtube.com/@example/videos', runScripts: 'outside-only' })
    const { window } = dom
    const listeners = [], messages = []
    window.chrome = { runtime: {
        id: 'test-extension',
        getManifest: () => ({ version: '1.1.0' }),
        sendMessage: async message => { messages.push(message) },
        onMessage: { addListener: listener => listeners.push(listener) }
    } }
    window.Element.prototype.getClientRects = () => [{ width: 100, height: 100 }]
    window.Element.prototype.scrollIntoView = () => {}
    window.scrollTo = () => {}
    // Short bounded waits make negative interaction tests practical.
    const originalTimeout = window.setTimeout.bind(window)
    window.setTimeout = (callback, duration, ...args) => originalTimeout(callback, Math.min(duration, 100), ...args)
    const originalInterval = window.setInterval.bind(window)
    window.setInterval = (callback, duration, ...args) => originalInterval(callback, Math.min(duration, 20), ...args)
    const load = file => window.eval(source(file))
    files.forEach(load)
    return { dom, window, app: window.PlaylistApp, load, listeners, messages }
}

module.exports = { page, source, modules }
