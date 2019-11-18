$(document).ready(function () {
    let tabCreationDelay = getSetting("tab_creation_delay");
    tabCreationDelay = tabCreationDelay * 1000;
    const tempArray = loadList("linksToOpen");
    const parsedList = JSON.parse(tempArray);
    const linksToOpen = [];
    for (const link of parsedList.list_links) {
        linksToOpen.push(link);
    }
    linksIterator(0, linksToOpen, tabCreationDelay);
    removeLinksToOpenList();
});

function linksIterator(i, strings, tabCreationDelay) {
    strings[i] = strings[i].trim();
    if (!(strings[i] === '') && !(strings[i] === "linksToOpen")) {
        let url = strings[i];
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
            chrome.tabs.create({
                active: false,
                'url': url
            });
        }
        i++;
        if (i - 1 < strings.length) {
            if (strings[i] == null || strings[i].trim() === '') {
                document.getElementById('loading').style.display = 'none';
                document.getElementById('completed').style.display = 'block';
                window.close();
            }
            setTimeout(linksIterator, tabCreationDelay, i, strings, tabCreationDelay);
        }
    } else {
        i++;
        if (i >= strings.length) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('completed').style.display = 'block';
            window.close();
        }
        if (i < strings.length) {
            linksIterator(i, strings, tabCreationDelay);
        }
    }
}

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