// Page capture deliberately does NOT depend on the YouTube adapter or card selectors.
(() => {
    'use strict'
    const app = globalThis.PlaylistApp ||= {}
    if (app.diagnostics) return
    const events = []
    const blockedTags = new Set(['script', 'style', 'noscript', 'iframe', 'object', 'embed'])
    const safeAttributes = new Set(['id', 'class', 'role', 'title', 'alt', 'name', 'type', 'hidden', 'disabled', 'datetime', 'itemprop', 'itemscope', 'itemtype', 'data-tooltip-text', 'd', 'viewBox'])
    const accountRegions = 'ytd-masthead, ytd-active-account-header-renderer, ytd-account-section-list-renderer, ytd-account-item-renderer, #account-menu, #avatar-btn, #sections.ytd-multi-page-menu-renderer'

    function redact(value) {
        return String(value)
            .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email removed]')
            .replace(/\bBearer\s+[\w.+/-]+=*/gi, '[credential removed]')
            .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[token removed]')
            .replace(/\b(?:AIza[\w-]{25,}|ya29\.[\w.-]+)\b/g, '[token removed]')
            .replace(/((?:access_token|auth_token|authorization|password|cookie|secret|api_key|session_token)\s*[=:]\s*)[^\s&"<>]+/gi, '$1[removed]')
    }

    function safeURL(value) {
        try {
            const url = new URL(value, location.href)
            if (!['https:', 'http:'].includes(url.protocol)) return null
            url.username = ''; url.password = ''; url.hash = ''
            for (const key of [...url.searchParams.keys()]) {
                if (!['v', 'list', 'index', 't'].includes(key)) url.searchParams.delete(key)
            }
            return redact(url.href)
        } catch { return null }
    }

    function snapshot(root, { maxNodes = 40000, maxCharacters = 3000000 } = {}) {
        let nodes = 0, characters = 0, truncated = false
        const visit = (node, depth = 0) => {
            if (++nodes > maxNodes || characters > maxCharacters || depth > 120) { truncated = true; return null }
            if (node.nodeType === 3) {
                const value = redact(node.textContent).slice(0, 4000)
                if (node.textContent.length > 4000) truncated = true
                characters += value.length
                return document.createTextNode(value)
            }
            if (node.nodeType !== 1) return null
            const clone = node.cloneNode(false)
            for (const attribute of [...clone.attributes]) {
                const name = attribute.name
                if (name === 'href') {
                    const url = safeURL(attribute.value)
                    url ? clone.setAttribute(name, url) : clone.removeAttribute(name)
                } else if (safeAttributes.has(name) || name.startsWith('aria-')) {
                    clone.setAttribute(name, redact(attribute.value).slice(0, 1000))
                } else clone.removeAttribute(name)
            }
            characters += clone.outerHTML.length
            const privateContent = node.matches(accountRegions) || node.matches('input, textarea, [contenteditable="true"]')
            if (blockedTags.has(node.localName) || privateContent) {
                clone.removeAttribute('src')
                if (privateContent) { for (const attr of ['title', 'aria-label', 'alt']) clone.removeAttribute(attr) }
                clone.textContent = '[content omitted]'
                return clone
            }
            for (const child of node.childNodes) {
                const copy = visit(child, depth + 1)
                if (copy) clone.appendChild(copy)
                if (truncated && (nodes > maxNodes || characters > maxCharacters)) break
            }
            if (node.shadowRoot && nodes < maxNodes && characters < maxCharacters) {
                const template = document.createElement('template')
                template.setAttribute('data-report-shadow-root', 'open')
                for (const child of node.shadowRoot.childNodes) {
                    const copy = visit(child, depth + 1)
                    if (copy) template.content.appendChild(copy)
                }
                clone.appendChild(template)
            }
            return clone
        }
        const clone = visit(root)
        const html = clone?.outerHTML || ''
        return { html, truncated, nodesVisited: nodes, characters: html.length, limits: { maxNodes, maxCharacters } }
    }

    function scrub(value) {
        if (typeof value === 'string') return redact(value)
        if (Array.isArray(value)) return value.map(scrub)
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrub(item)]))
        return value
    }

    function capture(options = {}, state = {}) {
        // Capture first so even a throwing/obsolete adapter cannot prevent the report.
        const dom = snapshot(document.documentElement)
        const tagCounts = {}, attributeNames = {}
        for (const node of document.querySelectorAll('*')) {
            tagCounts[node.localName] = (tagCounts[node.localName] || 0) + 1
            for (const attribute of node.attributes) attributeNames[attribute.name] = (attributeNames[attribute.name] || 0) + 1
        }
        const seen = new Set(), links = []
        for (const link of document.querySelectorAll('a[href]')) {
            const href = safeURL(link.getAttribute('href'))
            if (!href || !/youtube\.com\/(?:watch\?|shorts\/)/.test(href) || seen.has(href)) continue
            seen.add(href)
            if (links.length >= 30) continue
            // Fixed ancestor depth; does not assume a card tag/class/name.
            const context = link.parentElement?.parentElement || link
            links.push({ href, text: redact(link.textContent.trim()).slice(0, 500), context: snapshot(context, { maxNodes: 300, maxCharacters: 16000 }) })
        }
        // Queue panels can follow thousands of cards and fall beyond the main
        // snapshot's limits. Capture these surfaces separately using the same scrubber.
        const queueRegions = [...document.querySelectorAll('ytd-miniplayer, ytd-playlist-panel-renderer')].slice(0, 4)
            .map(node => ({ tag: node.localName, context: snapshot(node, { maxNodes: 3000, maxCharacters: 150000 }) }))
        let detection
        try { detection = app.youtube ? app.youtube.describe() : { error: 'YouTube adapter is unavailable.' } }
        catch (error) { detection = { error: error.message } }
        const metadata = [...document.querySelectorAll('meta[itemprop], meta[property="og:title"], meta[property="og:type"]')]
            .filter(node => ['name', 'uploadDate', 'datePublished', 'duration', 'interactionCount'].includes(node.getAttribute('itemprop')) || node.hasAttribute('property'))
            .map(node => ({ field: node.getAttribute('itemprop') || node.getAttribute('property'), value: redact(node.content) }))
        return scrub({
            schemaVersion: 1,
            capturedAt: new Date().toISOString(),
            extensionVersion: chrome.runtime.getManifest().version,
            page: { url: safeURL(location.href), language: document.documentElement.lang, readyState: document.readyState, viewport: { width: innerWidth, height: innerHeight }, scrollY },
            options, state, events: events.slice(), detection, metadata,
            independentCapture: { tagCounts, attributeNames, uniqueVideoLinks: seen.size, links, queueRegions, dom },
            privacy: {
                removed: ['script/style contents', 'form contents', 'account header/menu contents', 'event handlers', 'unapproved attributes', 'URL parameters except v/list/index/t', 'recognized emails and credential patterns'],
                note: 'Contains rendered page text, video titles, links, and your selected search/filter options. Review before sharing. No cookies, storage, or network headers are collected.'
            }
        })
    }

    app.diagnostics = {
        redact, safeURL, snapshot, capture,
        record(type, details = {}) {
            events.push(scrub({ at: new Date().toISOString(), type, url: safeURL(location.href), ...details }))
            if (events.length > 100) events.shift()
        }
    }
})()
