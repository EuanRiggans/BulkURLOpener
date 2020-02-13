<p align="center">
    <img src="https://static.euanriggans.com/apps/bulkurlopener/images/440x280.png">
</p>

## Install / Download Links

- Chrome: https://chrome.google.com/webstore/detail/bulk-url-opener/kgnfciolbjojfdbbelbdbhhocjmhenep
- Firefox: https://addons.mozilla.org/en-GB/firefox/addon/bulkurlopener/
- Desktop: https://github.com/EuanRiggans/BulkURLOpener/releases
- Desktop (Snap): https://snapcraft.io/bulkurlopener [![bulkurlopener](https://snapcraft.io//bulkurlopener/badge.svg)](https://snapcraft.io/bulkurlopener)
## Running From Source

#### Browser Extension

To run the app from source as a browser extension, just download / clone this repository. All you need from the repository is the 'app' folder.

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

## To Do List

- Completely remove dependency on Jquery.
- Improve regex extraction of URLS.
- Refactor some of the old code which is quite clunky
