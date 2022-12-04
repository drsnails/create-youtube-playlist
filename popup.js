'use strict'

window.addEventListener('DOMContentLoaded', () => {
    onInit()
})
const gTerms = ['key', 'top']
let gCurrTermIdx = 0
let gElAddToQBtn
let gElLoadVideosBtn
let gElStopBtn
let gElAscendingInput
let gTopVideosBtn
let gTopVideosContainer
let elTimeAmount
let elPeriod
// let gElToggleFilterByBtn
let gIsRunning = false
let gIsAscending = false
// let gIsAll = true
// let gFilterByTerm = 'key'

const periods = ['days', 'weeks', 'months', 'years']

const periodDaysMap = {
    days: '13',
    weeks: '4',
    months: '11',
}

function onInit() {
    gElAddToQBtn = document.querySelector('.add-to-q')
    gElLoadVideosBtn = document.querySelector('.load-videos-btn')
    gElStopBtn = document.querySelector('.stop-btn')
    gElAscendingInput = document.querySelector('.ascending-input')
    // gElToggleFilterByBtn = document.querySelector('.toggle-filterby-btn')
    gTopVideosBtn = document.querySelector('.top-videos-btn')
    gTopVideosContainer = document.querySelector('.top-videos-container')
    elTimeAmount = document.querySelector('.time-amount')
    elPeriod = document.querySelector('select[name="period"]')
    addEventListeners()
    chrome.runtime.onMessage.addListener(({ type, isRunningScroll }) => {
        if (type === 'queue') {
            onToggleImgLoader()
        } else if (type === 'scroll') {
            changeStopBtnTxt(isRunningScroll)
        }
    })

}


function shakeBtn() {
    gElAddToQBtn.classList.add('shake-animation')
    setTimeout(() => {
        gElAddToQBtn.classList.remove('shake-animation')
    }, 500)
}



async function onAddToQueue({ target }) {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const elTermInput = document.querySelector('[name="search-term"]')
    // let topVideosCount = +document.querySelector('.top-videos-container input').value
    let videosCount = +document.querySelector('select.num-of-vids').value
    let sortBy = document.querySelector('select.sort-by').value

    const term = elTermInput.value
    let terms = term.split(',').map(term => term.trim())
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: addToQueue,
        args: [sortBy, videosCount, gIsAscending, ...terms]
    })
}


function onToggleAscending() {
    gIsAscending = this.checked
}



async function onToggleLoadVideos(ev) {
    try {
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        const elTimeAmount = document.querySelector('.time-amount')
        const elPeriod = document.querySelector('select[name="period"]')
        const period = elPeriod.value
        let amount = +elTimeAmount.value
        if (!amount) amount = 1
        const func = gIsRunning ? stop : scrollToTime
        gIsRunning = !gIsRunning
        changeStopBtnTxt(gIsRunning)

        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: func,
            args: [amount, period]
        })
    } catch (err) {
        console.error(err)
    }
}

function onInput() {
    const _amount = elTimeAmount.value
    const _period = elPeriod.value
    let { amount, period } = _convertYoutubeDates(+_amount, _period)
    if (_amount < 0) {
        let prevPeriodIdx = periods.indexOf(period) - 1
        period = (prevPeriodIdx < 0) ? 'days' : periods[prevPeriodIdx]
        amount = (prevPeriodIdx < 0) ? '' : periodDaysMap[period]
    }
    elTimeAmount.value = (_amount && _amount !== '0') ? amount : ''
    elPeriod.value = period
}

async function onToggleFilterBy() {
    try {
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        // let nextTermIdx = gTerms.findIndex(term => term === gTerms[gCurrTermIdx]) + 1
        gCurrTermIdx = getNextTermIdx()
        changeToggleFilterTermTxt()
        onToggleFilterByContainer()
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: toggleFilterBy,
            args: [gTerms[gCurrTermIdx], gCurrTermIdx]
        })
    } catch (err) {
        console.log('err:', err)
    }

}


async function onStop() {
    try {

        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: stop,
            args: []
        })
    } catch (err) {
        console.error(err)
    }
}


function addEventListeners() {
    gElAddToQBtn.addEventListener('click', onAddToQueue)
    gTopVideosBtn.addEventListener('click', onAddToQueue)
    gElLoadVideosBtn.addEventListener('click', onToggleLoadVideos)
    gElAscendingInput.addEventListener('input', onToggleAscending)
    document.querySelector('.time-amount').addEventListener('input', onInput)
    document.querySelector('select[name="period"]').addEventListener('change', onInput)

}

function changeStopBtnTxt(isRunning) {
    gIsRunning = isRunning
    const txt = isRunning ? 'Stop' : 'Load More Videos'
    gElLoadVideosBtn.innerText = txt

}

function changeToggleFilterTermTxt() {
    let nextTermIdx = getNextTermIdx()
    let nextTerm = gTerms[nextTermIdx]
    let txt
    if (nextTerm === 'top') {
        txt = 'top videos'
    } else if (nextTerm === 'key') {
        txt = 'search by keyword'
    }
    gElToggleFilterByBtn.querySelector('span').innerText = txt

}

function getNextTermIdx() {
    let nextTermIdx = gCurrTermIdx + 1
    if (nextTermIdx === gTerms.length) nextTermIdx = 0
    return nextTermIdx
}

function onToggleImgLoader() {
    const elBtn = gTerms[gCurrTermIdx] === 'key' ? gElAddToQBtn : gTopVideosBtn
    elBtn.querySelector('img').classList.toggle('hide')
    elBtn.querySelector('span').classList.toggle('hide')
}

function onToggleFilterByContainer() {
    gTopVideosContainer.classList.toggle('hide')
    document.querySelector('.key-search-container').classList.toggle('hide')
}


function _convertYoutubeDates(amount, period) {

    switch (period) {
        case 'days': {
            const res = { amount, period: 'days' }
            if (amount >= 365) {
                res.period = 'years'
                res.amount = parseInt(amount / 365)
            } else if (amount >= 30) {
                res.period = 'months'
                res.amount = parseInt(amount / 30)
            } else if (amount >= 14) {
                res.period = 'weeks'
                res.amount = parseInt(amount / 7)
            }
            return res
        }
        case 'weeks': {
            const res = { amount, period: 'weeks' }
            if (amount >= 52) {
                res.period = 'years'
                res.amount = parseInt(amount / 52)
            } else if (amount >= 4.4) {
                res.period = 'months'
                res.amount = parseInt(amount / 4.4)
            }

            return res
        }
        case 'months': {
            const res = { amount, period: 'months' }
            if (amount >= 12) {
                res.period = 'years'
                res.amount = parseInt(amount / 12)
            }
            return res
        }

        default:
            return { amount, period }
    }


}