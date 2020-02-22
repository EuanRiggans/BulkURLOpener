const {
    app,
    BrowserWindow
} = require('electron');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;

// Array containing all of the cli args that can be used
const validArgs = [
    '-v',
    '--version',
    '-h',
    '--help'
];

// Object containing the long and short versions of cli arguments
const argDefinitions = {
    'version': {
        short: '-v',
        long: '--version'
    },
    'help': {
        short: '-h',
        long: '--help'
    }
};

// Array of the arguments (if any) provided by the user
let receivedArgs = [];

function createWindow() {
    win = new BrowserWindow({
        width: 1000,
        height: 640,
        webPreferences: {
            nodeIntegration: true
        },
        icon: './app/icon/128.png'
    });
    win.autoHideMenuBar = true;
    win.removeMenu()
    win.loadFile('./app/popup.html');

    // Open the DevTools. Automated test to make sure this is closed(?)
    // win.webContents.openDevTools()

    win.on('closed', () => {
        /**
         * Dereference the window object, usually you would store windows in an array if your app supports multi
         * windows, this is the time when you should delete the corresponding element.
         */
        win = null
    })
}

/**
 * This method will be called when Electron has finished initialization and is ready to create browser windows.
 * Some APIs can only be used after this event occurs.
 */
app.on('ready', () => {
    let isCalledViaCLI = checkIfCalledViaCLI(process.argv);
    if (isCalledViaCLI) {
        win = new BrowserWindow({show: false, width: 0, height: 0});
        win.hide();
        processArgs(receivedArgs);
        win.close();
    } else {
        createWindow();
    }
});

/**
 * Quit when all windows are closed.
 */
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
});

app.on('activate', () => {
    if (win === null) {
        createWindow()
    }
});

/**
 * Checks if the app has been called from the cli (With valid arguments / flags)
 * @param args          The arguments provided to the app
 * @returns {boolean}   Whether called from CLI with valid arguments or not
 */
function checkIfCalledViaCLI(args) {
    return !!(args && args.length > 1 && checkValidArgs(args));

}

/**
 * Checks if the arguments provided to the app are valid (Valid meaning the given argument actually does something)
 * @param args          Array of arguments
 * @returns {boolean}   True if any valid argument is found in array
 */
function checkValidArgs(args) {
    let valid = false;
    for (let arg in args) {
        if (args.hasOwnProperty(arg)) {
            if (validArgs.includes(args[arg])) {
                receivedArgs.push(args[arg]);
                valid = true;
            }
        }
    }
    return valid;
}

/**
 * Will loop through all arguments provided, and will process the argument if the use is found
 * @param args  Arguments to process
 */
function processArgs(args) {
    for (let arg in args) {
        if (args.hasOwnProperty(arg)) {
            switch (getArgumentDefinitionFromArgument(args[arg])) {
                case 'version':
                    console.log(app.getVersion());
                    break;
                case 'help':
                    console.log('Valid command line arguments and their use:');
                    console.log('  -v or --version        Displays the version of the app');
                    console.log('  -h or --help           Outputs this message');
                    break;
                default:
                    console.warn("Unable to find the use of argument: " + args[arg]);
            }
        }
    }
}

/**
 * Gets the argument name from the argument provided. For example, if provided with '-v' will return 'version'
 * @param argument              The argument
 * @returns {string|undefined}  Argument name. Undefined if not found.
 */
function getArgumentDefinitionFromArgument(argument) {
    for (let arg in argDefinitions) {
        if (argDefinitions.hasOwnProperty(arg)) {
            if (argDefinitions[arg].short === argument || argDefinitions[arg].long === argument) {
                return arg;
            }
        }
    }
    return undefined;
}