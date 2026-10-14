// Update layout assumptions here. Prefer semantic labels/links over element position.
(() => {
    const app = globalThis.PlaylistApp ||= {}
    if (app.selectors) return
    app.selectors = {
        version: '2026-10-14.5',
        cards: ['ytd-rich-grid-media', 'ytd-grid-video-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer', 'ytd-playlist-video-renderer', 'yt-lockup-view-model'],
        videoLinks: 'a[href*="/watch?"], a[href*="/shorts/"]',
        titles: ['#video-title', '[id="video-title-link"]', '.yt-lockup-metadata-view-model__title', '.ytLockupMetadataViewModelTitle', 'h3 a', 'a[title]'],
        metadata: ['#metadata-line', 'yt-content-metadata-view-model', '.yt-content-metadata-view-model__metadata-text', '.ytContentMetadataViewModelMetadataText'],
        accessibleMetadata: '[aria-label], [title]',
        badges: 'yt-badge-view-model, badge-shape, ytd-badge-supported-renderer',
        membersOnlyLabel: /^members(?:\s+|-)only$/i,
        progress: ['ytd-thumbnail-overlay-resume-playback-renderer', 'yt-thumbnail-overlay-progress-bar-view-model', '.ytThumbnailOverlayProgressBarHost', '#overlays #progress'],
        queueRoots: ['ytd-playlist-panel-renderer', 'ytd-miniplayer'],
        queuePlayer: 'ytd-miniplayer',
        queueExpandButton: '.ytdMiniplayerInfoBarExpand button[aria-expanded]',
        queueExpandCounter: '.ytdMiniplayerInfoBarPlaylistIndex',
        queuePanel: 'ytd-playlist-panel-renderer',
        queuePanelRows: 'ytd-playlist-panel-video-renderer',
        queueNavigation: 'a.ytp-prev-button[href], a.ytp-next-button[href]',
        queueListButton: '.ytp-playlist-menu-button',
        queueList: '.ytp-playlist-menu',
        queueItems: '.ytp-playlist-menu-items',
        queueCounter: '.ytp-playlist-menu-button-text',
        queueListClose: '.ytp-playlist-menu-close',
        menuButtons: ['ytd-menu-renderer button', 'ytd-menu-renderer yt-icon-button', 'button[aria-haspopup="true"]', 'button[aria-haspopup="menu"]'],
        menus: ['ytd-menu-popup-renderer', 'tp-yt-paper-listbox', '[role="menu"]'],
        menuItems: 'ytd-menu-service-item-renderer, [role="menuitem"], button',
        queueLabel: /add to queue|הוספה לתור|הוסף לתור|ajouter à la file|añadir a la cola|agregar a la cola|zur warteschlange hinzufügen/i,
        removeQueueLabel: /remove from queue|הסרה מהתור|הסר מהתור/i,
        moreLabel: /more actions|action menu|more options|פעולות נוספות|אפשרויות נוספות/i,
        viewsLabel: /views?\b|צפיות|צפייה/i,
        queueControls: '[aria-label], [title], [data-tooltip-text]',
        actionTargets: 'button, [role="button"], ytd-thumbnail-overlay-toggle-button-renderer, yt-icon-button'
    }
})()
