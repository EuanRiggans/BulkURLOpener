const {
    app,
    BrowserWindow,
} = require("electron");

const utilities = require("./utilities/electron-utilities");

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;

function createWindow() {
    win = new BrowserWindow({
        width: 1000,
        height: 640,
        webPreferences: {
            nodeIntegration: true,
        },
        icon: "./app/icon/128.png",
    });
    win.autoHideMenuBar = true;
    win.removeMenu();
    win.loadFile("./app/popup.html");

    // Open the DevTools. Automated test to make sure this is closed(?)
    // win.webContents.openDevTools()

    win.on("closed", () => {
    /**
		 * Dereference the window object,
		 * usually you would store windows in an array if your app supports multi
		 * windows, this is the time when you should delete the corresponding element.
		 */
        win = null;
    });
}

/**
 * This method will be called when Electron has finished
 * initialization and is ready to create browser windows.
 * Some APIs can only be used after this event occurs.
 */
app.on("ready", () => {
    const isCalledViaCLI = utilities.checkIfCalledViaCLI(process.argv);
    if (isCalledViaCLI) {
        utilities.setVersion(app.getVersion());
        win = new BrowserWindow({show: false, width: 0, height: 0});
        win.hide();
        utilities.processArgs();
        win.close();
    } else {
        createWindow();
    }
});

/**
 * Quit when all windows are closed.
 */
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (win === null) {
        createWindow();
    }
});
