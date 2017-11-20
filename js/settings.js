$(document).ready(function () {   
    $('#tabCreationDelay').val(0);
    for (var i = 0; i < localStorage.length; i++){
        var tempArray = loadList(localStorage.key(i));        
        if(tempArray[0] == "settings") {    
            $('#tabCreationDelay').val(tempArray[1]);
        }
    } 
    $('#closeModal').click(function () {
        window.close();
    });
    $('#saveSettings').click(function () {
        var tabCreationDelay = $('#tabCreationDelay').val();
        if(!(isNumber(tabCreationDelay))) {
            alert("Your tab creation delay is not a number!");
            return;
        }
        var settingsArray = new Array();
        settingsArray.push("settings");
        settingsArray.push(tabCreationDelay);
        saveSettings(settingsArray);
    });
    outputAllLists();
});

function isNumber(varToTest) { 
    return !isNaN(parseFloat(varToTest))
}
