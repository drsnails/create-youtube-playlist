const test = require('node:test')
const assert = require('node:assert/strict')
const { page, modules } = require('./helpers.cjs')

test('members-only badges exclude restricted cards from top selection while retaining their loading metadata', () => {
    const env = page('members-only.html')
    try {
        const videos = env.app.youtube.findVideos()
        assert.deepEqual(Array.from(videos, video => video.membersOnly), [false, true, false, true])
        assert.equal(videos[1].views, null)
        assert.equal(videos[1].ageDays, 2, 'restricted cards still provide date-loading boundaries')
        const selected = env.app.core.selectVideos(videos, { term: '', sortBy: 'top', videosCount: 2 })
        assert.deepEqual(Array.from(selected, video => video.id), ['ccccccccccc', 'aaaaaaaaaaa'])
        const detection = env.app.youtube.describe()
        assert.equal(detection.skipped.membersOnly, 2)
        assert.equal(detection.eligibleVideoCount, 2)
        assert.equal(detection.missing.views, 0)
        videos[0].element.querySelector('yt-content-metadata-view-model span').remove()
        assert.throws(() => env.app.core.selectVideos(env.app.youtube.findVideos(), { term: '', sortBy: 'top', videosCount: 2 }), /View counts could not/)
    } finally { env.window.close() }
})

test('reported compact cards read upload dates and view counts from accessible labels', () => {
    const env = page('reported-compact.html')
    try {
        const videos = env.app.youtube.findVideos()
        assert.equal(videos.length, 3)
        assert.ok(Math.abs(videos[0].ageDays - 20 / 24) < 1e-12)
        assert.equal(videos[0].views, 252000)
        assert.equal(videos[1].ageDays, 1)
        assert.equal(videos[2].ageDays, 28)
        assert.equal(videos[2].views, 299000)
        assert.equal(videos[0].ageSource, 'accessible-label')
        assert.equal(videos[0].viewsSource, 'accessible-label')
        assert.equal(env.app.core.selectVideos(videos, { term: '', sortBy: 'top', videosCount: 1 })[0].id, 'ccccccccccc')
    } finally { env.window.close() }
})

test('abbreviated relative dates remain readable when accessible labels are absent', () => {
    const env = page('reported-compact.html')
    try {
        for (const node of env.window.document.querySelectorAll('[aria-label]')) node.removeAttribute('aria-label')
        const videos = env.app.youtube.findVideos()
        assert.ok(Math.abs(videos[0].ageDays - 20 / 24) < 1e-12)
        assert.equal(videos[1].ageDays, 1)
        assert.equal(videos[2].ageDays, 28)
        assert.equal(videos[0].ageSource, 'relative-text')
        for (const [input, days] of [['2h ago', 2 / 24], ['3d ago', 3], ['4w ago', 28], ['2mo ago', 60], ['1y ago', 365], ['30m ago', 30 / 1440], ['45s ago', 45 / 86400]]) assert.ok(Math.abs(env.app.youtube.parseAge(input) - days) < 1e-12, input)
        assert.equal(env.app.youtube.parseAge('28 minutes, 51 seconds'), null, 'video durations are not upload dates')
        assert.equal(env.app.youtube.parseAge('20h'), null)
    } finally { env.window.close() }
})

test('legacy cards parse metadata regardless of span ordering and identify watched progress', () => {
    const env = page()
    try {
        const videos = env.app.youtube.findVideos()
        assert.equal(videos.length, 2)
        assert.equal(videos[0].views, 1200)
        assert.equal(videos[0].ageDays, 3)
        assert.equal(videos[0].watched, false)
        assert.equal(videos[1].views, 2345)
        assert.equal(videos[1].watched, true)
        modules.forEach(env.load)
        assert.equal(env.listeners.length, 1, 'reinjection must not register duplicate message handlers')
    } finally { env.window.close() }
})

test('modern metadata and duplicate thumbnail/title links yield one normalized video', () => {
    const env = page('modern.html')
    try {
        const [video] = env.app.youtube.findVideos()
        assert.equal(env.app.youtube.findVideos().length, 1)
        assert.equal(video.title, 'Modern layout')
        assert.equal(video.views, 3400000)
        assert.equal(video.ageDays, 5)
        assert.equal(env.app.youtube.parseViews('Channel 2024 • 3 days ago • 1.2K views'), 1200)
        assert.equal(env.app.youtube.parseViews('No views • 1 day ago'), 0)
        assert.equal(env.app.youtube.parseViews('9K subscribers'), null)
        assert.equal(env.app.youtube.parseViews('1.2 אלף צפיות', 'he'), 1200)
        assert.equal(env.app.youtube.parseAge('לפני שבועיים'), 14)
        assert.equal(env.app.youtube.parseAge('Streamed 2 hours ago'), 2 / 24)
        assert.equal(env.app.youtube.parseAge('LIVE'), null)
    } finally { env.window.close() }
})

test('renamed cards have a link-based fallback, with watched status explicitly unknown', () => {
    const env = page('renamed.html')
    try {
        const [video] = env.app.youtube.findVideos()
        assert.equal(video.id, 'ddddddddddd')
        assert.equal(video.source, 'video-link-fallback')
        assert.equal(video.views, 6000)
        assert.equal(video.watched, null)
    } finally { env.window.close() }
})

test('queue controls use their meaning, not their overlay position, and wait for confirmation', async () => {
    const env = page()
    try {
        const [video] = env.app.youtube.findVideos()
        let clicks = 0
        video.element.querySelector('[aria-label="Add to queue"]').addEventListener('click', () => {
            clicks++
            env.window.setTimeout(() => {
                const panel = env.window.document.createElement('ytd-playlist-panel-renderer')
                panel.innerHTML = '<a href="/watch?v=aaaaaaaaaaa">Queued video</a>'
                env.window.document.body.appendChild(panel)
            }, 10)
        })
        await env.app.youtube.addToQueue(video)
        assert.equal(clicks, 1)
        assert.equal(env.app.youtube.findVideos().length, 2, 'the queue itself must not become a discovered video list')
    } finally { env.window.close() }
})

test('modern cards open their menu and recognize a queue item from text', async () => {
    const env = page('modern.html')
    try {
        const [video] = env.app.youtube.findVideos()
        video.element.querySelector('button').addEventListener('click', () => {
            const menu = env.window.document.createElement('ytd-menu-popup-renderer')
            menu.innerHTML = '<ytd-menu-service-item-renderer>Add to queue</ytd-menu-service-item-renderer>'
            menu.firstElementChild.addEventListener('click', () => {
                const panel = env.window.document.createElement('ytd-playlist-panel-renderer')
                panel.innerHTML = '<a href="/watch?v=ccccccccccc">Queued</a>'
                env.window.document.body.appendChild(panel)
                menu.remove()
            })
            env.window.document.body.appendChild(menu)
        })
        await env.app.youtube.addToQueue(video)
    } finally { env.window.close() }
})

test('a click without evidence fails visibly and is never automatically repeated', async () => {
    const env = page()
    try {
        const [video] = env.app.youtube.findVideos()
        let clicks = 0
        video.element.querySelector('button').addEventListener('click', () => clicks++)
        await assert.rejects(env.app.youtube.addToQueue(video), /Could not confirm/)
        assert.equal(clicks, 1)
    } finally { env.window.close() }
})

test('a hover-created button is observed before clicking', async () => {
    const env = page('modern.html')
    try {
        const [video] = env.app.youtube.findVideos()
        // Exercise a hover-only layout; a ready menu can now be used immediately.
        video.element.querySelector('button').remove()
        video.element.addEventListener('mouseenter', () => {
            env.window.setTimeout(() => {
                const button = env.window.document.createElement('button')
                button.setAttribute('aria-label', 'Add to queue')
                button.addEventListener('click', () => button.setAttribute('aria-label', 'Remove from queue'))
                video.element.appendChild(button)
            }, 10)
        })
        await env.app.youtube.addToQueue(video)
    } finally { env.window.close() }
})

test('menu queues preserve order and await each new entry in an existing large queue', async () => {
    const env = page('modern.html')
    try {
        const { document } = env.window
        const template = document.querySelector('yt-lockup-view-model')
        const ids = Array.from({ length: 12 }, (_, index) => String(index).padStart(11, '0'))
        for (const id of ids) {
            const card = template.cloneNode(true)
            for (const link of card.querySelectorAll('a')) link.href = `/watch?v=${id}`
            document.body.appendChild(card)
        }
        template.remove()
        const player = document.createElement('ytd-miniplayer')
        const panel = document.createElement('ytd-playlist-panel-renderer')
        // Existing entries, including the requested IDs, cannot confirm a new click.
        for (let index = 0; index < 500; index++) {
            const link = document.createElement('a')
            link.href = `/watch?v=${ids[index % ids.length]}`
            panel.appendChild(link)
        }
        player.appendChild(panel)
        document.body.appendChild(player)
        const confirmed = []
        let pending = false
        const videos = env.app.youtube.findVideos()
        for (const video of videos) {
            video.element.querySelector('button').addEventListener('click', () => {
                assert.equal(pending, false, 'the previous addition must be confirmed before opening the next menu')
                const menu = document.createElement('ytd-menu-popup-renderer')
                menu.innerHTML = '<ytd-menu-service-item-renderer>Add to queue</ytd-menu-service-item-renderer>'
                menu.firstElementChild.addEventListener('click', () => {
                    pending = true
                    menu.remove()
                    env.window.setTimeout(() => {
                        const link = document.createElement('a')
                        link.href = `/watch?v=${video.id}`
                        panel.appendChild(link)
                        confirmed.push(video.id)
                        pending = false
                    }, 5)
                })
                document.body.appendChild(menu)
            })
            await env.app.youtube.addToQueue(video)
            assert.equal(pending, false, 'each addition must wait for its own new queue entry')
        }
        assert.deepEqual(confirmed, ids)
        const events = env.app.diagnostics.capture().events.filter(event => event.type === 'queue-item')
        assert.equal(events.length, ids.length)
        for (const event of events) {
            assert.equal(event.method, 'menu')
            assert.ok(event.durationMs >= event.confirmationMs)
            assert.ok(event.actionMs >= 0)
            assert.ok(event.clickMs >= 0)
            assert.ok(event.waitMs >= 0)
            assert.ok(Math.abs(event.clickMs + event.waitMs - event.confirmationMs) <= 1)
        }
    } finally { env.window.close() }
})

test('confirmation observes reused queue links and ignores IDs in unrelated URL parameters', async () => {
    const env = page()
    try {
        const [video] = env.app.youtube.findVideos()
        const panel = env.window.document.createElement('ytd-playlist-panel-renderer')
        panel.innerHTML = '<a href="/watch?v=bbbbbbbbbbb">Reused queue link</a>'
        env.window.document.body.appendChild(panel)
        let updated = false
        video.element.querySelector('[aria-label="Add to queue"]').addEventListener('click', () => {
            panel.firstElementChild.href = `/watch?v=bbbbbbbbbbb&list=${video.id}`
            env.window.setTimeout(() => {
                panel.firstElementChild.href = `/watch?v=${video.id}`
                updated = true
            }, 10)
        })
        await env.app.youtube.addToQueue(video)
        assert.equal(updated, true, 'only the video ID in the queue link can confirm the addition')
    } finally { env.window.close() }
})

test('valid video IDs are extracted independently of page DOM', () => {
    const env = page()
    try {
        for (const url of ['https://youtube.com/watch?v=aaaaaaaaaaa', 'https://youtu.be/aaaaaaaaaaa', 'https://www.youtube.com/shorts/aaaaaaaaaaa', 'https://www.youtube.com/embed/aaaaaaaaaaa']) assert.equal(env.app.youtube.videoId(url), 'aaaaaaaaaaa')
        assert.equal(env.app.youtube.videoId('https://evil.test/watch?v=aaaaaaaaaaa'), null)
        assert.equal(env.app.youtube.videoId('https://youtube.com/watch?v=invalid'), null)
    } finally { env.window.close() }
})
