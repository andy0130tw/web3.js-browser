#!/bin/sh

npx browserify -d ../node_modules/elliptic/lib/elliptic.js -o elliptic/elliptic.js -s elliptic
