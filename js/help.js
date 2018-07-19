$(document).ready(function () {   
    $('#closeModal').click(function () {
        window.close();
    });
    $('#openChangelog').click(function () {
        chrome.tabs.create({'url': chrome.extension.getURL('changelog.html')});
    });
    $('#openSupportURLBugs').click(function () {
        chrome.tabs.create({'url': "https:chrome.google.com/webstore/detail/"+chrome.runtime.id+"/support"});
    });
    $('#openSupportURL').click(function () {
        chrome.tabs.create({'url': "https:chrome.google.com/webstore/detail/"+chrome.runtime.id+"/support"});
    });
    $('#experimentalReport').click(function () {
        chrome.tabs.create({'url': "https:chrome.google.com/webstore/detail/" + chrome.runtime.id + "/support"});
    });
    $('#openSupportURLFooter').click(function () {
        chrome.tabs.create({'url': "https:chrome.google.com/webstore/detail/"+chrome.runtime.id+"/support"});
    });
});