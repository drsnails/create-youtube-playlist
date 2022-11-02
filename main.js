'use strict'

let gIsStop = true
let _gFilterByTerm = 'key'

function stop() {
    gIsStop = true
}

function toggleFilterBy(filterByTerm, currTermIdx) {
    _gFilterByTerm = filterByTerm
}




function addToQueue(sortBy, videosCount, isAscending, ...terms) {
    var elPlayListContainer = document.querySelector('#player-container')


    if (elPlayListContainer?.children.length) return
    try {

        chrome.runtime.sendMessage({ type: 'queue', isRunningQueue: true })
        const isSearchKeyInclude = (string, searchKey) => {
            if (!searchKey) return true
            // * comment next line for normal filter
            // searchKey = '.*' + searchKey.split('').join('.*') + '.*' 
            const isInclude = new RegExp(searchKey, 'i')

            return isInclude.test(string)
        }

        const getViewsCount = (viewsStr) => {
            console.log('viewsStr:', viewsStr)
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
                const el1ViewsTxt = el1.querySelector("#metadata-line > span:nth-child(2)").innerText
                const el2ViewsTxt = el2.querySelector("#metadata-line > span:nth-child(2)").innerText
                let el1ViewsCount = getViewsCount(el1ViewsTxt)
                let el2ViewsCount = getViewsCount(el2ViewsTxt)
                return (el2ViewsCount - el1ViewsCount) * sortDirection
            })
        }


        // let els = document.querySelectorAll("#items > ytd-grid-video-renderer")
        // let els = document.querySelectorAll("#contents > ytd-rich-item-renderer")
        let tempEls = document.querySelectorAll("#content > ytd-rich-grid-media")
        tempEls = Array.from(tempEls)
        if (sortBy === 'top') {
            sortByViews(tempEls)
        }
        
        if (!videosCount) videosCount = 200
        let foundVideosCount = 0
        let els = []
        for (const el of tempEls) {
            const title = el.querySelector('#video-title').innerText
            const isIncludes = terms.some(term => isSearchKeyInclude(title, term))
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
            elAddToQueue?.click()
            const mouseleaveEvent = new Event('mouseleave');
            el.dispatchEvent(mouseleaveEvent);
        }


        // chrome.runtime.sendMessage({ type: 'queue', isRunningQueue: false })
    } catch (err) {
        console.log('err:', err)
        alert('Something went wrong while creating the queue')
    } finally {
        chrome.runtime.sendMessage({ type: 'queue', isRunningQueue: false })
    }

}







function scrollToTime(amount, timePeriod, page = 0) {
    gIsStop = false

    // toggle is running
    try {

        const onToggleIsRunning = (isRunningScroll) => {
            gIsStop = isRunningScroll
            chrome.runtime.sendMessage({ isRunningScroll, type: 'scroll' })
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
            let elSpans = document.querySelectorAll("#metadata-line > span:nth-child(3)")
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
            var spans = [elSpans.at(-20), elSpans.at(-1)]
            for (const elSpan of spans) {
                if (!elSpan) continue
                let parts = elSpan?.innerText?.split(' ')
                let spanAmount = parts.at(-3)
                let spanTimePeriod = parts.at(-2)
                spanAmount = +spanAmount
                if (timesValMap[spanTimePeriod] > timesValMap[timePeriod]) return onToggleIsRunning(false)
                if (timesValMap[spanTimePeriod] === timesValMap[timePeriod] && spanAmount >= amount) return onToggleIsRunning(false)
            }


            window.scrollTo(0, page * 10000 + window.scrollY + 10000)
            setTimeout(() => {
                innerRecursive(amount, timePeriod, page + 1)
            }, 0);

        }

        window.scrollTo(0, page * 10000 + window.scrollY + 1000)
        innerRecursive(amount, timePeriod, page)
    } catch (err) {
        console.error(err)
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


