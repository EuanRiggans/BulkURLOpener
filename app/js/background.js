/**
 * background.js
 *
 * Handles general actions that take place in the background of the addon. Only current use is to check if there is a
 * list to open on the browser launching. If there is it will call the function to open that list.
 */

(() => {
	let settingsObjPresent = false;
	// Checking if there is a settings object in the browers local storage
	for (let i = 0; i < localStorage.length; i++) {
		if (localStorage.key(i) === "settings") {
			settingsObjPresent = true;
		}
	}
	// If there is a settings object present, check if the user has set a list to open on browser startup
	if (settingsObjPresent) {
		const listToOpen = getSetting("open_on_launch");
		// If there is a list to open on startup, then open that list
		if (listToOpen !== "no_list") {
			backgroundOpenListByID(listToOpen);
		}
	}
})();
