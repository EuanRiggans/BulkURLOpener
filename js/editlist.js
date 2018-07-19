$(document).ready(function () {
    $listNameSelector = $('#listName');
    if (!(document.location.search.length) || getParameterByName('ID') == null || getParameterByName('name') == null) {
        alert("No list data present. Closing window.");
        window.close();
    }
    $('#listID').val(getParameterByName('ID'));
    $listNameSelector.val(getParameterByName('name'));
    const id = getParameterByName('ID');
    for (let i = 0; i < localStorage.length; i++) {
        const tempArray = loadList(localStorage.key(i));
        try {
            const parsedList = JSON.parse(tempArray);
            if (parsedList.list_id === parseInt(id)) {
                const listTextArea = document.getElementById("list");
                $('#list').val('');
                for (const link of parsedList.list_links) {
                    listTextArea.value += link + "\n";
                }
                listTextArea.select();
            }
        } catch (e) {

        }
    }
    $('#closeModal').click(function () {
        window.close();
    });
    $('#closeModalFooter').click(function () {
        window.close();
    });
    $('#saveList').click(function () {
        const listID = $('#listID').val();
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
        newList.list_name = $listNameSelector.val();
        const lines = $('#list').val().split('\n');
        for(let i = 0; i < lines.length; i++) {
            if(!(lines[i]) == "\n") {
                console.log(lines[i]);
                newList.list_links.push(lines[i]);
            }
        }
        if(lines.length <= 3) {
            alert("No URLs given for the list!");
            return;
        } else if ($listNameSelector.val().trim() === "") {
            alert("You need to give a name for your list!");
            return;
        }
        saveList(listID, newList);
    });
    $('#listName').select();
});