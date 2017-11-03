$(document).ready(function () {   
    for (var i = 0; i < localStorage.length; i++){
        var tempArray = loadList(localStorage.key(i));        
        if(tempArray[0] == "temp") {    
            var listTextArea = document.getElementById("list");
            $('#list').val('');              
            for (var i=1; i<tempArray.length; ++i) {
                listTextArea.value += tempArray[i] + "\n";
            }            
            removeList("temp", true);
            listTextArea.select(); 
        }        
    } 
    $('#closeModal').click(function () {
        window.close();
    });
    $('#saveList').click(function () {
        var listID = getNextAvailableID();
        var arrayOfLines = new Array();
        arrayOfLines.push(listID);
        arrayOfLines.push($('#listName').val());    
        var lines = $('#list').val().split('\n');
        for(var i = 0;i < lines.length;i++) {
            arrayOfLines.push(lines[i]);        
        }
        if(arrayOfLines.length <= 3) {
            alert("No URLs given for the list!");
            return;
        } else if($('#listName').val().trim() == "") {
            alert("You need to give a name for your list!");
            return;
        }
        saveList(listID, arrayOfLines);
    });
    $('#tempView').click(function () {
        var counter = 0;
        for (var i = 0; i < localStorage.length; i++){
            console.log(loadList(localStorage.key(i)));
            counter = i;
        }
        if(counter == 0) {
            console.log("No lists found");
        }
    });
    $('#listName').select();
});