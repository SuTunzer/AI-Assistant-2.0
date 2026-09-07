$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voices = @($speaker.GetInstalledVoices() | Where-Object { $_.Enabled })
  $female = $voices | Where-Object { $_.VoiceInfo.Gender -eq 'Female' } | Select-Object -First 1
  if ($female) { $speaker.SelectVoice($female.VoiceInfo.Name) }
  $speaker.Rate = -1
  $target = Join-Path $PSScriptRoot '../apps/web/public/sample-briefing.wav'
  $speaker.SetOutputToWaveFile([IO.Path]::GetFullPath($target))
  $speaker.Speak('This is a sample briefing from Steadier. In your connected workspace, this would be created from your own tasks and memories. Start with one useful action. You do not need to finish everything to make today count. Give the proposal outline fifteen uninterrupted minutes. Write something rough, then decide on the next step. Keep the bigger picture close. The point of getting organised is to make room for a life that feels meaningful. Your relationships, your health, and time to think are part of that. Take one small step, then build from there.')
} finally { $speaker.Dispose() }
