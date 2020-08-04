/* Event Listeners */

document.getElementById("saveSettings").addEventListener("click", initSettingsSave);

document.getElementById("openImport").addEventListener("click", openImport);

document.getElementById("openExport").addEventListener("click", openExport);

document.getElementById("closeModal").addEventListener('click', (e) => {
    if (checkHostType() === "firefox") {
        alert("Unable to close window due to Firefox security policy. Please close this window manually.");
        // window.close();
    } else if (checkHostType() === "chrome") {
        window.close();
    } else if (checkHostType() === "electron") {
        window.location.replace("popup.html");
    }
});

/* End of event listeners */

(() => {
    createSettings();

    const tabCreationDelayElement = document.getElementById('tabCreationDelay');
    const nightModeGroup = document.getElementById('nightModeGroup');
    const autoOpenListsGroup = document.getElementById('autoOpenListsGroup');
    const activeNewTabsGroup = document.getElementById('activeNewTabsGroup');
    const autoLoadIntoTextAreaGroup = document.getElementById('autoLoadIntoTextAreaGroup');
    const loadTabOnFocusGroup = document.getElementById('loadTabOnFocusGroup');
    const contextMenuEnabledGroup = document.getElementById('contextMenusGroup');
    const openInReverseGroup = document.getElementById('openInReverseGroup');
    let selectedListID = -1;
    let selectedTheme = "defaultBootstrap";
    let currentlyOpenedTabsSetting = "allOpenedTabs";
    let nonURLHandlerSetting = "searchForString";
    let searchEngineSetting = "googleEngine";
    let buttonLookSetting = "alwaysOutline";
    let openListOnStartup = "no_list";
    tabCreationDelayElement.value = 0;
    let settingsObjPresent = false;

    for (let i = 0; i < localStorage.length; i++) {
        const tempArray = loadList(localStorage.key(i));
        if (localStorage.key(i) === "settings") {
            settingsObjPresent = true;
            const userSettings = JSON.parse(tempArray);
            if (tabCreationDelayElement.value === false) {
                tabCreationDelayElement.value = 0;
            } else {
                tabCreationDelayElement.value = userSettings.tab_creation_delay;
            }
            const checkboxesToBuild = {
                settings: {
                    user_theme: userSettings.custom_theme,
                },
                night_mode: {
                    checkbox_id: "nightMode",
                    label_text: "Enable night theme",
                    check_status: userSettings.night_mode === 1,
                    append_to: nightModeGroup
                },
                auto_open_lists: {
                    checkbox_id: "autoOpenLists",
                    label_text: "Automatically open lists",
                    check_status: userSettings.auto_open_lists === 1,
                    append_to: autoOpenListsGroup
                },
                new_tabs_active: {
                    checkbox_id: "activeNewTabs",
                    label_text: "Set new tabs as Active",
                    check_status: userSettings.new_tabs_active === 1,
                    append_to: activeNewTabsGroup
                },
                auto_load_into_textarea: {
                    checkbox_id: "autoLoadIntoTextArea",
                    label_text: "When a list is selected, automatically open it into the text box",
                    check_status: userSettings.auto_load_into_textarea === 1,
                    append_to: autoLoadIntoTextAreaGroup
                },
                load_on_focus: {
                    checkbox_id: "delayUntilFocus",
                    label_text: "Delay loading tab until tab is selected",
                    check_status: userSettings.load_on_focus === 1,
                    append_to: loadTabOnFocusGroup
                },
                context_menu_enabled: {
                    checkbox_id: "contextMenuEnabled",
                    label_text: "Enable context menus (Right click menus)",
                    check_status: userSettings.context_menu_enabled === 1,
                    append_to: contextMenuEnabledGroup
                },
                open_urls_in_reverse_order: {
                    checkbox_id: "openInReverse",
                    label_text: "Open urls in reverse order",
                    check_status: userSettings.open_urls_in_reverse_order === 1,
                    append_to: openInReverseGroup
                }
            }
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
            if (userSettings.default_list_open !== -1) {
                selectedListID = userSettings.default_list_open;
            }
        }
    }
    if (!settingsObjPresent) {
        buildBootstrapCheckbox("nightMode", "Enable night theme", false, nightModeGroup);
        buildBootstrapCheckbox("autoOpenLists", "Automatically open lists", false, autoOpenListsGroup);
        buildBootstrapCheckbox("activeNewTabs", "Set new tabs as Active", false, activeNewTabsGroup);
        buildBootstrapCheckbox("autoLoadIntoTextArea", "When a list is selected, automatically open it into the text box", false, autoLoadIntoTextAreaGroup);
        buildBootstrapCheckbox("delayUntilFocus", "Delay loading tab until tab is selected", false, loadTabOnFocusGroup);
        buildBootstrapCheckbox("contextMenuEnabled", "Enable context menus (Right click menus)", false, contextMenuEnabledGroup);
        buildBootstrapCheckbox("openInReverse", "Open urls in reverse order", false, openInReverseGroup);
    }
    for (let i = 0; i < localStorage.length; i++) {
        const tempStorageArray = loadList(localStorage.key(i));
        try {
            const parsedList = JSON.parse(tempStorageArray);
            if (parsedList.object_description === "list_storage") {
                appendHtml(document.getElementById('defaultList'), '<option id="' + parsedList.list_id + '">' + parsedList.list_name + '</option>');
                appendHtml(document.getElementById('loadListOnStartup'), '<option id="' + parsedList.list_id + '">' + parsedList.list_name + '</option>');
            }
            if (parsedList.object_description === "user_settings") {
                currentlyOpenedTabsSetting = parsedList.currently_opened_tabs_display;
                selectedTheme = parsedList.custom_theme;
                nonURLHandlerSetting = parsedList.non_url_handler;
                searchEngineSetting = parsedList.search_engine;
                buttonLookSetting = parsedList.button_look;
                openListOnStartup = parsedList.open_on_launch;

            }
        } catch (e) {
            console.log(e);
        }
    }
    setActiveSelectOptions(selectedListID, selectedTheme, currentlyOpenedTabsSetting, nonURLHandlerSetting, searchEngineSetting, buttonLookSetting, openListOnStartup);

    document.getElementById("nightMode").addEventListener('change', (e) => {
        const isChecked = document.getElementById("nightMode").checked;
        if (isChecked) {
            if (!(document.getElementById("styles-dark"))) {
                const head = document.getElementsByTagName('head')[0];
                const nightModeStylesheet = document.createElement('link');
                nightModeStylesheet.href = "css/style-dark.css";
                nightModeStylesheet.rel = "stylesheet";
                nightModeStylesheet.id = "styles-dark";
                head.appendChild(nightModeStylesheet);
            }
        } else {
            if (document.getElementById("styles-dark")) {
                document.getElementById("styles-dark").remove();
            }
        }
    });

    if (checkHostType() === "electron") {
        document.getElementById('loadOnBrowserStart').style.display = "none";
        document.getElementById('loadTabOnFocusGroup').style.display = "none";
        document.getElementById('loadOnBrowserStartGroupHR').style.display = "none";
        document.getElementById('loadTabOnFocusGroupHR').style.display = "none";
        document.getElementById('contextMenusGroup').style.display = "none";
        document.getElementById('contextMenusHR').style.display = "none";
    }
})();

function isNumber(varToTest) {
    return !isNaN(parseFloat(varToTest))
}

function initSettingsSave() {
    const tabCreationDelayElement = document.getElementById('tabCreationDelay');
    const nightModeElement = document.getElementById('nightMode');
    const autoOpenListsElement = document.getElementById('autoOpenLists');
    const activeNewTabsElement = document.getElementById('activeNewTabs');
    const autoLoadIntoTextareaElement = document.getElementById('autoLoadIntoTextArea');
    const delayTabLoadingElement = document.getElementById('delayUntilFocus');
    const contextMenuEnabledElement = document.getElementById('contextMenuEnabled');
    const openInReverseElement = document.getElementById('openInReverse');
    let tabCreationDelay = parseInt(tabCreationDelayElement.value);
    if (tabCreationDelayElement.value % 1 !== 0) {
        tabCreationDelay = parseFloat(tabCreationDelayElement.value);
    }
    let nightMode = 0;
    let autoOpenLists = 0;
    let activeNewTabs = 0;
    let autoLoadIntoTextArea = 0;
    let delayTabLoading = 0;
    let contextMenusEnabled = 0;
    let openInReverse = 0;
    const defaultList = getSelectedListID();
    const theme = getSelectedTheme();
    const currentlyOpenedTabsSetting = getCurrentlyOpenedTabsSetting();
    const nonURLHandlerSetting = getNonURLHandlerSetting();
    const searchEngineSetting = getSearchEngineSetting();
    const buttonLookSetting = getButtonLookSetting();
    const openListOnStartup = getLoadListOnStartupSetting();
    if (nightModeElement.checked) {
        nightMode = 1;
    }
    if (autoOpenListsElement.checked) {
        autoOpenLists = 1;
    }
    if (activeNewTabsElement.checked) {
        activeNewTabs = 1;
    }
    if (autoLoadIntoTextareaElement.checked) {
        autoLoadIntoTextArea = 1;
    }
    if (delayTabLoadingElement.checked) {
        delayTabLoading = 1;
    }
    if (contextMenuEnabledElement.checked) {
        contextMenusEnabled = 1;
    }
    if (openInReverseElement.checked) {
        openInReverse = 1;
    }
    if (!(isNumber(tabCreationDelay)) || tabCreationDelay < 0) {
        alert("Your tab creation delay must be zero or a positive number!");
        return;
    }
    if (checkHostType() === "electron" && tabCreationDelay < 1) {
        alert("Tab Creation Delay must be at least one second. This is due to a limitation in the way electron opens urls.");
        return;
    }
    if (checkHostType() === "electron") {
        delayTabLoading = 0;
    }
    const userSettings = {
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
    userSettings.tab_creation_delay = tabCreationDelay;
    userSettings.night_mode = nightMode;
    userSettings.auto_open_lists = autoOpenLists;
    userSettings.default_list_open = parseInt(defaultList);
    userSettings.custom_theme = theme;
    userSettings.currently_opened_tabs_display = currentlyOpenedTabsSetting;
    userSettings.non_url_handler = nonURLHandlerSetting;
    userSettings.search_engine = searchEngineSetting;
    userSettings.new_tabs_active = activeNewTabs;
    userSettings.auto_load_into_textarea = autoLoadIntoTextArea;
    userSettings.button_look = buttonLookSetting;
    userSettings.open_on_launch = openListOnStartup;
    userSettings.load_on_focus = delayTabLoading;
    userSettings.context_menu_enabled = contextMenusEnabled;
    userSettings.open_urls_in_reverse_order = openInReverse;

    if (userSettings.context_menu_enabled !== getSetting("context_menu_enabled")) {
        if (userSettings.context_menu_enabled === 0) {
            alert("You have disabled context menus, you will need to restart your browser for this change to come into effect.")
        } else {
            alert("You have enabled context menus, you will need to restart your browser for this change to come into effect.")
        }
    }

    saveSettings(userSettings);
}

function buildFluentBootstrapCheckbox(checkboxID, labelText, checkedStatus, appendTo) {
    let checkboxHTML;
    if (checkedStatus) {
        checkboxHTML = "<div class=\"form-check pl-0 checkbox\"><input class=\"form-check-input\" type=\"checkbox\" value=\"\" id=\"" + checkboxID + "\" checked><label class=\"form-check-label\" for=\"" + checkboxID + "\">&nbsp; " + labelText + "</label></div>"
    } else {
        checkboxHTML = "<div class=\"form-check pl-0 checkbox\"><input class=\"form-check-input\" type=\"checkbox\" value=\"\" id=\"" + checkboxID + "\"><label class=\"form-check-label\" for=\"" + checkboxID + "\">&nbsp; " + labelText + "</label></div>"
    }
    appendHtml(appendTo, checkboxHTML);
}

function buildBootstrapCheckbox(checkboxID, labelText, checkedStatus, appendTo) {
    let checkboxHTML;
    if (checkedStatus) {
        checkboxHTML = "<div class=\"checkbox\"><label><input type=\"checkbox\" id=\"" + checkboxID + "\" checked>&nbsp; " + labelText + "</label></div>";
    } else {
        checkboxHTML = "<div class=\"checkbox\"><label><input type=\"checkbox\" id=\"" + checkboxID + "\">&nbsp; " + labelText + "</label></div>";
    }
    appendHtml(appendTo, checkboxHTML);
}

function openImport() {
    if (checkHostType() === "firefox") {
        browser.tabs.create({
            active: true,
            'url': browser.extension.getURL('import.html')
        });
    } else if (checkHostType() === "chrome") {
        chrome.tabs.create({
            'url': chrome.extension.getURL('import.html')
        });
    } else if (checkHostType() === "electron") {
        window.location.replace("import.html");
    }
}

function openExport() {
    if (checkHostType() === "firefox") {
        browser.tabs.create({
            active: true,
            'url': browser.extension.getURL('export.html')
        });
    } else if (checkHostType() === "chrome") {
        chrome.tabs.create({
            'url': chrome.extension.getURL('export.html')
        });
    } else if (checkHostType() === "electron") {
        window.location.replace("export.html");
    }
}

function setActiveSelectOptions(selectedListID, selectedTheme, currentlyOpenedTabsSetting, nonURLHandlerSetting, searchEngineSetting, buttonLookSetting, openListOnStartup) {
    setActive(document.getElementById('defaultList'), selectedListID);
    setActive(document.getElementById('customTheme'), selectedTheme);
    setActive(document.getElementById('currentlyOpenedSetting'), currentlyOpenedTabsSetting);
    setActive(document.getElementById('nonURLHandlerSetting'), nonURLHandlerSetting);
    setActive(document.getElementById('selectedSearchEngineSetting'), searchEngineSetting);
    setActive(document.getElementById('buttonLookSetting'), buttonLookSetting);
    setActive(document.getElementById('loadListOnStartup'), openListOnStartup);
}

function setActive(selectEl, id) {
    let counter = 0;
    for (let opt of selectEl.options) {
        if (opt.id === String(id)) {
            selectEl.selectedIndex = counter;
        }
        counter++;
    }
}

function getSelectedList() {
    return document.getElementById('defaultList').options[document.getElementById('defaultList').selectedIndex].text;
}

function getSelectedListID() {
    return document.getElementById('defaultList').options[document.getElementById('defaultList').selectedIndex].id;
}

function getSelectedTheme() {
    return document.getElementById('customTheme').options[document.getElementById('customTheme').selectedIndex].id;
}

function getCurrentlyOpenedTabsSetting() {
    return document.getElementById('currentlyOpenedSetting').options[document.getElementById('currentlyOpenedSetting').selectedIndex].id;
}

function getNonURLHandlerSetting() {
    return document.getElementById('nonURLHandlerSetting').options[document.getElementById('nonURLHandlerSetting').selectedIndex].id;
}

function getSearchEngineSetting() {
    return document.getElementById('selectedSearchEngineSetting').options[document.getElementById('selectedSearchEngineSetting').selectedIndex].id;
}

function getButtonLookSetting() {
    return document.getElementById('buttonLookSetting').options[document.getElementById('buttonLookSetting').selectedIndex].id;
}

function getLoadListOnStartupSetting() {
    return document.getElementById('loadListOnStartup').options[document.getElementById('loadListOnStartup').selectedIndex].id;
}
