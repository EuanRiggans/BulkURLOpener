/**
 * help.js
 *
 * Code for the index.html page.
 */

/* Event Listeners */

document.getElementById("openFAQ").addEventListener("click", () => {
    openFAQ();
});
document.getElementById("openGithubBug").addEventListener("click", () => {
    openExternalURL("https://euan.link/buo-issues");
});
document.getElementById("openTools").addEventListener("click", () => {
    openTools();
});
document.getElementById("openSourceCode").addEventListener("click", () => {
    openExternalURL("https://euan.link/buo-github");
});

document.getElementById("openChangelog").addEventListener("click", () => {
    openChangelog();
});
document.getElementById("checkForUpdates").addEventListener("click", () => {
    checkForUpdates();
});

if (document.getElementById("goHome")) document.getElementById("goHome").addEventListener("click", goHome);

/* End Of Event Listeners */

(() => {
    // Remove browser sync options for electron users
    if (checkHostType() === "electron") {
        document.getElementById("browserSync").remove();
    }
})();

function openFAQ() {
    if (checkHostType() === "firefox") {
        browser.tabs.create({
            active: true,
            url: browser.extension.getURL("/pages/faq/index.html"),
        });
    } else if (checkHostType() === "chrome") {
        chrome.tabs.create({
            url: chrome.extension.getURL("/pages/faq/index.html"),
        });
    } else if (checkHostType() === "electron") {
        window.location.replace("../faq/index.html");
    }
}

function openTools() {
    if (checkHostType() === "firefox") {
        browser.tabs.create({
            active: true,
            url: browser.extension.getURL("/pages/tools/index.html"),
        });
    } else if (checkHostType() === "chrome") {
        chrome.tabs.create({
            url: chrome.extension.getURL("/pages/tools/index.html"),
        });
    } else if (checkHostType() === "electron") {
        window.location.replace("../tools/index.html");
    }
}

function openChangelog() {
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
        window.location.replace("../changelog/index.html");
    }
}

function checkForUpdates() {
    // Setting the version API endpoint
    const versionURL = "https://version.bulkurlopener.com/";
    // Fetching the JSON from endpoint
    fetch(versionURL)
        .then((res) => res.json())
        .then((out) => {
            // Checking if the users version is equal to the version number from API.
            if (out.version === getCurrentVersion()) {
                // User is on latest version
                alert("You're using the newest version!");
            } else {
                // User is not on latest version
                alert(
                    `You're not on the latest version. Please update to: ${out.version}. Visit the Github `
                    + "(https://github.com/EuanRiggans/BulkURLOpener) or visit the location where you installed the app"
                    + " to find out how to update.",
                );
            }
        })
        .catch((err) => {
            throw err;
        });
}

function goHome() {
    window.location.replace("../../popup.html");
}
