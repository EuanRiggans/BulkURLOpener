$(document).ready(function () {   
    $('#closeModal').click(function () {
        window.close();
    });
    $('#openChangelog').click(function () {
        chrome.tabs.create({'url': chrome.extension.getURL('changelog.html')});
    });
});