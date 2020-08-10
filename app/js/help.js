/**
 * help.js
 *
 * Code for the help.html page.
 */

/* Event Listeners */

document.getElementById('openFAQ').addEventListener('click', () => {
    openFAQ();
});
document.getElementById('openGithubBug').addEventListener('click', () => {
    openGithub();
});
document.getElementById('openGithubFeature').addEventListener('click', () => {
    openGithub();
});

function openFAQ() {
    if (checkHostType() === "firefox") {
        browser.tabs.create({
            active: true,
            'url': browser.extension.getURL('faq.html')
        });
    } else if (checkHostType() === "chrome") {
        chrome.tabs.create({
            'url': chrome.extension.getURL('faq.html')
        });
    } else if (checkHostType() === "electron") {
        window.location.replace('faq.html');
    }
}

function openGithub() {
    const githubURL = "https://euan.link/buo-github";
    if (checkHostType() === "electron") {
        const {
            shell
        } = require('electron');
        shell.openExternal("https://euan.link/buo-github");
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
}
