(() => {
    const app = globalThis.PlaylistApp
    if (app.messagesInstalled) return
    app.messagesInstalled = true
    const operations = new Set(['PLAYLIST_STATUS', 'PLAYLIST_QUEUE', 'PLAYLIST_LOAD', 'PLAYLIST_STOP', 'PLAYLIST_REPORT'])
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (sender.id !== chrome.runtime.id) return
        if (message.type === 'LOAD_QUEUE_URL') {
            const ids = (message.ids || []).filter(id => /^[\w-]{11}$/.test(id))
            if (!ids.length) { sendResponse({ success: false, error: 'No valid video IDs were provided.' }); return }
            sendResponse({ success: true })
            window.location.href = `https://www.youtube.com/watch_videos?video_ids=${ids.join(',')}`
            return
        }
        if (!operations.has(message.type)) return
        Promise.resolve().then(() => app.controller.handle(message)).then(sendResponse, error => {
            app.diagnostics.record('operation-error', { operation: message.type, error: error.message })
            sendResponse({ success: false, error: error.message })
        })
        return true
    })
})()

