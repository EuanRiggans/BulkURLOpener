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
            openListByID(listToOpen);
        }
    }
})();

/**
 * Will load a given lists urls into the text area in the popup
 * @param id    The id of the list to get urls from
 */
function openListByID(id) {
    let linksToOpen = [];
    for (let i = 0; i < localStorage.length; i++) {
        const tempArray = loadList(localStorage.key(i));
        try {
            const parsedList = JSON.parse(tempArray);
            if (parsedList.list_id === parseInt(id)) {
                for (const link of parsedList.list_links) {
                    linksToOpen.push(link);
                }
            }
        } catch (e) {

        }
    }
    openList(linksToOpen);
}

/**
 * Handles the opening of lists
 * @param list  The list of urls to open
 */
function openList(list) {
    const strings = list;
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
            window.location.replace('openingtabs.html');
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