// Shared content-script controller. All YouTube DOM knowledge lives in youtube/.
(() => {
    'use strict'
    const app = globalThis.PlaylistApp
    if (app.controller) return

    let queueRunning = false
    let scrollRunning = false
    let cancelled = false
    let lastResult = null
    const notify = () => chrome.runtime.sendMessage({
        type: 'PLAYLIST_STATE', queueRunning, scrollRunning, lastResult
    }).catch(() => {}) // The popup may be closed.

    async function runQueue(options) {
        if (queueRunning || scrollRunning) throw new Error('An operation is already running.')
        queueRunning = true
        cancelled = false
        lastResult = null
        app.diagnostics.record('queue-start', { options })
        notify()
        let added = 0
        const startURL = location.href
        try {
            const videos = await app.youtube.waitForVideos()
            const selected = app.core.selectVideos(videos, options)
            if (!selected.length) throw new Error('No loaded videos match these filters.')
            let fallback = false
            if (options.batchQueue) {
                const result = await app.youtube.addInBatches(selected, () => cancelled, count => { added += count })
                fallback = result.fallback
            } else {
                for (const video of selected) {
                    if (cancelled) break
                    if (location.href !== startURL) throw new Error('The page changed while creating the queue.')
                    await app.youtube.addToQueue(video, () => cancelled)
                    added++
                }
            }
            lastResult = { success: true, message: `${cancelled ? 'Stopped. ' : ''}Added ${added} videos to the queue.${fallback ? ' Used standard mode because batching could not verify the existing queue.' : ''}`, added }
            app.diagnostics.record('queue-complete', lastResult)
            return lastResult
        } catch (error) {
            const message = `${error.message}${added ? ` ${added} videos were added before this failure.` : ''}`
            lastResult = { success: false, error: message, added }
            app.diagnostics.record('queue-error', lastResult)
            throw new Error(message)
        } finally {
            queueRunning = false
            notify()
        }
    }

    async function loadVideos(options) {
        if (queueRunning || scrollRunning) throw new Error('An operation is already running.')
        const days = app.core.periodDays(options.amount, options.timePeriod)
        scrollRunning = true
        cancelled = false
        lastResult = null
        app.diagnostics.record('load-start', { options })
        notify()
        const startURL = location.href
        try {
            let videos = await app.youtube.waitForVideos()
            let stalled = 0
            let rounds = 0
            while (!cancelled) {
                if (location.href !== startURL) throw new Error('The page changed while loading videos.')
                app.youtube.assertDateLoading(videos)
                const ages = videos.map(video => video.ageDays).filter(Number.isFinite)
                if (!ages.length) throw new Error('Upload dates could not be read. Export a debug report from this page.')
                if (ages.some(age => age >= days)) break
                if (++rounds > 200) throw new Error('Loading stopped after 200 attempts. Export a debug report if videos are still missing.')
                const before = new Set(videos.map(video => video.id))
                app.youtube.scrollMore()
                videos = await app.youtube.waitForMoreVideos(before, () => cancelled)
                const changed = videos.some(video => !before.has(video.id))
                stalled = changed ? 0 : stalled + 1
                if (stalled >= 3) break
            }
            lastResult = { success: true, message: `${cancelled ? 'Stopped. ' : ''}${videos.length} videos are loaded.` }
            app.diagnostics.record('load-complete', lastResult)
        } catch (error) {
            lastResult = { success: false, error: error.message }
            app.diagnostics.record('load-error', lastResult)
        } finally {
            scrollRunning = false
            notify()
        }
    }

    app.controller = {
        state: () => ({ queueRunning, scrollRunning, lastResult }),
        async handle(message) {
            switch (message.type) {
                case 'PLAYLIST_STATUS': return { success: true, ...this.state() }
                case 'PLAYLIST_QUEUE': return runQueue(message.options)
                case 'PLAYLIST_LOAD':
                    if (queueRunning || scrollRunning) throw new Error('An operation is already running.')
                    app.core.periodDays(message.options.amount, message.options.timePeriod)
                    // Respond immediately; loading continues if the popup closes.
                    void loadVideos(message.options).catch(error => {
                        lastResult = { success: false, error: error.message }
                        app.diagnostics.record('load-error', lastResult)
                        notify()
                    })
                    return { success: true, started: true }
                case 'PLAYLIST_STOP':
                    cancelled = true
                    return { success: true }
                case 'PLAYLIST_REPORT': return { success: true, report: app.diagnostics.capture(message.options, this.state()) }
                default: throw new Error('Unknown extension operation.')
            }
        }
    }
})()
