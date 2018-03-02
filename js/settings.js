$(document).ready(function () {   
    $('#tabCreationDelay').val(0);
    for (var i = 0; i < localStorage.length; i++){
        var tempArray = loadList(localStorage.key(i));
        console.log(tempArray);
        if(tempArray[0] === "settings") {
            $('#tabCreationDelay').val(tempArray[1]);
            if(tempArray[2] === 1) {
                $('#nightMode').prop('checked', true);
            }
        }
    } 
    $('#closeModal').click(function () {
        window.close();
    });
    $('#closeModalFooter').click(function () {
        window.close();
    });
    $('#saveSettings').click(function () {
        var tabCreationDelay = $('#tabCreationDelay').val();
        var nightMode = 0;
        if($('#nightMode').is(":checked")) {
            nightMode = 1;
        }
        if(!(isNumber(tabCreationDelay))) {
            alert("Your tab creation delay is not a number!");
            return;
        }
        var settingsArray = new Array();
        settingsArray.push("settings");
        settingsArray.push(tabCreationDelay);
        settingsArray.push(nightMode);
        saveSettings(settingsArray);
    });
});

function isNumber(varToTest) { 
    return !isNaN(parseFloat(varToTest))
}
