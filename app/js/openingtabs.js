/**
 * openingtabs.js
 *
 *  Handles the delayed opening tabs. Will open new tabs at the interval provided by the user.
 */

let continueLoading = true;

/* Event Listeners */

document.getElementById("toggleOpening").addEventListener("click", toggleLoadingStatus);

/* End Of Event Listeners */

(() => {
    startOpening();
})();

function startOpening() {
    let tabCreationDelay = getSetting("tab_creation_delay");
    tabCreationDelay *= 1000;
    const tempArray = loadList("linksToOpen");
    const parsedList = JSON.parse(tempArray);
    const linksToOpen = [];
    for (const link of parsedList.list_links) {
        linksToOpen.push(link);
    }
    linksIterator(0, linksToOpen, tabCreationDelay);
    removeLinksToOpenList();
}

/**
 * When the toggle opening button is clicked, toggle the opening status, and adjust the user interface to reflect
 * the changes.
 *
 * The button text is adjusted and the spinning status of the loading icon is toggled.
 */
function toggleLoadingStatus() {
    continueLoading = !continueLoading;
    if (continueLoading) {
        document.getElementById("loadingSpinner").classList.remove("fa-pause");
        document.getElementById("loadingSpinner").classList.add("fa-spin");
        document.getElementById("toggleOpening").innerText = "Pause Opening";
    } else {
        document.getElementById("loadingSpinner").classList.remove("fa-spin");
        document.getElementById("loadingSpinner").classList.add("fa-pause");
        document.getElementById("toggleOpening").innerText = "Resume Opening";
    }
}

function linksIterator(i, strings, tabCreationDelay) {
    document.getElementById("tabs-to-be-opened").innerText = "";
    for(let x = i + 1; x < strings.length; x++) {
        let linkToBeOpened = document.createElement("div");
        let linkToBeOpenedHREF = document.createElement("a");
        linkToBeOpenedHREF.innerText = strings[x];
        linkToBeOpenedHREF.href = strings[x];
        linkToBeOpened.append(linkToBeOpenedHREF);
        document.getElementById("tabs-to-be-opened").append(linkToBeOpened);
    }
    if (strings[i] !== undefined) {
        strings[i] = strings[i].trim();
    }
    if (!continueLoading) {
        setTimeout(linksIterator, tabCreationDelay, i, strings, tabCreationDelay);
        return;
    }
    if (!(strings[i] === "") && !(strings[i] === "linksToOpen") && !(strings[i] === undefined)) {
        const url = strings[i];
        linksIteratorProcessURL(url);
        i++;
        if (i - 1 < strings.length) {
            setTimeout(linksIterator, tabCreationDelay, i, strings, tabCreationDelay);
        }
    } else {
        i++;
        if (i >= strings.length) {
            document.getElementById("loading").style.display = "none";
            document.getElementById("completed").style.display = "block";
            if (checkHostType() === "firefox") {
                alert("Unable to close window due to Firefox security policy. Please close this window manually.");
                // window.close();
            } else if (checkHostType() === "chrome") {
                window.close();
            } else if (checkHostType() === "electron") {
                window.location.replace("popup.html");
            }
            return;
        }
        if (i < strings.length) {
            linksIterator(i, strings, tabCreationDelay);
        }
    }
}
