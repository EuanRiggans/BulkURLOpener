#!/bin/bash

# Requirements: Electron Builder, npm, sha256sum, web-ext, wine, zip

# Checking requirements are met.

if ! [ -x "$(command -v electron-builder)" ]; then
  echo 'Error: electron-builder is not installed.' >&2
  exit 1
fi

if ! [ -x "$(command -v npm)" ]; then
  echo 'Error: npm is not installed.' >&2
  exit 1
fi

if ! [ -x "$(command -v sha256sum)" ]; then
  echo 'Error: sha256sum is not installed.' >&2
  exit 1
fi

if ! [ -x "$(command -v web-ext)" ]; then
  echo 'Error: web-ext is not installed.' >&2
  exit 1
fi

if ! [ -x "$(command -v wine)" ]; then
  echo 'Error: wine is not installed.' >&2
  exit 1
fi

if ! [ -x "$(command -v zip)" ]; then
  echo 'Error: zip is not installed.' >&2
  exit 1
fi

# Getting version from package.json

VERSION='';
re="\"(version)\": \"([^\"]*)\"";

while read -r l; do
    if [[ $l =~ $re ]]; then
        value="${BASH_REMATCH[2]}";
        VERSION="$value";
    fi
done < package.json;

# Removing any old build / dist directories

rm -rf dist/
rm -rf app/web-ext-artifacts

# Making build directories

mkdir dist
mkdir dist/browser

# Building and tidying up

cp -r ./app/* ./dist/browser/
npm run make:all
cd ./dist/browser/
web-ext build
mv ./web-ext-artifacts/bulk_url_opener-$VERSION.zip ../bulkurlopener-$VERSION-browser.zip
cd ..
rm -r browser/
zip -r bulkurlopener-$VERSION-windows.zip win-unpacked
zip -r bulkurlopener-$VERSION-linux.zip linux-unpacked
rm -r win-unpacked/
rm -r linux-unpacked/
rm -r mac/

# Removing files not required

rm *.blockmap
rm *.yaml
rm *.yml

# Generating checksums & outputting result to text file

echo Generating checksums...
sha256sum * > bulkurlopener-$VERSION-checksum.txt
