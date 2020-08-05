## New Unreleased Changes

- Added context menus. Currently, only context menus are for opening lists that the user has saved.
- Added setting to open lists in reverse order.
- Added new option for the 'Default list to display' setting:
    - 'Previous urls': whatever you previous had in the 'URLs' text box will be displayed the next time you open the app / popup.
- Improved the REGEX for extracting urls from strings.
## 1.9.0

- Added ability for the user to pause and resume the opening of tabs when using tab creation delay.
- User can now specify the tab creation delay to decimal points, rather than just whole numbers as previously.
- Added a hotkey to open the popup (Ctrl + Shift + U)

## 1.8.3

- Fixed wording on buttons on extension popup to make them clearer and less confusing.

## 1.8.2

- Fixed bug where if "Delay tab loading until tab is selected" setting was enabled, the url would be truncated after the first parameter in the query string.

## 1.8.1

- Firefox bug fix when deleting lists.

## 1.8.0

- Added option to launch a list when the browser starts.
- Added feature to delay tab loading until the user focuses the tab (Selects the tab in their browser)
- Added basic command line flags for election version of app, -v or --version, -h or --help

## 1.7.2

- Added a options file to the app manifest, so the settings page can be launched from the browsers addon / extension management page.
- Continued refactor of old sections of code, as well as working to completely remove dependence on Jquery in preparation of Bootstrap 5

## 1.7.1

- Prevented electron version from having a tab creation delay of < 1, to prevent issues from occurring when opening tabs
- Fixed bug which could stop large lists being opened on Chromium, if the 'Open tabs 'Active'' setting is enabled

## 1.7.0
- Added Importing and Exporting of user configuration. Users are now able to import or export their configuration (Lists and Settings). This allows your to transfer all you data to another device in a simpler manner.
- New setting: Buttons Look. This option lets the user choose whether filled or outline buttons should be used. As outline buttons can have some readability issues - especially if the user is using the 'Night Mode'
- New setting: Open Tabs Active State. Setting allows user to decided whether new tabs should be set as 'Active' when they are opened. 'Active' means that the tab is the one being displayed by the browser
- New setting: Auto Load Into Textbox. When a list is selected from the dropdown, it will be automatically loaded into the textbox (Text Area). Rather than having to select a list, then click on 'Open List'
- All versions of the app (Chrome, Firefox, Electron) are now in one single code base, meaning all features will be available on all platforms. Built using a shell script.
- Fixed a bug when editing lists of less then three urls

## 1.6.0
- The browser-based versions of the application are now in a single code-base. So it will be easier to develop, test and deploy changes.
- Fixed www. links not opening correctly.

## 1.5.1
- Tidied up help page.

## 1.5.0
- Added setting for user to decide how non-urls should be handled when encountered. User can choose to either: Open the non-url in a search engine, Ignore the non-url, Attempt to extract the non-url.
- Added setting so user can decide which search engine should be used if a non-url is going to be opened in a search engine.

## 1.4.0
- Added new setting to allow user to choose which tabs should be displayed when the 'Currently opened tabs' setting is selected. Either all opened tabs, or just those in the current window.
- Fixed bug which would cause the 'Automatically open lists' and 'Enable Night Theme' options not to display if no settings object was present in the browser storage.

## 1.3.4
- Removed deprecated API chrome.tabs.getAllInWindow
- If a user uses Tab Creation Delay, once all tabs are opened the message on the page will change to inform the user that all links are opened
- Tidied up tab creation and remove deprecated 'selected' parameter

## 1.3.3
- Fixed bug which would stop the user from creating more than 10 lists. Also causing the list with the id 10 to be overwritten with a new list.

## 1.3.2
- Small code optimization for loading popup load times
- Improved shadow for modals

## 1.3.1
- Fixed bug where checkboxes would be missing on the settings page if the user had not saved settings previously
- Fluent design bootstrap is now provided with the extension package rather than being loaded over cdn

## 1.3.0
- Added a simple night mode
- Added setting that allows users to change their bootstrap theme. Currently only supports default bootstrap and fluent design bootstrap.

## 1.2.0
- Added a setting to automatically open a list when it is selected from the extensions popup. (This setting can be overruled by holding the ctrl key before selecting a list from the dropdown) (User requested feature)
- Added a setting to change the default list that is loaded when the extension is launched (User requested feature)
- Added button on popup to open the extension in a popup window
- Link lists and settings are now stored using JSON this improves the stability of the extension as more settings are added. Old lists and settings should be automatically converted
- Performance improvements, removed duplicate jQuery selectors to improve performance
- Added a new re-designed icon
- The extension is now open source. You can view the repository at here. (https://github.com/EuanRiggans/BulkURLOpener)
- Updated bootstrap to v4.1.1
- Updated jquery to v3.1.1

## 1.1.4
-Fixed an issue where many links on the help page would not work correctly

## 1.1.3
-Fixed a bug where lists without a trailing new line would not open the last link in the list
-Help page now contains links to get support, report bugs or suggest new features

## 1.1.2
-Fixed an issue where Vivaldi users would not be able to open more than 9 tabs in one go

## 1.1.1
-Fixed tab naming issue when Tab Creation Delay is used
-Removed unnecessary font files to reduce extension size

## 1.1.0
-New method of storing lists of URLs. Old lists will be converted automatically
-Added settings page
-Added help page
-Added changelog page
-Added 'Tab Creation Delay' functionality (User requested feature)
-Code optimizations

## 1.0.1
-Small code optimization

## 1.0.0
-Initial release
