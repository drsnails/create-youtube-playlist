const test = require('node:test')
const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')
const { page, source } = require('./helpers.cjs')

async function popupForQueue(saved = {}) {
    const popup = new JSDOM(source('index.html'), { url: 'https://extension.test/index.html', runScripts: 'outside-only' })
    const win = popup.window
    await new Promise(resolve => win.addEventListener('load', resolve, { once: true }))
    const messages = [], listeners = []
    win.localStorage.setItem('inputsData', JSON.stringify(saved))
    win.chrome = {
        tabs: {
            query: async () => [{ id: 1, url: 'https://www.youtube.com/@example/videos' }],
            sendMessage: async (tabId, message) => { messages.push(message); return { success: true, message: 'Done' } }
        },
        runtime: { onMessage: { addListener: listener => listeners.push(listener) } },
        scripting: { executeScript: async () => [] }
    }
    win.eval(source('popup.js'))
    win.document.dispatchEvent(new win.Event('DOMContentLoaded'))
    await new Promise(resolve => setImmediate(resolve))
    return { popup, win, messages, listeners }
}

test('faster queuing defaults off, persists explicit selection, and reaches the queue request', async () => {
    const { popup, win, messages, listeners } = await popupForQueue({ term: '', sortBy: 'top', videosCount: 10 })
    try {
        const checkbox = win.document.querySelector('.batch-queue-checkbox')
        assert.equal(checkbox.checked, false, 'existing saved inputs must not opt into experimental batching')
        checkbox.checked = true
        checkbox.dispatchEvent(new win.Event('change', { bubbles: true }))
        assert.equal(JSON.parse(win.localStorage.getItem('inputsData')).batchQueue, true)
        win.document.querySelector('.add-to-q').click()
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(messages.find(message => message.type === 'PLAYLIST_QUEUE').options.batchQueue, true)
        listeners[0]({ type: 'PLAYLIST_STATE', queueRunning: true }, { tab: { id: 1 } })
        assert.equal(checkbox.disabled, true)
        listeners[0]({ type: 'PLAYLIST_STATE', queueRunning: false }, { tab: { id: 1 } })
        assert.equal(checkbox.disabled, false)
    } finally { popup.window.close() }
})

test('faster queuing restores a saved selection and Clear Inputs turns it off', async () => {
    const { popup, win } = await popupForQueue({ batchQueue: true })
    try {
        const checkbox = win.document.querySelector('.batch-queue-checkbox')
        assert.equal(checkbox.checked, true)
        win.document.querySelector('.clear-btn').click()
        assert.equal(checkbox.checked, false)
        assert.equal(win.localStorage.getItem('inputsData'), null)
    } finally { popup.window.close() }
})

test('popup downloads a report even when the controller cannot initialize', async () => {
    const tab = page('renamed.html', ['services/diagnostics.js'])
    const popup = new JSDOM(source('index.html'), { url: 'https://extension.test/index.html', runScripts: 'outside-only' })
    try {
        const win = popup.window
        await new Promise(resolve => win.addEventListener('load', resolve, { once: true }))
        const injected = [], downloads = [], blobs = []
        win.chrome = {
            tabs: { query: async () => [{ id: 1, url: 'https://www.youtube.com/@example/videos' }], sendMessage: async () => { throw new Error('Broken controller') } },
            runtime: { onMessage: { addListener() {} } },
            scripting: { executeScript: async request => {
                if (request.files) {
                    injected.push(request.files)
                    if (request.files.length > 1) throw new Error('Broken adapter initialization')
                    request.files.forEach(tab.load)
                    return []
                }
                const result = tab.window.eval(`(${request.func.toString()})`)(...request.args)
                return [{ result }]
            } }
        }
        win.URL.createObjectURL = blob => { blobs.push(blob); return 'blob:test-report' }
        win.URL.revokeObjectURL = () => {}
        win.HTMLAnchorElement.prototype.click = function () { downloads.push({ filename: this.download, href: this.href }) }
        win.eval(source('popup.js'))
        win.document.dispatchEvent(new win.Event('DOMContentLoaded'))
        await new Promise(resolve => setImmediate(resolve))
        assert.match(win.document.querySelector('.operation-status').textContent, /Broken adapter/)
        win.document.querySelector('.export-report-btn').click()
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(downloads.length, 1)
        assert.match(downloads[0].filename, /^youtube-debug-.*\.json$/)
        assert.equal(blobs[0].type, 'application/json')
        assert.equal(injected.at(-1).join(','), 'services/diagnostics.js')
        assert.match(win.document.querySelector('.operation-status').textContent, /Attach the JSON file/)
    } finally { popup.window.close(); tab.window.close() }
})
