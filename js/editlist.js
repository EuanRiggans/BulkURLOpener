$(document).ready(function () {        
    if(!(document.location.search.length) || getParameterByName('ID') == null || getParameterByName('name') == null) {
        alert("No list data present. Closing window.");
        window.close();
    }
    $('#listID').val(getParameterByName('ID'));
    $('#listName').val(getParameterByName('name'));
    var id = getParameterByName('ID');
    for (var i = 0; i < localStorage.length; i++){
        var tempArray = loadList(localStorage.key(i));        
        if(tempArray[1] == id && tempArray.length > 1) {    
            var listTextArea = document.getElementById("list");
            $('#list').val('');              
            for (var i=3; i<tempArray.length; ++i) {
                listTextArea.value += tempArray[i] + "\n";
            }            
            listTextArea.select(); 
        }        
    }
    $('#closeModal').click(function () {
        window.close();
    });
    $('#saveList').click(function () {
        var listID = $('#listID').val()
        removeList(listID, true);
        var arrayOfLines = new Array();
        arrayOfLines.push("listStorage");
        arrayOfLines.push(listID);
        arrayOfLines.push($('#listName').val());    
        var lines = $('#list').val().split('\n');
        for(var i = 0;i < lines.length;i++) {
            if(!(lines[i]) == "\n") {
                arrayOfLines.push(lines[i]);        
            } 
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
    $('#listName').select();
});