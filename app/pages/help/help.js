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
        let userSettings = syncedData.settings;
        let userLists = syncedData.lists;
        let modalBody = document.getElementById("syncFromModalBody");
        modalBody.innerHTML = "";
        appendHtml(modalBody, "<h4>Lists:</h4>");
        for (let list in userLists) {
            if (list !== "object_description") {
                appendHtml(modalBody, buildListSyncDisplay(userLists[list].list_name));
                for (let listURL of userLists[list].list_links) {
                    document.getElementById(userLists[list].list_name).value += `${listURL}\n`;
                }
            }
        }
        appendHtml(modalBody, "<h4>Settings:</h4>");
        for (let setting in userSettings) {
            if (setting !== "object_description") {
                settingsBuildSwitch(modalBody, userLists, userSettings, setting);
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

/**
 * Outputs all of the users settings when syncing from browser storage
 */
function settingsBuildSwitch(modalBody, userLists, userSettings, setting) {
    switch (setting) {
    case "tab_creation_delay":
        appendHtml(
            modalBody,
            buildSyncSettingDisplay(
                setting,
                userSettings[setting] + " seconds"
            )
        );
        break;
    case "default_list_open":
        appendHtml(
            modalBody,
            buildSyncSettingDisplay(
                setting,
                userSettings[setting] === -1
                    ? "Current Tabs"
                    : getListFromIdSync(userLists, userSettings[setting])
            )
        );
        break;
    case "custom_theme":
        appendHtml(
            modalBody,
            buildSyncSettingDisplay(
                setting,
                userSettings[setting] === "defaultBoostrap"
                    ? "Bootstrap"
                    : "Fluent Design Bootstrap"
            )
        );
        break;
    case "currently_opened_tabs_display":
        appendHtml(
            modalBody,
            buildSyncSettingDisplay(
                setting,
                userSettings[setting] === "currentWindow"
                    ? "Current Window"
                    : "All tabs"
            )
        );
        break;
    case "non_url_handler":
        output = "";
        if (userSettings[setting] === "searchForString") {
            output = "Search For String";
        } else if (userSettings[setting] === "ignoreString") {
            output = "Ignore String";
        } else if (userSettings[setting] === "attemptToExtractURL") {
            output = "Attempt To Extract URL";
        }
        appendHtml(modalBody, buildSyncSettingDisplay(setting, output));
        break;
    case "search_engine":
        output = "";
        if (userSettings[setting] === "googleEngine") {
            output = "Google";
        } else if (userSettings[setting] === "duckduckgoEngine") {
            output = "DuckDuckGo";
        } else if (userSettings[setting] === "bingEngine") {
            output = "Bing";
        }
        appendHtml(modalBody, buildSyncSettingDisplay(setting, output));
        break;
    case "new_tabs_active":
        appendHtml(
            modalBody,
            buildSyncSettingDisplay(
                setting,
                userSettings[setting] === 1
                    ? "On"
                    : "Off"
            )
        );
        break;
    case "auto_load_into_textarea":
        appendHtml(
            modalBody,
            buildSyncSettingDisplay(
                setting,
                userSettings[setting] === 1
                    ? "On"
                    : "Off"
            )
        );
        break;
    case "button_look":
        output = "";
        if (userSettings[setting] === "alwaysOutline") {
            output = "Always Outline";
        } else if (userSettings[setting] === "alwaysFilled") {
            output = "Always Filled";
        } else if (userSettings[setting] === "filledNight") {
            output = "Filled On Night Theme";
        } else if (userSettings[setting] === "filledLight") {
            output = "Filled On Light Theme";
        }
        appendHtml(modalBody, buildSyncSettingDisplay(setting, output));
        break;
    case "open_on_launch":
        try {
            appendHtml(
                modalBody,
                buildSyncSettingDisplay(
                    setting,
                    userSettings[setting] === "no_list"
                        ? "No List"
                        : getListFromIdSync(userLists, parseInt(userSettings[setting]))
                )
            );
        } catch (e) {
            console.log(e);
            alert("Error while parsing setting: open_on_launch");
        }
        break;
    default:
        genericEnabledDisabledSettingBuilder(modalBody, userSettings, setting);
        break;
    }
}

/**
 * For settings that are simply output as Enabled or Disabled, rather than having repetition in the code.
 */
function genericEnabledDisabledSettingBuilder(modalBody, userSettings, setting) {
    appendHtml(
        modalBody,
        buildSyncSettingDisplay(
            setting,
            userSettings[setting] === 1 ? "Enabled" : "Disabled"
        )
    );
}

/**
 * Gets the name of a list that is being synced from browser storage.
 * @param lists
 * @param Id
 * @returns {null}
 */
function getListFromIdSync(lists, Id) {
    for (let list of lists) {
        if (list.list_id === Id) {
            return list.list_name;
        }
    }
    return null;
}

function buildListSyncDisplay(listName) {
    return `<div class="form-group" id="urlsForm"><label for="${listName}">${listName}:</label><textarea class="form-control text-area-import" id="${listName}" rows="4"></textarea></div>`;
}

function buildSyncSettingDisplay(settingName, settingValue) {
    return `<p><b>${settingName}:</b> ${settingValue}</p>`;
}

function goHome() {
    window.location.replace("../../popup.html");
}
