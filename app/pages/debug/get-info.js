/**
 * get-info.js
 *
 * Takes all of the users settings and lists and creates a JSON object which can then be used to import all of the users
 * settings and lists on a different browser or device.
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

/* End Of Event Listeners */

(() => {
    buildDebugData();
})();

function buildDebugData() {
    const exportTextArea = document.getElementById("debugInfoTextArea");
    let exportData = {
        settings: {},
    };
    for (let i = 0; i < localStorage.length; i++) {
        const tempStorage = loadList(localStorage.key(i));
        const parsedJSON = JSON.parse(tempStorage);
        if (localStorage.key(i) === "settings") {
            exportData.settings = parsedJSON;
        }
    }
    exportData = JSON.stringify(exportData);
    exportTextArea.value = exportData;
    exportTextArea.select();
}
