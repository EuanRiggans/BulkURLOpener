/**
 * extended.js
 *
 * Code for the extended version of popup.html
 */

/* Default event listeners */

document.getElementById("listTextArea").addEventListener("input", saveUserInput);

document.getElementById("openButton").addEventListener('click', () => {
    openTextAreaList();
});

document.getElementById("copyCurrentOpen").addEventListener('click', () => {
    getCurrentTabs();
});

document.getElementById("clearList").addEventListener('click', () => {
    clearLinksList();
});

document.getElementById("createNewList").addEventListener('click', () => {
    openSaveNewListDialog();
});

document.getElementById("openList").addEventListener('click', () => {
    openSelectedList();
    openTextAreaList();
});

document.getElementById("loadList").addEventListener('click', () => {
    openSelectedList();
});

document.getElementById("editList").addEventListener('click', () => {
    editSelectedList();
});

document.getElementById("deleteList").addEventListener('click', () => {
    deleteList();
});

document.getElementById("openSettings").addEventListener('click', () => {
    openSettingsDialog();
});

document.getElementById("openHelp").addEventListener('click', () => {
    openHelpDialog();
});

document.getElementById('savedLists').addEventListener('change', () => {
    if (getSetting('auto_load_into_textarea') === 1) {
        openSelectedList();
    }
});

/* End Of Event Listeners */

let quickSettings = {
    open_urls_in_reverse_order: 0,
};

(() => {
    createSettings();

    if (getSetting('auto_open_lists') === 1) {
        if (getSetting('custom_theme') === "fluentDesignBootstrap") {
            let html = "<div class=\"form-check pl-0 checkbox\"><input class=\"form-check-input\" type=\"checkbox\" value=\"\" id=\"overrideAutoOpen\"><label class=\"form-check-label\" for=\"overrideAutoOpen\">&nbsp;Override Auto Open</label></div>"
            appendHtml(document.getElementById('controls'), html);
        } else {
            let html = "<label for=\"overrideAutoOpen\"><input type=\"checkbox\" id=\"overrideAutoOpen\">&nbsp;Override Auto Open</label>";
            appendHtml(document.getElementById('controls'), html);
        }
        document.getElementById('savedLists').addEventListener('change', () => {
            if (document.getElementById('overrideAutoOpen')) {
                if (!(document.getElementById('overrideAutoOpen').checked)) {
                    if (getSetting('auto_open_lists') === 1) {
                        openSelectedList();
                        openTextAreaList();
                    }
                }
            }
        });
    }

    if (getSetting("default_list_open") === -1 || getSetting("default_list_open") === undefined) {
        if (!(checkHostType() === "electron")) {
            getCurrentTabs();
        }
    } else if (getSetting("default_list_open") === -2 && previousInputExists()) {
        getPreviousTabsFromLocalStorage();
    } else {
        openListByID(getSetting("default_list_open"));
    }

    for (let i = 0; i < localStorage.length; i++) {
        const tempStorageArray = loadList(localStorage.key(i));
        try {
            const parsedList = JSON.parse(tempStorageArray);
            if (parsedList.object_description === "list_storage") {
                let html = '<option id="' + parsedList.list_id + '">' + parsedList.list_name + '</option>';
                appendHtml(document.getElementById('savedLists'), html);
            }
        } catch (e) {

        }
    }

    if (checkHostType() === "electron") {
        document.getElementById("copyCurrentOpen").remove();
    }

    const loadTabOnFocusGroup = document.getElementById('loadTabOnFocusGroup');
    const openInReverseGroup = document.getElementById('openInReverseGroup');

    document.getElementById("tabCreationDelay").value = getSetting("tab_creation_delay");

    const checkboxesToBuild = {
        settings: {
            user_theme: getSetting("custom_theme"),
        },
        open_urls_in_reverse_order: {
            checkbox_id: "openInReverse",
            label_text: "Open urls in reverse order",
            check_status: getSetting("open_urls_in_reverse_order") === 1,
            append_to: openInReverseGroup
        }
    }
    quickSettings.open_urls_in_reverse_order = checkboxesToBuild.open_urls_in_reverse_order.check_status;
    for (let todoCheckbox in checkboxesToBuild) {
        if (todoCheckbox !== "settings") {
            if (checkboxesToBuild.settings.user_theme === "defaultBoostrap") {
                buildBootstrapCheckbox(
                    checkboxesToBuild[todoCheckbox].checkbox_id,
                    checkboxesToBuild[todoCheckbox].label_text,
                    checkboxesToBuild[todoCheckbox].check_status,
                    checkboxesToBuild[todoCheckbox].append_to
                );
            } else if (checkboxesToBuild.settings.user_theme === "fluentDesignBootstrap") {
                buildFluentBootstrapCheckbox(checkboxesToBuild[todoCheckbox].checkbox_id,
                    checkboxesToBuild[todoCheckbox].label_text,
                    checkboxesToBuild[todoCheckbox].check_status,
                    checkboxesToBuild[todoCheckbox].append_to
                );
            }
        }
    }

    document.getElementById("version").textContent = "- Version " + getCurrentVersion();
})();

/**
 *  Will open all of the urls in the textarea
 */
function openTextAreaList() {
    openList(document.getElementById("listTextArea").value);
}

/**
 * Gets all of the urls for the currently opened tabs
 */
function getCurrentTabs() {
    let currentWindowSetting = getSetting("currently_opened_tabs_display") !== "allOpenedTabs";
    if (currentWindowSetting === false) {
        currentWindowSetting = undefined;
    }
    if (checkHostType() === "firefox") {
        browser.tabs.query({
            currentWindow: currentWindowSetting
        }, tabs => {
            const tabsArray = [];
            for (let tab of tabs) {
                tabsArray.push(tab.url);
            }
            if (!tabsArray.length) {
                return;
            }
            const listTextArea = document.getElementById("listTextArea");
            clearLinksList();
            for (let i = 0; i < tabs.length; ++i) {
                listTextArea.value += tabsArray[i] + "\n";
            }
            listTextArea.select();
        });
    } else if (checkHostType() === "chrome") {
        chrome.tabs.query({
            currentWindow: currentWindowSetting
        }, tabs => {
            const tabsArray = [];
            for (let tab of tabs) {
                tabsArray.push(tab.url);
            }
            if (!tabsArray.length) {
                return;
            }
            const listTextArea = document.getElementById("listTextArea");
            clearLinksList();
            for (let i = 0; i < tabs.length; ++i) {
                listTextArea.value += tabsArray[i] + "\n";
            }
            listTextArea.select();
        });
    } else {
        alert("Could not detect which browser you are using.")
    }
}

/**
 * Sets the list text area to contain the urls from that were saved into local storage. Used for the 'Previous urls'
 * setting.
 */
function getPreviousTabsFromLocalStorage() {
    const listTextArea = document.getElementById("listTextArea");
    const previousURLS = JSON.parse(localStorage.getItem("previous_list_input"));
    for (let i = 0; i < previousURLS.length; ++i) {
        listTextArea.value += previousURLS[i] + "\n";
    }
    listTextArea.select();
}

/**
 * Clears all of the urls from the textarea
 */
function clearLinksList() {
    const listTextArea = document.getElementById("listTextArea");
    listTextArea.value = "";
}

/**
 * Handles the opening of lists
 * @param list  The list of urls to open
 */
function openList(list) {
    let strings = list.split(/\r\n|\r|\n/);
    if (quickSettings.open_urls_in_reverse_order === 1) {
        strings = strings.reverse();
    }
    let tabCreationDelay = document.getElementById("tabCreationDelay").value;
    if (!(tabCreationDelay > 0) || !(strings.length > 1)) {
        for (let i = 0; i < strings.length; i++) {
            if (strings[i].trim() === '') {
                strings.splice(i, 1);
                i--;
            }
        }
        tabCreationDelay = tabCreationDelay * 1000;
        linksIterator(0, strings, tabCreationDelay);
    } else {
        const linksToOpen = {
            object_description: "link_to_open",
            list_links: []
        };
        for (const link of strings) {
            linksToOpen.list_links.push(link);
        }
        localStorage.setItem("linksToOpen", JSON.stringify(linksToOpen));
        if (checkHostType() === "firefox") {
            browser.tabs.create({
                active: true,
                'url': browser.extension.getURL('openingtabs.html')
            });
        } else if (checkHostType() === "chrome") {
            chrome.tabs.create({
                'url': chrome.extension.getURL('openingtabs.html')
            });
        } else if (checkHostType() === "electron") {
            window.location.replace('../../openingtabs.html');
        }
    }
}

/**
 * Recursive function to iterate through a list of urls to open
 * @param i                 Counter
 * @param strings           The urls to open
 * @param tabCreationDelay  The delay between opening a new url
 */
function linksIterator(i, strings, tabCreationDelay) {
    strings[i] = strings[i].trim();
    if (strings[i] === '') {
        return;
    }
    const last = strings[i + 1] === undefined;
    let url = strings[i];
    linksIteratorProcessURL(url, last);
    i++;
    if (i < strings.length) {
        setTimeout(linksIterator, tabCreationDelay, i, strings, tabCreationDelay);
    }
}

/**
 * Opens the page to create a new list of urls
 */
function openSaveNewListDialog() {
    const lines = document.getElementById("listTextArea").value.split('\n');
    const tempList = {
        object_description: "temp_storage",
        list_links: []
    };
    for (let i = 0; i < lines.length; i++) {
        if (!(lines[i]) == "\n") {
            tempList.list_links.push(lines[i]);
        }

    }
    localStorage.setItem("temp", JSON.stringify(tempList));
    if (checkHostType() === "firefox") {
        browser.tabs.create({
            active: true,
            'url': browser.extension.getURL('/pages/lists/new.html')
        });
    } else if (checkHostType() === "chrome") {
        chrome.tabs.create({
            'url': chrome.extension.getURL('/pages/lists/new.html')
        });
    } else if (checkHostType() === "electron") {
        window.location.replace('../lists/new.html');
    }
}

/**
 * Loads the urls for the selected list into the text area
 */
function openSelectedList() {
    if (getSelectedListID() === "-1") {
        alert("You need to select a list");
        return;
    }
    for (let i = 0; i < localStorage.length; i++) {
        const tempArray = loadList(localStorage.key(i));
        try {
            const parsedList = JSON.parse(tempArray);
            if (parsedList.list_id === parseInt(getSelectedListID())) {
                const listTextArea = document.getElementById("listTextArea");
                clearLinksTextArea();
                for (const link of parsedList.list_links) {
                    listTextArea.value += link + "\n";
                }
                listTextArea.select();
            }
        } catch (e) {

        }
    }
}

/**
 * Will load a given lists urls into the text area in the popup
 * @param id    The id of the list to get urls from
 */
function openListByID(id) {
    for (let i = 0; i < localStorage.length; i++) {
        const tempArray = loadList(localStorage.key(i));
        try {
            const parsedList = JSON.parse(tempArray);
            if (parsedList.list_id === parseInt(id)) {
                const listTextArea = document.getElementById("listTextArea");
                clearLinksTextArea();
                for (const link of parsedList.list_links) {
                    listTextArea.value += link + "\n";
                }
                listTextArea.select();
            }
        } catch (e) {

        }
    }
}

/**
 * Opens the settings page
 */
function openSettingsDialog() {
    if (checkHostType() === "firefox") {
        browser.tabs.create({
            active: true,
            'url': browser.extension.getURL('/pages/settings/index.html')
        });
    } else if (checkHostType() === "chrome") {
        chrome.tabs.create({
            'url': chrome.extension.getURL('/pages/settings/index.html')
        });
    } else if (checkHostType() === "electron") {
        window.location.replace('../settings/index.html');
    }
}

/**
 * Opens the help page
 */
function openHelpDialog() {
    if (checkHostType() === "firefox") {
        browser.tabs.create({
            active: true,
            'url': browser.extension.getURL('/pages/help/index.html')
        });
    } else if (checkHostType() === "chrome") {
        chrome.tabs.create({
            'url': chrome.extension.getURL('/pages/help/index.html')
        });
    } else if (checkHostType() === "electron") {
        window.location.replace('../help/index.html');
    }
}

/**
 * Deletes a list
 */
function deleteList() {
    if (getSelectedListID() === "-1") {
        alert("You need to select a list");
        return;
    }
    // Cannot confirm on Firefox as alerts will close popup
    if (checkHostType() === "firefox") {
        removeList(getSelectedListID());
        return;
    }
    if (confirm("Are you sure you wish to delete the list: " + getSelectedList())) {
        removeList(getSelectedListID());
    }
}

/**
 * Creates a window to edit the selected list
 */
function editSelectedList() {
    if (getSelectedListID() === "-1") {
        alert("You need to select a list");
        return;
    }
    if (checkHostType() === "firefox") {
        browser.tabs.create({
            active: true,
            'url': browser.extension.getURL('/pages/lists/edit.html?id=' + getSelectedListID() + "&name=" + getSelectedList())
        });
    } else if (checkHostType() === "chrome") {
        chrome.tabs.create({
            'url': chrome.extension.getURL('/pages/lists/edit.html?id=' + getSelectedListID() + "&name=" + getSelectedList())
        });
    } else if (checkHostType() === "electron") {
        window.location.replace('../lists/edit.html?id=' + getSelectedListID() + "&name=" + getSelectedList());
    }
}

/**
 *  Gets the selected list name
 * @returns {string | jQuery}   Selected list name
 */
function getSelectedList() {
    return document.getElementById('savedLists').options[document.getElementById('savedLists').selectedIndex].text;
}

/**
 * Gets the currently selected list id
 * @returns {string | jQuery}   List id
 */
function getSelectedListID() {
    return document.getElementById('savedLists').options[document.getElementById('savedLists').selectedIndex].id;
}

/**
 * Saves the input in the 'list' text area into browser storage so that it can be re-used if the
 * 'Default list to display' setting is set to 'Previous urls'
 */
function saveUserInput() {
    localStorage.setItem("previous_list_input", JSON.stringify(document.getElementById("listTextArea").value.split(/\r\n|\r|\n/)));
}

/**
 * Checks if there is a key of 'previous_list_input' in the local storage to be retrieved for the 'Previous urls'
 * setting
 */
function previousInputExists() {
    return localStorage.getItem("previous_list_input") !== null;
}

/**
 * Clears all data from the text area
 */
function clearLinksTextArea() {
    document.getElementById("listTextArea").value = "";
}

String.prototype.trim = function () {
    return this.replace(/^\s+|\s+$/g, '');
};
