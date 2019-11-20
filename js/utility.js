/**
 * Checks which browser is being used - as this determines which api to use (chrome or browser)
 * @returns {string}
 */
function checkHostType() {
    let hostType;
    if (typeof browser === "undefined") {
        if (typeof chrome.tabs.create === "function") {
            hostType = "chrome";
        }
    } else if (typeof browser === "object") {
        if (typeof browser.tabs.create === "function") {
            hostType = "firefox";
        } else if (typeof chrome.tabs.create === "function") {
            hostType = "chrome";
        }
    }
    return hostType;
}

/**
 * Prepends http to a string if it is not present
 */
function prependHttpIfNotExist(url) {
    if (!/^https?:\/\//i.test(url)) {
        url = 'http://' + url;
    }
    return url;
}

function linksIteratorProcessURL(url) {
    if (!isProbablyUrl(url) && getSetting('non_url_handler') === "searchForString") {
        url = encodeSearchQuery(url);
    } else if (!isProbablyUrl(url) && getSetting('non_url_handler') === "ignoreString") {
        ignoreURL = true;
    } else if (!isProbablyUrl(url) && getSetting('non_url_handler') === "attemptToExtractURL") {
        const extractedString = extractURLFromString(url);
        if (isProbablyUrl(extractedString)) {
            url = extractedString;
        } else {
            ignoreURL = true;
        }
    }
    if (!ignoreURL) {
        url = prependHttpIfNotExist(url);
        if (checkHostType() === "firefox") {
            browser.tabs.create({
                'url': url
            });
        } else if (checkHostType() === "chrome") {
            chrome.tabs.create({
                active: false,
                'url': url
            });
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
    if (substr === 'ftp:' || substr === 'www.') {
        return true;
    }

    substr = string.substring(0, 5).toLowerCase();
    if (substr === 'http:') {
        return true;
    }

    substr = string.substring(0, 6).toLowerCase();
    if (substr === 'https:') {
        return true;
    }

    substr = string.substring(0, 7).toLowerCase();
    if (substr === 'chrome:') {
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
        string = 'http://www.google.com/search?q=' + encodeURI(string);
    } else if (setting === "duckduckgoEngine") {
        string = 'https://duckduckgo.com/?q=' + encodeURI(string);
    } else if (setting === "bingEngine") {
        string = 'https://www.bing.com/search?q=' + encodeURI(string);
    }
    return string;
}

/**
 * Attempts to extract a url from a string
 * @param {*} string
 */
function extractURLFromString(string) {
    const urlRegex = /(https?:\/\/[^ ]*)/;
    let url;
    if (string.match(urlRegex)) {
        url = string.match(urlRegex)[1];
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

    } else if (checkHostType() === "chrome") {
        manifestData = chrome.runtime.getManifest();

    }
    return (manifestData.version);
}

/**
 * Saves a list to local storage
 * @param Id                The id of the list
 * @param newListObject     The object containing the data for the list
 */
function saveList(Id, newListObject) {
    localStorage.setItem(Id, JSON.stringify(newListObject));
    localStorage.setItem("maxID", Id);
    alert("List saved successfully!");
    if (checkHostType() === "firefox") {
        // alert("Unable to close window due to Firefox security policy. Please close this window manually.");
        // window.close();
    } else if (checkHostType() === "chrome") {
        window.close();
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
                $('select option[id="' + id + '"]').remove();
                if (!(noAlert)) {
                    alert("List successfully deleted");
                }
            }
        } catch (e) {

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
    let regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)", "i"),
        results = regex.exec(url);
    if (!results) {
        return null;
    }
    if (!results[2]) {
        return '';
    }
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}

/**
 * Removes the query string from the URL
 * @param URL   The URL to remove the query string from
 * @returns {string | void | *} The url with query string removed
 */
function removeQueryString(URL) {
    //Removes the query string from a URL provided Use: var URL = window.location.href; URL = removeQueryString(URL);
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