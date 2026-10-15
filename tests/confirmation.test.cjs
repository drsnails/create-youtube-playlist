const test = require('node:test')
const assert = require('node:assert/strict')
const { page } = require('./helpers.cjs')

function collapsedQueue({ initialQueue = [], settle = true, readable = true, batching = false, closeOnMenu = false } = {}) {
    const env = page('reported-first-queue.html')
    const { document } = env.window
    const ids = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd']
    const queue = [...initialQueue], clicks = []
    let player, pending = false, expanded = 0
    const render = () => {
        player.querySelector('.ytdMiniplayerInfoBarPlaylistIndex').textContent = `• 1 / ${queue.length}`
        const panel = player.querySelector('ytd-playlist-panel-renderer')
        panel.replaceChildren()
        if (panel.hidden || !readable) return
        for (const id of queue) {
            const row = document.createElement('ytd-playlist-panel-video-renderer')
            row.innerHTML = `<a href="/watch?v=${id}">Thumbnail</a><a href="/watch?v=${id}">Title</a>`
            panel.appendChild(row)
        }
    }
    const createPlayer = () => {
        player = document.querySelector('#player-template').content.firstElementChild.cloneNode(true)
        document.body.appendChild(player)
        const button = player.querySelector('.ytdMiniplayerInfoBarExpand button')
        button.addEventListener('click', () => {
            const panel = player.querySelector('ytd-playlist-panel-renderer')
            panel.hidden = !panel.hidden
            button.setAttribute('aria-expanded', String(!panel.hidden))
            if (!panel.hidden) expanded++
            render()
        })
        render()
    }
    if (queue.length) createPlayer()
    const template = document.querySelector('yt-lockup-view-model')
    for (const id of ids) {
        const card = template.cloneNode(true)
        for (const link of card.querySelectorAll('a')) link.href = `/watch?v=${id}`
        card.querySelector('button').addEventListener('click', () => {
            if (!batching) assert.equal(pending, false, 'standard mode must await each submitted addition')
            if (closeOnMenu && player?.querySelector('.ytdMiniplayerInfoBarExpand button').getAttribute('aria-expanded') === 'true') {
                player.querySelector('.ytdMiniplayerInfoBarExpand button').click()
            }
            const menu = document.createElement('yt-list-view-model')
            menu.setAttribute('role', 'menu')
            menu.innerHTML = '<button role="menuitem">Add to queue</button>'
            menu.firstElementChild.addEventListener('click', () => {
                clicks.push(id)
                menu.remove()
                pending = true
                env.window.setTimeout(() => {
                    if (settle) queue.push(id)
                    if (!player) createPlayer()
                    render()
                    pending = false
                }, 10)
            })
            document.body.appendChild(menu)
        })
        document.body.appendChild(card)
    }
    template.remove()
    return { env, ids, clicks, queue, expanded: () => expanded }
}

for (const batchQueue of [false, true]) {
    test(`a first queue without a current-video link is confirmed with experimental mode ${batchQueue ? 'on' : 'off'}`, async () => {
        const fixture = collapsedQueue()
        try {
            const result = await fixture.env.app.controller.handle({ type: 'PLAYLIST_QUEUE', options: { term: '', sortBy: 'date', videosCount: 1, batchQueue } })
            assert.equal(result.added, 1)
            assert.deepEqual(fixture.clicks, [fixture.ids[0]])
            assert.ok(fixture.expanded() > 0, 'read the actual queued ID instead of inferring it from the title or counter')
            assert.equal(fixture.env.window.document.querySelector('.ytdMiniplayerInfoBarExpand button').getAttribute('aria-expanded'), 'false')
        } finally { fixture.env.window.close() }
    })
}

test('standard mode confirms successive additions when collapsed rows are removed from the DOM', async () => {
    const fixture = collapsedQueue()
    try {
        const result = await fixture.env.app.controller.handle({ type: 'PLAYLIST_QUEUE', options: { term: '', sortBy: 'date', videosCount: 0, batchQueue: false } })
        assert.equal(result.added, fixture.ids.length)
        assert.deepEqual(fixture.clicks, fixture.ids)
        assert.deepEqual(fixture.queue, fixture.ids)
    } finally { fixture.env.window.close() }
})

test('a first queue without player links initializes a fully verified experimental batch', async () => {
    const fixture = collapsedQueue({ batching: true })
    try {
        const result = await fixture.env.app.controller.handle({ type: 'PLAYLIST_QUEUE', options: { term: '', sortBy: 'date', videosCount: 0, batchQueue: true } })
        assert.equal(result.added, fixture.ids.length)
        assert.deepEqual(fixture.queue, fixture.ids)
        const batches = fixture.env.app.diagnostics.capture().events.filter(event => event.type === 'queue-batch')
        assert.equal(batches.length, 1)
        assert.deepEqual(Array.from(batches[0].ids), fixture.ids.slice(1))
    } finally { fixture.env.window.close() }
})

test('standard confirmation reopens a queue dismissed by the video action menu', async () => {
    const fixture = collapsedQueue({ initialQueue: ['aaaaaaaaaaa'], closeOnMenu: true })
    try {
        await fixture.env.app.youtube.addToQueue(fixture.env.app.youtube.findVideos()[0])
        assert.deepEqual(fixture.queue, ['aaaaaaaaaaa', 'aaaaaaaaaaa'])
        assert.equal(fixture.expanded(), 2)
        assert.equal(fixture.env.window.document.querySelector('.ytdMiniplayerInfoBarExpand button').getAttribute('aria-expanded'), 'false')
    } finally { fixture.env.window.close() }
})

test('opening an existing collapsed queue cannot confirm a failed duplicate addition', async () => {
    const fixture = collapsedQueue({ initialQueue: ['aaaaaaaaaaa'], settle: false })
    try {
        await assert.rejects(fixture.env.app.youtube.addToQueue(fixture.env.app.youtube.findVideos()[0]), /Could not confirm/)
        assert.deepEqual(fixture.clicks, [fixture.ids[0]])
    } finally { fixture.env.window.close() }
})

test('a duplicate addition is confirmed only after the existing collapsed queue gains another occurrence', async () => {
    const fixture = collapsedQueue({ initialQueue: ['aaaaaaaaaaa'] })
    try {
        await fixture.env.app.youtube.addToQueue(fixture.env.app.youtube.findVideos()[0])
        assert.deepEqual(fixture.queue, ['aaaaaaaaaaa', 'aaaaaaaaaaa'])
        assert.deepEqual(fixture.clicks, [fixture.ids[0]])
    } finally { fixture.env.window.close() }
})

test('a matching title and queue counter without readable video IDs still fails without retrying', async () => {
    const fixture = collapsedQueue({ readable: false })
    try {
        await assert.rejects(fixture.env.app.youtube.addToQueue(fixture.env.app.youtube.findVideos()[0]), /Could not confirm/)
        assert.deepEqual(fixture.clicks, [fixture.ids[0]])
    } finally { fixture.env.window.close() }
})
