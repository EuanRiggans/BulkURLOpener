(() => {
    createSettings();
    document.getElementById("saveSettings").addEventListener('click', (e) => {
        initSettingsSave();
    });

    document.getElementById('openImport').addEventListener('click', (e) => {
        openImport();
    });

    document.getElementById('openExport').addEventListener('click', (e) => {
        openExport();
    });

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

    const tabCreationDelayElement = document.getElementById('tabCreationDelay');
    const nightModeGroup = document.getElementById('nightModeGroup');
    const autoOpenListsGroup = document.getElementById('autoOpenListsGroup');
    const activeNewTabsGroup = document.getElementById('activeNewTabsGroup');
    const autoLoadIntoTextAreaGroup = document.getElementById('autoLoadIntoTextAreaGroup');
    const loadTabOnFocusGroup = document.getElementById('loadTabOnFocusGroup');
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
            if (userSettings.custom_theme === "fluentDesignBootstrap") {
                if (userSettings.night_mode === 1) {
                    let html = "<div class=\"form-check pl-0 checkbox\"><input class=\"form-check-input\" type=\"checkbox\" value=\"\" id=\"nightMode\" checked><label class=\"form-check-label\" for=\"nightMode\">&nbsp; Enable night theme</label></div>";
                    appendHtml(nightModeGroup, html);
                } else {
                    let html = "<div class=\"form-check pl-0 checkbox\"><input class=\"form-check-input\" type=\"checkbox\" value=\"\" id=\"nightMode\"><label class=\"form-check-label\" for=\"nightMode\">&nbsp; Enable night theme</label></div>";
                    appendHtml(nightModeGroup, html);
                }

                if (userSettings.auto_open_lists === 1) {
                    let html = "<div class=\"form-check pl-0 checkbox\"><input class=\"form-check-input\" type=\"checkbox\" value=\"\" id=\"autoOpenLists\" checked><label class=\"form-check-label\" for=\"autoOpenLists\">&nbsp; Automatically open lists<a id=\"autoOpenListsTooltip\" data-toggle=\"tooltip\" data-placement=\"top\" title=\"When you select a link list from the dropdown, it will be automatically opened.\">(?)</a></label></div>";
                    appendHtml(autoOpenListsGroup, html);
                } else {
                    let html = "<div class=\"form-check pl-0 checkbox\"><input class=\"form-check-input\" type=\"checkbox\" value=\"\" id=\"autoOpenLists\"><label class=\"form-check-label\" for=\"autoOpenLists\">&nbsp; Automatically open lists<a id=\"autoOpenListsTooltip\" data-toggle=\"tooltip\" data-placement=\"top\" title=\"When you select a link list from the dropdown, it will be automatically opened.\">(?)</a></label></div>";
                    appendHtml(autoOpenListsGroup, html);
                }

                if (userSettings.new_tabs_active === 1) {
                    let html = "<div class=\"form-check pl-0 checkbox\"><input class=\"form-check-input\" type=\"checkbox\" value=\"\" id=\"activeNewTabs\" checked><label class=\"form-check-label\" for=\"activeNewTabs\">&nbsp; Set new tabs as Active</label></div>";
                    appendHtml(activeNewTabsGroup, html);
                } else {
                    let html = "<div class=\"form-check pl-0 checkbox\"><input class=\"form-check-input\" type=\"checkbox\" value=\"\" id=\"activeNewTabs\"><label class=\"form-check-label\" for=\"activeNewTabs\">&nbsp; Set new tabs as Active</label></div>";
                    appendHtml(activeNewTabsGroup, html);
                }

                if (userSettings.auto_load_into_textarea === 1) {
                    let html = "<div class=\"form-check pl-0 checkbox\"><input class=\"form-check-input\" type=\"checkbox\" value=\"\" id=\"autoLoadIntoTextArea\" checked><label class=\"form-check-label\" for=\"autoLoadIntoTextArea\">&nbsp; When a list is selected, automatically open it into the text box</label></div>";
                    appendHtml(autoLoadIntoTextAreaGroup, html);
                } else {
                    let html = "<div class=\"form-check pl-0 checkbox\"><input class=\"form-check-input\" type=\"checkbox\" value=\"\" id=\"autoLoadIntoTextArea\"><label class=\"form-check-label\" for=\"autoLoadIntoTextArea\">&nbsp; When a list is selected, automatically open it into the text box</label></div>";
                    appendHtml(autoLoadIntoTextAreaGroup, html);
                }

                if (userSettings.load_on_focus === 1) {
                    let html = "<div class=\"form-check pl-0 checkbox\"><input class=\"form-check-input\" type=\"checkbox\" value=\"\" id=\"delayUntilFocus\" checked><label class=\"form-check-label\" for=\"delayUntilFocus\">&nbsp; Delay loading tab until tab is selected</label></div>";
                    appendHtml(loadTabOnFocusGroup, html);
                } else {
                    let html = "<div class=\"form-check pl-0 checkbox\"><input class=\"form-check-input\" type=\"checkbox\" value=\"\" id=\"delayUntilFocus\"><label class=\"form-check-label\" for=\"delayUntilFocus\">&nbsp; Delay loading tab until tab is selected</label></div>";
                    appendHtml(loadTabOnFocusGroup, html);
                }
            } else {
                if (userSettings.night_mode === 1) {
                    let html = "<div class=\"checkbox\"><label><input type=\"checkbox\" id=\"nightMode\" checked>&nbsp; Enable night theme</label></div>";
                    appendHtml(nightModeGroup, html);
                } else {
                    let html = "<div class=\"checkbox\"><label><input type=\"checkbox\" id=\"nightMode\">&nbsp; Enable night theme</label></div>";
                    appendHtml(nightModeGroup, html);
                }

                if (userSettings.auto_open_lists === 1) {
                    let html = "<div class=\"checkbox\"><label><input type=\"checkbox\" id=\"autoOpenLists\" checked>&nbsp; Automatically open lists <a id=\"autoOpenListsTooltip\" data-toggle=\"tooltip\" data-placement=\"top\" title=\"When you select a link list from the dropdown, it will be automatically opened.\">(?)</a></label></div>";
                    appendHtml(autoOpenListsGroup, html);
                } else {
                    let html = "<div class=\"checkbox\"><label><input type=\"checkbox\" id=\"autoOpenLists\">&nbsp; Automatically open lists <a id=\"autoOpenListsTooltip\" data-toggle=\"tooltip\" data-placement=\"top\" title=\"When you select a link list from the dropdown, it will be automatically opened.\">(?)</a></label></div>";
                    appendHtml(autoOpenListsGroup, html);
                }

                if (userSettings.new_tabs_active === 1) {
                    let html = "<div class=\"checkbox\"><label><input type=\"checkbox\" id=\"activeNewTabs\" checked>&nbsp; Set new tabs as Active</label></div>";
                    appendHtml(activeNewTabsGroup, html);
                } else {
                    let html = "<div class=\"checkbox\"><label><input type=\"checkbox\" id=\"activeNewTabs\">&nbsp; Set new tabs as Active</label></div>";
                    appendHtml(activeNewTabsGroup, html);
                }

                if (userSettings.auto_load_into_textarea === 1) {
                    let html = "<div class=\"checkbox\"><label><input type=\"checkbox\" id=\"autoLoadIntoTextArea\" checked>&nbsp; When a list is selected, automatically open it into the text box</label></div>";
                    appendHtml(autoLoadIntoTextAreaGroup, html);
                } else {
                    let html = "<div class=\"checkbox\"><label><input type=\"checkbox\" id=\"autoLoadIntoTextArea\">&nbsp; When a list is selected, automatically open it into the text box</label></div>";
                    appendHtml(autoLoadIntoTextAreaGroup, html);
                }

                if (userSettings.load_on_focus === 1) {
                    let html = "<div class=\"checkbox\"><label><input type=\"checkbox\" id=\"delayUntilFocus\" checked>&nbsp; Delay tab loading until tab is selected</label></div>";
                    appendHtml(loadTabOnFocusGroup, html);
                } else {
                    let html = "<div class=\"checkbox\"><label><input type=\"checkbox\" id=\"delayUntilFocus\">&nbsp; Delay tab loading until tab is selected</label></div>";
                    appendHtml(loadTabOnFocusGroup, html);
                }
            }
            if (userSettings.default_list_open !== -1) {
                selectedListID = userSettings.default_list_open;
            }
        }
    }
    if (!settingsObjPresent) {
        const nightModeHTML = "<div class=\"checkbox\"><label><input type=\"checkbox\" id=\"nightMode\">&nbsp; Enable night theme</label></div>";
        appendHtml(nightModeGroup, nightModeHTML);
        const autoOpenListsHTML = "<div class=\"checkbox\"><label><input type=\"checkbox\" id=\"autoOpenLists\">&nbsp; Automatically open lists <a id=\"autoOpenListsTooltip\" data-toggle=\"tooltip\" data-placement=\"top\" title=\"When you select a link list from the dropdown, it will be automatically opened.\">(?)</a></label></div>";
        appendHtml(autoOpenListsGroup, autoOpenListsHTML);
        const activeNewTabsHTML = "<div class=\"checkbox\"><label><input type=\"checkbox\" id=\"activeNewTabs\">&nbsp; Set new tabs as Active</label></div>";
        appendHtml(activeNewTabsGroup, activeNewTabsHTML);
        const autoLoadIntoTextAreaHTML = "<div class=\"checkbox\"><label><input type=\"checkbox\" id=\"autoLoadIntoTextArea\">&nbsp; When a list is selected, automatically open it into the text box</label></div>";
        appendHtml(autoLoadIntoTextAreaGroup, autoLoadIntoTextAreaHTML);
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
    const tabCreationDelay = parseInt(tabCreationDelayElement.value);
    let nightMode = 0;
    let autoOpenLists = 0;
    let activeNewTabs = 0;
    let autoLoadIntoTextArea = 0;
    let delayTabLoading = 0;
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
    saveSettings(userSettings);
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