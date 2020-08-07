/**
 * Utilities for the electron version of Bulk URL Opener. Required to be in separate file as it is not possible to
 * export on the javascript files used in the browser versions.
 */

module.exports = {
    setVersion,
    checkIfCalledViaCLI,
    processArgs
}

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

let version = null;

// Array of the arguments (if any) provided by the user
let receivedArgs = [];

/**
 * App version setter
 * @param appVersion    The current version of the app
 */
function setVersion(appVersion) {
    version = appVersion;
}

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
 */
function processArgs() {
    for (let arg in receivedArgs) {
        if (receivedArgs.hasOwnProperty(arg)) {
            switch (getArgumentDefinitionFromArgument(receivedArgs[arg])) {
                case 'version':
                    console.log(version);
                    break;
                case 'help':
                    console.log('Valid command line arguments and their use:');
                    console.log('  -v or --version        Displays the version of the app');
                    console.log('  -h or --help           Outputs this message');
                    break;
                default:
                    console.warn("Unable to find the use of argument: " + receivedArgs[arg]);
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
