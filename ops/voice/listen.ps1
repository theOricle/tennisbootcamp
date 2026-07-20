# Continuous hands-free voice input for Claude Code.
#
# Run this in a SEPARATE PowerShell window (minimized is fine).
# Keep the Claude Code terminal window focused/active.
# Speak naturally — after ~1.5s of silence it auto-submits your phrase.
#
# Usage:
#   powershell -NoProfile -File ops\voice\listen.ps1
#
# Stop: Ctrl+C in this window.

Add-Type -AssemblyName System.Speech
Add-Type -AssemblyName System.Windows.Forms

$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine
$engine.SetInputToDefaultAudioDevice()

# Free-form dictation (no fixed grammar)
$grammar = New-Object System.Speech.Recognition.DictationGrammar
$engine.LoadGrammar($grammar)

# How long to wait after speech stops before submitting (seconds)
$engine.EndSilenceTimeout        = [TimeSpan]::FromSeconds(1.5)
$engine.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromSeconds(2.0)
$engine.BabbleTimeout            = [TimeSpan]::FromSeconds(0)

Write-Host ""
Write-Host "  Listening... (Ctrl+C to stop)"
Write-Host "  Speak naturally. 1.5s silence = submit."
Write-Host ""

while ($true) {
    try {
        $result = $engine.Recognize()
        if (-not $result -or -not $result.Text.Trim()) { continue }

        $phrase = $result.Text.Trim()

        # Show what was heard
        Write-Host "> $phrase" -ForegroundColor Cyan

        # Type the phrase + Enter into the active window (should be Claude Code terminal)
        [System.Windows.Forms.SendKeys]::SendWait($phrase)
        Start-Sleep -Milliseconds 80
        [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")

    } catch [System.OperationCanceledException] {
        break
    } catch {
        # Transient recognition errors are normal; keep going
        Start-Sleep -Milliseconds 200
    }
}

$engine.Dispose()
Write-Host "Stopped."
