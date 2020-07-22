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
