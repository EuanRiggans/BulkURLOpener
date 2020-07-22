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
            addContextMenus();
        } else {
            removeContextMenus();
        }
    }
})();

function contextClickHandler(info, tab) {
    switch (info.parentMenuItemId) {
        case "open-list":
            if (info.menuItemId !== "placeholder-no-lists") {
                console.log(getCurrentVersion())
                backgroundOpenListByID(info.menuItemId.substring(0, info.menuItemId.indexOf(":")))
            }
            break;
        default:
            if (info.menuItemId === "refresh-lists") {
                removeContextMenus();
                addContextMenus();
            } else {
                alert("There was a problem opening that list, try clicking 'Refresh Lists'")
            }
            break;
    }
}

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
                    console.log(info)
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
                                onclick: console.log("x"),
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

function removeContextMenus() {
    if (checkHostType() === "chrome") {
        chrome.contextMenus.removeAll();
    } else if (checkHostType() === "firefox") {
        browser.contextMenus.removeAll();
    }
}
