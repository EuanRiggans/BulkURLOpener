/**
 * utility.js
 *
 * All of the utility functions that are used throughout the app. And any functions that are reused across multiple
 * javascript files.
 */

(() => {
    if (document.getElementById("goHome")) {
        if (checkHostType() !== "electron") {
            document.getElementById("goHome").remove();
        }
    }
    if (document.getElementById("electron-nav-breadcrumb")) {
        if (checkHostType() !== "electron") {
            document.getElementById("electron-nav-breadcrumb").remove();
        }
    }
    if (getSetting("button_look") === "alwaysFilled") {
        switchOutlineButtons();
    } else if (getSetting("button_look") === "filledNight") {
        if (isNightModeEnabled()) {
            switchOutlineButtons();
        }
    } else if (getSetting("button_look") === "filledLight") {
        if (!isNightModeEnabled()) {
            switchOutlineButtons();
        }
    }
}
)();

/**
 * Checks which browser is being used - as this determines which api to use (chrome or browser)
 * @returns {string}
 */
function checkHostType() {
    let hostType = null;
    if (typeof require === "function") {
        hostType = "electron";
        return hostType;
    }
    if (typeof browser === "undefined") {
        if (typeof chrome === "object") {
            if (typeof chrome.tabs === "object") {
                if (typeof chrome.tabs.create === "function") {
                    hostType = "chrome";
                }
            }
        }
    } else if (typeof browser === "object") {
        if (typeof browser.tabs === "object") {
            if (typeof browser.tabs.create === "function") {
                hostType = "firefox";
            } else if (typeof chrome.tabs.create === "function") {
                hostType = "chrome";
            }
        }
    } else {
    // Fallback if all checks fail, then the app is most likely the web app version.
        hostType = "webapp";
    }
    return hostType;
}

/**
 * Prepends http to a string if it is not present
 */
function prependHttpIfNotExist(url) {
    if (!/^https?:\/\//i.test(url)) {
        url = `http://${url}`;
    }
    return url;
}

function linksIteratorProcessURL(url, last = false) {
    let ignoreURL = false;

    if (extractURLFromString(prependHttpIfNotExist(url)) !== "noextractionsuccess") {
        url = prependHttpIfNotExist(url);
    }

    if (!isProbablyUrl(url) && getSetting("non_url_handler") === "searchForString") {
        url = encodeSearchQuery(url);
    } else if (!isProbablyUrl(url) && getSetting("non_url_handler") === "ignoreString") {
        ignoreURL = true;
    } else if (!isProbablyUrl(url) && getSetting("non_url_handler") === "attemptToExtractURL") {
        const extractedString = extractURLFromString(url);
        if (isProbablyUrl(extractedString)) {
            url = extractedString;
        } else {
            ignoreURL = true;
        }
    }
    if (!ignoreURL) {
        if (getSetting("load_on_focus") === 1) {
            if (checkHostType() === "firefox") {
                browser.tabs.create({
                    active: false,
                    url: browser.extension.getURL("delayedloading.html?url=") + encodeURIComponent(url),
                });
            } else if (checkHostType() === "chrome") {
                chrome.tabs.create({
                    active: false,
                    url: chrome.extension.getURL("delayedloading.html?url=") + encodeURIComponent(url),
                });
            }
        } else {
            url = prependHttpIfNotExist(url);
            const openAsActive = getSetting("new_tabs_active") === 1 && last;
            if (checkHostType() === "firefox") {
                browser.tabs.create({
                    active: openAsActive,
                    url,
                });
            } else if (checkHostType() === "chrome") {
                chrome.tabs.create({
                    active: openAsActive,
                    url,
                });
            } else if (checkHostType() === "electron") {
                const {
                    shell,
                } = require("electron");
                shell.openExternal(url);
            }
        }
    }
}

/**
 * Checks if a string is likely to be a valid url
 * @param string    String to check
 * @returns {boolean}   Result
 */
function isProbablyUrl(string) {
    let substr = string.substring(0, 4).toLowerCase();
    if (substr === "ftp:" || substr === "www.") {
        return true;
    }

    substr = string.substring(0, 5).toLowerCase();
    if (substr === "http:") {
        return true;
    }

    substr = string.substring(0, 6).toLowerCase();
    if (substr === "https:") {
        return true;
    }

    substr = string.substring(0, 7).toLowerCase();
    if (substr === "chrome:") {
        return true;
    }

    return false;
}

/**
 * Gets a specified setting for the user
 * @param setting   The setting to fetch
 * @returns {*} The setting value
 */
function getSetting(setting) {
    const settingSelected = setting.toLowerCase();
    for (let i = 0; i < localStorage.length; i++) {
        const tempStorage = loadList(localStorage.key(i));
        if (localStorage.key(i) === "settings") {
            const userSettings = JSON.parse(tempStorage);
            switch (settingSelected) {
            case "tab_creation_delay":
                return userSettings.tab_creation_delay;
            case "auto_open_lists":
                return userSettings.auto_open_lists;
            case "default_list_open":
                return userSettings.default_list_open;
            case "custom_theme":
                return userSettings.custom_theme;
            case "currently_opened_tabs_display":
                return userSettings.currently_opened_tabs_display;
            case "non_url_handler":
                return userSettings.non_url_handler;
            case "search_engine":
                return userSettings.search_engine;
            case "new_tabs_active":
                return userSettings.new_tabs_active;
            case "auto_load_into_textarea":
                return userSettings.auto_load_into_textarea;
            case "button_look":
                return userSettings.button_look;
            case "open_on_launch":
                return userSettings.open_on_launch;
            case "load_on_focus":
                return userSettings.load_on_focus;
            case "context_menu_enabled":
                return userSettings.context_menu_enabled;
            case "open_urls_in_reverse_order":
                return userSettings.open_urls_in_reverse_order;
            default:
                break;
            }
        }
    }
}

/**
 * Builds search engine query url from a string
 * @param {*} string
 */
function encodeSearchQuery(string) {
    const setting = getSetting("search_engine");
    if (setting === "googleEngine") {
        string = `http://www.google.com/search?q=${encodeURI(string)}`;
    } else if (setting === "duckduckgoEngine") {
        string = `https://duckduckgo.com/?q=${encodeURI(string)}`;
    } else if (setting === "bingEngine") {
        string = `https://www.bing.com/search?q=${encodeURI(string)}`;
    }
    return string;
}

/**
 * Attempts to extract a url from a string
 * @param {*} string
 */
function extractURLFromString(string) {
    const primaryURLRegex = /(https?:\/\/[\w-]+\.[a-z0-9\/:%_+.,#?!@&=-~]+)/;
    const secondaryURLRegex = /(https?:\/\/[^ ]*)/;
    let url;
    if (string.match(primaryURLRegex)) {
        url = string.match(primaryURLRegex)[1];
    } else if (string.match(secondaryURLRegex) && url === "noextractionsuccess") {
        url = string.match(secondaryURLRegex)[1];
    } else {
        url = "noextractionsuccess";
    }
    return url;
}

/**
 * Gets the current version of the extension from the manifest
 * @returns {string}    The current version
 */
function getCurrentVersion() {
    let manifestData;
    if (checkHostType() === "firefox") {
        manifestData = browser.runtime.getManifest();
        return (manifestData.version);
    }
    if (checkHostType() === "chrome") {
        manifestData = chrome.runtime.getManifest();
        return (manifestData.version);
    }
    return "1.9.0";
}

/**
 * Saves a list to local storage
 * @param Id                The id of the list
 * @param newListObject     The object containing the data for the list
 */
function saveList(Id, newListObject, close = true) {
    localStorage.setItem(Id, JSON.stringify(newListObject));
    localStorage.setItem("maxID", Id);
    alert("List saved successfully!");
    if (close) {
        if (checkHostType() === "firefox") {
            // alert("Unable to close window due to Firefox security policy. Please close this window manually.");
            // window.close();
        } else if (checkHostType() === "chrome") {
            window.close();
        } else if (checkHostType() === "electron") {
            window.location.replace("popup.html");
        }
    }
}

/**
 * Saves users settings to local storage
 * @param userSettings  The users settings object
 */
function saveSettings(userSettings) {
    removeList("settings", false);
    localStorage.setItem("settings", JSON.stringify(userSettings));
    alert("Settings successfully saved!");
    if (checkHostType() === "firefox") {
    // alert("Unable to close window due to Firefox security policy. Please close this window manually.");
    // window.close();
    } else if (checkHostType() === "chrome") {
        window.close();
    } else if (checkHostType() === "electron") {
        window.location.replace("../../popup.html");
    }
}

/**
 * Gets a list from local storage
 * @param Id    The list ID
 * @returns {*} The list object
 */
function loadList(Id) {
    const results = localStorage.getItem(Id);
    try {
        return results;
    } catch (e) {
        return e;
    }
}

/**
 * Returns the current max id
 * @returns {*} The current max id
 */
function getCurrentMaxID() {
    if (localStorage.getItem("maxID") == "NaN") {
        return 0;
    }
    return localStorage.getItem("maxID");
}

/**
 * Removes a list from local storage
 * @param id        The ID of the list to remove
 * @param noAlert   Whether a alert should be shown when list is deleted
 */
function removeList(id, noAlert) {
    for (let i = 0; i < localStorage.length; i++) {
        const tempArray = loadList(localStorage.key(i));
        try {
            const parsedList = JSON.parse(tempArray);
            if (parsedList.list_id === parseInt(id)) {
                localStorage.removeItem(localStorage.key(i));
                document.getElementById(id).remove();
                const listSelect = document.getElementById("savedLists");
                for (let i = 0; i < listSelect.length; i++) {
                    if (listSelect.options[i].id === id) {
                        listSelect.remove(i);
                    }
                }
                if (!(noAlert)) {
                    alert("List successfully deleted");
                }
            }
        } catch (e) {
            console.log(e);
        }
    }
}

/**
 * Removes the temporary list that is created when creating a new list
 */
function removeTempList() {
    for (let i = 0; i < localStorage.length; i++) {
        if (localStorage.key(i) === "temp") {
            localStorage.removeItem(localStorage.key(i));
        }
    }
}

/**
 * Removes the temporary list created when using tab creation delay
 */
function removeLinksToOpenList() {
    for (let i = 0; i < localStorage.length; i++) {
        if (localStorage.key(i) === "linksToOpen") {
            localStorage.removeItem(localStorage.key(i));
        }
    }
}

/**
 * Gets the next available ID for a list
 * @returns {number}    The next available id
 */
function getNextAvailableID() {
    let availableID;
    availableID = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const results = localStorage.getItem(localStorage.key(i));
        try {
            if (localStorage.key(i) === "maxID") {
                availableID = parseInt(results) + 1;
            }
        } catch (e) {
            alert("Unexpected error occurred");
        }
    }
    return availableID;
}

/**
 * Gets the value of a parameter in the query string
 * @param name  The name of the parameter
 * @param url   The URL that contains the query string
 * @returns {string | null} The value of the parameter
 */
function getParameterByName(name, url) {
    if (!url) {
        url = window.location.href;
    }
    name = name.replace(/[\[\]]/g, "\\$&");
    const regex = new RegExp(`[?&]${name}(=([^&#]*)|&|#|$)`, "i");
    const results = regex.exec(url);
    if (!results) {
        return null;
    }
    if (!results[2]) {
        return "";
    }
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}

/**
 * Gets the string to display in the footer
 * @returns {string}
 */
function getFooterText() {
    let footerString = "Bulk URL Opener";
    if (checkHostType() === "firefox") {
        footerString = "Bulk URL Opener - Firefox";
    } else if (checkHostType() === "chrome") {
        footerString = "Bulk URL Opener - Chromium";
    } else if (checkHostType() === "electron") {
        footerString = "Bulk URL Opener - Electron";
    } else if (checkHostType() === "webapp") {
        footerString = "Bulk URL Opener - Web App";
    }
    return footerString;
}

/**
 * Removes the query string from the URL
 * @param URL   The URL to remove the query string from
 * @returns {string | void | *} The url with query string removed
 */
function removeQueryString(URL) {
    // Removes the query string from a URL provided Use: var URL = window.location.href; URL = removeQueryString(URL);
    URL = URL.replace(/(\?.*)|(#.*)/g, "");
    return URL;
}

/**
 * Outputs all data currently in the extensions local storage
 */
function outputAllLists() {
    let counter = 0;
    for (let i = 0; i < localStorage.length; i++) {
        console.dir(loadList(localStorage.key(i)));
        counter = i;
    }
    if (counter === 0) {
        console.log("No lists found");
    }
}

/**
 * Checks if the user has enabled night mode
 * @returns {boolean}   Whether night mode in enabled
 */
function isNightModeEnabled() {
    for (let i = 0; i < localStorage.length; i++) {
        const tempStorage = loadList(localStorage.key(i));
        if (localStorage.key(i) === "settings") {
            const userSettings = JSON.parse(tempStorage);
            return parseInt(userSettings.night_mode) === 1;
        }
    }
}

function switchOutlineButtons() {
    let buttonsToSwitch = [];
    let temp;
    temp = document.getElementsByClassName("btn-outline-primary");
    for (let i = 0; i < temp.length; i++) {
        buttonsToSwitch.push(temp[i]);
    }
    for (const element of buttonsToSwitch) {
        element.classList.add("btn-primary");
        element.classList.remove("btn-outline-primary");
    }
    buttonsToSwitch = [];
    temp = document.getElementsByClassName("btn-outline-secondary");
    for (let i = 0; i < temp.length; i++) {
        buttonsToSwitch.push(temp[i]);
    }
    for (const element of buttonsToSwitch) {
        element.classList.add("btn-secondary");
        element.classList.remove("btn-outline-secondary");
    }
    buttonsToSwitch = [];
    temp = document.getElementsByClassName("btn-outline-success");
    for (let i = 0; i < temp.length; i++) {
        buttonsToSwitch.push(temp[i]);
    }
    for (const element of buttonsToSwitch) {
        element.classList.add("btn-success");
        element.classList.remove("btn-outline-success");
    }
    buttonsToSwitch = [];
    temp = document.getElementsByClassName("btn-outline-danger");
    for (let i = 0; i < temp.length; i++) {
        buttonsToSwitch.push(temp[i]);
    }
    for (const element of buttonsToSwitch) {
        element.classList.add("btn-danger");
        element.classList.remove("btn-outline-danger");
    }
    buttonsToSwitch = [];
    temp = document.getElementsByClassName("btn-outline-warning");
    for (let i = 0; i < temp.length; i++) {
        buttonsToSwitch.push(temp[i]);
    }
    for (const element of buttonsToSwitch) {
        element.classList.add("btn-warning");
        element.classList.remove("btn-outline-warning");
    }
    buttonsToSwitch = [];
    temp = document.getElementsByClassName("btn-outline-info");
    for (let i = 0; i < temp.length; i++) {
        buttonsToSwitch.push(temp[i]);
    }
    for (const element of buttonsToSwitch) {
        element.classList.add("btn-info");
        element.classList.remove("btn-outline-info");
    }
    buttonsToSwitch = [];
    temp = document.getElementsByClassName("btn-outline-light");
    for (let i = 0; i < temp.length; i++) {
        buttonsToSwitch.push(temp[i]);
    }
    for (const element of buttonsToSwitch) {
        element.classList.add("btn-light");
        element.classList.remove("btn-outline-light");
    }
    buttonsToSwitch = [];
    temp = document.getElementsByClassName("btn-outline-dark");
    for (let i = 0; i < temp.length; i++) {
        buttonsToSwitch.push(temp[i]);
    }
    for (const element of buttonsToSwitch) {
        element.classList.add("btn-dark");
        element.classList.remove("btn-outline-dark");
    }
}

function appendHtml(el, str) {
    const div = document.createElement("div");
    div.innerHTML = str;
    while (div.children.length > 0) {
        el.appendChild(div.children[0]);
    }
}

function openExternalURL(URLToOpen) {
    if (checkHostType() === "electron") {
        const {
            shell,
        } = require("electron");
        shell.openExternal(URLToOpen);
    } else if (checkHostType() === "firefox") {
        browser.tabs.create({
            active: true,
            url: URLToOpen,
        });
    } else if (checkHostType() === "chrome") {
        chrome.tabs.create({
            url: URLToOpen,
        });
    }
}

/**
 *  Creates the settings json for the user if the do not have settings
 */
function createSettings() {
    const settingsFound = false;
    const settingsList = loadList("settings");
    if (!settingsList) {
        if (checkHostType() === "electron") {
            const newSettings = {
                object_description: "user_settings",
                tab_creation_delay: 1,
                night_mode: 0,
                auto_open_lists: 0,
                default_list_open: -1,
                custom_theme: "defaultBoostrap",
                currently_opened_tabs_display: "currentWindow",
                non_url_handler: "searchForString",
                search_engine: "googleEngine",
                new_tabs_active: 0,
                auto_load_into_textarea: 0,
                button_look: "alwaysOutline",
                open_on_launch: "no_list",
                load_on_focus: 0,
                context_menu_enabled: 0,
                open_urls_in_reverse_order: 0,
            };
            localStorage.setItem("settings", JSON.stringify(newSettings));
            return;
        }
        const newSettings = {
            object_description: "user_settings",
            tab_creation_delay: 0,
            night_mode: 0,
            auto_open_lists: 0,
            default_list_open: -1,
            custom_theme: "defaultBoostrap",
            currently_opened_tabs_display: "currentWindow",
            non_url_handler: "searchForString",
            search_engine: "googleEngine",
            new_tabs_active: 0,
            auto_load_into_textarea: 0,
            button_look: "alwaysOutline",
            open_on_launch: "no_list",
            load_on_focus: 0,
            context_menu_enabled: 0,
            open_urls_in_reverse_order: 0,
        };
        localStorage.setItem("settings", JSON.stringify(newSettings));
    }
}

/*
    Background List Opening Scripts
 */

/**
 * Will load a given lists urls into the text area in the popup
 * @param id    The id of the list to get urls from
 */
function backgroundOpenListByID(id) {
    let linksToOpen = [];
    for (let i = 0; i < localStorage.length; i++) {
        const tempArray = loadList(localStorage.key(i));
        try {
            const parsedList = JSON.parse(tempArray);
            if (parsedList.list_id === parseInt(id)) {
                for (const link of parsedList.list_links) {
                    linksToOpen.push(link);
                }
            }
        } catch (e) {
            console.log(e);
        }
    }
    if (getSetting("open_urls_in_reverse_order") === 1) {
        linksToOpen = linksToOpen.reverse();
    }
    backgroundOpenList(linksToOpen);
}

/**
 * Handles the opening of lists
 * @param list  The list of urls to open
 */
function backgroundOpenList(list) {
    const strings = list;
    let tabCreationDelay = getSetting("tab_creation_delay");
    if (!(tabCreationDelay > 0) || !(strings.length > 1)) {
        for (let i = 0; i < strings.length; i++) {
            if (strings[i].trim() === "") {
                strings.splice(i, 1);
                i--;
            }
        }
        tabCreationDelay *= 1000;
        backgroundLinksIterator(0, strings, tabCreationDelay);
    } else {
        const linksToOpen = {
            object_description: "link_to_open",
            list_links: [],
        };
        for (const link of strings) {
            linksToOpen.list_links.push(link);
        }
        localStorage.setItem("linksToOpen", JSON.stringify(linksToOpen));
        if (checkHostType() === "firefox") {
            browser.tabs.create({
                active: true,
                url: browser.extension.getURL("openingtabs.html"),
            });
        } else if (checkHostType() === "chrome") {
            chrome.tabs.create({
                url: chrome.extension.getURL("openingtabs.html"),
            });
        } else if (checkHostType() === "electron") {
            window.location.replace("openingtabs.html");
        }
    }
}

/**
 * Recursive function to iterate through a list of urls to open
 * @param i                 Counter
 * @param strings           The urls to open
 * @param tabCreationDelay  The delay between opening a new url
 */
function backgroundLinksIterator(i, strings, tabCreationDelay) {
    strings[i] = strings[i].trim();
    if (strings[i] === "") {
        return;
    }
    const last = strings[i + 1] === undefined;
    const url = strings[i];
    linksIteratorProcessURL(url, last);
    i++;
    if (i < strings.length) {
        setTimeout(backgroundLinksIterator, tabCreationDelay, i, strings, tabCreationDelay);
    }
}

function buildFluentBootstrapCheckbox(checkboxID, labelText, checkedStatus, appendTo) {
    let checkboxHTML;
    if (checkedStatus) {
        checkboxHTML = `<div class="form-check pl-0 checkbox"><input class="form-check-input" type="checkbox" value="" id="${checkboxID}" checked><label class="form-check-label" for="${checkboxID}">&nbsp; ${labelText}</label></div>`;
    } else {
        checkboxHTML = `<div class="form-check pl-0 checkbox"><input class="form-check-input" type="checkbox" value="" id="${checkboxID}"><label class="form-check-label" for="${checkboxID}">&nbsp; ${labelText}</label></div>`;
    }
    appendHtml(appendTo, checkboxHTML);
}

function buildBootstrapCheckbox(checkboxID, labelText, checkedStatus, appendTo) {
    let checkboxHTML;
    if (checkedStatus) {
        checkboxHTML = `<div class="checkbox"><label><input type="checkbox" id="${checkboxID}" checked>&nbsp; ${labelText}</label></div>`;
    } else {
        checkboxHTML = `<div class="checkbox"><label><input type="checkbox" id="${checkboxID}">&nbsp; ${labelText}</label></div>`;
    }
    appendHtml(appendTo, checkboxHTML);
}

function getCurrentFileName() {
    const path = window.location.pathname;
    return path.split("/").pop();
}
