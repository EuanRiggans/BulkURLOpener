/**
 * import.js
 *
 * Will take the users inputted JSON object and then import all of the settings and lists into this devices local
 * storage.
 */

/* Event Listeners */

document.getElementById("closeModal").addEventListener("click", () => {
    if (checkHostType() === "firefox") {
        alert("Unable to close window due to Firefox security policy. Please close this window manually.");
        // window.close();
    } else if (checkHostType() === "chrome") {
        window.close();
    } else if (checkHostType() === "electron") {
        window.location.replace("../settings/index.html");
    }
});

document.getElementById("importData").addEventListener("click", () => {
    importData();
});

/* End Of Event Listeners */

function importData() {
    const exportTextArea = document.getElementById("importTextArea");
    const userJSON = exportTextArea.value;
    let skipLists = false;
    let skipSettings = false;
    let parsedJSON;
    try {
        parsedJSON = JSON.parse(userJSON);
    } catch (e) {
        console.log(e);
        alert("There is a problem with the data you have input.");
    }
    if (parsedJSON.maxID === undefined || parsedJSON.lists === undefined) {
        skipLists = true;
        if (!confirm("Your imported data is missing lists or lists max ID. Do you wish to continue with importing this data?")) {
            return;
        }
    }
    if (parsedJSON.settings === undefined) {
        skipSettings = true;
        if (!confirm("Your imported data is missing settings. Do you wish to continue with importing this data?")) {
            return;
        }
    }
    if (confirm("Importing this data will overwrite all of your settings and lists you have currently. Are you sure you wish to proceed?")) {
        clearLocalStorage();
        let maxID = 0;
        let userLists = [];
        let userSettings;
        if (!skipLists) {
            maxID = parsedJSON.maxID;
            userLists = parsedJSON.lists;
        }
        if (!skipSettings) {
            userSettings = parsedJSON.settings;
        }
        try {
            localStorage.setItem("maxID", maxID);
        } catch (e) {
            console.log(e);
            alert("Unexpected error occurred when writing to local storage. Your local storage may be full. " +
                "Consider disabling and purging your snapshots to free up space. This can be done from the " +
                "settings page. Otherwise you will need to delete some lists to free up space.");
        }
        for (const list of userLists) {
            try {
                localStorage.setItem(list.list_id, JSON.stringify(list));
            } catch (e) {
                console.log(e);
                alert("Unexpected error occurred when writing to local storage. Your local storage may be full. " +
                    "Consider disabling and purging your snapshots to free up space. This can be done from the " +
                    "settings page. Otherwise you will need to delete some lists to free up space.");
            }
        }
        try {
            localStorage.setItem("settings", JSON.stringify(userSettings));
        } catch (e) {
            console.log(e);
            alert("Unexpected error occurred when writing to local storage. Your local storage may be full. " +
                "Consider disabling and purging your snapshots to free up space. This can be done from the " +
                "settings page. Otherwise you will need to delete some lists to free up space.");
        }
        alert("Successfully imported settings.");
    }
}
