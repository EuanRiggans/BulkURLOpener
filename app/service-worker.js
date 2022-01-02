/**
 * service-worker.js
 *
 * Handles general actions that take place in the background of the addon. Only current use is to check if there is a
 * list to open on the browser launching. If there is it will call the function to open that list.
 */

let settingsObj;
let listsObj;

if(checkHostType() === "chrome") {
    chrome.runtime.onStartup.addListener(() => {
        browserStartup();
    });
}

if(checkHostType() === "firefox") {
    browser.runtime.onStartup.addListener(() => {
        browserStartup();
    });
}

async function browserStartup() {
    if(checkHostType() === "chrome") {
        settingsObj = await chrome.storage.local.get(["userSettings"]);
        listsObj = await chrome.storage.local.get(["lists"]);
    } else if (checkHostType() === "firefox") {
        settingsObj = await browser.storage.local.get(["userSettings"]);
        listsObj = await browser.storage.local.get(["lists"]);
    }
    listsObj = listsObj.lists;
    settingsObj = settingsObj.userSettings;
    let settingsObjPresent = (settingsObj === undefined) ? false : true;
    if (settingsObjPresent) {
        const contextMenuEnabled = settingsObj.context_menu_enabled;
        if (contextMenuEnabled === 1) {
            addContextMenus(listsObj);
        }
        const listToOpen = settingsObj.open_on_launch;
        // If there is a list to open on startup, then open that list
        if (listToOpen !== "no_list") {
            backgroundOpenListByID(listToOpen);
        }
    }
}

/**
 * General contexts click handler
 * @param info
 */
async function contextClickHandler(info) {
    if (info.menuItemId === "open-tools") {
        if (checkHostType() === "firefox") {
            browser.tabs.create({
                active: true,
                url: browser.extension.getURL("/pages/tools/index.html"),
            });
        } else if (checkHostType() === "chrome") {
            chrome.tabs.create({
                url: chrome.runtime.getURL("/pages/tools/index.html"),
            });
        }
    }
    if (info.menuItemId === "open-url-extractor") {
        if (checkHostType() === "firefox") {
            browser.tabs.create({
                active: true,
                url: browser.extension.getURL("/pages/tools/extractor.html"),
            });
        } else if (checkHostType() === "chrome") {
            chrome.tabs.create({
                url: chrome.runtime.getURL("/pages/tools/extractor.html"),
            });
        }
    }
    if (info.menuItemId === "open-list-reverse") {
        if (checkHostType() === "firefox") {
            browser.tabs.create({
                active: true,
                url: browser.extension.getURL("/pages/tools/reverse.html"),
            });
        } else if (checkHostType() === "chrome") {
            chrome.tabs.create({
                url: chrome.runtime.getURL("/pages/tools/reverse.html"),
            });
        }
    }
    if (info.menuItemId === "open-settings") {
        if (checkHostType() === "firefox") {
            browser.tabs.create({
                active: true,
                url: browser.extension.getURL("/pages/settings/index.html"),
            });
        } else if (checkHostType() === "chrome") {
            chrome.tabs.create({
                url: chrome.runtime.getURL("/pages/settings/index.html"),
            });
        }
    }
    if (info.menuItemId === "open-help") {
        if (checkHostType() === "firefox") {
            browser.tabs.create({
                active: true,
                url: browser.extension.getURL("/pages/help/index.html"),
            });
        } else if (checkHostType() === "chrome") {
            chrome.tabs.create({
                url: chrome.runtime.getURL("/pages/help/index.html"),
            });
        }
    }
}

/**
 * Handles clicks for the open list context sub-menu
 * @param info
 * @param tab
 */
function contextMenuListOpenHandler(info, tab) {
    backgroundOpenListByID(info.menuItemId.substring(0, info.menuItemId.indexOf(":")));
}

/**
 * Adds context menus to the browser using either the chrome or browser APIs depending on the host type.
 */
function addContextMenus() {
    if (checkHostType() === "chrome") {
        chrome.permissions.contains({
            permissions: ["contextMenus"],
        }, (result) => {
            if (result) {
                chrome.contextMenus.removeAll();
                chrome.contextMenus.create({
                    title: "Open List",
                    id: "open-list",
                    contexts: ["all"],
                });
                let listFound = false;
                for (let i = 0; i < listsObj.length; i++) {
                    try {
                        if (listsObj[i].object_description === "list_storage") {
                            listFound = true;
                            chrome.contextMenus.create({
                                id: `${listsObj[i].list_id}:${listsObj[i].list_name}`,
                                title: listsObj[i].list_name,
                                parentId: "open-list",
                                contexts: ["all"],
                            });
                        }
                    } catch (e) {
                        console.log(e);
                    }
                }
                if (!listFound) {
                    chrome.contextMenus.create({
                        id: "placeholder-no-lists",
                        title: "No lists found",
                        parentId: "open-list",
                        contexts: ["all"],
                    });
                }
                chrome.contextMenus.create({
                    title: "Tools",
                    id: "open-tools",
                    contexts: ["all"],
                });
                chrome.contextMenus.create({
                    id: "open-url-extractor",
                    title: "URL Extractor",
                    parentId: "open-tools",
                    contexts: ["all"],
                });
                chrome.contextMenus.create({
                    id: "open-list-reverse",
                    title: "List Reverse",
                    parentId: "open-tools",
                    contexts: ["all"],
                });
                chrome.contextMenus.create({
                    id: "open-settings",
                    title: "Settings",
                    contexts: ["all"],
                });
                chrome.contextMenus.create({
                    id: "open-help",
                    title: "Help",
                    contexts: ["all"],
                });
            }
            chrome.contextMenus.onClicked.addListener((info, tab) => {
                if(info.parentMenuItemId) {
                    if(info.parentMenuItemId === "open-list") {
                        contextMenuListOpenHandler(info, tab);
                    } else {
                        contextClickHandler(info, tab);
                    }
                } else {
                    contextClickHandler(info, tab);
                }
            });
        });
    } else if (checkHostType() === "firefox") {
        browser.permissions.contains({
            permissions: ["contextMenus"],
        }, (result) => {
            if (result) {
                browser.contextMenus.removeAll();
                browser.contextMenus.create({
                    title: "Open List",
                    id: "open-list",
                    contexts: ["all"],
                });
                let listFound = false;
                for (let i = 0; i < listsObj[i]; i++) {
                    try {
                        if (listsObj[i].object_description === "list_storage") {
                            listFound = true;
                            browser.contextMenus.create({
                                id: `${listsObj[i].list_id}:${listsObj[i].list_name}`,
                                title: listsObj[i].list_name,
                                parentId: "open-list",
                                contexts: ["all"],
                            });
                        }
                    } catch (e) {
                        console.log(e);
                    }
                }
                if (!listFound) {
                    browser.contextMenus.create({
                        id: "placeholder-no-lists",
                        title: "No lists found",
                        parentId: "open-list",
                        contexts: ["all"],
                    });
                }
                browser.contextMenus.create({
                    title: "Tools",
                    id: "open-tools",
                    contexts: ["all"],
                });
                browser.contextMenus.create({
                    id: "open-url-extractor",
                    title: "URL Extractor",
                    parentId: "open-tools",
                    contexts: ["all"],
                });
                browser.contextMenus.create({
                    id: "open-list-reverse",
                    title: "List Reverse",
                    parentId: "open-tools",
                    contexts: ["all"],
                });
                browser.contextMenus.create({
                    id: "open-settings",
                    title: "Settings",
                    contexts: ["all"],
                });
                browser.contextMenus.create({
                    id: "open-help",
                    title: "Help",
                    contexts: ["all"],
                });
            }
            browser.contextMenus.onClicked.addListener((info, tab) => {
                if(info.parentMenuItemId) {
                    if(info.parentMenuItemId === "open-list") {
                        contextMenuListOpenHandler(info, tab);
                    }
                } else {
                    contextClickHandler(info, tab);
                }
            });
        });
    }
}

/**
 * Removes the context menus from the browser
 */
function removeContextMenus() {
    if (checkHostType() === "chrome") {
        chrome.contextMenus.removeAll();
    } else if (checkHostType() === "firefox") {
        browser.contextMenus.removeAll();
    }
}

/*
    Background List Opening Scripts
 */

/**
 * Will load a given lists urls into the text area in the popup
 * @param listID
 * @param lists
 * @param settingsObj
 */
function backgroundOpenListByID(listID) {
    let linksToOpen = [];
    for(let i = 0; i < listsObj.length; i++) {
        if(listsObj[i].list_id === parseInt(listID)) {
            for (const link of listsObj[i].list_links) {
                linksToOpen.push(link);
            }
        }
    }
    if (settingsObj.open_urls_in_reverse_order === 1) {
        linksToOpen = linksToOpen.reverse();
    }
    backgroundOpenList(linksToOpen, settingsObj.tab_creation_delay, settingsObj);
}

/**
 * Handles the opening of lists
 * @param list  The list of urls to open
 * @param tabCreationDelay
 */
function backgroundOpenList(list, tabCreationDelay) {
    const strings = list;
    for (let i = 0; i < strings.length; i++) {
        if (strings[i].trim() === "") {
            strings.splice(i, 1);
            i--;
        }
    }
    tabCreationDelay *= 1000;
    backgroundLinksIterator(0, strings, tabCreationDelay);
}

/**
 * Recursive function to iterate through a list of urls to open
 * @param i                 Counter
 * @param strings           The urls to open
 * @param tabCreationDelay  The delay between opening a new url
 * @param settingsObj
 */
function backgroundLinksIterator(i, strings, tabCreationDelay) {
    strings[i] = strings[i].trim();
    if (strings[i] === "") {
        return;
    }
    const last = strings[i + 1] === undefined;
    const url = strings[i];
    linksIteratorProcessURL(url, last, settingsObj);
    i++;
    if (i < strings.length) {
        setTimeout(backgroundLinksIterator, tabCreationDelay, i, strings, tabCreationDelay, settingsObj);
    }
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

function linksIteratorProcessURL(url, last = false, settingsObj) {
    let ignoreURL = false;
    if (!isProbablyUrl(url) && settingsObj.non_url_handler === "searchForString") {
        url = encodeSearchQuery(url);
    } else if (!isProbablyUrl(url) && settingsObj.non_url_handler === "ignoreString") {
        ignoreURL = true;
    } else if (!isProbablyUrl(url) && settingsObj.non_url_handler === "attemptToExtractURL") {
        const extractedString = extractURLFromString(url);
        if (isProbablyUrl(extractedString)) {
            url = extractedString;
        } else {
            ignoreURL = true;
        }
    }
    if (extractURLFromString(prependHttpIfNotExist(url)) !== "noextractionsuccess") {
        url = prependHttpIfNotExist(url);
        ignoreURL = false;
    }
    if (!ignoreURL) {
        if (settingsObj.load_on_focus === 1) {
            if (checkHostType() === "firefox") {
                browser.tabs.create({
                    active: false,
                    url: browser.extension.getURL("delayedloading.html?url=") + encodeURIComponent(url),
                });
            } else if (checkHostType() === "chrome") {
                chrome.tabs.create({
                    active: false,
                    url: chrome.runtime.getURL("delayedloading.html?url=") + encodeURIComponent(url),
                });
            }
        } else {
            url = prependHttpIfNotExist(url);
            const openAsActive = settingsObj.new_tabs_active === 1 && last;
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
 * Checks which browser is being used - as this determines which api to use (chrome or browser)
 * @returns {string}
 */
function checkHostType() {
    let hostType = null;
    if (isElectron()) {
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
 * Returns true / false depending on whether electron is being used to run app.
 * Source: https://github.com/cheton/is-electron / https://stackoverflow.com/questions/61725325/detect-an-electron-instance-via-javascript/61725416#61725416
 * @returns {boolean}
 */
function isElectron() {
    // Renderer process
    if (typeof window !== "undefined" && typeof window.process === "object" && window.process.type === "renderer") {
        return true;
    }

    // Main process
    if (typeof process !== "undefined" && typeof process.versions === "object" && !!process.versions.electron) {
        return true;
    }

    // Detect the user agent when the `nodeIntegration` option is set to true
    if (typeof navigator === "object" && typeof navigator.userAgent === "string" && navigator.userAgent.indexOf("Electron") >= 0) {
        return true;
    }

    return false;
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