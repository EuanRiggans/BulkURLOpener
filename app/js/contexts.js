/**
 * contexts.js
 *
 * Handles the creation and deletion of context menus. As well as handling the click events for the context menus.
 */

(() => {
    let settingsObjPresent = false;
    for (let i = 0; i < localStorage.length; i++) {
        if (localStorage.key(i) === "settings") {
            settingsObjPresent = true;
        }
    }
    if (settingsObjPresent) {
        const contextMenuEnabled = getSetting("context_menu_enabled");
        if (contextMenuEnabled === 1) {
            removeContextMenus();
            addContextMenus();
        } else {
            removeContextMenus();
        }
    }
})();

/**
 * General contexts click handler
 * @param info
 * @param tab
 */
function contextClickHandler(info) {
    if (info.menuItemId === "refresh-lists") {
        removeContextMenus();
        addContextMenus();
    }
    if (info.menuItemId === "open-tools") {
        if (checkHostType() === "firefox") {
            browser.tabs.create({
                active: true,
                url: browser.extension.getURL("/pages/tools/index.html"),
            });
        } else if (checkHostType() === "chrome") {
            chrome.tabs.create({
                url: chrome.extension.getURL("/pages/tools/index.html"),
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
                url: chrome.extension.getURL("/pages/tools/extractor.html"),
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
                url: chrome.extension.getURL("/pages/tools/reverse.html"),
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
                url: chrome.extension.getURL("/pages/settings/index.html"),
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
                url: chrome.extension.getURL("/pages/help/index.html"),
            });
        }
    }
}

/**
 * Handles clicks for the open list context sub-menu
 * @param obj
 */
function contextMenuListOpenHandler(obj) {
    backgroundOpenListByID(obj.menuItemId.substring(0, obj.menuItemId.indexOf(":")));
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
                for (let i = 0; i < localStorage.length; i++) {
                    const tempStorageArray = loadList(localStorage.key(i));
                    try {
                        const parsedList = JSON.parse(tempStorageArray);
                        if (parsedList.object_description === "list_storage") {
                            listFound = true;
                            chrome.contextMenus.create({
                                id: `${parsedList.list_id}:${parsedList.list_name}`,
                                title: parsedList.list_name,
                                parentId: "open-list",
                                onclick: contextMenuListOpenHandler.bind(),
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
                chrome.contextMenus.create({
                    id: "refresh-lists",
                    title: "Refresh Lists",
                    contexts: ["all"],
                });
                chrome.contextMenus.onClicked.addListener((info, tab) => {
                    contextClickHandler(info, tab);
                });
            }
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
                for (let i = 0; i < localStorage.length; i++) {
                    const tempStorageArray = loadList(localStorage.key(i));
                    try {
                        const parsedList = JSON.parse(tempStorageArray);
                        if (parsedList.object_description === "list_storage") {
                            listFound = true;
                            browser.contextMenus.create({
                                id: `${parsedList.list_id}:${parsedList.list_name}`,
                                title: parsedList.list_name,
                                parentId: "open-list",
                                onclick: contextMenuListOpenHandler.bind(),
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
                browser.contextMenus.create({
                    id: "refresh-lists",
                    title: "Refresh Lists",
                    contexts: ["all"],
                });
                browser.contextMenus.onClicked.addListener((info, tab) => {
                    contextClickHandler(info, tab);
                });
            }
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
