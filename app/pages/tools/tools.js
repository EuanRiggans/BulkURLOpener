/**
 * tools.js
 *
 * Code for the tools index.html page.
 */

/* Event Listeners */

document.getElementById("openExtractor").addEventListener("click", openExtractor);

document.getElementById("openReverse").addEventListener("click", openReverse);

/* End Of Event Listeners */

(() => {
    if (checkHostType() !== "electron") {
        document.getElementById("tools-container").classList.remove("fluid-container");
        document.getElementById("tools-container").classList.add("container");
    }
})();

function openExtractor() {
    if (checkHostType() === "firefox") {
        browser.tabs.create({
            active: true,
            url: browser.runtime.getURL("/pages/tools/extractor.html"),
        });
    } else if (checkHostType() === "chrome") {
        chrome.tabs.create({
            url: chrome.runtime.getURL("/pages/tools/extractor.html"),
        });
    } else if (checkHostType() === "electron") {
        window.location.replace("./extractor.html");
    }
}

function openReverse() {
    if (checkHostType() === "firefox") {
        browser.tabs.create({
            active: true,
            url: browser.runtime.getURL("/pages/tools/reverse.html"),
        });
    } else if (checkHostType() === "chrome") {
        chrome.tabs.create({
            url: chrome.runtime.getURL("/pages/tools/reverse.html"),
        });
    } else if (checkHostType() === "electron") {
        window.location.replace("./reverse.html");
    }
}
