/**
 * changelog.js
 *
 * Code for the index.html page.
 */

/* Event Listeners */

document.getElementById('view-source').addEventListener('click', () => {
    const sourceURL = "https://github.com/EuanRiggans/BulkURLOpener";
    if (checkHostType() === "electron") {
        const {
            shell
        } = require('electron');
        shell.openExternal(sourceURL);
    } else if (checkHostType() === "firefox") {
        browser.tabs.create({
            active: true,
            'url': sourceURL
        });
    } else if (checkHostType() === "chrome") {
        chrome.tabs.create({
            'url': sourceURL
        });
    }
});

document.getElementById('closeModal').addEventListener('click', () => {
    if (checkHostType() === "firefox") {
        alert("Unable to close window due to Firefox security policy. Please close this window manually.");
        // window.close();
    } else if (checkHostType() === "chrome") {
        window.close();
    } else if (checkHostType() === "electron") {
        goHome()
    }
});

document.getElementById("openGithubChangelog").addEventListener("click", () => {
    const githubURL = "https://euan.link/buo-github-changelog";
    if (checkHostType() === "electron") {
        const {
            shell
        } = require('electron');
        shell.openExternal(githubURL);
    } else if (checkHostType() === "firefox") {
        browser.tabs.create({
            active: true,
            'url': githubURL
        });
    } else if (checkHostType() === "chrome") {
        chrome.tabs.create({
            'url': githubURL
        });
    }
})

if (document.getElementById("goHome")) document.getElementById("goHome").addEventListener('click', goHome);

/* End Of Event Listeners */

(() => {
    document.getElementById("changelog-footer").innerText = getFooterText();
})();

function goHome() {
    window.location.replace("../../popup.html");
}
