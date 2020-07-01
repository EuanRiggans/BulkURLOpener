let continueLoading = true;

/**
 * When the toggle opening button is clicked, toggle the opening status, and adjust the user interface to reflect
 * the changes.
 *
 * The button text is adjusted and the spinning status of the loading icon is toggled.
 */
document.getElementById('toggleOpening').addEventListener('click', () => {
    continueLoading = !continueLoading;
    if (continueLoading) {
        document.getElementById('loadingSpinner').classList.add('fa-spin');
        document.getElementById('toggleOpening').innerText = "Pause Opening"
    } else {
        document.getElementById('loadingSpinner').classList.remove('fa-spin');
        document.getElementById('toggleOpening').innerText = "Resume Opening"
    }
});

(() => {
    startOpening();
})();

function startOpening() {
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
}

function linksIterator(i, strings, tabCreationDelay) {
    strings[i] = strings[i].trim();
    if (!continueLoading) {
        setTimeout(linksIterator, tabCreationDelay, i, strings, tabCreationDelay);
        return;
    }
    if (!(strings[i] === '') && !(strings[i] === "linksToOpen")) {
        let url = strings[i];
        linksIteratorProcessURL(url);
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
                } else if (checkHostType() === "electron") {
                    window.location.replace("popup.html");
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
            } else if (checkHostType() === "electron") {
                window.location.replace("popup.html");
            }
        }
        if (i < strings.length) {
            linksIterator(i, strings, tabCreationDelay);
        }
    }
}
