const test = require('node:test')
const assert = require('node:assert/strict')
const { page } = require('./helpers.cjs')

test('a zero-card detection result still captures the newly changed page structure', () => {
    const env = page('renamed.html')
    try {
        env.app.selectors.cards = ['obsolete-card-name']
        env.app.selectors.videoLinks = 'a[href*="/obsolete-watch-path/"]'
        const report = env.app.diagnostics.capture()
        assert.equal(report.detection.videoCount, 0)
        assert.match(report.independentCapture.dom.html, /future-video-renderer/)
        assert.match(report.independentCapture.dom.html, /new-metadata/)
        assert.equal(report.independentCapture.attributeNames['data-new-field'], 1)
        assert.equal(report.independentCapture.uniqueVideoLinks, 1)
    } finally { env.window.close() }
})

test('reports survive both an unavailable adapter and a throwing adapter', () => {
    const env = page('renamed.html', ['services/diagnostics.js'])
    try {
        let report = env.app.diagnostics.capture({ term: 'example' })
        assert.match(report.detection.error, /unavailable/)
        assert.match(report.independentCapture.dom.html, /completely-new-tile/)
        assert.match(report.independentCapture.dom.html, /New link format and metadata/)
        assert.equal(report.independentCapture.uniqueVideoLinks, 1)
        env.app.youtube = { describe() { throw new Error('Obsolete selector') } }
        report = env.app.diagnostics.capture()
        assert.equal(report.detection.error, 'Obsolete selector')
        assert.match(report.independentCapture.dom.html, /future-video-renderer/)
        assert.doesNotThrow(() => JSON.stringify(report))
    } finally { env.window.close() }
})

test('reports remove sensitive contents/attributes, unsafe URLs, and email/credential patterns', () => {
    const env = page('legacy.html', ['services/diagnostics.js'])
    try {
        env.window.document.body.insertAdjacentHTML('beforeend', '<script>const secret = "SCRIPT_SECRET"</script><style>/* STYLE_SECRET */</style><ytd-masthead aria-label="ACCOUNT_NAME">ACCOUNT_NAME person@example.com</ytd-masthead><input value="FORM_SECRET"><textarea>TEXTAREA_SECRET</textarea><div contenteditable="true">EDIT_SECRET</div><div onclick="HANDLER_SECRET" data-auth-token="ATTRIBUTE_SECRET" aria-label="person@example.com">Bearer abcdefghijklmnop</div><a href="https://www.youtube.com/watch?v=aaaaaaaaaaa&amp;access_token=URL_SECRET">video</a><a href="javascript:UNSAFE_SECRET">unsafe</a>')
        env.app.diagnostics.record('test', { error: 'person@example.com access_token=ERROR_SECRET' })
        const report = env.app.diagnostics.capture({ term: 'person@example.com' })
        const serialized = JSON.stringify(report)
        for (const secret of ['SCRIPT_SECRET', 'STYLE_SECRET', 'ACCOUNT_NAME', 'FORM_SECRET', 'TEXTAREA_SECRET', 'EDIT_SECRET', 'HANDLER_SECRET', 'ATTRIBUTE_SECRET', 'URL_SECRET', 'UNSAFE_SECRET', 'ERROR_SECRET', 'person@example.com', 'abcdefghijklmnop']) assert.ok(!serialized.includes(secret), secret)
        assert.match(report.independentCapture.dom.html, /JavaScript basics/)
        assert.match(report.independentCapture.dom.html, /aria-label="Add to queue"/)
    } finally { env.window.close() }
})

test('capture has explicit size limits and includes open shadow DOM', () => {
    const env = page('legacy.html', ['services/diagnostics.js'])
    try {
        const host = env.window.document.createElement('new-component')
        host.attachShadow({ mode: 'open' }).innerHTML = '<button aria-label="New queue control">Action</button>'
        env.window.document.body.appendChild(host)
        assert.match(env.app.diagnostics.snapshot(host).html, /New queue control/)
        const small = env.app.diagnostics.snapshot(env.window.document.documentElement, { maxNodes: 4, maxCharacters: 100 })
        assert.equal(small.truncated, true)
        assert.ok(small.html.length < 1000)
    } finally { env.window.close() }
})

test('queue regions remain inspectable when the main document snapshot is truncated', () => {
    const env = page('legacy.html', ['services/diagnostics.js'])
    try {
        let container = env.window.document.body
        for (let depth = 0; depth < 125; depth++) {
            const node = env.window.document.createElement('div')
            container.appendChild(node)
            container = node
        }
        container.innerHTML = '<ytd-playlist-panel-renderer><a href="/watch?v=aaaaaaaaaaa&amp;access_token=QUEUE_SECRET">Queued video</a><input value="QUEUE_FORM_SECRET"></ytd-playlist-panel-renderer>'
        const report = env.app.diagnostics.capture()
        assert.equal(report.independentCapture.dom.truncated, true)
        assert.doesNotMatch(report.independentCapture.dom.html, /Queued video/)
        const region = report.independentCapture.queueRegions.find(region => region.tag === 'ytd-playlist-panel-renderer')
        assert.match(region.context.html, /Queued video/)
        assert.doesNotMatch(region.context.html, /QUEUE_SECRET|QUEUE_FORM_SECRET/)
        assert.equal(region.context.limits.maxNodes, 3000)
    } finally { env.window.close() }
})

test('failed operations and detection provenance appear in the report', async () => {
    const env = page()
    try {
        await assert.rejects(env.app.controller.handle({ type: 'PLAYLIST_QUEUE', options: { term: '[', videosCount: 0 } }), /Invalid search/)
        const report = env.app.diagnostics.capture({}, env.app.controller.state())
        assert.equal(report.state.queueRunning, false)
        assert.equal(report.state.lastResult.success, false)
        assert.ok(report.events.some(event => event.type === 'queue-error'))
        assert.equal(report.detection.videoCount, 2)
        assert.equal(report.detection.videos[0].ageSource, 'relative-text')
    } finally { env.window.close() }
})
