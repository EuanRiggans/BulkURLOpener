$(document).ready(function () {
    let tabCreationDelay = getSetting("tab_creation_delay");
    tabCreationDelay = tabCreationDelay * 1000;
    const tempArray = loadList("linksToOpen");
    const parsedList = JSON.parse(tempArray);
    const linksToOpen = [];
    for (const link of parsedList.list_links) {
        linksToOpen.push(link);
    }
    linksIterator(0, linksToOpen, tabCreationDelay);
    removeLinksToOpenList();
});

function linksIterator(i, strings, tabCreationDelay) {
    strings[i] = strings[i].trim();
    let ignoreURL = false;
    if (!(strings[i] === '') && !(strings[i] === "linksToOpen")) {
        let url = strings[i];
        if (!isProbablyUrl(url) && getSetting('non_url_handler') === "searchForString") {
            url = encodeSearchQuery(url);
        } else if (!isProbablyUrl(url) && getSetting('non_url_handler') === "ignoreString") {
            ignoreURL = true;
        } else if (!isProbablyUrl(url) && getSetting('non_url_handler') === "attemptToExtractURL") {
            const extractedString = extractURLFromString(url);
            if (isProbablyUrl(extractedString)) {
                url = extractedString;
            } else {
                ignoreURL = true;
            }
        }
        if (!ignoreURL) {
            if (checkHostType() === "firefox") {
                browser.tabs.create({
                    'url': url
                });
            } else if (checkHostType() === "chrome") {
                chrome.tabs.create({
                    active: false,
                    'url': url
                });
            }
        }
        i++;
        if (i - 1 < strings.length) {
            if (strings[i] == null || strings[i].trim() === '') {
                document.getElementById('loading').style.display = 'none';
                document.getElementById('completed').style.display = 'block';
                if (checkHostType() === "firefox") {
                    alert("Unable to close window due to Firefox security policy. Please close this window manually.");
                    // window.close();
                } else if (checkHostType() === "chrome") {
                    window.close();
                }
            }
            setTimeout(linksIterator, tabCreationDelay, i, strings, tabCreationDelay);
        }
    } else {
        i++;
        if (i >= strings.length) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('completed').style.display = 'block';
            if (checkHostType() === "firefox") {
                alert("Unable to close window due to Firefox security policy. Please close this window manually.");
                // window.close();
            } else if (checkHostType() === "chrome") {
                window.close();
            }
        }
        if (i < strings.length) {
            linksIterator(i, strings, tabCreationDelay);
        }
    }
}