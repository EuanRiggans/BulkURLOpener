<p align="center">
    <img src="https://static.euanriggans.com/file/static-euanriggans-com/apps/bulkurlopener/images/440x280.png">
</p>

## Install / Download Links

- Chrome: https://chrome.google.com/webstore/detail/bulk-url-opener/kgnfciolbjojfdbbelbdbhhocjmhenep
- Firefox: https://addons.mozilla.org/en-GB/firefox/addon/bulkurlopener/
- Edge: https://microsoftedge.microsoft.com/addons/detail/bulk-url-opener/cfopcknfhpogkpcnnppcaedkhokachoo
- Opera: https://addons.opera.com/en-gb/extensions/details/bulk-url-opener-2/
- Desktop: https://github.com/EuanRiggans/BulkURLOpener/releases
- Desktop (Snap): https://snapcraft.io/bulkurlopener [![bulkurlopener](https://snapcraft.io//bulkurlopener/badge.svg)](https://snapcraft.io/bulkurlopener)
## Running From Source

#### Browser Extension

To run the app from source as a browser extension, just download / clone this repository. All you need from the repository is the 'app' folder. You can then install it to your browser. In Chrome, for example, you can navigate to the exensions page (Three dots in top right => More tools => Extensions). Then drag and drop the app folder onto that page to install it.

#### Electron

Running the electron version is very simple, clone / download the repository:

```shell script
npm install
```

```shell script
electron .
```

## Known Issues

- Close buttons not working. This is because Firefox does not allow a window to be closed by a script, if that window was opened by a script.
- 'Opening Tabs' window does not close. This is caused by the same issue as mentioned above.
- Addon does not open file: or about: urls. (See issue [#2](https://github.com/EuanRiggans/BulkURLOpener/issues/2))
- Context menus working initially on Firefox. Solution: If your context menus are not working on Firefox, then please restart your browser as this is an known issue. 

## To Do List

- Add ability for users to add custom search engine (Baidu etc)
- Redesign main interface
- Add 'extract urls' option to main interface
- Fix defaultBoostrap typo
- Improve design of settings page.
- Switch to using Bootstrap 5 once in stable release.
- Refactor some of the old code which is quite clunky.
