//Add ability for user to only open first X number of URL's e.g. first 25, 50, 75, 100
//When searching for the URL list stop search once found?

function initPopup() {
    chrome.windows.getCurrent( function(window) {
        chrome.tabs.getAllInWindow(window.id, function(tabs){
            if (!tabs.length) return;

            var listTextArea = document.getElementById("list");

            for (var i=0; i<tabs.length; ++i) {
                listTextArea.value += tabs[i].url + "\n";
            }

            listTextArea.select();
        });
    });
    for (var i = 0; i < localStorage.length; i++){
        var tempStorageArray = loadList(localStorage.key(i));
        if(tempStorageArray.length > 1) {
            $('#savedLists').append('<option id="' + tempStorageArray[0] +'">'+ tempStorageArray[1] +'</option>');
        }        
    }   
    document.getElementById("openButton").addEventListener("click", openTextAreaList);
    document.getElementById("copyCurrentOpen").addEventListener("click", getCurrentTabs);
    document.getElementById("clearList").addEventListener("click", clearLinksList);
    document.getElementById("createNewList").addEventListener("click", openSaveNewListDialog);
    document.getElementById("openList").addEventListener("click", openSelectedList);
    document.getElementById("editList").addEventListener("click", editSelectedList);
    document.getElementById("deleteList").addEventListener("click", deleteList);
}

function openTextAreaList() {
    openList(document.getElementById("list").value);
}

function getCurrentTabs() {    
    chrome.windows.getCurrent( function(window) {
        chrome.tabs.getAllInWindow(window.id, function(tabs){
            if (!tabs.length) return;

            var listTextArea = document.getElementById("list");
            listTextArea.value = "";
            for (var i=0; i<tabs.length; ++i) {
                listTextArea.value += tabs[i].url + "\n";
            }

            listTextArea.select();
        });
    });
}

function clearLinksList() {
    var listTextArea = document.getElementById("list");
    listTextArea.value = "";
}

window.addEventListener("load", initPopup);

String.prototype.trim = function() { 
	return this.replace(/^\s+|\s+$/g, ''); 
}

function isProbablyUrl(string) {
	var substr = string.substring(0,4).toLowerCase();
	if (substr == 'ftp:' || substr == 'www.') return true;

	var substr = string.substring(0,5).toLowerCase();
	if (substr == 'http:') return true;

	var substr = string.substring(0,6).toLowerCase();
	if (substr == 'https:') return true;

	var substr = string.substring(0,7).toLowerCase();
	if (substr == 'chrome:') return true;

	return false;
}

function openList(list) {
    //Should prompt the user to comfirm they wish to open X number of tabs if > than 5
	var strings = list.split(/\r\n|\r|\n/);
	for (var i=0; i<strings.length; i++) {
		strings[i] = strings[i].trim();
		if (strings[i] == '') continue;
		var url = strings[i];
		if (!isProbablyUrl(url)) {
			url = 'http://www.google.com/search?q=' + encodeURI(url);
		}
		chrome.tabs.create({'url':url,'selected':false});
	}
}

function openSaveNewListDialog() {
    var arrayOfLines = new Array();
    var lines = $('#list').val().split('\n');
    arrayOfLines.push("temp");
    for(var i = 0;i < lines.length;i++) {
        if(!(lines[i]) == "\n") {
            arrayOfLines.push(lines[i]);
        }
        
    }
    localStorage.setItem("temp", arrayOfLines);
    chrome.tabs.create({'url': chrome.extension.getURL('savelist.html')});
}

function openSelectedList() {
    if(getSelectedListID() == "-1") {
        alert("You need to select a list");
        return;
    }
    for (var i = 0; i < localStorage.length; i++){
        var tempArray = loadList(localStorage.key(i));        
        if(tempArray[0] == getSelectedListID() && tempArray.length > 1) {    
            var listTextArea = document.getElementById("list");
            $('#list').val('');              
            for (var i=2; i<tempArray.length; ++i) {
                listTextArea.value += tempArray[i] + "\n";
            }            
            listTextArea.select(); 
        }        
    }
}

function deleteList() {
    if(getSelectedListID() == "-1") {
        alert("You need to select a list");
        return;
    }
    if(confirm("Are you sure you wish to delete the list: " + getSelectedList())) {
        removeList(getSelectedListID());
    }    
}

function editSelectedList() {
    if(getSelectedListID() == "-1") {
        alert("You need to select a list");
        return;
    }
    chrome.tabs.create({'url': chrome.extension.getURL('editlist.html?id=' + getSelectedListID() + "&name=" + getSelectedList())});
}

function getSelectedList() {
    return $("#savedLists option:selected").html();    
}

function getSelectedListID() {
    return $('select[id="savedLists"] option:selected').attr('id');
}