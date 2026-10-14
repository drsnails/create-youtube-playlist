(() => {
    'use strict'
    const files = ['services/core.js', 'youtube/selectors.js', 'youtube/adapter.js', 'services/diagnostics.js', 'main.js', 'content.js']
    const storageKey = 'inputsData'
    let activeTab, queueRunning = false, scrollRunning = false, lastPopupError = null
    const $ = selector => document.querySelector(selector)
    const status = (message, error = false) => {
        $('.operation-status').textContent = message
        $('.operation-status').dataset.error = String(error)
        if (error) lastPopupError = message
    }

    function options() {
        return {
            term: $('[name="search-term"]').value,
            isFilterByDate: $('.date-filter-checkbox').checked,
            isNotWatched: $('.not-watched-filter-checkbox').checked,
            batchQueue: $('.batch-queue-checkbox').checked,
            videosCount: +$('.num-of-vids').value,
            sortBy: $('.sort-by').value,
            isAscending: $('.ascending-input').checked,
            amount: $('.time-amount').value === '' ? 1 : +$('.time-amount').value,
            timePeriod: $('[name="period"]').value
        }
    }

    function save() { localStorage.setItem(storageKey, JSON.stringify(options())) }
    function restore() {
        let saved
        try { saved = JSON.parse(localStorage.getItem(storageKey)) } catch { return }
        if (!saved) return
        $('[name="search-term"]').value = saved.term || ''
        $('.date-filter-checkbox').checked = !!saved.isFilterByDate
        $('.not-watched-filter-checkbox').checked = !!saved.isNotWatched
        $('.batch-queue-checkbox').checked = !!saved.batchQueue
        $('.num-of-vids').value = saved.videosCount || ''
        $('.sort-by').value = saved.sortBy || 'date'
        $('.ascending-input').checked = !!saved.isAscending
        $('.time-amount').value = saved.amount ?? ''
        $('[name="period"]').value = saved.timePeriod || saved.period || 'days'
    }

    async function ensureTab() {
        if (!activeTab) [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!activeTab || !/^https:\/\/www\.youtube\.com\//.test(activeTab.url || '')) {
            throw new Error('Open a YouTube page first, then reopen this popup.')
        }
    }

    async function ensureContent() {
        await ensureTab()
        // Idempotent modules also support tabs opened before the extension was reloaded.
        await chrome.scripting.executeScript({ target: { tabId: activeTab.id }, files })
    }

    async function request(type, requestOptions) {
        await ensureContent()
        const response = await chrome.tabs.sendMessage(activeTab.id, { type, options: requestOptions })
        if (!response?.success) throw new Error(response?.error || 'The page did not respond. Reload it and try again.')
        return response
    }

    function setState(state) {
        queueRunning = !!state.queueRunning
        scrollRunning = !!state.scrollRunning
        $('.add-to-q').disabled = queueRunning || scrollRunning
        $('.add-to-q img').classList.toggle('hide', !queueRunning)
        $('.add-to-q span').classList.toggle('hide', queueRunning)
        $('.add-from-tabs-btn').disabled = queueRunning || scrollRunning
        $('.batch-queue-checkbox').disabled = queueRunning || scrollRunning
        $('.load-videos-btn').textContent = queueRunning || scrollRunning ? 'Stop' : 'Load More Videos'
        if (state.lastResult) status(state.lastResult.message || state.lastResult.error, !state.lastResult.success)
        else if (queueRunning || scrollRunning) status(queueRunning ? 'Creating your queue…' : 'Loading videos…')
    }

    async function guarded(button, action) {
        button.disabled = true
        try { await action() }
        catch (error) { status(error.message, true) }
        finally { button.disabled = button.matches('.add-to-q, .add-from-tabs-btn') && (queueRunning || scrollRunning) }
    }

    async function exportReport() {
        status('Capturing this page…')
        // This path needs neither the adapter nor the controller/message listener.
        await ensureTab()
        await chrome.scripting.executeScript({ target: { tabId: activeTab.id }, files: ['services/diagnostics.js'] })
        const results = await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: (selectedOptions, popupError) => {
                const app = globalThis.PlaylistApp
                let state
                try { state = app.controller?.state?.() || { controllerUnavailable: true } }
                catch (error) { state = { controllerError: error.message } }
                return app.diagnostics.capture(selectedOptions, { ...state, popupError })
            },
            args: [options(), lastPopupError]
        })
        const report = results[0]?.result
        if (!report) throw new Error('Page capture failed. Reload the page and try again.')
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `youtube-debug-${report.capturedAt.replace(/[:.]/g, '-')}.json`
        document.body.appendChild(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 30000)
        status('Report download started. Attach the JSON file in chat and describe what failed.')
    }

    document.addEventListener('DOMContentLoaded', async () => {
        restore()
        for (const input of document.querySelectorAll('input, select')) input.addEventListener('change', save)
        $('.add-to-q').addEventListener('click', () => guarded($('.add-to-q'), async () => {
            save()
            status('Creating your queue…')
            const result = await request('PLAYLIST_QUEUE', options())
            status(result.message)
        }))
        $('.load-videos-btn').addEventListener('click', () => guarded($('.load-videos-btn'), async () => {
            save()
            if (queueRunning || scrollRunning) {
                await request('PLAYLIST_STOP')
                status('Stopping…')
            } else {
                await request('PLAYLIST_LOAD', options())
                status('Loading videos… You can close this popup and reopen it to stop.')
            }
        }))
        $('.export-report-btn').addEventListener('click', () => guarded($('.export-report-btn'), exportReport))
        $('.clear-btn').addEventListener('click', () => {
            localStorage.removeItem(storageKey)
            $('[name="search-term"]').value = ''
            $('.date-filter-checkbox').checked = $('.not-watched-filter-checkbox').checked = $('.ascending-input').checked = false
            $('.batch-queue-checkbox').checked = false
            $('.num-of-vids').value = $('.time-amount').value = ''
            $('.sort-by').value = 'date'
            $('[name="period"]').value = 'days'
        })
        $('.add-from-tabs-btn').addEventListener('click', () => guarded($('.add-from-tabs-btn'), async () => {
            await ensureContent()
            const result = await chrome.runtime.sendMessage({ type: 'CREATE_FROM_TABS', tabId: activeTab.id })
            if (!result?.success) throw new Error(result?.error || 'Could not create the queue.')
            status(`Opened a queue with ${result.videoCount} videos.${result.omitted ? ` ${result.omitted} additional videos exceed the 50-video URL limit.` : ''}`)
        }))
        chrome.runtime.onMessage.addListener((message, sender) => {
            if (message.type === 'PLAYLIST_STATE' && sender.tab?.id === activeTab?.id) setState(message)
        })
        try { setState(await request('PLAYLIST_STATUS')) }
        catch (error) { status(error.message, true) }
    })
})()
