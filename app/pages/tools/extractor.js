/* Event Listeners */

document.getElementById("extractFrom").addEventListener("input", attemptURLExtraction);

document.getElementById("manualExtractButton").addEventListener("click", attemptURLExtraction);

/* End Of Event Listeners */

function attemptURLExtraction() {
    const strings = document.getElementById("extractFrom").value.split(/\r\n|\r|\n/);
    const extracted = [];
    for (const line of strings) {
        const extraction = extractURLFromString(line);
        if (extraction !== "noextractionsuccess") {
            extracted.push(extraction);
        }
    }
    console.log(extracted);
    document.getElementById("extractTo").value = "";
    for (const link of extracted) {
        document.getElementById("extractTo").value += `${link}\n`;
    }
}

function goHome() {
    window.location.replace("../../popup.html");
}
