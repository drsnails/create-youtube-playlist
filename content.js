// content.js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'LOAD_QUEUE_URL') {
    const ids = (msg.ids || []).filter(Boolean)
    if (!ids.length) return
    const url = `https://www.youtube.com/watch_videos?video_ids=${ids.join(',')}`
    // Replace current queue by navigating this tab
    window.location.href = url
  }
})

