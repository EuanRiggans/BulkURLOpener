/**
 * Saves a list to local storage
 * @param Id                The id of the list
 * @param newListObject     The object containing the data for the list
 */
function saveList(Id, newListObject) {
    localStorage.setItem(Id, JSON.stringify(newListObject));
    localStorage.setItem("maxID", Id);
    alert("List saved successfully!");
    window.close();
}

/**
 * Saves users settings to local storage
 * @param userSettings  The users settings object
 */
function saveSettings(userSettings) {
    removeList("settings", false);
    localStorage.setItem("settings", JSON.stringify(userSettings));
    alert("Settings successfully saved!");
    window.close();
}

/**
 * Gets a list from local storage
 * @param Id    The list ID
 * @returns {*} The list object
 */
function loadList(Id) {
    const results = localStorage.getItem(Id);
    try {
        return results;
    } catch (e) {
        return e;
    }
}

/**
 * Returns the current max id
 * @returns {*} The current max id
 */
function getCurrentMaxID() {
    if (localStorage.getItem("maxID") == "NaN") {
        return 0;
    }
    return localStorage.getItem("maxID");
}

/**
 * Removes a list from local storage
 * @param id        The ID of the list to remove
 * @param noAlert   Whether a alert should be shown when list is deleted
 */
function removeList(id, noAlert) {
    for (let i = 0; i < localStorage.length; i++) {
        const tempArray = loadList(localStorage.key(i));
        try {
            const parsedList = JSON.parse(tempArray);
            if (parsedList.list_id === parseInt(id)) {
                localStorage.removeItem(localStorage.key(i));
                $('select option[id="' + id + '"]').remove();
                if (!(noAlert)) {
                    alert("List successfully deleted");
                }
            }
        } catch (e) {

        }
    }
}

/**
 * Removes the temporary list that is created when creating a new list
 */
function removeTempList() {
    for (let i = 0; i < localStorage.length; i++) {
        if (localStorage.key(i) === "temp") {
            localStorage.removeItem(localStorage.key(i));
        }
    }
}

/**
 * Removes the temporary list created when using tab creation delay
 */
function removeLinksToOpenList() {
    for (let i = 0; i < localStorage.length; i++) {
        if (localStorage.key(i) === "linksToOpen") {
            localStorage.removeItem(localStorage.key(i));
        }
    }
}

/**
 * Gets the next available ID for a list
 * @returns {number}    The next available id
 */
function getNextAvailableID() {
    let availableID;
    availableID = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const results = localStorage.getItem(localStorage.key(i));
        try {
            if (localStorage.key(i) === "maxID") {
                availableID = parseInt(results) + 1;
            }
        } catch (e) {
            alert("Unexpected error occurred");
        }
    }
    return availableID;
}

/**
 * Gets the value of a parameter in the query string
 * @param name  The name of the parameter
 * @param url   The URL that contains the query string
 * @returns {string | null} The value of the parameter
 */
function getParameterByName(name, url) {
    if (!url) {
        url = window.location.href;
    }
    name = name.replace(/[\[\]]/g, "\\$&");
    let regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)", "i"),
        results = regex.exec(url);
    if (!results) {
        return null;
    }
    if (!results[2]) {
        return '';
    }
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}

/**
 * Removes the query string from the URL
 * @param URL   The URL to remove the query string from
 * @returns {string | void | *} The url with query string removed
 */
function removeQueryString(URL) {
    //Removes the query string from a URL provided Use: var URL = window.location.href; URL = removeQueryString(URL);
    URL = URL.replace(/(\?.*)|(#.*)/g, "");
    return URL;
}

/**
 * Outputs all data currently in the extensions local storage
 */
function outputAllLists() {
    let counter = 0;
    for (let i = 0; i < localStorage.length; i++) {
        console.dir(loadList(localStorage.key(i)));
        counter = i;
    }
    if (counter === 0) {
        console.log("No lists found");
    }
}