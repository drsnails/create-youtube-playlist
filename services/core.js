// Pure application logic: no document, selectors, or Chrome APIs.
(() => {
    'use strict'
    const app = globalThis.PlaylistApp ||= {}
    if (app.core) return
    const units = { day: 1, week: 7, month: 30, year: 365 }

    function periodDays(amount, period) {
        const unit = units[String(period).replace(/s$/, '')]
        if (!unit || !Number.isFinite(+amount) || +amount <= 0) throw new Error('Enter a positive time amount.')
        return +amount * unit
    }

    function tokenize(expression) {
        const tokens = []
        let term = '', regex = false, escaped = false
        const flush = () => { if (term.trim()) tokens.push({ term: term.trim() }); term = '' }
        for (let i = 0; i < expression.length; i++) {
            const char = expression[i]
            if (regex) {
                term += char
                if (char === '/' && !escaped) regex = false
                escaped = char === '\\' && !escaped
                continue
            }
            if (char === '/' && /^-?$/.test(term.trim())) { regex = true; term += char; continue }
            let operator = expression.slice(i).match(/^(?:&&|\|\||\bAND\b|\bOR\b)/)
            if (operator && /^(AND|OR)$/.test(operator[0]) && /\w/.test(expression[i - 1] || '')) operator = null
            if (operator) {
                flush()
                tokens.push(operator[0] === 'AND' ? '&&' : operator[0] === 'OR' ? '||' : operator[0])
                i += operator[0].length - 1
            } else if (char === '(' || char === ')') { flush(); tokens.push(char) }
            else term += char
        }
        if (regex) throw new Error('The search regular expression is missing its closing slash.')
        flush()
        return tokens
    }

    function compileSearch(expression = '') {
        if (!expression.trim()) return () => true
        const tokens = tokenize(expression)
        let position = 0
        const term = () => {
            const token = tokens[position++]
            if (token === '(') {
                const matcher = or()
                if (tokens[position++] !== ')') throw new Error('The search has unbalanced parentheses.')
                return matcher
            }
            if (!token || typeof token !== 'object') throw new Error('The search expression is incomplete.')
            if (token.term === '-' && tokens[position] === '(') {
                const matcher = term()
                return title => !matcher(title)
            }
            const negated = token.term.startsWith('-')
            const value = negated ? token.term.slice(1) : token.term
            if (!value) throw new Error('Enter a search term after "-".')
            const explicit = value.match(/^\/([\s\S]*)\/([a-z]*)$/)
            let pattern
            try { pattern = explicit ? new RegExp(explicit[1], explicit[2]) : new RegExp(value, 'i') }
            catch { throw new Error(`Invalid search regular expression: ${value}`) }
            return title => { pattern.lastIndex = 0; return pattern.test(title) !== negated }
        }
        const and = () => {
            let matcher = term()
            while (tokens[position] === '&&') {
                position++
                const left = matcher, right = term()
                matcher = title => left(title) && right(title)
            }
            return matcher
        }
        const or = () => {
            let matcher = and()
            while (tokens[position] === '||') {
                position++
                const left = matcher, right = and()
                matcher = title => left(title) || right(title)
            }
            return matcher
        }
        const matcher = or()
        if (position !== tokens.length) throw new Error('Check the search operators and parentheses.')
        return matcher
    }

    function selectVideos(videos, options) {
        const matches = compileSearch(options.term)
        let selected = videos.filter(video => {
            if (video.membersOnly) return false
            if (!video.title) throw new Error('Some video titles could not be read. Export a debug report.')
            return matches(video.title)
        })
        const requireField = (field, label) => {
            if (selected.some(video => video[field] == null || (field !== 'watched' && !Number.isFinite(video[field])))) {
                throw new Error(`${label} could not be read for some videos. Export a debug report or disable this filter.`)
            }
        }
        if (options.isFilterByDate) {
            const days = periodDays(options.amount, options.timePeriod)
            requireField('ageDays', 'Upload dates')
            selected = selected.filter(video => video.ageDays < days)
        }
        if (options.isNotWatched) {
            requireField('watched', 'Watched status')
            selected = selected.filter(video => !video.watched)
        }
        if (options.sortBy === 'top') {
            requireField('views', 'View counts')
            selected.sort((a, b) => b.views - a.views)
        } else if (options.isAscending) selected.reverse()
        const count = Number(options.videosCount)
        if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) throw new Error('Choose a valid video count.')
        if (count) selected = selected.slice(0, count)
        if (options.sortBy === 'top' && options.isAscending) selected.reverse()
        return selected
    }

    app.core = { periodDays, compileSearch, selectVideos }
})()
