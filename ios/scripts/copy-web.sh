#!/bin/sh
# 教材を .app 内の www/ へ写す。Xcode の Run Script から呼ばれる。
#
# リポジトリ直下をまるごとフォルダ参照にしない。reference/ の PDF や
# tools/・node_modules/ までアプリに入り、配布物が教材と無関係に膨らむ。
set -eu

SRC="${SRCROOT}/.."
DEST="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/www"

rm -rf "$DEST"
mkdir -p "$DEST"

cp "$SRC"/*.html "$DEST"/
cp -R "$SRC/assets" "$DEST"/
for dir in "$SRC"/phase*/; do
  cp -R "$dir" "$DEST/$(basename "$dir")"
done
