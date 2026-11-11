#!/bin/bash
# Build MacHanzi.app into ~/Applications. Needs only the Command Line Tools (swiftc).
set -e
cd "$(dirname "$0")"
APP="$HOME/Applications/MacHanzi.app"
mkdir -p "$APP/Contents/MacOS"
swiftc -O -swift-version 5 main.swift -o "$APP/Contents/MacOS/MacHanzi" \
  -framework AppKit -framework AVFoundation -framework ServiceManagement
cp Info.plist "$APP/Contents/Info.plist"
codesign --force --sign - "$APP"
echo "Built $APP"
