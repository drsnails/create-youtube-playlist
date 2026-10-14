// Service worker: browser-tab operations only. No YouTube page selectors.
importScripts('services/core.js', 'youtube/selectors.js', 'youtube/adapter.js')

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== 'CREATE_FROM_TABS' || sender.id !== chrome.runtime.id) return
    createFromTabs(message.tabId).then(sendResponse, error => sendResponse({ success: false, error: error.message }))
    return true
})

async function createFromTabs(tabId) {
    const activeTab = await chrome.tabs.get(tabId)
    if (!/^https:\/\/www\.youtube\.com\//.test(activeTab.url || '')) throw new Error('Open a YouTube page first.')
    const tabs = await chrome.tabs.query({ windowId: activeTab.windowId })
    const ids = [...new Set(tabs.map(tab => globalThis.PlaylistApp.youtube.videoId(tab.url || '')).filter(Boolean))]
    if (!ids.length) throw new Error('No YouTube videos were found in this window’s open tabs.')
    const selected = ids.slice(0, 50)
    // Navigation is acknowledged, not presented as a verified playback result.
    await chrome.tabs.update(tabId, { url: `https://www.youtube.com/watch_videos?video_ids=${selected.join(',')}` })
    return { success: true, videoCount: selected.length, omitted: Math.max(0, ids.length - selected.length) }
}
