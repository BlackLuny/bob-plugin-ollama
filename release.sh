#!/bin/bash
version=${1#refs/tags/v}
zip -r -j bob-plugin-ollama-$version.bobplugin src/*

sha256_deeplx=$(sha256sum bob-plugin-ollama-$version.bobplugin | cut -d ' ' -f 1)
echo $sha256_deeplx

download_link="https://github.com/hqwuzhaoyi/bob-plugin-ollama/releases/download/v$version/bob-plugin-ollama-$version.bobplugin"

new_version="{\"version\": \"$version\", \"desc\": \"Support access token.\", \"sha256\": \"$sha256_deeplx\", \"url\": \"$download_link\", \"minBobVersion\": \"0.5.0\"}"

json_file='appcast.json'
json_data=$(cat $json_file)

updated_json=$(echo $json_data | jq --argjson new_version "$new_version" '.versions += [$new_version]')

echo $updated_json > $json_file
mkdir dist
mv *.bobplugin dist