'use strict'

var isStop = true

function stop() {
    isStop = true
}



function addToQueue(...terms) {
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

        let els = document.querySelectorAll("#items > ytd-grid-video-renderer")
        els = [...els].reverse()
        els.forEach(el => {
            const title = el.querySelector('#details #meta #video-title').innerText
            const isIncludes = terms.some(term => isSearchKeyInclude(title, term))
            if (!isIncludes) return
            const mouseenterEvent = new Event('mouseenter');
            el.dispatchEvent(mouseenterEvent);
            var elAddToQueue = el.querySelector('#hover-overlays > ytd-thumbnail-overlay-toggle-button-renderer:nth-child(2) #icon')
            elAddToQueue?.click()
            const mouseleaveEvent = new Event('mouseleave');
            el.dispatchEvent(mouseleaveEvent);
        })
        chrome.runtime.sendMessage({ type: 'queue', isRunningQueue: false })
    } catch (err) {
        console.error(err)
    }

}




function scrollToTime(amount, timePeriod, page = 0) {
    isStop = false

    // toggle is running
    try {

        const onToggleIsRunning = (isRunningScroll) => chrome.runtime.sendMessage({ isRunningScroll, type: 'scroll' })

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

            if (isStop) return
            timePeriod = timePeriod.toLocaleLowerCase()
            amount = +amount
            let elSpans = document.querySelectorAll("#metadata-line > span:nth-child(2)")
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


