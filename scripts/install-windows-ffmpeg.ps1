$ErrorActionPreference = "Stop"

$archiveUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-08-23-13-03/ffmpeg-n9.0.1-6-g9d4ca21220-win64-gpl-9.0.zip"
$archiveSha256 = "2f388916565c44f6edcdddd7b01ccc73a2bbc7f107bd615b7247e9c9773f4a09"
$root = Split-Path -Parent $PSScriptRoot
$binaryDirectory = Join-Path $root "src-tauri\binaries"
$temporaryDirectory = Join-Path $env:TEMP "brand-material-ffmpeg-n9.0.1-6-g9d4ca21220"
$archivePath = Join-Path $temporaryDirectory "ffmpeg-n9.0.1-6-g9d4ca21220-win64-gpl-9.0.zip"
$extractDirectory = Join-Path $temporaryDirectory "unpacked"

New-Item -ItemType Directory -Force $temporaryDirectory | Out-Null
New-Item -ItemType Directory -Force $binaryDirectory | Out-Null

Invoke-WebRequest -Uri $archiveUrl -OutFile $archivePath
$actualSha256 = (Get-FileHash -Algorithm SHA256 $archivePath).Hash.ToLowerInvariant()
if ($actualSha256 -ne $archiveSha256) {
  throw "FFmpeg archive checksum mismatch. Expected $archiveSha256, got $actualSha256"
}

if (Test-Path $extractDirectory) {
  Remove-Item -Recurse -Force $extractDirectory
}
Expand-Archive -Path $archivePath -DestinationPath $extractDirectory

$ffmpeg = Get-ChildItem $extractDirectory -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
$ffprobe = Get-ChildItem $extractDirectory -Recurse -Filter "ffprobe.exe" | Select-Object -First 1
if ($null -eq $ffmpeg -or $null -eq $ffprobe) {
  throw "FFmpeg archive did not contain ffmpeg.exe and ffprobe.exe"
}

Copy-Item $ffmpeg.FullName (Join-Path $binaryDirectory "ffmpeg-x86_64-pc-windows-msvc.exe") -Force
Copy-Item $ffprobe.FullName (Join-Path $binaryDirectory "ffprobe-x86_64-pc-windows-msvc.exe") -Force

$ffmpegHash = (Get-FileHash -Algorithm SHA256 (Join-Path $binaryDirectory "ffmpeg-x86_64-pc-windows-msvc.exe")).Hash.ToLowerInvariant()
$ffprobeHash = (Get-FileHash -Algorithm SHA256 (Join-Path $binaryDirectory "ffprobe-x86_64-pc-windows-msvc.exe")).Hash.ToLowerInvariant()
if ($ffmpegHash -ne "e3a2512b56eebc3b2b8c9e435ceb0fa055e003eee075d8a960a16ddfe9e0c933") {
  throw "Unexpected ffmpeg.exe checksum: $ffmpegHash"
}
if ($ffprobeHash -ne "5aa91156c5bc7e06b5682fc2a9ae2c52f52681ba8d951c207746739199e68d46") {
  throw "Unexpected ffprobe.exe checksum: $ffprobeHash"
}

Write-Host "Installed audited FFmpeg n9.0.1-6-g9d4ca21220 Windows sidecars."
