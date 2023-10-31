'use strict'

let gIsStop = true
let _gFilterByTerm = 'key'

function stop() {
    gIsStop = true
}

function toggleFilterBy(filterByTerm, currTermIdx) {
    _gFilterByTerm = filterByTerm
}



/**
Adds a specified number of videos to the YouTube queue based on the given parameters.
@async
@function addToQueue
@param {string} sortBy - The sorting criterion ('top' for sorting by views).
@param {number} videosCount - The maximum number of videos to add to the queue.
@param {boolean} isAscending - If true, the videos will be added in ascending order based on the sorting criterion.
@param {boolean} isFilterByDate - If true, the videos will be filtered by the given date criteria.
@param {number} amount - The number of units of the specified time period to filter videos by (e.g., if timePeriod is 'weeks', and amount is 2, videos older than 2 weeks will be filtered out).
@param {string} timePeriod - The time period used for filtering videos ('day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years').
@param {string} term - string term that can be split into multiple terms and filtered based on the delimiter
@throws Will throw an error if something goes wrong while creating the queue.
*/
async function addToQueue(sortBy, videosCount, isAscending, isFilterByDate, amount, timePeriod, term) {
    var elPlayListContainer = document.querySelector('#player-container')
    var viewsSpansSelector = '#metadata-line > span:first-of-type'

    if (elPlayListContainer?.children.length) return
    try {

        chrome.runtime.sendMessage({ type: 'queue', isRunningQueue: true })
        const isSearchKeyInclude = (string, searchKey) => {
            // alert('string:' + string + ' searchKey:' + searchKey)
            if (!searchKey) return true
            if (searchKey.startsWith('-')) return !isSearchKeyInclude(string, searchKey.slice(1))
            const isInclude = new RegExp(searchKey, 'i')
            return isInclude.test(string)
        }

        const getDelimiter = (term) => {
            const delimiters = ['&&', '||'] // ! the order here matters for order of logic operations!
            return delimiters.find(delimiter => term.includes(delimiter)) || '***'
        }

        const getIsInclude = (term, title) => {

            const delimiter = getDelimiter(term)
            const terms = term.split(delimiter).map(term => term.trim())

            // ! the order here matters for order of logic operations!
            if (delimiter === '&&') {
                return terms.every(_term => getIsInclude(_term, title))
            }

            if (delimiter === '||') {
                return terms.some(_term => getIsInclude(_term, title))
            }

            if (term.startsWith('-')) return !getIsInclude(term.slice(1), title)
            const termRegexp = new RegExp(term, 'i')
            return termRegexp.test(title)
        }

        const sleep = (time = 0) => new Promise((resolve) => setTimeout(resolve, time))
        const getViewsCount = (viewsStr) => {
            const numMultMap = {
                K: 1000,
                M: 1000000,
                B: 1000000000
            }

            let viewsCountStr = viewsStr.split(' ')[0]
            let viewsCount = +viewsCountStr
            const numMult = viewsCountStr.at(-1)
            if (numMult in numMultMap) {
                viewsCount = +viewsCountStr.slice(0, -1) * numMultMap[numMult]
            }
            return viewsCount

        }

        // const sortDirection = isAscending ? -1 : 1
        const sortDirection = 1

        const sortByViews = (els) => {

            els.sort((el1, el2) => {
                const el1Views = el1.querySelector(viewsSpansSelector)
                const el2Views = el2.querySelector(viewsSpansSelector)
                const el1ViewsTxt = el1Views.innerText
                const el2ViewsTxt = el2Views.innerText
                let el1ViewsCount = getViewsCount(el1ViewsTxt)
                let el2ViewsCount = getViewsCount(el2ViewsTxt)
                return (el2ViewsCount - el1ViewsCount) * sortDirection
            })
        }


        const timesValMap = {
            day: 0,
            days: 0,
            week: 1,
            weeks: 1,
            month: 2,
            months: 2,
            year: 3,
            years: 3,
        }


        const checkIsSpanOverTheTime = (elSpan) => {
            let parts = elSpan?.innerText?.split(' ')
            let spanAmount = parts.at(0)
            let spanTimePeriod = parts.at(1)
            spanAmount = +spanAmount

            let _amount = amount
            let _timePeriod = timePeriod
            if (_amount === 1 && _timePeriod === 'weeks') {
                _amount = 7
                _timePeriod = 'days'
            }
            if (timesValMap[spanTimePeriod] > timesValMap[_timePeriod]) return true
            if (timesValMap[spanTimePeriod] === timesValMap[_timePeriod] && spanAmount >= _amount) return true
            return false
        }

        const filterByDate = (els) => {
            return els.filter(el => {
                const elSpan = el.querySelector('#metadata-line > span:nth-of-type(2)')
                return !checkIsSpanOverTheTime(elSpan)
            })
        }




        // let els = document.querySelectorAll("#items > ytd-grid-video-renderer")
        // let els = document.querySelectorAll("#contents > ytd-rich-item-renderer")
        let tempEls = document.querySelectorAll("#content > ytd-rich-grid-media")
        tempEls = Array.from(tempEls)
        if (sortBy === 'top') {
            sortByViews(tempEls)
        }
        if (isFilterByDate) tempEls = filterByDate(tempEls)

        if (!videosCount) videosCount = 200
        let foundVideosCount = 0
        console.log('videosCount:', videosCount)
        let els = []


        for (const el of tempEls) {
            const title = el.querySelector('#video-title').innerText
            const isIncludes = getIsInclude(term, title)
            if (isIncludes) {
                foundVideosCount++
                els.push(el)
            }
            if (foundVideosCount === videosCount) break
        }

        if (isAscending) els = els.reverse()
        for (const el of els) {
            const mouseenterEvent = new Event('mouseenter');
            el.dispatchEvent(mouseenterEvent);
            var elAddToQueue = el.querySelector('ytd-thumbnail-overlay-toggle-button-renderer:nth-child(2) #icon.ytd-thumbnail-overlay-toggle-button-renderer')
            await sleep(0) // ? multiple picks for the same videos without the sleep
            elAddToQueue?.click()
            const mouseleaveEvent = new Event('mouseleave');
            el.dispatchEvent(mouseleaveEvent);
        }


        // chrome.runtime.sendMessage({ type: 'queue', isRunningQueue: false })
    } catch (err) {
        console.log('err:', err)
        alert('Something went wrong while creating the queue: ' + err)
    } finally {
        chrome.runtime.sendMessage({ type: 'queue', isRunningQueue: false })
    }

}






/**
Scrolls through a YouTube video list page until reaching videos within a specified time period.
@function scrollToTime
@param {number} amount - The number of units of the specified time period to scroll to (e.g., if timePeriod is 'weeks', and amount is 2, the function will scroll until reaching videos that are 2 weeks old).
@param {string} timePeriod - The time period used to determine the scrolling target ('day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years').
@param {number} [page=0] - The starting page number for scrolling (default is 0).
@throws Will throw an error if something goes wrong while loading more videos.
*/
function scrollToTime(amount, timePeriod, page = 0) {
    gIsStop = false

    // toggle is running
    try {

        const onToggleIsRunning = (isRunningScroll) => {
            gIsStop = isRunningScroll
            chrome.runtime.sendMessage({ isRunningScroll, type: 'scroll' })
        }

        const checkIsSpanOverTheTime = (elSpan, timesValMap, amount) => {
            let parts = elSpan?.innerText?.split(' ')
            let spanAmount = parts.at(0)
            let spanTimePeriod = parts.at(1)
            spanAmount = +spanAmount
            if (timesValMap[spanTimePeriod] > timesValMap[timePeriod]) return true
            if (timesValMap[spanTimePeriod] === timesValMap[timePeriod] && spanAmount >= amount) return true
        }

        const timesValMap = {
            day: 0,
            days: 0,
            week: 1,
            weeks: 1,
            month: 2,
            months: 2,
            year: 3,
            years: 3,
        }

        let lastLength = 0
        let sameLengthCount = 0
        function innerRecursive(amount, timePeriod, page) {
            if (gIsStop) return
            timePeriod = timePeriod.toLocaleLowerCase()
            amount = +amount
            let elSpans = document.querySelectorAll("#metadata-line > span:nth-child(4)")
            elSpans = [...elSpans]
            if (elSpans.length === lastLength) {
                sameLengthCount++
                if (sameLengthCount > 150) return onToggleIsRunning(false)
            } else {
                sameLengthCount = 0
            }
            lastLength = elSpans.length

            if (amount === 1) {
                if (timePeriod.endsWith('s')) timePeriod = timePeriod.slice(0, -1)
            } else if (amount > 1) {
                if (!timePeriod.endsWith('s')) timePeriod += 's'
            } else return onToggleIsRunning(false)

            const elSpansToCheck = [elSpans.at(-30), elSpans.at(-20), elSpans.at(-10), elSpans.at(-1)]
            for (const elSpan of elSpansToCheck) {
                if (!elSpan) continue
                if (checkIsSpanOverTheTime(elSpan, timesValMap, amount)) return onToggleIsRunning(false)
            }


            window.scrollTo(0, page * 10000 + window.scrollY + 10000)
            setTimeout(() => {
                innerRecursive(amount, timePeriod, page + 1)
            }, 0);

        }

        window.scrollTo(0, page * 10000 + window.scrollY + 1000)
        innerRecursive(amount, timePeriod, page)
    } catch (err) {
        console.log(err)
        alert('Something went wrong while loading more videos: ' + err)

    }


}



function scrollToBottom(rounds) {
    for (let i = 0; i < rounds; i++) {
        setTimeout(((i) => {
            return () => window.scrollTo(0, i * 10000 + window.scrollY + 1000);
        })(i), 0 * i, i);
    }
}


// let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

// chrome.scripting.executeScript({
//     target: { tabId: tab.id },
//     function: fillInputs,
//     args: [startingDay, endDay, clockInHour, clockOutHour]
// });


