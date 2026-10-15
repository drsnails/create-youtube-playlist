(() => {
    'use strict'
    const app = globalThis.PlaylistApp
    if (app.youtube) return
    const s = app.selectors
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
    const text = node => {
        if (!node) return ''
        const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT)
        const parts = []
        while (walker.nextNode()) parts.push(walker.currentNode.textContent)
        return parts.join(' ').replace(/\s+/g, ' ').trim()
    }
    const first = (root, selectors) => selectors.map(selector => root.querySelector(selector)).find(Boolean)
    const label = node => [node.getAttribute('aria-label'), node.getAttribute('title'), node.getAttribute('data-tooltip-text')].filter(Boolean).join(' ')

    function videoId(href) {
        try {
            const url = new URL(href, 'https://www.youtube.com')
            if (!/^(www\.|m\.)?youtube\.com$/.test(url.hostname) && url.hostname !== 'youtu.be') return null
            const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1]
            return /^[\w-]{11}$/.test(id || '') ? id : null
        } catch { return null }
    }

    function parseViews(value, locale = 'en') {
        if (!s.viewsLabel.test(value)) return null
        if (/\bno views\b|אין צפיות/i.test(value)) return 0
        let number = value.match(/(\d[\d.,\s\u00a0\u202f]*(?:thousand|million|billion|[KMB]|אלף|מיליון|מיליארד)?)\s*(?:views?\b|צפיות|צפייה)/i)?.[1]?.trim()
        if (!number) return null
        const suffix = number.match(/(thousand|million|billion|K|M|B|אלף|מיליון|מיליארד)$/i)?.[0]
        const multiplier = { thousand: 1e3, million: 1e6, billion: 1e9, k: 1e3, m: 1e6, b: 1e9, 'אלף': 1e3, 'מיליון': 1e6, 'מיליארד': 1e9 }[suffix?.toLowerCase()] || 1
        if (suffix) number = number.slice(0, -suffix.length)
        let parts
        try { parts = new Intl.NumberFormat(locale).formatToParts(12345.6) } catch { return null }
        const group = parts.find(part => part.type === 'group')?.value
        const decimal = parts.find(part => part.type === 'decimal')?.value
        if (group) number = number.split(group).join('')
        if (decimal && decimal !== '.') number = number.replace(decimal, '.')
        const result = Number(number.replace(/\s/g, '')) * multiplier
        return Number.isFinite(result) ? result : null
    }

    function parseAge(value) {
        const english = value.match(/(\d+(?:\.\d+)?)\s+(second|minute|hour|day|week|month|year)s?\s+ago\b/i)
        const days = { second: 1 / 86400, minute: 1 / 1440, hour: 1 / 24, day: 1, week: 7, month: 30, year: 365 }
        if (english) return +english[1] * days[english[2].toLowerCase()]
        const abbreviated = value.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(mo|min|sec|[smhdwy])\s+ago\b/i)
        const abbreviatedDays = { s: days.second, sec: days.second, m: days.minute, min: days.minute, h: days.hour, d: days.day, w: days.week, mo: days.month, y: days.year }
        if (abbreviated) return +abbreviated[1] * abbreviatedDays[abbreviated[2].toLowerCase()]
        const hebrew = value.match(/לפני\s+(\d+)\s+(שניות|דקות|שעות|ימים|שבועות|חודשים|שנים)/)
        const hebrewUnits = { 'שניות': days.second, 'דקות': days.minute, 'שעות': days.hour, 'ימים': 1, 'שבועות': 7, 'חודשים': 30, 'שנים': 365 }
        if (hebrew) return +hebrew[1] * hebrewUnits[hebrew[2]]
        const special = { 'שנייה': days.second, 'דקה': days.minute, 'שעתיים': 2 / 24, 'שעה': days.hour, 'יום': 1, 'יומיים': 2, 'שבוע': 7, 'שבועיים': 14, 'חודש': 30, 'חודשיים': 60, 'שנה': 365, 'שנתיים': 730 }
        const match = value.match(/לפני\s+(שנייה|דקה|שעתיים|שעה|יומיים|יום|שבועיים|שבוע|חודשיים|חודש|שנתיים|שנה)(?:\s|$)/)
        return match ? special[match[1]] : null
    }

    function findVideos(root = document) {
        const found = new Map()
        const locale = root.documentElement?.lang || document.documentElement.lang || 'en'
        const entries = [...root.querySelectorAll(s.cards.join(','))].map(element => ({ element, source: element.localName }))
        for (const link of root.querySelectorAll(s.videoLinks)) {
            if (!videoId(link.getAttribute('href'))) continue
            if (link.closest(s.queueRoots.join(',')) || link.closest(s.cards.join(','))) continue
            let element = link.parentElement
            for (let depth = 0; element && depth < 5; depth++, element = element.parentElement) {
                const ids = new Set([...element.querySelectorAll(s.videoLinks)].map(a => videoId(a.getAttribute('href'))).filter(Boolean))
                if (ids.size !== 1) break
                if (element.querySelector('h3, [role="heading"]') || element.localName.includes('renderer') || element.localName.includes('view-model')) {
                    entries.push({ element, source: 'video-link-fallback' })
                    break
                }
            }
        }
        for (const { element, source } of entries) {
            if (element.closest(s.queueRoots.join(','))) continue
            const link = [...element.querySelectorAll(s.videoLinks)].find(a => videoId(a.getAttribute('href')))
            if (!link) continue
            const id = videoId(link.getAttribute('href'))
            if (found.has(id)) continue
            const membersOnly = [...element.querySelectorAll(s.badges)].some(badge =>
                [text(badge), badge.getAttribute('aria-label'), badge.getAttribute('title')]
                    .some(value => value && s.membersOnlyLabel.test(value.trim())))
            const titleNode = first(element, s.titles)
            const title = text(titleNode) || titleNode?.getAttribute('title') || link.getAttribute('title') || text(link)
            const metadataNodes = [...element.querySelectorAll(s.metadata.join(','))]
            // Read semantic labels only inside metadata, so title/duration labels cannot be mistaken for dates.
            const metadataAccessible = [...new Set(metadataNodes.flatMap(node => [node, ...node.querySelectorAll(s.accessibleMetadata)]).map(label).filter(Boolean))].join(' • ')
            const metadataRoots = metadataNodes.filter(node => !metadataNodes.some(other => other !== node && other.contains(node)))
            const metadata = metadataRoots.map(text).join(' • ')
            const ageText = metadata || text(element)
            const datetime = element.querySelector('time[datetime]')?.getAttribute('datetime')
            const timestamp = datetime ? Date.parse(datetime) : NaN
            const accessibleAge = parseAge(metadataAccessible)
            const accessibleViews = parseViews(metadataAccessible, locale)
            const ageDays = Number.isFinite(timestamp) ? Math.max(0, (Date.now() - timestamp) / 86400000) : accessibleAge ?? parseAge(ageText)
            const views = accessibleViews ?? parseViews(metadata || text(element), locale)
            const progress = first(element, s.progress)
            found.set(id, {
                id, title, views, ageDays, membersOnly,
                watched: progress ? true : source === 'video-link-fallback' ? null : false,
                metadata, metadataAccessible, source,
                ageSource: Number.isFinite(timestamp) ? 'datetime' : accessibleAge != null ? 'accessible-label' : ageDays == null ? 'unknown' : 'relative-text',
                viewsSource: accessibleViews != null ? 'accessible-label' : views == null ? 'unknown' : 'visible-text',
                watchedSource: progress ? 'visible-progress' : source === 'video-link-fallback' ? 'unknown' : 'no-progress-in-known-layout',
                element
            })
        }
        return [...found.values()]
    }

    function waitFor(check, timeout = 4000, isCancelled = () => false, { root = document.documentElement, attributeFilter } = {}) {
        return new Promise((resolve, reject) => {
            let observer, timer, poll
            let finished = false
            const finish = (value, error) => {
                if (finished) return
                finished = true
                observer?.disconnect()
                clearTimeout(timer)
                clearInterval(poll)
                error ? reject(error) : resolve(value)
            }
            const run = () => {
                try {
                    if (isCancelled()) return finish(null)
                    const value = check()
                    if (value) finish(value)
                } catch (error) { finish(null, error) }
            }
            // Most controls and confirmations are already rendered. Avoid setting up
            // an observer and timers when the first check can finish immediately.
            run()
            if (finished) return
            observer = new MutationObserver(run)
            observer.observe(root, { childList: true, subtree: true, attributes: true, ...(attributeFilter ? { attributeFilter } : {}) })
            timer = setTimeout(() => finish(null), timeout)
            poll = setInterval(run, 150)
        })
    }

    const visible = node => !node.closest('[hidden], [aria-hidden="true"]') && node.getClientRects().length > 0
    function queueControl(root) {
        const node = [...root.querySelectorAll(s.queueControls)].find(node => !node.closest('a[href]') && s.queueLabel.test(label(node)) && visible(node))
        return node?.closest(s.actionTargets) || null
    }
    function queueCount(id) {
        let count = 0
        for (const root of document.querySelectorAll(s.queueRoots.join(','))) {
            if (root.parentElement?.closest(s.queueRoots.join(','))) continue
            // IDs come from videoId(), which only accepts 11 URL-safe characters.
            // Inspect links for this video instead of reparsing the entire queue.
            for (const link of root.querySelectorAll(`a[href*="${id}"]`)) {
                if (videoId(link.getAttribute('href')) === id) count++
            }
        }
        return count
    }

    function recordQueueItem(receipt, confirmedAt, batchSize = 1) {
        const { id, method, started, clickedAt, clickReturnedAt } = receipt
        app.diagnostics?.record('queue-item', {
            id, verified: true, method, batchSize,
            actionMs: Math.round(clickedAt - started), confirmationMs: Math.round(confirmedAt - clickedAt),
            clickMs: Math.round(clickReturnedAt - clickedAt), waitMs: Math.round(confirmedAt - clickReturnedAt),
            durationMs: Math.round(confirmedAt - started)
        })
    }

    async function addToQueue(video, isCancelled = () => false, { deferConfirmation = false } = {}) {
        const started = performance.now()
        if (!video.element.isConnected) throw new Error(`The video card for "${video.title}" is no longer on the page.`)
        const element = video.element
        element.scrollIntoView({ block: 'nearest' })
        element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
        element.dispatchEvent(new MouseEvent('mouseenter'))
        let menuButton = null, openedMenu = false, reader = null
        const expandControl = () => document.querySelector(s.queuePlayer)?.querySelector(s.queueExpandButton)
        const hadExpandControl = !!expandControl()
        try {
            // Collapsed info-bar queues can omit every queued link, including the
            // first/current video. Read existing IDs before clicking so expanding
            // an old queue cannot be mistaken for a successful duplicate addition.
            if (!deferConfirmation && hadExpandControl) reader = await openQueueReader(isCancelled)
            const previousIds = reader?.ids
            const action = await waitFor(() => {
                const control = queueControl(element)
                if (control) return { control }
                const button = [...element.querySelectorAll(s.menuButtons.join(','))].find(visible) ||
                    [...element.querySelectorAll('button, [role="button"]')].find(node => s.moreLabel.test(label(node)) && visible(node))
                return button ? { menuButton: button } : null
            }, 700, isCancelled, { root: element })
            if (isCancelled()) throw new Error('Queue creation stopped.')
            if (!action) throw new Error('The queue action could not be found. Export a debug report from this page.')
            let control = action.control
            if (action.menuButton) {
                menuButton = action.menuButton
                menuButton.click()
                openedMenu = true
                control = await waitFor(() => {
                    for (const menu of document.querySelectorAll(s.menus.join(','))) {
                        if (!visible(menu)) continue
                        const item = [...menu.querySelectorAll(s.menuItems)].find(node => s.queueLabel.test(`${label(node)} ${text(node)}`) && visible(node))
                        if (item) return item
                    }
                    return null
                }, 2500, isCancelled)
            }
            if (isCancelled()) throw new Error('Queue creation stopped.')
            if (!control) throw new Error('The menu opened, but its queue action was not recognized. Export a debug report with the menu open.')
            const before = queueCount(video.id)
            const removedBefore = [...element.querySelectorAll(s.queueControls)].filter(node => s.removeQueueLabel.test(label(node))).length
            const clickedAt = performance.now()
            control.click()
            const clickReturnedAt = performance.now()
            const receipt = { id: video.id, method: openedMenu ? 'menu' : 'overlay', started, clickedAt, clickReturnedAt }
            if (deferConfirmation) {
                // Submit in order, allowing YouTube's click handlers to finish before
                // the next menu is opened. The batch must still be verified below.
                await sleep(0)
                return receipt
            }
            const confirmsAddition = () => {
                const current = reader?.read()
                const countIn = ids => ids?.filter(id => id === video.id).length || 0
                const newEntry = reader ? current && countIn(current) > countIn(previousIds) : queueCount(video.id) > before
                const removedAfter = [...element.querySelectorAll(s.queueControls)].filter(node => s.removeQueueLabel.test(label(node)) && visible(node)).length
                return newEntry || removedAfter > removedBefore
            }
            const observe = { attributeFilter: ['href', 'aria-label', 'title', 'data-tooltip-text', 'hidden', 'aria-hidden', 'aria-expanded'] }
            let verified = await waitFor(() => {
                if (confirmsAddition()) return { confirmed: true }
                const expand = expandControl()
                // Only open after a click when this is a new queue or its existing
                // IDs were read above. Otherwise there is no trustworthy baseline.
                return expand && visible(expand) && expand.getAttribute('aria-expanded') === 'false' &&
                    (!hadExpandControl || previousIds) ? { open: true } : null
            }, 4500, isCancelled, observe)
            if (verified?.open) {
                reader = await openQueueReader(isCancelled)
                verified = reader && await waitFor(confirmsAddition, 4500, isCancelled, observe)
            }
            if (!verified) throw new Error(`Could not confirm that "${video.title}" was added. Export a debug report; the click will not be retried automatically.`)
            recordQueueItem(receipt, performance.now())
            reader?.close()
            // Yield to YouTube's event handlers between clicks without a fixed pause.
            await sleep(0)
        } finally {
            element.dispatchEvent(new MouseEvent('mouseleave'))
            if (openedMenu && menuButton && isCancelled()) menuButton.click()
        }
    }

    async function openQueueReader(isCancelled) {
        // Navigation links can acknowledge the first addition before the info bar
        // has finished rendering its expand control.
        const control = await waitFor(() => {
            const player = document.querySelector(s.queuePlayer)
            const expand = player?.querySelector(s.queueExpandButton)
            if (expand && visible(expand)) return { player, button: expand, modern: true }
            const button = player?.querySelector(s.queueListButton)
            return button && visible(button) ? { player, button, modern: false } : null
        }, 1000, isCancelled, { attributeFilter: ['hidden', 'aria-hidden', 'aria-expanded', 'class', 'style'] })
        const player = control?.player || document.querySelector(s.queuePlayer)
        const expand = player?.querySelector(s.queueExpandButton)
        const modern = control?.modern ?? !!expand
        const button = control?.button || expand || player?.querySelector(s.queueListButton)
        let problem = 'Queue control is missing or hidden.', expectedCount = null, renderedCount = null, panel = null
        const failed = () => {
            app.diagnostics?.record('queue-reader-error', { reason: problem, mode: modern ? 'info-bar' : 'player-menu', playerPresent: !!player, buttonPresent: !!button, expectedCount, renderedCount })
            return null
        }
        if (!control || !button.isConnected || !visible(button)) return failed()
        const listVisible = menu => {
            if (!menu || !visible(menu)) return false
            const style = getComputedStyle(menu)
            return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0'
        }
        const listId = link => {
            try { return new URL(link.getAttribute('href'), location.href).searchParams.get('list') }
            catch { return null }
        }
        const associated = candidate => {
            if (player.contains(candidate)) return true
            for (const id of (button.getAttribute('aria-controls') || '').split(/\s+/).filter(Boolean)) {
                if (document.getElementById(id)?.contains(candidate)) return true
            }
            // Some miniplayers render their expanded panel outside the player.
            // Associate it using the queue's playlist ID, never proximity or count alone.
            const queueLists = new Set([...player.querySelectorAll(s.queueNavigation)].map(listId).filter(Boolean))
            if (queueLists.size !== 1) return false
            const queueList = [...queueLists][0]
            const rows = [...candidate.querySelectorAll(s.queuePanelRows)]
            return rows.length > 0 && rows.every(row => {
                const lists = [...row.querySelectorAll(s.videoLinks)].map(listId).filter(Boolean)
                return lists.length > 0 && lists.every(id => id === queueList)
            })
        }
        const findPanel = () => {
            if (panel?.isConnected && listVisible(panel) && associated(panel)) return panel
            const candidates = [...document.querySelectorAll(s.queuePanel)].filter(candidate => listVisible(candidate) && associated(candidate))
            panel = candidates.length === 1 ? candidates[0] : null
            return panel
        }
        const read = () => {
            if (!player.isConnected) return null
            const counter = text(player.querySelector(modern ? s.queueExpandCounter : s.queueCounter)).match(/(?:^|\D)\d+\s*\/\s*(\d+)\s*$/)
            if (!counter) { problem = 'The queue counter could not be read.'; return null }
            expectedCount = +counter[1]
            let ids
            if (modern) {
                if (button.getAttribute('aria-expanded') !== 'true') { problem = 'The queue expand control did not open.'; return null }
                const current = findPanel()
                if (!current) { problem = 'No visible queue panel could be associated with this miniplayer.'; return null }
                const rows = [...current.querySelectorAll(s.queuePanelRows)]
                ids = rows.map(row => {
                    const links = [...row.querySelectorAll(s.videoLinks)]
                    const values = new Set(links.map(link => videoId(link.getAttribute('href'))))
                    return values.size === 1 ? [...values][0] : null
                })
            } else {
                const menu = player.querySelector(s.queueList)
                const list = menu?.querySelector(s.queueItems)
                if (!listVisible(menu) || !list) { problem = 'The player Playlist menu did not open.'; return null }
                ids = [...list.querySelectorAll(s.videoLinks)].map(link => videoId(link.getAttribute('href')))
            }
            renderedCount = ids.length
            // A counter alone cannot confirm IDs or order. A partially rendered or
            // virtualized list is not a complete snapshot and cannot enable batching.
            if (ids.some(id => !id) || ids.length !== expectedCount) { problem = 'The queue list is incomplete or its video IDs could not be read.'; return null }
            return ids
        }
        const menu = player.querySelector(s.queueList)
        const opened = modern ? button.getAttribute('aria-expanded') !== 'true' : !listVisible(menu)
        const close = () => {
            if (modern) {
                if (opened && button.isConnected && button.getAttribute('aria-expanded') === 'true') button.click()
                return
            }
            const menu = player.querySelector(s.queueList)
            if (opened && listVisible(menu)) menu.querySelector(s.queueListClose)?.click()
        }
        if (opened) button.click()
        const observe = { root: modern ? document.documentElement : player, attributeFilter: ['href', 'hidden', 'aria-hidden', 'aria-expanded', 'class', 'style'] }
        const ids = await waitFor(read, 2500, isCancelled, observe)
        if (!ids) { close(); return failed() }
        if (modern) observe.root = panel
        app.diagnostics?.record('queue-reader-ready', { mode: modern ? 'info-bar' : 'player-menu', videoCount: ids.length })
        return { ids, read, close, observe }
    }

    async function addInBatches(videos, isCancelled = () => false, onVerified = () => {}) {
        if (!videos.length || isCancelled()) return { fallback: false }
        const startURL = location.href
        const navigated = () => location.href !== startURL
        const stopped = () => isCancelled() || navigated()
        const checkPage = () => {
            if (navigated()) throw new Error('The page changed while creating the queue.')
        }
        // Initialize the queue through the existing, individually confirmed path.
        await addToQueue(videos[0], stopped)
        onVerified(1)
        checkPage()
        if (isCancelled() || videos.length === 1) return { fallback: false }
        const initial = await openQueueReader(stopped)
        checkPage()
        const remaining = videos.slice(1)
        const overlap = initial && remaining.some(video => initial.ids.includes(video.id))
        const stale = initial && !initial.ids.includes(videos[0].id)
        if (!initial || overlap || stale) {
            initial?.close()
            app.diagnostics?.record('batch-fallback', { reason: overlap ? 'Selected videos are already in the queue.' : 'The complete current queue order could not be read.' })
            for (const video of remaining) {
                if (isCancelled()) break
                checkPage()
                await addToQueue(video, stopped)
                onVerified(1)
            }
            return { fallback: true }
        }
        let previous = initial.ids
        initial.close()
        for (let index = 1; index < videos.length; index += 3) {
            checkPage()
            if (isCancelled()) break
            const receipts = []
            const started = performance.now()
            try {
                for (const video of videos.slice(index, index + 3)) {
                    checkPage()
                    if (isCancelled()) break
                    receipts.push(await addToQueue(video, stopped, { deferConfirmation: true }))
                }
                if (!receipts.length) break
                checkPage()
                // Stop prevents more clicks; already submitted additions are still
                // checked so that cancellation never presents pending clicks as safe to retry.
                const reader = await openQueueReader(navigated)
                if (!reader) throw new Error('The complete queue could not be read after submitting a batch.')
                const expected = [...previous, ...receipts.map(receipt => receipt.id)]
                const verified = await waitFor(() => {
                    const current = reader.read()
                    if (!current || current.length < expected.length) return null
                    if (current.length > expected.length) throw new Error('The queue contains unexpected or duplicate videos after batching.')
                    if (current.some((id, position) => id !== expected[position])) throw new Error('The queue order changed after batching.')
                    return current
                }, 4500 * receipts.length, navigated, reader.observe)
                checkPage()
                if (!verified) throw new Error('Some submitted videos could not be confirmed in the queue.')
                const confirmedAt = performance.now()
                for (const receipt of receipts) recordQueueItem(receipt, confirmedAt, receipts.length)
                onVerified(receipts.length)
                app.diagnostics?.record('queue-batch', { ids: receipts.map(receipt => receipt.id), verified: true, durationMs: Math.round(confirmedAt - started) })
                previous = verified
                reader.close()
            } catch (error) {
                // Never fall back or replay this batch once any clicks were submitted.
                app.diagnostics?.record('batch-error', { error: error.message, submittedIds: receipts.map(receipt => receipt.id) })
                throw new Error(`${error.message} ${receipts.length} batch additions were submitted; review the current queue before retrying. No batch clicks were retried automatically.`)
            }
        }
        return { fallback: false }
    }

    app.youtube = {
        videoId, parseViews, parseAge, findVideos, waitFor, addToQueue, addInBatches,
        assertDateLoading(videos) {
            if (!location.pathname.endsWith('/videos')) throw new Error('Load by date requires a channel Videos page sorted by Latest.')
            const ages = videos.map(video => video.ageDays).filter(Number.isFinite)
            if (ages.some((age, index) => index > 0 && age < ages[index - 1])) {
                throw new Error('Switch the channel Videos page to Latest before loading by date.')
            }
        },
        async waitForVideos() {
            const videos = await waitFor(() => { const result = findVideos(); return result.length ? result : null })
            if (!videos) throw new Error('No video cards were recognized. Open a channel Videos page or export a debug report.')
            return videos
        },
        async waitForMoreVideos(before, isCancelled) {
            return await waitFor(() => {
                const videos = findVideos()
                return videos.some(video => !before.has(video.id)) ? videos : null
            }, 3500, isCancelled) || findVideos()
        },
        scrollMore() { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }) },
        describe() {
            const videos = findVideos()
            const eligible = videos.filter(video => !video.membersOnly)
            return {
                selectorVersion: s.version,
                selectorMatches: Object.fromEntries(s.cards.map(selector => [selector, document.querySelectorAll(selector).length])),
                videoCount: videos.length,
                eligibleVideoCount: eligible.length,
                skipped: { membersOnly: videos.length - eligible.length },
                missing: Object.fromEntries(['title', 'views', 'ageDays', 'watched'].map(field => [field, eligible.filter(video => video[field] == null || video[field] === '').length])),
                videos: videos.slice(0, 50).map(({ element, ...video }) => video)
            }
        }
    }
})()
