param(
  [Parameter(Mandatory = $true)]
  [string]$FfmpegPath,

  [Parameter(Mandatory = $true)]
  [string]$FfprobePath,

  [string]$InputPath,
  [string]$OutputDirectory = "$env:TEMP\brand-material-hw-smoke"
)

$ErrorActionPreference = "Stop"

$ffmpeg = (Resolve-Path $FfmpegPath).Path
$ffprobe = (Resolve-Path $FfprobePath).Path
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

function Invoke-LoggedCommand {
  param(
    [string]$Executable,
    [string[]]$Arguments,
    [string]$LogPath
  )

  & $Executable @Arguments 2>&1 | Tee-Object -FilePath $LogPath
  return $LASTEXITCODE
}

"FFmpeg: $ffmpeg" | Set-Content "$OutputDirectory\environment.txt"
"FFprobe: $ffprobe" | Add-Content "$OutputDirectory\environment.txt"
Get-Date -Format o | Add-Content "$OutputDirectory\environment.txt"

& $ffmpeg -hide_banner -version 2>&1 | Set-Content "$OutputDirectory\ffmpeg-version.txt"
& $ffmpeg -hide_banner -buildconf 2>&1 | Set-Content "$OutputDirectory\ffmpeg-buildconf.txt"
& $ffmpeg -hide_banner -encoders 2>&1 | Set-Content "$OutputDirectory\ffmpeg-encoders.txt"
Get-CimInstance Win32_VideoController |
  Select-Object Name, DriverVersion, PNPDeviceID |
  Format-List | Out-String |
  Set-Content "$OutputDirectory\video-controllers.txt"

if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
  nvidia-smi --query-gpu=index,name,driver_version --format=csv 2>&1 |
    Set-Content "$OutputDirectory\nvidia-smi.txt"
}

$results = @()
$encoders = @(
  @{ Name = "NVENC"; Codec = "h264_nvenc"; Extra = @("-preset", "p4", "-cq", "23") },
  @{ Name = "AMF"; Codec = "h264_amf"; Extra = @("-quality", "balanced", "-rc", "cqp", "-qp_i", "23", "-qp_p", "23", "-qp_b", "23") },
  @{ Name = "QSV"; Codec = "h264_qsv"; Extra = @("-global_quality", "23") }
)

foreach ($encoder in $encoders) {
  $slug = $encoder.Name.ToLowerInvariant()
  $output = "$OutputDirectory\probe-$slug.mp4"
  $log = "$OutputDirectory\probe-$slug.log"
  $arguments = @(
    "-hide_banner", "-nostdin", "-loglevel", "verbose",
    "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30",
    "-frames:v", "120", "-an", "-vf", "format=nv12",
    "-c:v", $encoder.Codec
  ) + $encoder.Extra + @("-pix_fmt", "nv12", "-y", $output)

  $exitCode = Invoke-LoggedCommand $ffmpeg $arguments $log
  $probeOk = $false
  if ($exitCode -eq 0 -and (Test-Path $output)) {
    & $ffprobe -v error -select_streams v:0 `
      -show_entries stream=codec_name,width,height,pix_fmt,nb_frames `
      -of json $output |
      Set-Content "$OutputDirectory\probe-$slug.json"
    $probeOk = ($LASTEXITCODE -eq 0)
  }

  $results += [PSCustomObject]@{
    Backend = $encoder.Name
    Encoder = $encoder.Codec
    ExitCode = $exitCode
    ProbeReadable = $probeOk
    Output = $output
    Log = $log
  }
}

$results | Format-Table -AutoSize
$results | ConvertTo-Json | Set-Content "$OutputDirectory\summary.json"

if ($InputPath) {
  $input = (Resolve-Path $InputPath).Path
  $selected = $results | Where-Object { $_.ExitCode -eq 0 -and $_.ProbeReadable } | Select-Object -First 1
  if ($selected) {
    $realOutput = "$OutputDirectory\real-video-$($selected.Backend.ToLowerInvariant()).mp4"
    $realLog = "$OutputDirectory\real-video.log"
    $realArgs = @(
      "-hide_banner", "-nostdin", "-loglevel", "verbose",
      "-t", "30", "-i", $input,
      "-vf", "drawbox=x=iw*0.72:y=ih*0.78:w=iw*0.23:h=ih*0.14:color=white@0.35:t=fill,format=nv12",
      "-c:v", $selected.Encoder, "-c:a", "aac", "-movflags", "+faststart",
      "-y", $realOutput
    )
    $realExitCode = Invoke-LoggedCommand $ffmpeg $realArgs $realLog
    "Real-video backend=$($selected.Backend), exit=$realExitCode, output=$realOutput"
  } else {
    "No hardware encoder passed; skipped the real-video sample."
  }
}

"Logs and outputs: $OutputDirectory"
