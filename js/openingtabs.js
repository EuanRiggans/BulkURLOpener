$(document).ready(function () {        
    var tabCreationDelay = getTabCreationDelay();   
    tabCreationDelay = tabCreationDelay * 1000;
    var strings = loadList("linksToOpen");
    for (var i = 0; i<strings.length; i++) {
        if(strings[i].trim() == '') {
            strings.splice(i, 1);
            i--;
        }
    }
    linksIterator(0, strings, tabCreationDelay);
    removeLinksToOpenList();
});

function linksIterator(i, strings, tabCreationDelay) {
    strings[i] = strings[i].trim();
    if (!(strings[i] == '') && !(strings[i] == "linksToOpen")) {
        var url = strings[i];
        if (!isProbablyUrl(url)) {
            url = 'http://www.google.com/search?q=' + encodeURI(url);
        }
        chrome.tabs.create({'url':url,'selected':false});
        i++;
        if(i - 1 < strings.length) {
            if(strings[i] == null || strings[i].trim() == '') {
                window.close();
            }
            setTimeout(linksIterator, tabCreationDelay, i, strings, tabCreationDelay);
        }
    } else {
        i++;
        if(i >= strings.length) {
            window.close();
        }
        if(i < strings.length) {
            linksIterator(i, strings, tabCreationDelay);            
        }
    }
}

function isProbablyUrl(string) {
	var substr = string.substring(0,4).toLowerCase();
	if (substr == 'ftp:' || substr == 'www.') {
        return true;
    }

	var substr = string.substring(0,5).toLowerCase();
	if (substr == 'http:') {
        return true;
    }

	var substr = string.substring(0,6).toLowerCase();
	if (substr == 'https:') {
        return true;
    }

	var substr = string.substring(0,7).toLowerCase();
	if (substr == 'chrome:') {
        return true;
    }

	return false;
}

function getTabCreationDelay() {
    for (var i = 0; i < localStorage.length; i++){
        var tempArray = loadList(localStorage.key(i));        
        if(tempArray[0] == "settings") {    
            return tempArray[1];
        }
    } 
}