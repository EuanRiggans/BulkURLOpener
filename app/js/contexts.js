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
function contextClickHandler(info, tab) {
    if (info.menuItemId === "refresh-lists") {
        removeContextMenus();
        addContextMenus();
    }
}

/**
 * Handles clicks for the open list context sub-menu
 * @param obj
 */
function contextMenuListOpenHandler(obj) {
    backgroundOpenListByID(obj.menuItemId.substring(0, obj.menuItemId.indexOf(":")))
}

/**
 * Adds context menus to the browser using either the chrome or browser APIs depending on the host type.
 */
function addContextMenus() {
    if (checkHostType() === "chrome") {
        chrome.permissions.contains({
            permissions: ['contextMenus']
        }, function (result) {
            if (result) {
                chrome.contextMenus.removeAll();
                chrome.contextMenus.create({
                    title: "Open List",
                    id: "open-list",
                    contexts: ["all"]
                });
                let listFound = false;
                for (let i = 0; i < localStorage.length; i++) {
                    const tempStorageArray = loadList(localStorage.key(i));
                    try {
                        const parsedList = JSON.parse(tempStorageArray);
                        if (parsedList.object_description === "list_storage") {
                            listFound = true;
                            chrome.contextMenus.create({
                                id: parsedList.list_id + ":" + parsedList.list_name,
                                title: parsedList.list_name,
                                parentId: "open-list",
                                onclick: contextMenuListOpenHandler.bind(),
                                contexts: ["all"]
                            });
                        }
                    } catch (e) {

                    }
                }
                if (!listFound) {
                    chrome.contextMenus.create({
                        id: "placeholder-no-lists",
                        title: "No lists found",
                        parentId: "open-list",
                        contexts: ["all"]
                    });
                }
                chrome.contextMenus.create({
                    id: "refresh-lists",
                    title: "Refresh Lists",
                    contexts: ["all"]
                });
                chrome.contextMenus.onClicked.addListener(function (info, tab) {
                    contextClickHandler(info, tab);
                });
            }
        });
    } else if (checkHostType() === "firefox") {
        browser.permissions.contains({
            permissions: ['contextMenus']
        }, function (result) {
            if (result) {
                browser.contextMenus.removeAll();
                browser.contextMenus.create({
                    title: "Open List",
                    id: "open-list",
                    contexts: ["all"]
                });
                let listFound = false;
                for (let i = 0; i < localStorage.length; i++) {
                    const tempStorageArray = loadList(localStorage.key(i));
                    try {
                        const parsedList = JSON.parse(tempStorageArray);
                        if (parsedList.object_description === "list_storage") {
                            listFound = true;
                            browser.contextMenus.create({
                                id: parsedList.list_id + ":" + parsedList.list_name,
                                title: parsedList.list_name,
                                parentId: "open-list",
                                onclick: contextMenuListOpenHandler.bind(),
                                contexts: ["all"]
                            });
                        }
                    } catch (e) {

                    }
                }
                if (!listFound) {
                    browser.contextMenus.create({
                        id: "placeholder-no-lists",
                        title: "No lists found",
                        parentId: "open-list",
                        contexts: ["all"]
                    });
                }
                browser.contextMenus.create({
                    id: "refresh-lists",
                    title: "Refresh Lists",
                    contexts: ["all"]
                });
                browser.contextMenus.onClicked.addListener(function (info, tab) {
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
