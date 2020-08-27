if (document.getElementById("goHome")) {
    document.getElementById("goHome").addEventListener("click", () => {
        if (checkHostType() === "electron") {
            window.location.replace("../../popup.html");
        }
    });
}

if (document.getElementById("goHelp")) {
    document.getElementById("goHelp").addEventListener("click", () => {
        if (checkHostType() === "electron") {
            window.location.replace("../help/index.html");
        }
    });
}

if (document.getElementById("goTools")) {
    document.getElementById("goTools").addEventListener("click", () => {
        if (checkHostType() === "electron") {
            window.location.replace("./index.html");
        }
    });
}
