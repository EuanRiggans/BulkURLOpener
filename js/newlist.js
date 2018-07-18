$(document).ready(function () {
    for (let i = 0; i < localStorage.length; i++){
        const tempArray = loadList(localStorage.key(i));
        if(tempArray[0] === "temp") {
            const listTextArea = document.getElementById("list");
            $('#list').val('');              
            for (i = 1; i<tempArray.length; ++i) {
                listTextArea.value += tempArray[i] + "\n";
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
        const listID = getNextAvailableID();
        const newList = {
            object_description: "list_storage",
            list_id: null,
            list_name: null,
            list_links: []
        };
        newList.list_id = listID;
        newList.list_name = $('#listName').val();
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
        } else if($('#listName').val().trim() === "") {
            alert("You need to give a name for your list!");
            return;
        }
        saveList(listID, newList);
    });
    $('#listName').select();
});