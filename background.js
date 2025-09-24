// background.js
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'CREATE_FROM_TABS') {
    try {
      // Get the current window by finding the active tab first
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!activeTab) {
        sendResponse({ success: false, error: 'No active tab found' })
        return
      }

      // Query tabs only from the current window using the active tab's windowId
      const tabs = await chrome.tabs.query({ windowId: activeTab.windowId })
      const ids = []

      for (const t of tabs) {
        const id = extractVideoId(t.url || '')
        if (id) ids.push(id)
      }

      // Chunk if needed: very long URLs can fail, and YouTube may cap items
      const chunkSize = 50
      const chunks = []
      for (let i = 0; i < ids.length; i += chunkSize) {
        chunks.push(ids.slice(i, i + chunkSize))
      }

      // Strategy: load first chunk as queue, then (optionally) append via UI-Sim if you implement it
      if (chunks[0] && chunks[0].length > 0) {
        await chrome.tabs.sendMessage(activeTab.id, { type: 'LOAD_QUEUE_URL', ids: chunks[0] })
        sendResponse({ success: true, videoCount: chunks[0].length })
      } else {
        sendResponse({ success: false, error: 'No YouTube videos found in open tabs' })
      }

      // Optional: for remaining chunks, you could fall back to your current UI-sim appender
      // for (let i = 1; i < chunks.length; i++) { ... send message to append via UI-sim ... }
    } catch (error) {
      console.error('Error creating playlist from tabs:', error)
      sendResponse({ success: false, error: error.message })
    }
    return true // Keep the message channel open for async response
  }
})

function extractVideoId(url) {
  try {
    if (!url) return null
    const u = new URL(url)

    // youtube watch
    if ((/^(www\.)?youtube\.com$/).test(u.hostname) && u.pathname === '/watch') {
      return u.searchParams.get('v')
    }

    // shorts
    if ((/^(www\.)?youtube\.com$/).test(u.hostname) && u.pathname.startsWith('/shorts/')) {
      const [, , id] = u.pathname.split('/')
      return id || null
    }

    // youtu.be short links
    if ((/^youtu\.be$/).test(u.hostname)) {
      const [, id] = u.pathname.split('/')
      return id || null
    }

    // /embed/ID
    if ((/^(www\.)?youtube\.com$/).test(u.hostname) && u.pathname.startsWith('/embed/')) {
      const [, , id] = u.pathname.split('/')
      return id || null
    }
  } catch {}
  return null
}
