const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const { source } = require('./helpers.cjs')

test('open-tab queue deduplicates IDs, preserves order, caps the URL and reports omissions', async () => {
    let listener, update
    const urls = ['https://www.youtube.com/watch?v=aaaaaaaaaaa', 'https://youtu.be/aaaaaaaaaaa', ...Array.from({ length: 52 }, (_, i) => `https://www.youtube.com/watch?v=${String(i).padStart(11, '0')}`), 'https://other.test/watch?v=bbbbbbbbbbb']
    const context = vm.createContext({ URL, console, chrome: {
        runtime: { id: 'test-extension', onMessage: { addListener(fn) { listener = fn } } },
        tabs: { get: async () => ({ windowId: 7, url: 'https://www.youtube.com/@example/videos' }), query: async request => { assert.equal(request.windowId, 7); return urls.map(url => ({ url })) }, update: async (id, options) => { update = { id, ...options } } }
    } })
    context.importScripts = (...files) => files.forEach(file => vm.runInContext(source(file), context))
    vm.runInContext(source('background.js'), context)
    const response = await new Promise(resolve => {
        assert.equal(listener({ type: 'CREATE_FROM_TABS', tabId: 42 }, { id: 'test-extension' }, resolve), true)
    })
    assert.equal(response.videoCount, 50)
    assert.equal(response.omitted, 3)
    const ids = new URL(update.url).searchParams.get('video_ids').split(',')
    assert.equal(ids[0], 'aaaaaaaaaaa')
    assert.equal(ids[1], '00000000000')
    assert.equal(update.id, 42)
})
