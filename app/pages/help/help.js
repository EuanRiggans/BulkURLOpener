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

document.getElementById("syncToBrowser").addEventListener("click", () => {
    syncToBrowser();
});

document.getElementById("syncFromBrowser").addEventListener("click", () => {
    syncFromBrowser();
});

document.getElementById("acceptSyncedChanges").addEventListener("click", () => {
    // @todo Switch for pure js rather than jquery
    $("#syncFromModal").modal("hide");
    overwriteCurrentWithBrowserStorage();
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

function syncToBrowser() {
    let exportData = {
        maxID: 0,
        lists: [],
        settings: {},
    };
    for (let i = 0; i < localStorage.length; i++) {
        const tempStorage = loadList(localStorage.key(i));
        const parsedJSON = JSON.parse(tempStorage);
        if (localStorage.key(i) === "settings") {
            exportData.settings = parsedJSON;
        } else if (parsedJSON.object_description === "list_storage") {
            exportData.lists.push(parsedJSON);
        } else if (localStorage.getItem("maxID") !== "NaN") {
            exportData.maxID = localStorage.getItem("maxID");
        }
    }
    exportData = JSON.stringify(exportData);
    chrome.storage.sync.set({"user_settings": exportData}, () => {
        alert("Successfully saved data to browser storage.");
    });
}

function syncFromBrowser() {
    chrome.storage.sync.get(function (result) {
        let syncedData;
        try {
            syncedData = JSON.parse(result.user_settings);
        } catch (e) {
            console.log(e);
            alert("Failed to get data from browser storage. You may not have anything data stored.");
            return;
        }
        let userSetting = syncedData.settings;
        let userLists = syncedData.lists;
        let modalBody = document.getElementById("syncFromModalBody");
        appendHtml(modalBody, "<h4>Lists:</h4>");
        for (let list in userLists) {
            if (list !== "object_description") {
                appendHtml(modalBody, buildListSyncDisplay(userLists[list].list_name));
                for (let listURL of userLists[list].list_links) {
                    document.getElementById(userLists[list].list_name).value += `${listURL}\n`;
                }
            }
        }
        // @todo Switch for pure js rather than jquery
        $("#syncFromModal").modal("show");
    });
}

function overwriteCurrentWithBrowserStorage() {
    chrome.storage.sync.get(function (result) {
        let syncedData;
        try {
            syncedData = JSON.parse(result.user_settings);
        } catch (e) {
            console.log(e);
            alert("Failed to get data from browser storage. You may not have anything data stored.");
            return;
        }
        if (confirm(
            "This will overwrite all of your current settings (Lists, settings etc) with the data synced to " +
            "our browsers storage. Are you sure you wish to continue?"
        )) {
            let skipLists = false;
            let skipSettings = false;
            if (syncedData.maxID === undefined || syncedData.lists === undefined) {
                skipLists = true;
                if (!confirm("Your imported data is missing lists or lists max ID. Do you wish to continue with importing this data?")) {
                    return;
                }
            }
            if (syncedData.settings === undefined) {
                skipSettings = true;
                if (!confirm("Your imported data is missing settings. Do you wish to continue with importing this data?")) {
                    return;
                }
            }
            localStorage.clear();
            let maxID = 0;
            let userLists = [];
            let userSettings;
            if (!skipLists) {
                maxID = syncedData.maxID;
                userLists = syncedData.lists;
            }
            if (!skipSettings) {
                userSettings = syncedData.settings;
            }
            localStorage.setItem("maxID", maxID);
            for (const list of userLists) {
                localStorage.setItem(list.list_id, JSON.stringify(list));
            }
            localStorage.setItem("settings", JSON.stringify(userSettings));
            alert("Successfully imported settings.");
        }
    });
}

function buildListSyncDisplay(listName) {
    return `<div class="form-group" id="urlsForm"><label for="${listName}">${listName}:</label><textarea class="form-control text-area-import" id="${listName}" rows="4"></textarea></div>`;
}

function buildSyncSettingDisplay(settingName, settingValue, settingId) {
    return `<div class="input-group"><div class="input-group-prepend"><span class="input-group-text" id="${settingId}">${settingName}:</span></div><input aria-describedby="${settingId}" class="form-control" value="${settingValue}" disabled></div>`;
}

function goHome() {
    window.location.replace("../../popup.html");
}
