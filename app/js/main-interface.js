/**
 * bulkopen.js
 *
 * Code for the main popup.html
 */

/* Default event listeners */

document.getElementById("list").addEventListener("input", saveUserInput);

document.getElementById("openButton").addEventListener("click", () => {
	openTextAreaList();
});

document.getElementById("copyCurrentOpen").addEventListener("click", () => {
	getCurrentTabs();
});

document.getElementById("clearList").addEventListener("click", () => {
	clearLinksList();
});

document.getElementById("createNewList").addEventListener("click", () => {
	openSaveNewListDialog();
});

document.getElementById("openList").addEventListener("click", () => {
	openSelectedList();
});

document.getElementById("editList").addEventListener("click", () => {
	editSelectedList();
});

document.getElementById("deleteList").addEventListener("click", () => {
	deleteList();
});

document.getElementById("openSettings").addEventListener("click", () => {
	openSettingsDialog();
});

document.getElementById("openHelp").addEventListener("click", () => {
	openHelpDialog();
});

document.getElementById("savedLists").addEventListener("change", () => {
	if (getSetting("auto_load_into_textarea") === 1) {
		openSelectedList();
	}
});

/* End Of Event Listeners */

(() => {
	upgradeToJSONFormatting();

	createSettings();

	if (getSetting("auto_open_lists") === 1) {
		if (getSetting("custom_theme") === "fluentDesignBootstrap") {
			const html = "<div class=\"form-check pl-0 checkbox\"><input class=\"form-check-input\" type=\"checkbox\" value=\"\" id=\"overrideAutoOpen\"><label class=\"form-check-label\" for=\"overrideAutoOpen\">&nbsp;Override Auto Open</label></div>";
			appendHtml(document.getElementById("controls"), html);
		} else {
			const html = "<label for=\"overrideAutoOpen\"><input type=\"checkbox\" id=\"overrideAutoOpen\">&nbsp;Override Auto Open</label>";
			appendHtml(document.getElementById("controls"), html);
		}
		document.getElementById("savedLists").addEventListener("change", () => {
			if (document.getElementById("overrideAutoOpen")) {
				if (!(document.getElementById("overrideAutoOpen").checked)) {
					if (getSetting("auto_open_lists") === 1) {
						openSelectedList();
						openTextAreaList();
					}
				}
			}
		});
	}

	if (getSetting("default_list_open") === -1 || getSetting("default_list_open") === undefined) {
		if (!(checkHostType() === "electron")) {
			getCurrentTabs();
		}
	} else if (getSetting("default_list_open") === -2 && previousInputExists()) {
		getPreviousTabsFromLocalStorage();
	} else {
		openListByID(getSetting("default_list_open"));
	}

	for (let i = 0; i < localStorage.length; i++) {
		const tempStorageArray = loadList(localStorage.key(i));
		try {
			const parsedList = JSON.parse(tempStorageArray);
			if (parsedList.object_description === "list_storage") {
				const html = `<option id="${parsedList.list_id}">${parsedList.list_name}</option>`;
				appendHtml(document.getElementById("savedLists"), html);
			}
		} catch (e) {
			console.log(e);
		}
	}

	if (getParameterByName("popup", window.location) === "true") {
		document.getElementById("openInPopup").remove();
	} else {
		document.getElementById("openInPopup").addEventListener("click", () => {
			popupMain();
		});
	}

	if (checkHostType() === "electron") {
		document.getElementById("openInPopup").remove();
		document.getElementById("copyCurrentOpen").remove();
	}

	document.getElementById("version").textContent = `- Version ${getCurrentVersion()}`;
})();

/**
 *  Will open all of the urls in the textarea
 */
function openTextAreaList() {
	openList(document.getElementById("list").value);
}

/**
 * Gets all of the urls for the currently opened tabs
 */
function getCurrentTabs() {
	let currentWindowSetting = getSetting("currently_opened_tabs_display") !== "allOpenedTabs";
	if (currentWindowSetting === false) {
		currentWindowSetting = undefined;
	}
	if (checkHostType() === "firefox") {
		browser.tabs.query({
			currentWindow: currentWindowSetting,
		}, (tabs) => {
			const tabsArray = [];
			for (const tab of tabs) {
				tabsArray.push(tab.url);
			}
			if (!tabsArray.length) {
				return;
			}
			const listTextArea = document.getElementById("list");
			clearLinksList();
			for (let i = 0; i < tabs.length; ++i) {
				listTextArea.value += `${tabsArray[i]}\n`;
			}
			listTextArea.select();
		});
	} else if (checkHostType() === "chrome") {
		chrome.tabs.query({
			currentWindow: currentWindowSetting,
		}, (tabs) => {
			const tabsArray = [];
			for (const tab of tabs) {
				tabsArray.push(tab.url);
			}
			if (!tabsArray.length) {
				return;
			}
			const listTextArea = document.getElementById("list");
			clearLinksList();
			for (let i = 0; i < tabs.length; ++i) {
				listTextArea.value += `${tabsArray[i]}\n`;
			}
			listTextArea.select();
		});
	} else {
		alert("Could not detect which browser you are using.");
	}
}

/**
 * Sets the list text area to contain the urls from that were saved into local storage. Used for the 'Previous urls'
 * setting.
 */
function getPreviousTabsFromLocalStorage() {
	const listTextArea = document.getElementById("list");
	const previousURLS = JSON.parse(localStorage.getItem("previous_list_input"));
	for (let i = 0; i < previousURLS.length; ++i) {
		listTextArea.value += `${previousURLS[i]}\n`;
	}
	listTextArea.select();
}

/**
 * Clears all of the urls from the textarea
 */
function clearLinksList() {
	const listTextArea = document.getElementById("list");
	listTextArea.value = "";
}

/**
 * Handles the opening of lists
 * @param list  The list of urls to open
 */
function openList(list) {
	let strings = list.split(/\r\n|\r|\n/);
	if (getSetting("open_urls_in_reverse_order") === 1) {
		strings = strings.reverse();
	}
	let tabCreationDelay = getSetting("tab_creation_delay");
	if (!(tabCreationDelay > 0) || !(strings.length > 1)) {
		for (let i = 0; i < strings.length; i++) {
			if (strings[i].trim() === "") {
				strings.splice(i, 1);
				i--;
			}
		}
		tabCreationDelay *= 1000;
		linksIterator(0, strings, tabCreationDelay);
	} else {
		const linksToOpen = {
			object_description: "link_to_open",
			list_links: [],
		};
		for (const link of strings) {
			linksToOpen.list_links.push(link);
		}
		localStorage.setItem("linksToOpen", JSON.stringify(linksToOpen));
		if (checkHostType() === "firefox") {
			browser.tabs.create({
				active: true,
				url: browser.extension.getURL("openingtabs.html"),
			});
		} else if (checkHostType() === "chrome") {
			chrome.tabs.create({
				url: chrome.extension.getURL("openingtabs.html"),
			});
		} else if (checkHostType() === "electron") {
			window.location.replace("openingtabs.html");
		}
	}
}

/**
 * Recursive function to iterate through a list of urls to open
 * @param i                 Counter
 * @param strings           The urls to open
 * @param tabCreationDelay  The delay between opening a new url
 */
function linksIterator(i, strings, tabCreationDelay) {
	strings[i] = strings[i].trim();
	if (strings[i] === "") {
		return;
	}
	const last = strings[i + 1] === undefined;
	const url = strings[i];
	linksIteratorProcessURL(url, last);
	i++;
	if (i < strings.length) {
		setTimeout(linksIterator, tabCreationDelay, i, strings, tabCreationDelay);
	}
}

/**
 * Opens the page to create a new list of urls
 */
function openSaveNewListDialog() {
	const lines = document.getElementById("list").value.split("\n");
	const tempList = {
		object_description: "temp_storage",
		list_links: [],
	};
	for (let i = 0; i < lines.length; i++) {
		if (!(lines[i]) == "\n") {
			tempList.list_links.push(lines[i]);
		}
	}
	localStorage.setItem("temp", JSON.stringify(tempList));
	if (checkHostType() === "firefox") {
		browser.tabs.create({
			active: true,
			url: browser.extension.getURL("/pages/lists/new.html"),
		});
	} else if (checkHostType() === "chrome") {
		chrome.tabs.create({
			url: chrome.extension.getURL("/pages/lists/new.html"),
		});
	} else if (checkHostType() === "electron") {
		window.location.replace("./pages/lists/new.html");
	}
}

/**
 * Loads the urls for the selected list into the text area
 */
function openSelectedList() {
	if (getSelectedListID() === "-1") {
		alert("You need to select a list");
		return;
	}
	for (let i = 0; i < localStorage.length; i++) {
		const tempArray = loadList(localStorage.key(i));
		try {
			const parsedList = JSON.parse(tempArray);
			if (parsedList.list_id === parseInt(getSelectedListID())) {
				const listTextArea = document.getElementById("list");
				clearLinksTextArea();
				for (const link of parsedList.list_links) {
					listTextArea.value += `${link}\n`;
				}
				listTextArea.select();
			}
		} catch (e) {
			console.log(e);
		}
	}
}

/**
 * Will load a given lists urls into the text area in the popup
 * @param id    The id of the list to get urls from
 */
function openListByID(id) {
	for (let i = 0; i < localStorage.length; i++) {
		const tempArray = loadList(localStorage.key(i));
		try {
			const parsedList = JSON.parse(tempArray);
			if (parsedList.list_id === parseInt(id)) {
				const listTextArea = document.getElementById("list");
				clearLinksTextArea();
				for (const link of parsedList.list_links) {
					listTextArea.value += `${link}\n`;
				}
				listTextArea.select();
			}
		} catch (e) {
			console.log(e);
		}
	}
}

/**
 * Opens the settings page
 */
function openSettingsDialog() {
	if (checkHostType() === "firefox") {
		browser.tabs.create({
			active: true,
			url: browser.extension.getURL("/pages/settings/index.html"),
		});
	} else if (checkHostType() === "chrome") {
		chrome.tabs.create({
			url: chrome.extension.getURL("/pages/settings/index.html"),
		});
	} else if (checkHostType() === "electron") {
		window.location.replace("./pages/settings/index.html");
	}
}

/**
 * Opens the help page
 */
function openHelpDialog() {
	if (checkHostType() === "firefox") {
		browser.tabs.create({
			active: true,
			url: browser.extension.getURL("/pages/help/index.html"),
		});
	} else if (checkHostType() === "chrome") {
		chrome.tabs.create({
			url: chrome.extension.getURL("/pages/help/index.html"),
		});
	} else if (checkHostType() === "electron") {
		window.location.replace("./pages/help/index.html");
	}
}

/**
 * Deletes a list
 */
function deleteList() {
	if (getSelectedListID() === "-1") {
		alert("You need to select a list");
		return;
	}
	// Cannot confirm on Firefox as alerts will close popup
	if (checkHostType() === "firefox") {
		removeList(getSelectedListID());
		return;
	}
	if (confirm(`Are you sure you wish to delete the list: ${getSelectedList()}`)) {
		removeList(getSelectedListID());
	}
}

/**
 * Creates a window to edit the selected list
 */
function editSelectedList() {
	if (getSelectedListID() === "-1") {
		alert("You need to select a list");
		return;
	}
	if (checkHostType() === "firefox") {
		browser.tabs.create({
			active: true,
			url: browser.extension.getURL(`/pages/lists/edit.html?id=${getSelectedListID()}&name=${getSelectedList()}`),
		});
	} else if (checkHostType() === "chrome") {
		chrome.tabs.create({
			url: chrome.extension.getURL(`/pages/lists/edit.html?id=${getSelectedListID()}&name=${getSelectedList()}`),
		});
	} else if (checkHostType() === "electron") {
		window.location.replace(`./pages/lists/edit.html?id=${getSelectedListID()}&name=${getSelectedList()}`);
	}
}

/**
 *  Gets the selected list name
 * @returns {string | jQuery}   Selected list name
 */
function getSelectedList() {
	return document.getElementById("savedLists").options[document.getElementById("savedLists").selectedIndex].text;
}

/**
 * Gets the currently selected list id
 * @returns {string | jQuery}   List id
 */
function getSelectedListID() {
	return document.getElementById("savedLists").options[document.getElementById("savedLists").selectedIndex].id;
}

/**
 * Creates the extension in a popup window
 */
function popupMain() {
	if (checkHostType() === "firefox") {
		browser.windows.create({
			url: "popup.html?popup=true",
			type: "popup",
			width: 755,
			height: 610,
		});
	} else if (checkHostType() === "chrome") {
		chrome.windows.create({
			url: "popup.html?popup=true",
			type: "popup",
			width: 755,
			height: 610,
		});
	}
}

/**
 * Saves the input in the 'list' text area into browser storage so that it can be re-used if the
 * 'Default list to display' setting is set to 'Previous urls'
 */
function saveUserInput() {
	localStorage.setItem("previous_list_input", JSON.stringify(document.getElementById("list").value.split(/\r\n|\r|\n/)));
}

/**
 * Checks if there is a key of 'previous_list_input' in the local storage to be retrieved for the 'Previous urls'
 * setting
 */
function previousInputExists() {
	return localStorage.getItem("previous_list_input") !== null;
}

/**
 * Upgrades users from the old array based storage to the new JSON based storage
 */
function upgradeToJSONFormatting() {
	for (let i = 0; i < localStorage.length; i++) {
		const tempArray = loadList(localStorage.key(i));
		if (tempArray[0] === "listStorage") {
			const newList = {
				object_description: "list_storage",
				list_id: parseInt(tempArray[1]),
				list_name: tempArray[2],
				list_links: [],
			};
			for (let i = 3; i < tempArray.length; i++) {
				newList.list_links.push(tempArray[i]);
			}
			localStorage.setItem(tempArray[1], JSON.stringify(newList));
		} else if (tempArray[0] === "settings") {
			const newSettings = {
				object_description: "user_settings",
				tab_creation_delay: parseInt(tempArray[1]),
				night_mode: 0,
				auto_open_lists: 0,
				default_list_open: -1,
				custom_theme: "defaultBoostrap",
			};
			localStorage.setItem("settings", JSON.stringify(newSettings));
		}
	}
}

/**
 * Clears all data from the text area
 */
function clearLinksTextArea() {
	document.getElementById("list").value = "";
}

String.prototype.trim = function () {
	return this.replace(/^\s+|\s+$/g, "");
};
