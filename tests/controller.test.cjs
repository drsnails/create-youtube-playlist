const test = require('node:test')
const assert = require('node:assert/strict')
const { page } = require('./helpers.cjs')
const options = { term: '', sortBy: 'date', videosCount: 1, amount: 1, timePeriod: 'weeks' }

test('the reported Top queue skips members-only cards with missing view counts', async () => {
    const env = page('members-only.html')
    try {
        const queued = []
        env.app.youtube.addToQueue = async video => { queued.push(video.id) }
        const result = await env.app.controller.handle({ type: 'PLAYLIST_QUEUE', options: {
            ...options, sortBy: 'top', videosCount: 20, isFilterByDate: true, amount: 6, timePeriod: 'months'
        } })
        assert.equal(result.added, 2)
        assert.deepEqual(queued, ['ccccccccccc', 'aaaaaaaaaaa'])
    } finally { env.window.close() }
})

test('loading a month on the reported layout scrolls until a five-week-old upload appears', async () => {
    const env = page('reported-compact.html')
    try {
        let scrolls = 0
        env.app.youtube.scrollMore = () => {
            scrolls++
            const older = env.window.document.querySelectorAll('yt-lockup-view-model')[2].cloneNode(true)
            older.querySelector('a').href = '/watch?v=ddddddddddd'
            const age = older.querySelector('[aria-label="4 weeks ago"]')
            age.setAttribute('aria-label', '5 weeks ago')
            age.textContent = '5w ago'
            env.window.setTimeout(() => env.window.document.body.appendChild(older), 10)
        }
        await env.app.controller.handle({ type: 'PLAYLIST_LOAD', options: { ...options, timePeriod: 'months' } })
        const finished = await env.app.youtube.waitFor(() => !env.app.controller.state().scrollRunning, 1000)
        assert.ok(finished)
        assert.equal(env.app.controller.state().lastResult.success, true)
        assert.equal(scrolls, 1)
        assert.match(env.app.controller.state().lastResult.message, /4 videos/)
    } finally { env.window.close() }
})

test('queue state survives popup lifetime and rejects overlapping work', async () => {
    const env = page()
    try {
        let release
        env.app.youtube.addToQueue = () => new Promise(resolve => { release = resolve })
        const operation = env.app.controller.handle({ type: 'PLAYLIST_QUEUE', options })
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(env.app.controller.state().queueRunning, true)
        await assert.rejects(env.app.controller.handle({ type: 'PLAYLIST_LOAD', options }), /already running/)
        release()
        assert.equal((await operation).added, 1)
        assert.equal(env.app.controller.state().queueRunning, false)
        assert.ok(env.messages.some(message => message.queueRunning))
    } finally { env.window.close() }
})

test('load waits for new IDs and stops once the requested date is reached', async () => {
    const env = page()
    try {
        env.window.document.querySelector('ytd-grid-video-renderer').remove()
        let scrolls = 0
        env.app.youtube.scrollMore = () => {
            scrolls++
            env.window.setTimeout(() => {
                env.window.document.body.insertAdjacentHTML('beforeend', '<ytd-grid-video-renderer><a id="video-title" href="/watch?v=bbbbbbbbbbb">Older video</a><div id="metadata-line"><span>9 days ago</span><span>10 views</span></div></ytd-grid-video-renderer>')
            }, 10)
        }
        await env.app.controller.handle({ type: 'PLAYLIST_LOAD', options })
        await env.app.youtube.waitFor(() => !env.app.controller.state().scrollRunning, 1000)
        assert.equal(scrolls, 1)
        assert.equal(env.app.controller.state().lastResult.success, true)
        assert.match(env.app.controller.state().lastResult.message, /2 videos/)
    } finally { env.window.close() }
})

test('stop cancels a pending scroll and resets running state', async () => {
    const env = page()
    try {
        env.window.document.querySelector('ytd-grid-video-renderer').remove()
        await env.app.controller.handle({ type: 'PLAYLIST_LOAD', options: { ...options, amount: 100 } })
        assert.equal(env.app.controller.state().scrollRunning, true)
        await env.app.controller.handle({ type: 'PLAYLIST_STOP' })
        await env.app.youtube.waitFor(() => !env.app.controller.state().scrollRunning, 1000)
        assert.match(env.app.controller.state().lastResult.message, /Stopped/)
    } finally { env.window.close() }
})

test('nonchronological lists are rejected before date-based scrolling', () => {
    const env = page()
    try {
        assert.throws(() => env.app.youtube.assertDateLoading([{ ageDays: 30 }, { ageDays: 1 }]), /Latest/)
    } finally { env.window.close() }
})

test('content messages respond asynchronously, once, and ignore unrelated messages', async () => {
    const env = page()
    try {
        const listener = env.listeners[0]
        let result
        const keptOpen = listener({ type: 'PLAYLIST_STATUS' }, { id: 'test-extension' }, response => { result = response })
        assert.equal(keptOpen, true)
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(result.success, true)
        assert.equal(listener({ type: 'OTHER' }, { id: 'test-extension' }, () => assert.fail()), undefined)
        assert.equal(listener({ type: 'PLAYLIST_STATUS' }, { id: 'other-extension' }, () => assert.fail()), undefined)
    } finally { env.window.close() }
})
