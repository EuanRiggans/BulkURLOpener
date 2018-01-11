$(document).ready(function () {   
    $('#closeModal').click(function () {
        window.close();
    });
    $('#openChangelog').click(function () {
        chrome.tabs.create({'url': chrome.extension.getURL('changelog.html')});
    });
    $('#openSupportURL').click(function () {
        chrome.tabs.create({'url': "https:chrome.google.com/webstore/detail/"+chrome.runtime.id+"/support"});
    });
});