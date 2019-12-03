# BulkURLOpener

## Install / Download Links

- Chrome: https://chrome.google.com/webstore/detail/bulk-url-opener/kgnfciolbjojfdbbelbdbhhocjmhenep
- Firefox: https://addons.mozilla.org/en-GB/firefox/addon/bulkurlopener/
- Desktop: https://github.com/EuanRiggans/BulkURLOpener/releases

## Known Issues

- Close buttons not working. This is because Firefox does not allow a window to be closed by a script, if that window was opened by a script.
- 'Opening Tabs' window does not close. This is caused by the same issue as mentioned above.
- Addon does not open file: or about: urls. (See issue #2)

## To Do List

- Merge Electron and Browser repositories into one.
- Export / Import settings & lists in JSON.
- New setting: "Automatically load list" - When a list is selected from the dropdown, automatically load it into the textarea.
- Make version that runs in the browser, rather than on desktop / browser addons
- Completely remove dependency on Jquery.
- Improve regex extraction of URLS.
- Refactor old pieces of code that lack quality.
