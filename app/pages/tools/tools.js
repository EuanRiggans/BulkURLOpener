/**
 * tools.js
 *
 * Code for the tools index.html page.
 */

/* Event Listeners */

document.getElementById('openExtractor').addEventListener('click', () => {
    openExtractor();
});

document.getElementById('goHome').addEventListener('click', () => {
    goHome();
});

/* End Of Event Listeners */

function openExtractor() {
    if (checkHostType() === "firefox") {
        browser.tabs.create({
            active: true,
            'url': browser.extension.getURL('/pages/tools/extractor.html')
        });
    } else if (checkHostType() === "chrome") {
        chrome.tabs.create({
            'url': chrome.extension.getURL('/pages/tools/extractor.html')
        });
    } else if (checkHostType() === "electron") {
        window.location.replace('/pages/tools/extractor.html');
    }
}
