function saveList(Id, newListObject) {
    localStorage.setItem(Id, JSON.stringify(newListObject));
    localStorage.setItem("maxID", Id);
    alert("List saved successfully!");
    window.close();
}

function saveSettings(userSettings) {
    removeList("settings", false);
    localStorage.setItem("settings", JSON.stringify(userSettings));
    alert("Settings successfully saved!");
    window.close();
}

function loadList(Id) {
    const results = localStorage.getItem(Id);
    try {
        return results;
    } catch (e) {
        return e;
    }
}

function getCurrentMaxID() {
    if (localStorage.getItem("maxID") == "NaN") {
        return 0;
    }
    return localStorage.getItem("maxID");
}

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

function removeTempList() {
    for (let i = 0; i < localStorage.length; i++) {
        const tempArray = loadList(localStorage.key(i));
        if (localStorage.key(i) === "temp") {
            localStorage.removeItem(localStorage.key(i));
        }
    }
}

function removeLinksToOpenList() {
    for (let i = 0; i < localStorage.length; i++) {
        const tempArray = loadList(localStorage.key(i));
        if (localStorage.key(i) === "linksToOpen") {
            localStorage.removeItem(localStorage.key(i));
        }
    }
}

function getNextAvailableID() {
    let availableID;
    availableID = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const results = localStorage.getItem(localStorage.key(i));
        try {
            const result = JSON.parse(results);
            if (result.object_description === "list_storage") {
                availableID = result.list_id + 1;
            }
        } catch (e) {
            //Not a JSON list
        }
    }
    return availableID;
}

function getParameterByName(name, url) {
    //Gets variable from query string by name. Use: var VIDINURL = getParameterByName('VID');
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

function removeQueryString(URL) {
    //Removes the query string from a URL provided Use: var URL = window.location.href; URL = removeQueryString(URL);
    URL = URL.replace(/(\?.*)|(#.*)/g, "");
    return URL;
}

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