(() => {

    document.getElementById("help-footer").innerText = getFooterText();

    document.getElementById('openGithub').addEventListener('click', () => {
        openGithub();
    });
    document.getElementById('openGithubBugs').addEventListener('click', () => {
        openIssues();
    });
    document.getElementById('openGithubSuggestions').addEventListener('click', () => {
        openIssues();
    });
})();

$('#closeModal').click(function () {
    if (checkHostType() === "firefox") {
        alert("Unable to close window due to Firefox security policy. Please close this window manually.");
        // window.close();
    } else if (checkHostType() === "chrome") {
        window.close();
    } else if (checkHostType() === "electron") {
        window.location.replace("popup.html");
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
    } else if (checkHostType() === "electron") {
        window.location.replace("changelog.html");
    }
});

function openGithub() {
    const githubURL = "https://euan.link/github";
    if (checkHostType() === "electron") {
        const {
            shell
        } = require('electron');
        shell.openExternal(githubURL);
    } else if (checkHostType() === "firefox") {
        browser.tabs.create({
            active: true,
            'url': githubURL
        });
    } else if (checkHostType() === "chrome") {
        chrome.tabs.create({
            'url': githubURL
        });
    }
}

function openIssues() {
    const issuesURL = "https://euan.link/buo-ff-issue";
    if (checkHostType() === "electron") {
        const {
            shell
        } = require('electron');
        shell.openExternal("https://euan.link/buo-ff-issue");
    } else if (checkHostType() === "firefox") {
        browser.tabs.create({
            active: true,
            'url': issuesURL
        });
    } else if (checkHostType() === "chrome") {
        chrome.tabs.create({
            'url': issuesURL
        });
    }
}