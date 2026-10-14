const test = require('node:test')
const assert = require('node:assert/strict')
const { page } = require('./helpers.cjs')

function batchPage(settings = {}) {
    const env = page(settings.modern ? 'batch-modern.html' : 'batch.html')
    const { document } = env.window
    const ids = Array.from({ length: settings.count || 7 }, (_, index) => String(index).padStart(11, '0'))
    const queue = settings.initialQueue || ['zzzzzzzzzzz']
    const clicks = [], completed = []
    let pending = 0, maxPending = 0
    const menu = document.querySelector(settings.modern ? 'ytd-playlist-panel-renderer' : '.ytp-playlist-menu')
    const counter = document.querySelector(settings.modern ? '.ytdMiniplayerInfoBarPlaylistIndex' : '.ytp-playlist-menu-button-text')
    const button = document.querySelector(settings.modern ? '.ytdMiniplayerInfoBarExpand button' : '.ytp-playlist-menu-button')
    const buttonHost = button.parentElement
    if (settings.delayedControl) button.remove()
    if (settings.external) document.body.appendChild(menu)
    const render = () => {
        const total = queue.length + (settings.incomplete && !menu.hidden ? 1 : 0)
        counter.textContent = settings.modern ? `• 1 / ${total}` : `1/${total}`
        document.querySelector('.ytp-prev-button').href = `/watch?v=${queue.at(-1)}&list=TLPQexample`
        if (menu.hidden) return // YouTube populates this list when it is opened.
        const list = settings.modern ? menu : menu.querySelector('.ytp-playlist-menu-items')
        list.replaceChildren(...queue.map(id => {
            const link = document.createElement('a')
            link.href = `/watch?v=${id}&list=${settings.unrelatedPanel ? 'OTHERplaylist' : 'TLPQexample'}`
            link.textContent = 'Queued video'
            if (!settings.modern) return link
            const row = document.createElement('ytd-playlist-panel-video-renderer')
            row.append(link, link.cloneNode(true)) // A thumbnail and title link refer to one queue entry.
            return row
        }))
    }
    button.addEventListener('click', () => {
        menu.hidden = settings.modern ? !menu.hidden : false
        if (settings.modern) button.setAttribute('aria-expanded', String(!menu.hidden))
        render()
    })
    if (!settings.modern) document.querySelector('.ytp-playlist-menu-close').addEventListener('click', () => { menu.hidden = true })
    if (settings.unreadable) button.remove()
    const template = document.querySelector('yt-lockup-view-model')
    for (const id of ids) {
        const card = template.cloneNode(true)
        for (const link of card.querySelectorAll('a')) link.href = `/watch?v=${id}`
        card.querySelector('h3 a').textContent = `Video ${id}`
        card.querySelector('button').addEventListener('click', () => {
            const popup = document.createElement('ytd-menu-popup-renderer')
            popup.innerHTML = '<ytd-menu-service-item-renderer>Add to queue</ytd-menu-service-item-renderer>'
            popup.firstElementChild.addEventListener('click', () => {
                clicks.push(id)
                pending++
                maxPending = Math.max(maxPending, pending)
                settings.onSubmit?.({ id, ids, env, completed })
                popup.remove()
                env.window.setTimeout(() => {
                    if (settings.settle) settings.settle({ id, ids, queue })
                    else queue.push(id)
                    completed.push(id)
                    pending--
                    render()
                    if (settings.delayedControl && id === ids[0]) env.window.setTimeout(() => buttonHost.appendChild(button), 10)
                }, 15)
            })
            document.body.appendChild(popup)
        })
        document.body.appendChild(card)
    }
    template.remove()
    render()
    const run = (options = {}) => env.app.controller.handle({ type: 'PLAYLIST_QUEUE', options: { term: '', sortBy: 'date', videosCount: 0, batchQueue: true, ...options } })
    return { env, ids, queue, clicks, completed, run, maxPending: () => maxPending }
}

test('batch mode overlaps at most three additions and verifies complete order before continuing', async () => {
    const fixture = batchPage({ onSubmit({ id, ids, completed }) {
        if (id === ids[4]) assert.ok(ids.slice(0, 4).every(id => completed.includes(id)), 'the next batch must wait for the previous one')
    } })
    try {
        const result = await fixture.run()
        assert.equal(result.added, 7)
        assert.equal(result.success, true)
        assert.deepEqual(fixture.clicks, fixture.ids)
        assert.deepEqual(fixture.queue, ['zzzzzzzzzzz', ...fixture.ids])
        assert.equal(fixture.maxPending(), 3)
        const events = fixture.env.app.diagnostics.capture().events
        const batches = events.filter(event => event.type === 'queue-batch')
        assert.equal(batches.length, 2)
        assert.ok(batches.every(event => event.ids.length === 3 && event.verified))
        assert.equal(events.filter(event => event.type === 'queue-item').length, 7)
    } finally { fixture.env.window.close() }
})

test('ten videos use three verified batches after the first individually confirmed addition', async () => {
    const fixture = batchPage({ count: 10 })
    try {
        const result = await fixture.run()
        assert.equal(result.added, 10)
        assert.deepEqual(fixture.queue, ['zzzzzzzzzzz', ...fixture.ids])
        assert.equal(fixture.maxPending(), 3)
        const events = fixture.env.app.diagnostics.capture().events
        assert.equal(events.filter(event => event.type === 'queue-batch').length, 3)
    } finally { fixture.env.window.close() }
})

for (const external of [false, true]) {
    test(`reported info-bar expand control enables batching with ${external ? 'a linked external' : 'an embedded'} queue panel`, async () => {
        const fixture = batchPage({ modern: true, external })
        try {
            const result = await fixture.run()
            assert.equal(result.added, 7)
            assert.doesNotMatch(result.message, /Used standard mode/)
            assert.equal(fixture.maxPending(), 3)
            assert.deepEqual(fixture.queue, ['zzzzzzzzzzz', ...fixture.ids])
            assert.equal(fixture.env.window.document.querySelector('.ytdMiniplayerInfoBarExpand button').getAttribute('aria-expanded'), 'false')
        } finally { fixture.env.window.close() }
    })
}

test('an unrelated external playlist cannot authorize batching', async () => {
    const fixture = batchPage({ modern: true, external: true, unrelatedPanel: true })
    try {
        const result = await fixture.run()
        assert.equal(result.added, 7)
        assert.match(result.message, /Used standard mode/)
        assert.equal(fixture.maxPending(), 1)
    } finally { fixture.env.window.close() }
})

test('a queue expand control rendered after the first confirmation is awaited before batching', async () => {
    const fixture = batchPage({ modern: true, delayedControl: true })
    try {
        const result = await fixture.run()
        assert.equal(result.added, 7)
        assert.doesNotMatch(result.message, /Used standard mode/)
        assert.equal(fixture.maxPending(), 3)
        assert.deepEqual(fixture.queue, ['zzzzzzzzzzz', ...fixture.ids])
    } finally { fixture.env.window.close() }
})

test('standard mode still waits for each individual confirmation', async () => {
    const fixture = batchPage()
    try {
        const result = await fixture.run({ batchQueue: false })
        assert.equal(result.added, 7)
        assert.equal(fixture.maxPending(), 1)
        assert.deepEqual(fixture.clicks, fixture.ids)
        assert.equal(fixture.env.app.diagnostics.capture().events.filter(event => event.type === 'queue-batch').length, 0)
    } finally { fixture.env.window.close() }
})

test('search, sorting, and count limits are applied before any batch clicks', async () => {
    const fixture = batchPage()
    try {
        const result = await fixture.run({ term: '-00000000002', isAscending: true, videosCount: 4 })
        const expected = fixture.ids.slice(3).reverse()
        assert.equal(result.added, 4)
        assert.deepEqual(fixture.clicks, expected)
        assert.deepEqual(fixture.queue, ['zzzzzzzzzzz', ...expected])
    } finally { fixture.env.window.close() }
})

test('members-only cards with no view count are excluded before Top batch submissions', async () => {
    const fixture = batchPage({ modern: true })
    try {
        const card = fixture.env.window.document.querySelectorAll('yt-lockup-view-model')[2]
        card.querySelector('yt-content-metadata-view-model').innerHTML = '<span>1 day ago</span><yt-badge-view-model><badge-shape><div class="ytBadgeShapeText">Members only</div></badge-shape></yt-badge-view-model>'
        const result = await fixture.run({ sortBy: 'top' })
        const expected = fixture.ids.filter((id, index) => index !== 2)
        assert.equal(result.added, expected.length)
        assert.deepEqual(fixture.clicks, expected)
        assert.deepEqual(fixture.queue, ['zzzzzzzzzzz', ...expected])
    } finally { fixture.env.window.close() }
})

test('a selected video already in the queue uses the standard path before batching', async () => {
    const fixture = batchPage({ initialQueue: ['zzzzzzzzzzz', '00000000002'] })
    try {
        const result = await fixture.run()
        assert.equal(result.added, 7)
        assert.match(result.message, /Used standard mode/)
        assert.equal(fixture.maxPending(), 1)
    } finally { fixture.env.window.close() }
})

test('losing access to the queue after submitting a batch stops without fallback or retries', async () => {
    const fixture = batchPage({ onSubmit({ id, ids, env }) {
        if (id === ids[3]) env.window.document.querySelector('.ytp-playlist-menu-button').remove()
    } })
    try {
        await assert.rejects(fixture.run(), /could not be read after submitting/)
        assert.deepEqual(fixture.clicks, fixture.ids.slice(0, 4))
        assert.equal(fixture.env.app.controller.state().lastResult.added, 1)
    } finally { fixture.env.window.close() }
})

for (const modern of [false, true]) for (const failure of ['missing', 'reordered', 'duplicate']) {
    test(`a ${failure} batch in the ${modern ? 'info-bar' : 'legacy'} layout stops further additions and is never replayed`, async () => {
        const fixture = batchPage({ modern, settle({ id, ids, queue }) {
            if (failure === 'missing' && id === ids[2]) return
            queue.push(id)
            if (id !== ids[3]) return
            if (failure === 'reordered') queue.splice(-3, 3, ids[3], ids[2], ids[1])
            if (failure === 'duplicate') queue.push(id)
        } })
        try {
            await assert.rejects(fixture.run(), failure === 'reordered' ? /order changed/ : failure === 'duplicate' ? /duplicate/ : /could not be confirmed/)
            assert.deepEqual(fixture.clicks, fixture.ids.slice(0, 4))
            assert.equal(fixture.env.app.controller.state().lastResult.added, 1, 'unconfirmed batch clicks must not be counted as verified additions')
            assert.equal(fixture.env.app.controller.state().queueRunning, false)
            assert.match(fixture.env.app.controller.state().lastResult.error, /No batch clicks were retried/)
        } finally { fixture.env.window.close() }
    })
}

for (const modern of [false, true]) for (const reason of ['unreadable', 'incomplete']) {
    test(`an ${reason} initial queue in the ${modern ? 'info-bar' : 'legacy'} layout uses standard mode before submitting any batch`, async () => {
        const fixture = batchPage({ modern, [reason]: true })
        try {
            const result = await fixture.run()
            assert.equal(result.added, 7)
            assert.match(result.message, /Used standard mode/)
            assert.equal(fixture.maxPending(), 1)
            assert.deepEqual(fixture.clicks, fixture.ids)
            assert.deepEqual(fixture.queue, ['zzzzzzzzzzz', ...fixture.ids])
            const diagnostic = fixture.env.app.diagnostics.capture().events.find(event => event.type === 'queue-reader-error')
            assert.ok(diagnostic.reason)
            if (reason === 'incomplete') assert.ok(diagnostic.expectedCount > diagnostic.renderedCount)
        } finally { fixture.env.window.close() }
    })
}

test('Stop prevents further clicks and verifies the already submitted partial batch', async () => {
    const fixture = batchPage({ onSubmit({ id, ids, env }) {
        if (id === ids[2]) void env.app.controller.handle({ type: 'PLAYLIST_STOP' })
    } })
    try {
        const result = await fixture.run()
        assert.equal(result.added, 3)
        assert.match(result.message, /^Stopped/)
        assert.deepEqual(fixture.clicks, fixture.ids.slice(0, 3))
        assert.deepEqual(fixture.queue, ['zzzzzzzzzzz', ...fixture.ids.slice(0, 3)])
        assert.equal(fixture.env.app.controller.state().queueRunning, false)
    } finally { fixture.env.window.close() }
})

test('navigation stops batch submissions without retries', async () => {
    const fixture = batchPage({ onSubmit({ id, ids, env }) {
        if (id === ids[2]) env.window.history.pushState({}, '', '/other')
    } })
    try {
        await assert.rejects(fixture.run(), /page changed/)
        assert.deepEqual(fixture.clicks, fixture.ids.slice(0, 3))
        assert.equal(fixture.env.app.controller.state().lastResult.added, 1)
        assert.equal(fixture.env.app.controller.state().queueRunning, false)
    } finally { fixture.env.window.close() }
})
