# Claude Code Stop hook — speaks the last assistant response via edge-tts (neural TTS).
param()

$raw = [Console]::In.ReadToEnd()
$raw | Out-File "$env:TEMP\claude-speak-debug.txt" -Encoding utf8
if (-not $raw.Trim()) { exit 0 }

$text = ""
try {
    $data = $raw | ConvertFrom-Json -ErrorAction Stop

    if ($data.transcript_path -and (Test-Path $data.transcript_path)) {
        $lines = Get-Content $data.transcript_path -ErrorAction Stop
        foreach ($line in $lines) {
            if (-not $line.Trim()) { continue }
            try {
                $entry = $line | ConvertFrom-Json -ErrorAction Stop
                $msg = if ($entry.message) { $entry.message } else { $entry }
                if ($msg.role -eq "assistant") {
                    $content = $msg.content
                    if ($content -is [string]) {
                        $text = $content
                    } elseif ($content -is [array]) {
                        $parts = $content | Where-Object { $_.type -eq "text" } | ForEach-Object { $_.text }
                        if ($parts) { $text = $parts -join " " }
                    }
                }
            } catch {}
        }
    }

    if (-not $text -and $data.transcript) {
        $turn = $data.transcript | Where-Object { $_.role -eq "assistant" } | Select-Object -Last 1
        if ($turn) {
            if ($turn.content -is [string]) { $text = $turn.content }
            elseif ($turn.content -is [array]) {
                $text = ($turn.content |
                    Where-Object { $_.type -eq "text" } |
                    ForEach-Object { $_.text }) -join " "
            }
        }
    }

    if (-not $text -and $data.result) { $text = [string]$data.result }
} catch { exit 0 }

if (-not $text.Trim()) { exit 0 }

# Strip markdown
$text = $text -replace '(?s)```.*?```', 'code block.'
$text = $text -replace '`[^`]+`', ''
$text = $text -replace '\*\*([^*]+)\*\*', '$1'
$text = $text -replace '\*([^*]+)\*', '$1'
$text = $text -replace '(?m)^#{1,6}\s+', ''
$text = $text -replace '\[([^\]]+)\]\([^)]+\)', '$1'
$text = $text -replace 'https?://\S+', 'link'
$text = $text -replace '(?m)^\s*[-*+]\s+', ' '
$text = $text.Trim()

if ($text.Length -gt 600) {
    $cutoff = $text.Substring(0, 600).LastIndexOf(' ')
    if ($cutoff -lt 0) { $cutoff = 600 }
    $text = $text.Substring(0, $cutoff) + " ... response continues."
}

if ($text.Length -lt 5) { exit 0 }

$pythonExe = "C:\Users\farib\AppData\Local\Programs\Python\Python312\python.exe"
$tempAudio = "$env:TEMP\claude-speak.mp3"
$usedNeural = $false

# Try edge-tts neural voice first
if (Test-Path $pythonExe) {
    & $pythonExe -m edge_tts --voice en-US-AriaNeural --rate="+10%" --text $text --write-media $tempAudio 2>$null
    if (Test-Path $tempAudio) {
        try {
            Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MCI {
    [DllImport("winmm.dll")] public static extern int mciSendString(string cmd, System.Text.StringBuilder ret, int length, IntPtr hwnd);
}
"@ -ErrorAction Stop
            $audioPath = (Resolve-Path $tempAudio).Path
            [MCI]::mciSendString("open `"$audioPath`" type mpegvideo alias media", $null, 0, [IntPtr]::Zero)
            [MCI]::mciSendString("play media wait", $null, 0, [IntPtr]::Zero)
            [MCI]::mciSendString("close media", $null, 0, [IntPtr]::Zero)
            $usedNeural = $true
        } catch {}
    }
}

# Fallback to Zira if neural failed
if (-not $usedNeural) {
    Add-Type -AssemblyName System.Speech
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $synth.SelectVoice("Microsoft Zira Desktop")
    $synth.Rate = 3
    $synth.Volume = 90
    $synth.Speak($text)
}
