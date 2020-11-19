/* Event Listeners */

document.getElementById("reverseFrom").addEventListener("input", attemptURLExtraction);

document.getElementById("manualReverseButton").addEventListener("click", attemptURLExtraction);

/* End Of Event Listeners */

(() => {
    if (checkHostType() !== "electron") {
        document.getElementById("reverse-container").classList.remove("fluid-container");
        document.getElementById("reverse-container").classList.add("container");
    }
})();

function attemptURLExtraction() {
    const strings = document.getElementById("reverseFrom").value.split(/\r\n|\r|\n/).reverse();
    document.getElementById("reverseTo").value = "";
    for (const line of strings) {
        if (line !== "") {
            document.getElementById("reverseTo").value += `${line}\n`;
        }
    }
}

function goHome() {
    window.location.replace("../../popup.html");
}
