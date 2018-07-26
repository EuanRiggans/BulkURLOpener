/**
 * Checks if the user has enabled night mode
 * @returns {boolean}   Whether night mode in enabled
 */
function isNightModeEnabled() {
    for (let i = 0; i < localStorage.length; i++) {
        const tempStorage = loadList(localStorage.key(i));
        if (localStorage.key(i) === "settings") {
            const userSettings = JSON.parse(tempStorage);
            return parseInt(userSettings.night_mode) === 1;
        }
    }
}

/**
 * Loads any extra stylesheets required by user settings
 */
(() => {
    if (isNightModeEnabled()) {
        const head = document.getElementsByTagName('head')[0];
        const nightModeStylesheet = document.createElement('link');
        nightModeStylesheet.href = "css/style-dark.css";
        nightModeStylesheet.rel = "stylesheet";
        head.appendChild(nightModeStylesheet);
        document.getElementById('tempStylesheetLoader').remove();
    }
})();