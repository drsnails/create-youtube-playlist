'use strict'

window.addEventListener('DOMContentLoaded', () => {
    onInit();
})

let gElAddToQBtn
let gElLoadVideosBtn
let gElStopBtn
let gIsRunning = false

function onInit() {
    gElAddToQBtn = document.querySelector('.add-to-q')
    gElLoadVideosBtn = document.querySelector('.load-videos-btn')
    gElStopBtn = document.querySelector('.stop-btn')
    addEventListeners()
    chrome.runtime.onMessage.addListener(({ type, isRunningScroll }) => {
        if (type === 'queue') {
            onToggleImgLoader()
        } else if (type === 'scroll') {
            onChangeStopBtnTxt(isRunningScroll)
        }
    })

}


function shakeBtn() {
    gElAddToQBtn.classList.add('shake-animation')
    setTimeout(() => {
        gElAddToQBtn.classList.remove('shake-animation')
    }, 500);
}


async function onAddToQueue({ target }) {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const elTermInput = document.querySelector('[name="search-term"]')
    const term = elTermInput.value
    if (!term) return shakeBtn(target)
    let terms = term.split(',').map(term => term.trim())
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: addToQueue,
        args: [...terms]
    });
}

async function onToggleLoadVideos(ev) {
    try {
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const elTimeAmount = document.querySelector('.time-amount')
        const elPeriod = document.querySelector('select[name="period"]')
        const period = elPeriod.value
        let amount = +elTimeAmount.value
        if (!amount) amount = 1
        const func = gIsRunning ? stop : scrollToTime
        gIsRunning = !gIsRunning
        onChangeStopBtnTxt(gIsRunning)
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: func,
            args: [amount, period]
        });
    } catch (err) {
        console.error(err)
    }

}


async function onStop() {
    try {

        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: stop,
            args: []
        });
    } catch (err) {
        console.error(err)
    }
}


function addEventListeners() {
    gElAddToQBtn.addEventListener('click', onAddToQueue);
    gElLoadVideosBtn.addEventListener('click', onToggleLoadVideos);
}

function onChangeStopBtnTxt(isRunning) {
    gIsRunning = isRunning
    const txt = isRunning ? 'Stop' : 'Load Videos'
    gElLoadVideosBtn.innerText = txt

}

function onToggleImgLoader() {
    gElAddToQBtn.querySelector('img').classList.toggle('hide')
    gElAddToQBtn.querySelector('span').classList.toggle('hide')
}