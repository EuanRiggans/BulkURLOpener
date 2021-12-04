<p align="center">
    <img src="https://static.euanriggans.com/file/static-euanriggans-com/apps/bulkurlopener/images/440x280.png">
</p>

## Install / Download Links

| Package | Status | Version | URL |
| ---------- | ---------- | ---------- | ---------- |
| Chrome / Chromium | Official Version | 1.11.2 | [Chrome Webstore](https://chrome.google.com/webstore/detail/bulk-url-opener/kgnfciolbjojfdbbelbdbhhocjmhenep) |
| Firefox | Official Version | 1.11.2 | [Firefox Addons](https://addons.mozilla.org/en-GB/firefox/addon/bulkurlopener/) |
| Edge | Official Version | 1.11.2 | [Edge Addons](https://microsoftedge.microsoft.com/addons/detail/bulk-url-opener/cfopcknfhpogkpcnnppcaedkhokachoo) |
| Opera | Official Version | 1.9.0 (1.11.2 Submitted) | [Opera Addons](https://addons.opera.com/en-gb/extensions/details/bulk-url-opener-2/) |
| Desktop | Official Version | 1.11.2 | [Multi-Platform Github Releases](https://github.com/EuanRiggans/BulkURLOpener/releases) |
| Snap [![bulkurlopener](https://snapcraft.io//bulkurlopener/badge.svg)](https://snapcraft.io/bulkurlopener) | Official Version | 1.10.0 | [Snapcraft](https://snapcraft.io/bulkurlopener) |

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

- Add option to open in new window rather than new tab
- Add ability for user to set a delay for a specific list
- Improve 'Opening Tabs' page, display tabs that are being opened in order, and allow user to remove urls from that list.
- Add ability for users to add custom search engine (Baidu etc)
- New context menu: Open selected links
- New tool: Sort list into alphabetical order
- Redesign main interface
- Add 'extract urls' option to main interface
- Fix defaultBoostrap typo
- Switch to using Bootstrap 5 once in stable release.
- Refactor some of the old code which is quite clunky.
