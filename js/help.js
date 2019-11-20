$(document).ready(function () {
    $('#closeModal').click(function () {
        if (checkHostType() === "firefox") {
            alert("Unable to close window due to Firefox security policy. Please close this window manually.");
            // window.close();
        } else if (checkHostType() === "chrome") {
            window.close();
        }
    });
    $('#openChangelog').click(function () {
        if (checkHostType() === "firefox") {
            browser.tabs.create({
                active: true,
                'url': browser.extension.getURL('changelog.html')
            });
        } else if (checkHostType() === "chrome") {
            chrome.tabs.create({
                'url': chrome.extension.getURL('changelog.html')
            });
        }
    });
});
