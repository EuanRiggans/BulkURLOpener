/**
 * newlist.js
 *
 * Saves users new lists to local storage.
 */

const listNameElement = document.getElementById("listName");

/* Event Listeners */

document.getElementById("closeModal").addEventListener("click", () => {
	if (checkHostType() === "firefox") {
		alert("Unable to close window due to Firefox security policy. Please close this window manually.");
		// window.close();
	} else if (checkHostType() === "chrome") {
		window.close();
	} else if (checkHostType() === "electron") {
		window.location.replace("../../popup.html");
	}
});
document.getElementById("saveList").addEventListener("click", () => {
	const listID = getNextAvailableID();
	const newList = {
		object_description: "list_storage",
		list_id: null,
		list_name: null,
		list_links: [],
	};
	newList.list_id = listID;
	newList.list_name = listNameElement.value;
	const lines = document.getElementById("list").value.split("\n");
	for (let i = 0; i < lines.length; i++) {
		if (!(lines[i]) == "\n") {
			console.log(lines[i]);
			newList.list_links.push(lines[i]);
		}
	}
	if (document.getElementById("list").value.trim() === "") {
		alert("No URLs given for the list!");
		return;
	}
	if (document.getElementById("list").value.trim() === "") {
		alert("You need to give a name for your list!");
		return;
	}
	saveList(listID, newList);
});

/* End Of Event Listeners */

(() => {
	for (let i = 0; i < localStorage.length; i++) {
		if (localStorage.key(i) === "temp") {
			const listTextArea = document.getElementById("list");
			document.getElementById("list").value = "";
			try {
				const parsedList = JSON.parse(loadList(localStorage.key(i)));
				for (const link of parsedList.list_links) {
					listTextArea.value += `${link}\n`;
				}
			} catch (e) {
				console.log(e);
			}
			removeTempList();
			listTextArea.select();
		}
	}
	listNameElement.focus();
})();
