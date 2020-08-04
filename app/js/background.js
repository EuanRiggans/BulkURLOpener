/**
 * background.js
 *
 * Handles general actions that take place in the background of the addon. Only current use is to check if there is a
 * list to open on the browser launching. If there is it will call the function to open that list.
 */

(() => {
    let settingsObjPresent = false;
    for (let i = 0; i < localStorage.length; i++) {
        if (localStorage.key(i) === "settings") {
            settingsObjPresent = true;
        }
    }
    if (settingsObjPresent) {
        const listToOpen = getSetting("open_on_launch");
        if (listToOpen !== "no_list") {
            backgroundOpenListByID(listToOpen);
        }
    }
})();
