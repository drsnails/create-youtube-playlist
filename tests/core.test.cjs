const test = require('node:test')
const assert = require('node:assert/strict')
const { page } = require('./helpers.cjs')
const options = { term: '', sortBy: 'date', videosCount: 0, amount: 1, timePeriod: 'weeks' }

test('members-only records are excluded before validation, sorting, and the requested count limit', () => {
    const env = page()
    try {
        const videos = [
            { id: 'restricted-missing', membersOnly: true, title: '', views: null, ageDays: null, watched: null },
            { id: 'public-low', title: 'Public episode', views: 10, ageDays: 1, watched: false },
            { id: 'restricted-known', membersOnly: true, title: 'Exclusive episode', views: 1000, ageDays: 1, watched: false },
            { id: 'public-high', title: 'Public episode', views: 100, ageDays: 2, watched: false }
        ]
        const selected = env.app.core.selectVideos(videos, { ...options, sortBy: 'top', videosCount: 2, isFilterByDate: true, isNotWatched: true })
        assert.deepEqual(Array.from(selected, video => video.id), ['public-high', 'public-low'])
        assert.equal(env.app.core.selectVideos(videos, { ...options, term: 'Exclusive' }).length, 0)
    } finally { env.window.close() }
})

test('filtering uses records and keeps the highest N in ascending top order', () => {
    const env = page()
    try {
        const videos = [{ id: 'a', title: 'JS basics', views: 50, ageDays: 3, watched: false }, { id: 'b', title: 'JS live', views: 500, ageDays: 10, watched: true }, { id: 'c', title: 'JS tutorial', views: 100, ageDays: 2, watched: false }]
        assert.deepEqual(Array.from(env.app.core.selectVideos(videos, { ...options, sortBy: 'top', videosCount: 2, isAscending: true }), v => v.id), ['c', 'b'])
        assert.deepEqual(Array.from(env.app.core.selectVideos(videos, { ...options, isFilterByDate: true, isNotWatched: true }), v => v.id), ['a', 'c'])
        assert.deepEqual(Array.from(env.app.core.selectVideos(videos, { ...options, isAscending: true, videosCount: 1 }), v => v.id), ['c'])
        assert.deepEqual(videos.map(v => v.id), ['a', 'b', 'c'])
    } finally { env.window.close() }
})

test('unknown metadata blocks only operations that need it', () => {
    const env = page()
    try {
        const videos = [{ id: 'a', title: 'Example', views: null, ageDays: null, watched: null }]
        assert.equal(env.app.core.selectVideos(videos, options).length, 1)
        assert.throws(() => env.app.core.selectVideos(videos, { ...options, sortBy: 'top' }), /View counts could not/)
        assert.throws(() => env.app.core.selectVideos(videos, { ...options, isFilterByDate: true }), /Upload dates could not/)
        assert.throws(() => env.app.core.selectVideos(videos, { ...options, isNotWatched: true }), /Watched status could not/)
        assert.throws(() => env.app.core.periodDays(-1, 'days'), /positive/)
    } finally { env.window.close() }
})

test('search supports grouped boolean expressions, negation, and regex groups/flags', () => {
    const env = page()
    try {
        const compile = env.app.core.compileSearch
        const search = compile('(JavaScript OR TypeScript) AND -live')
        assert.equal(search('JavaScript tutorial'), true)
        assert.equal(search('TypeScript live'), false)
        assert.equal(search('Python tutorial'), false)
        assert.equal(compile('/(java|type)script/i && -live')('TYPESCRIPT tutorial'), true)
        const global = compile('/tutorial/g')
        assert.equal(global('tutorial'), true)
        assert.equal(global('tutorial'), true)
        assert.equal(compile('CANDY')('candy'), true)
        assert.equal(compile('BAND')('band'), true)
        assert.equal(compile('-(live OR shorts)')('tutorial'), true)
        assert.equal(compile('-(live OR shorts)')('live tutorial'), false)
        assert.throws(() => compile('(hello OR world'), /unbalanced/)
        assert.throws(() => compile('hello &&'), /incomplete/)
        assert.throws(() => compile('/[/'), /Invalid search/)
    } finally { env.window.close() }
})
