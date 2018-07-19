$(document).ready(function () {
    const $tabCreationDelaySelector = $('#tabCreationDelay');
    const $nightModeSelector = $('#nightMode');
    const $autoOpenSelector = $('#autoOpenLists');
    let selectedListID = -1;
    $tabCreationDelaySelector.val(0);
    for (let i = 0; i < localStorage.length; i++) {
        const tempArray = loadList(localStorage.key(i));
        if (localStorage.key(i) === "settings") {
            const userSettings = JSON.parse(tempArray);
            $tabCreationDelaySelector.val(userSettings.tab_creation_delay);
            if (userSettings.night_mode === 1) {
                $nightModeSelector.prop('checked', true);
            }

            if (userSettings.auto_open_lists === 1) {
                $autoOpenSelector.prop('checked', true);
            }

            if (userSettings.default_list_open !== -1) {
                selectedListID = userSettings.default_list_open;
            }
        }
    }
    for (let i = 0; i < localStorage.length; i++) {
        const tempStorageArray = loadList(localStorage.key(i));
        try {
            const parsedList = JSON.parse(tempStorageArray);
            if (parsedList.object_description === "list_storage") {
                $('#defaultList').append('<option id="' + parsedList.list_id + '">' + parsedList.list_name + '</option>');
            }
        } catch (e) {

        }
    }
    $("#defaultList option[id=" + selectedListID + "]").prop('selected', true);
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
    const defaultList = getSelectedListID();
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
        object_description: "user_settings",
        tab_creation_delay: 0,
        night_mode: 0,
        auto_open_lists: 0,
        default_list_open: -1
    };
    userSettings.tab_creation_delay = tabCreationDelay;
    userSettings.night_mode = nightMode;
    userSettings.auto_open_lists = autoOpenLists;
    userSettings.default_list_open = parseInt(defaultList);
    saveSettings(userSettings);
}

function getSelectedList() {
    return $("#defaultList option:selected").html();
}

function getSelectedListID() {
    return $('select[id="defaultList"] option:selected').attr('id');
}