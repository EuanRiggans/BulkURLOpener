$(document).ready(function () {
    const $listNameSelector = $('#listName');
    for (let i = 0; i < localStorage.length; i++){
        if (localStorage.key(i) === "temp") {
            const listTextArea = document.getElementById("list");
            $('#list').val('');
            try {
                const parsedList = JSON.parse(loadList(localStorage.key(i)));
                for (const link of parsedList.list_links) {
                    listTextArea.value += link + "\n";
                }
            } catch (e) {

            }
            removeTempList();
            listTextArea.select(); 
        }        
    } 
    $('#closeModal').click(function () {
        window.close();
    });
    $('#closeModalFooter').click(function () {
        window.close();
    });
    $('#saveList').click(function () {
        const $linksListSelector = $('#list');
        const listID = getNextAvailableID();
        const newList = {
            object_description: "list_storage",
            list_id: null,
            list_name: null,
            list_links: []
        };
        newList.list_id = listID;
        newList.list_name = $listNameSelector.val();
        const lines = $linksListSelector.val().split('\n');
        for(let i = 0; i < lines.length; i++) {
            if(!(lines[i]) == "\n") {
                console.log(lines[i]);
                newList.list_links.push(lines[i]);
            }            
        }
        if ($linksListSelector.val().trim() === "") {
            alert("No URLs given for the list!");
            return;
        } else if($('#listName').val().trim() === "") {
            alert("You need to give a name for your list!");
            return;
        }
        saveList(listID, newList);
    });
    $listNameSelector.select();
});