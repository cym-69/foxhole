$ErrorActionPreference = 'Stop'
Set-Location C:\Users\debih\Desktop\foxhole

# clean slate
Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  ? { $_.CommandLine -like '*server/index.js*' -or $_.CommandLine -like '*mock-rss*' } |
  % { Stop-Process -Id $_.ProcessId -Force }

Start-Process -FilePath "node" -ArgumentList "tools/mock-rss.mjs" -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput "mock-rss.out" -RedirectStandardError "mock-rss.err"
Start-Sleep -Seconds 2

$env:FOXHOLE_RSS_URLS = "http://127.0.0.1:9200/a.xml,http://127.0.0.1:9200/b.xml"
$env:FOXHOLE_TEST = "1"
Start-Process -FilePath "node" -ArgumentList "server/index.js" -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput "server.out" -RedirectStandardError "server.err"

# wait for the port
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 2
  if (Test-NetConnection -ComputerName 127.0.0.1 -Port 4180 -InformationLevel Quiet) { break }
}
Write-Output ("SERVER_UP_AFTER_SECONDS=" + ($i * 2))
Start-Sleep -Seconds 12

$live = Invoke-RestMethod -Uri "http://127.0.0.1:4180/api/live" -TimeoutSec 25
Write-Output ("HEADLINES_STATUS_4B=" + $live.headlines.status)
foreach ($s in $live.headlines.sources) {
  Write-Output ("SOURCE_4B id=$($s.id) ok=$($s.ok) count=$($s.count) lastFetch=$($_.lastFetch)")
}

# first 3 SSE feed lines
node tools/dbg-sse.mjs 2>&1 | Select-String -Pattern '^FEED ' | Select-Object -First 3 | ForEach-Object { $_.Line }

# --- 4d: kill the mock for 130 s ---
Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  ? { $_.CommandLine -like '*mock-rss*' } |
  % { Stop-Process -Id $_.ProcessId -Force; Write-Output "MOCK_KILLED" }
Write-Output "WAITING_130S"
Start-Sleep -Seconds 130

$live2 = Invoke-RestMethod -Uri "http://127.0.0.1:4180/api/live" -TimeoutSec 25
Write-Output ("HEADLINES_STATUS_4D=" + $live2.headlines.status)
foreach ($s in $live2.headlines.sources) {
  Write-Output ("SOURCE_4D id=$($s.id) ok=$($s.ok) err=$($s.error)")
}
try {
  $st = Invoke-WebRequest -Uri "http://127.0.0.1:4180/api/state" -TimeoutSec 30 -UseBasicParsing
  Write-Output ("API_STATE_HTTP=" + $st.StatusCode)
} catch {
  Write-Output ("API_STATE_ERROR=" + $_.Exception.Message)
}
Write-Output "PHASE_4D_DONE"
