/**
 * faq.js
 *
 * Code for the index.html page.
 */

/* Event Listeners */

document.getElementById("openGithub").addEventListener("click", () => {
    openExternalURL("https://euan.link/buo-github");
});
document.getElementById("openGithubBugs").addEventListener("click", () => {
    openExternalURL("https://euan.link/buo-issues");
});
document.getElementById("openGithubSuggestions").addEventListener("click", () => {
    openExternalURL("https://euan.link/buo-issues");
});

document.getElementById("closeModal").addEventListener("click", () => {
    if (checkHostType() === "firefox") {
        alert("Unable to close window due to Firefox security policy. Please close this window manually.");
    // window.close();
    } else if (checkHostType() === "chrome") {
        window.close();
    } else if (checkHostType() === "electron") {
        window.location.replace("../help/index.html");
    }
});

document.getElementById("openChangelog").addEventListener("click", () => {
    if (checkHostType() === "firefox") {
        browser.tabs.create({
            active: true,
            url: browser.extension.getURL("/pages/changelog/index.html"),
        });
    } else if (checkHostType() === "chrome") {
        chrome.tabs.create({
            url: chrome.extension.getURL("/pages/changelog/index.html"),
        });
    } else if (checkHostType() === "electron") {
        window.location.replace("./pages/changelog/index.html");
    }
});

/* End Of Event Listeners */

(() => {
    document.getElementById("help-footer").innerText = getFooterText();
})();
