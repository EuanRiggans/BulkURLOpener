$(document).ready(function () {
    upgradeToJSONFormatting();
    if (getSetting('auto_open_lists') === 1) {
        $('#savedListsOptions').after("<label for=\"overrideAutoOpen\"><input type=\"checkbox\" id=\"overrideAutoOpen\">&nbsp;Override Auto Open</label>");
        $(document).on('change', '#savedLists', function (e) {
            const $overrideSelector = $('#overrideAutoOpen');
            if (!$overrideSelector.is(':checked')) {
                if (getSetting('auto_open_lists') === 1) {
                    openSelectedList();
                    openTextAreaList();
                }
            }
        });
    }
    if (getSetting("default_list_open") === -1 || getSetting("default_list_open") === undefined) {
        chrome.windows.getCurrent(function (window) {
            chrome.tabs.getAllInWindow(window.id, function (tabs) {
                if (!tabs.length) return;

                const listTextArea = document.getElementById("list");

                for (let i = 0; i < tabs.length; ++i) {
                    listTextArea.value += tabs[i].url + "\n";
                }
                listTextArea.select();
            });
        });
    } else {
        openListByID(getSetting("default_list_open"));
    }
    for (let i = 0; i < localStorage.length; i++) {
        const tempStorageArray = loadList(localStorage.key(i));
        try {
            const parsedList = JSON.parse(tempStorageArray);
            if (parsedList.object_description === "list_storage") {
                $('#savedLists').append('<option id="' + parsedList.list_id + '">' + parsedList.list_name + '</option>');
            }
        } catch (e) {

        }
    }
    if (getParameterByName("popup", window.location) === "true") {
        $('#openInPopup').remove();
    }
    $('#openButton').click(function () {
        openTextAreaList();
    });
    $('#copyCurrentOpen').click(function () {
        getCurrentTabs();
    });
    $('#clearList').click(function () {
        clearLinksList();
    });
    $('#createNewList').click(function () {
        openSaveNewListDialog();
    });
    $('#openList').click(function () {
        openSelectedList();
    });
    $('#editList').click(function () {
        editSelectedList();
    });
    $('#deleteList').click(function () {
        deleteList();
    });
    $('#openSettings').click(function () {
        openSettingsDialog();
    });
    $('#openHelp').click(function () {
        openHelpDialog();
    });
    $('#openInPopup').click(function () {
        popupMain();
        window.close();
    });
    $('#version').text("- Version " + getCurrentVersion());
});

function openTextAreaList() {
    openList(document.getElementById("list").value);
}

function getCurrentTabs() {
    chrome.windows.getCurrent(function (window) {
        chrome.tabs.getAllInWindow(window.id, function (tabs) {
            if (!tabs.length) {
                return;
            }
            const listTextArea = document.getElementById("list");
            listTextArea.value = "";
            for (let i = 0; i < tabs.length; ++i) {
                listTextArea.value += tabs[i].url + "\n";
            }
            listTextArea.select();
        });
    });
}

function clearLinksList() {
    const listTextArea = document.getElementById("list");
    listTextArea.value = "";
}

String.prototype.trim = function () {
    return this.replace(/^\s+|\s+$/g, '');
};

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

function openList(list) {
    const strings = list.split(/\r\n|\r|\n/);
    //Removed, pending better solution. Caused issue for users using browsers other than chrome.
    //if(strings.length > 10) {
    //    if(!(confirm("Are you sure you wish to open " + strings.length + " URLs?"))) {
    //        return;
    //    }
    //}
    let tabCreationDelay = getSetting("tab_creation_delay");
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
        chrome.tabs.create({'url': chrome.extension.getURL('openingtabs.html')});
    }
}

function linksIterator(i, strings, tabCreationDelay) {
    strings[i] = strings[i].trim();
    if (strings[i] === '') {
        return;
    }
    let url = strings[i];
    if (!isProbablyUrl(url)) {
        url = 'http://www.google.com/search?q=' + encodeURI(url);
    }
    chrome.tabs.create({'url': url, 'selected': false});
    i++;
    if (i < strings.length) {
        setTimeout(linksIterator, tabCreationDelay, i, strings, tabCreationDelay);
    }
}

function openSaveNewListDialog() {
    const lines = $('#list').val().split('\n');
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
    chrome.tabs.create({'url': chrome.extension.getURL('newlist.html')});
}

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
                const listTextArea = document.getElementById("list");
                $('#list').val('');
                for (const link of parsedList.list_links) {
                    listTextArea.value += link + "\n";
                }
                listTextArea.select();
            }
        } catch (e) {

        }
    }
}

function openListByID(id) {
    for (let i = 0; i < localStorage.length; i++) {
        const tempArray = loadList(localStorage.key(i));
        try {
            const parsedList = JSON.parse(tempArray);
            if (parsedList.list_id === parseInt(id)) {
                const listTextArea = document.getElementById("list");
                $('#list').val('');
                for (const link of parsedList.list_links) {
                    listTextArea.value += link + "\n";
                }
                listTextArea.select();
            }
        } catch (e) {

        }
    }
}

function openSettingsDialog() {
    chrome.tabs.create({'url': chrome.extension.getURL('settings.html')});
}

function openHelpDialog() {
    chrome.tabs.create({'url': chrome.extension.getURL('help.html')});
}

function openImportDialog() {
    chrome.tabs.create({'url': chrome.extension.getURL('import.html')});
}

function openExportDialog() {
    chrome.tabs.create({'url': chrome.extension.getURL('export.html')});
}

function deleteList() {
    if (getSelectedListID() === "-1") {
        alert("You need to select a list");
        return;
    }
    if (confirm("Are you sure you wish to delete the list: " + getSelectedList())) {
        removeList(getSelectedListID());
    }
}

function editSelectedList() {
    if (getSelectedListID() === "-1") {
        alert("You need to select a list");
        return;
    }
    chrome.tabs.create({'url': chrome.extension.getURL('editlist.html?id=' + getSelectedListID() + "&name=" + getSelectedList())});
}

function getSelectedList() {
    return $("#savedLists option:selected").html();
}

function getSelectedListID() {
    return $('select[id="savedLists"] option:selected').attr('id');
}

function getSetting(setting) {
    const settingSelected = setting.toLowerCase();
    for (let i = 0; i < localStorage.length; i++) {
        const tempStorage = loadList(localStorage.key(i));
        if (localStorage.key(i) === "settings") {
            const userSettings = JSON.parse(tempStorage);
            switch (settingSelected) {
                case "tab_creation_delay":
                    return userSettings.tab_creation_delay;
                    break;
                case "auto_open_lists":
                    return userSettings.auto_open_lists;
                    break;
                case "default_list_open":
                    return userSettings.default_list_open;
                    break;
                default:
                    break;
            }
        }
    }
}

function getCurrentVersion() {
    const manifestData = chrome.runtime.getManifest();
    return (manifestData.version);
}

function popupMain() {
    chrome.windows.create({
        url: "popup.html?popup=true",
        type: "popup",
        width: 755,
        height: 600,
    });
}

function upgradeToJSONFormatting() {
    for (let i = 0; i < localStorage.length; i++) {
        const tempArray = loadList(localStorage.key(i));
        if (tempArray[0] === "listStorage") {
            const newList = {
                object_description: "list_storage",
                list_id: parseInt(tempArray[1]),
                list_name: tempArray[2],
                list_links: []
            };
            for (let i = 3; i < tempArray.length; i++) {
                newList.list_links.push(tempArray[i]);
            }
            localStorage.setItem(tempArray[1], JSON.stringify(newList));
        } else if (tempArray[0] === "settings") {
            const newSettings = {
                object_description: "user_settings",
                tab_creation_delay: parseInt(tempArray[1]),
                night_mode: 0,
                auto_open_lists: 0,
                default_list_open: -1
            };
            localStorage.setItem("settings", JSON.stringify(newSettings));
        }
    }
}

/**
 * Automatically converted lists from pre 1.1.0 into the new list format. Now for all versions 1.1.4 > lists are stored using json, so this list has been deprecated
 * @deprecated
 */
function convertOldURLLists() {
    for (let i = 0; i < localStorage.length; i++) {
        const tempArray = loadList(localStorage.key(i));
        const newListStorageArray = [];
        if (tempArray[0] === localStorage.key(i) && !(localStorage.key(i) === "settings") && !(localStorage.key(i) === "maxID")) {
            console.log("Need to convert: " + tempArray);
            localStorage.removeItem(localStorage.key(i));
            newListStorageArray.push("listStorage");
            newListStorageArray.push(getNextAvailableID());
            for (let x = 1; x < tempArray.length; x++) {
                newListStorageArray.push(tempArray[x]);
            }
            const listID = getNextAvailableID();
            localStorage.setItem(listID, newListStorageArray);
        }
    }
}