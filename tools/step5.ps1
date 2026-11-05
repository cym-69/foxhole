$ErrorActionPreference = 'Stop'
Set-Location C:\Users\debih\Desktop\foxhole

Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  ? { $_.CommandLine -like '*server/index.js*' } |
  % { Stop-Process -Id $_.ProcessId -Force }

Start-Process -FilePath "node" -ArgumentList "server/index.js" -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput "server.out" -RedirectStandardError "server.err"

for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 2
  if (Test-NetConnection -ComputerName 127.0.0.1 -Port 4180 -InformationLevel Quiet) { break }
}
Write-Output ("SERVER_UP_AFTER=" + ($i * 2) + "s")

# wait for the headline sources to be probed and the first poll to land
Start-Sleep -Seconds 30

$live = Invoke-RestMethod -Uri "http://127.0.0.1:4180/api/live" -TimeoutSec 30
Write-Output ("HEADLINES_STATUS=" + $live.headlines.status)
foreach ($s in $live.headlines.sources) {
  Write-Output ("SOURCE $($s.id) name=$($s.name) ok=$($s.ok) count=$($s.count) err=$($s.error)")
}

# first 5 feed items from the snapshot (source + title cut to 70)
$snap = (New-Object System.Net.WebClient).DownloadString("http://127.0.0.1:4180/stream")
$feedLines = @()
foreach ($line in ($snap -split "`n")) {
  if ($line -like 'data: *' -and $line -like '*"feed"*') { $feedLines += $line.Substring(6) }
}
$json = $feedLines[0] | ConvertFrom-Json
Write-Output "FIRST_5_HEADLINE_ITEMS:"
$i5 = 0
foreach ($it in $json.feed) {
  if ($i5 -ge 5) { break }
  $t = $it.text
  if ($t.Length -gt 70) { $t = $t.Substring(0, 70) }
  Write-Output ("  " + $it.srcName + " | " + $t + " | " + $it.kind + " url=" + $it.url)
  $i5++
}
Write-Output ("SNAPSHOT_FEED_COUNT=" + $json.feed.Count)

$state = Invoke-RestMethod -Uri "http://127.0.0.1:4180/api/state" -TimeoutSec 30
Write-Output ("TOPBAR seen=" + $state.status.events.counts.seen + " linked=" + $state.status.events.counts.linked)

# TV tab list
$tvRows = @()
foreach ($m in ([regex]'"tv"').Matches($null)) { }
$tv = (New-Object System.Net.WebClient).DownloadString("http://127.0.0.1:4180/assets/")
$js = Get-ChildItem "dist/assets/*.js" | ForEach-Object { $_.FullName }
$tvText = (Get-Content dist/assets/*.js -Raw | Select-String -Pattern 'aljazeera.{0,200}' -AllMatches).Matches[0].Value
Write-Output ("TV_CSS=" + 'src/config/tv.js read below')

# test hook must be gone
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:4180/__test/feed" -Method Post -Body '{"text":"x"}' -ContentType 'application/json' -UseBasicParsing -TimeoutSec 20
  Write-Output ("TEST_FEED_STATUS=" + $r.StatusCode)
} catch {
  Write-Output ("TEST_FEED_STATUS=" + $_.Exception.Response.StatusCode.value__)
}
Write-Output "PHASE_5_DONE"
