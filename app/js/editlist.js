/**
 * editlist.js
 *
 * Handles the saving of edited lists to localstorage
 */

const listNameElement = document.getElementById('listName');

/* Event Listeners */

document.getElementById('closeModal').addEventListener('click', () => {
    if (checkHostType() === "firefox") {
        alert("Unable to close window due to Firefox security policy. Please close this window manually.");
        // window.close();
    } else if (checkHostType() === "chrome") {
        window.close();
    } else if (checkHostType() === "electron") {
        window.location.replace("popup.html");
    }
});
document.getElementById('saveList').addEventListener('click', () => {
    const listID = document.getElementById('listID').value;
    const listName = listNameElement.value;
    removeList(listID, true);
    const newList = {
        object_description: "list_storage",
        list_id: null,
        list_name: null,
        list_links: []
    };
    try {
        newList.list_id = parseInt(listID);
    } catch (e) {

    }
    newList.list_name = listName;
    const lines = document.getElementById("list").value.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (!(lines[i]) == "\n") {
            console.log(lines[i]);
            newList.list_links.push(lines[i]);
        }
    }
    if (lines.length <= 1) {
        alert("No URLs given for the list!");
        return;
    } else if (listName === "") {
        alert("You need to give a name for your list!");
        return;
    }
    saveList(listID, newList);
});

/* End Of Event Listeners */

(() => {
    if (!(document.location.search.length) || getParameterByName('ID') == null || getParameterByName('name') == null) {
        alert("No list data present.");
        if (checkHostType() === "firefox") {
            // window.close();
        } else if (checkHostType() === "chrome") {
            window.close();
        } else if (checkHostType() === "electron") {
            window.location.replace("popup.html");
        }
    }
    document.getElementById('listID').value = getParameterByName('ID');
    document.getElementById('listName').value = getParameterByName('name');
    const id = getParameterByName('ID');
    for (let i = 0; i < localStorage.length; i++) {
        const tempArray = loadList(localStorage.key(i));
        try {
            const parsedList = JSON.parse(tempArray);
            if (parsedList.list_id === parseInt(id)) {
                const listTextArea = document.getElementById("list");
                document.getElementById('list').value = "";
                for (const link of parsedList.list_links) {
                    listTextArea.value += link + "\n";
                }
                listTextArea.select();
            }
        } catch (e) {

        }
    }
    document.getElementById('listName').focus();
})();
