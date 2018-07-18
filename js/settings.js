$(document).ready(function () {
    const $tabCreationDelaySelector = $('#tabCreationDelay');
    const $nightModeSelector = $('#nightMode');
    const $autoOpenSelector = $('#autoOpenLists');
    $tabCreationDelaySelector.val(0);
    for (let i = 0; i < localStorage.length; i++) {
        const tempArray = loadList(localStorage.key(i));
        if (localStorage.key(i) === "settings") {
            const userSettings = JSON.parse(tempArray);
            console.dir(userSettings);
            $tabCreationDelaySelector.val(userSettings.tab_creation_delay);
            if (userSettings.night_mode === 1) {
                $nightModeSelector.prop('checked', true);
            }

            if (userSettings.auto_open_lists === 1) {
                $autoOpenSelector.prop('checked', true);
            }
        }
    }
    $('#closeModal').click(function () {
        window.close();
    });
    $('#closeModalFooter').click(function () {
        window.close();
    });
    $('#saveSettings').click(function () {
        initSettingsSave();
    });
});

function isNumber(varToTest) {
    return !isNaN(parseFloat(varToTest))
}

function initSettingsSave() {
    const $tabCeationDelaySelector = $('#tabCreationDelay');
    const $nightModeSelector = $('#nightMode');
    const $autoOpenListsSelector = $('#autoOpenLists');
    const tabCreationDelay = parseInt($tabCeationDelaySelector.val());
    let nightMode = 0;
    let autoOpenLists = 0;
    if ($nightModeSelector.is(":checked")) {
        nightMode = 1;
    }
    if ($autoOpenListsSelector.is(":checked")) {
        autoOpenLists = 1;
    }
    if (!(isNumber(tabCreationDelay))) {
        alert("Your tab creation delay is not a number!");
        return;
    }
    const userSettings = {
        object_description: null,
        tab_creation_delay: 0,
        night_mode: 0,
        auto_open_lists: 0
    };
    userSettings.object_description = "user_settings";
    userSettings.tab_creation_delay = tabCreationDelay;
    userSettings.night_mode = nightMode;
    userSettings.auto_open_lists = autoOpenLists;
    saveSettings(userSettings);
}
