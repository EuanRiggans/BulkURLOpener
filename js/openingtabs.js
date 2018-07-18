$(document).ready(function () {
    let tabCreationDelay = getSetting("tab_creation_delay");
    tabCreationDelay = tabCreationDelay * 1000;
    const strings = loadList("linksToOpen");
    for (let i = 0; i<strings.length; i++) {
        if(strings[i].trim() === '') {
            strings.splice(i, 1);
            i--;
        }
    }
    linksIterator(0, strings, tabCreationDelay);
    removeLinksToOpenList();
});

function linksIterator(i, strings, tabCreationDelay) {
    strings[i] = strings[i].trim();
    if (!(strings[i] === '') && !(strings[i] === "linksToOpen")) {
        var url = strings[i];
        if (!isProbablyUrl(url)) {
            url = 'http://www.google.com/search?q=' + encodeURI(url);
        }
        chrome.tabs.create({'url':url,'selected':false});
        i++;
        if(i - 1 < strings.length) {
            if(strings[i] == null || strings[i].trim() === '') {
                window.close();
            }
            setTimeout(linksIterator, tabCreationDelay, i, strings, tabCreationDelay);
        }
    } else {
        i++;
        if(i >= strings.length) {
            window.close();
        }
        if(i < strings.length) {
            linksIterator(i, strings, tabCreationDelay);            
        }
    }
}

function isProbablyUrl(string) {
    let substr = string.substring(0, 4).toLowerCase();
    if (substr === 'ftp:' || substr === 'www.') {
        return true;
    }

    substr = string.substring(0, 5).toLowerCase();
    if (substr === 'http:') {
        return true;
    }

    substr = string.substring(0, 6).toLowerCase();
    if (substr === 'https:') {
        return true;
    }

    substr = string.substring(0, 7).toLowerCase();
    if (substr === 'chrome:') {
        return true;
    }

	return false;
}

function getSetting(setting) {
    const settingSelected = setting.toLowerCase();
    for (let i = 0; i < localStorage.length; i++){
        const tempArray = loadList(localStorage.key(i));
        if(localStorage.key(i) === "settings") {
            const userSettings = JSON.parse(tempArray);
            console.dir(userSettings);
            switch(settingSelected) {
                case "tab_creation_delay":
                    return userSettings.tab_creation_delay;
                    break;
                case "auto_open_lists":
                    return userSettings.auto_open_lists;
                    break;
                default:
                    break;
            }
        }
    }
}