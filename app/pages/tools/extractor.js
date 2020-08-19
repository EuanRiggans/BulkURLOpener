/* Event Listeners */

document.getElementById("extractFrom").addEventListener("input", attemptURLExtraction);

document.getElementById("manualExtractButton").addEventListener("click", attemptURLExtraction);

/* End Of Event Listeners */

function attemptURLExtraction() {
    let strings = document.getElementById("extractFrom").value.split(/\r\n|\r|\n/);
    let extracted = [];
    for (const line of strings) {
        let extraction = extractURLFromString(line)
        if (extraction !== "noextractionsuccess") {
            extracted.push(extraction);
        }
    }
    console.log(extracted)
    document.getElementById("extractTo").value = "";
    for (const link of extracted) {
        document.getElementById("extractTo").value += link + "\n";
    }
}
