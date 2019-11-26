# BulkURLOpener

## Known Issues

- Tab Creation Delay not opening tabs on Chrome. Fix deployed - waiting for Google to review and approve the update.
- Close buttons not working. This is because Firefox does not allow a window to be closed by a script, if that window was opened by a script.
- 'Opening Tabs' window does not close. This is caused by the same issue as mentioned above.
- Addon does not open file: or about: urls. (See issue #2)

## To Do List

- Merge Electron and Browser repositories into one.
- New setting: "Automatically load list" - When a list is selected from the dropdown, automatically load it into the textarea.
- Completely remove dependency on Jquery.
- Improve regex extraction of URLS.
- Refactor old pieces of code that lack quality.
