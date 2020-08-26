/**
 * delayedloading.js
 *
 * Will redirect the user to the set url when the "delayedloading" page is loaded.
 */

/* Event Listeners */

window.addEventListener("focus", () => {
    window.location.replace(document.getElementById("loadURL").innerText);
});

/* End Of Event Listeners */

(() => {
    document.getElementById("loadURL").innerText = decodeURIComponent(getParameterByName("url"));
    document.getElementById("page-title").innerText = decodeURIComponent(getParameterByName("url"));
})();
