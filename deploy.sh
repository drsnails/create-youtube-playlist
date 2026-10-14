#!/bin/zsh

#* Get the version from manifest.json
version=$(grep '"version"' manifest.json | cut -d'"' -f4)

#* Remove dots from version to use in folder name
version_no_dots=$(echo $version | tr -d '.')

#* Create folder name
folder_name="create-youtube-playlist-v$version_no_dots"

#* Get current directory name
current_dir=${PWD##*/}

#* Create deploy directory in parent folder if it doesn't exist
mkdir -p "../deploy"

#* Create temporary directory for the copy
deploy_path="../deploy/$folder_name"

#* Remove existing deploy folder if it exists
rm -rf "$deploy_path"

#* Copy all files except .git directory
rsync -av --exclude '.git' --exclude 'deploy.sh' --exclude 'node_modules' --exclude 'tests' --exclude 'scripts' --exclude 'test-results' --exclude 'package*.json' --exclude '*.log' --exclude 'youtube-debug-*.json' . "$deploy_path"

#* Create zip file
cd "../deploy"
zip -r "${folder_name}.zip" "$folder_name"
cd "../$current_dir"

echo "✅ Deployment complete!"
echo "📁 Folder created: $deploy_path"
echo "📦 Zip created: ../deploy/${folder_name}.zip"
