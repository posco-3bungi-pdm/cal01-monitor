param(
    [string]$Runtime = "$env:LOCALAPPDATA/CAL01Monitor",
    [string]$Node = "node"
)
$ErrorActionPreference = "Stop"

function Wait-ServiceReady {
    param(
        [Diagnostics.Process]$Process,
        [scriptblock]$Check,
        [string]$Name,
        [string[]]$Logs
    )
    $Deadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        $Process.Refresh()
        if ($Process.HasExited) {
            throw "$Name 프로세스가 종료되었습니다. 로그: $($Logs -join ', ')"
        }
        try {
            if (& $Check) { return }
        } catch {
            # Allow a short startup period before reporting an unavailable endpoint.
        }
        Start-Sleep -Milliseconds 300
    } while ([DateTime]::UtcNow -lt $Deadline)
    throw "$Name 시작을 확인하지 못했습니다. 로그: $($Logs -join ', ')"
}

$Repository = Split-Path -Parent $PSScriptRoot
$Runtime = [IO.Path]::GetFullPath($Runtime)
$ConfigPath = Join-Path $Runtime "server-config.json"
if (-not (Test-Path -LiteralPath $ConfigPath)) {
    throw "서버 설정이 없습니다. docs/08-local-development.md의 최초 설정을 먼저 진행하세요."
}
$Config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
foreach ($Entry in $Config.PSObject.Properties) {
    if ($Entry.Name -ne "ADMIN_PASSWORD") {
        [Environment]::SetEnvironmentVariable($Entry.Name, [string]$Entry.Value, "Process")
    }
}
$Python = Join-Path $Repository ".venv/Scripts/python.exe"
if (-not (Test-Path -LiteralPath $Python)) { throw ".venv를 먼저 설치하세요." }
$PgCtl = Join-Path $Runtime "pgsql/bin/pg_ctl.exe"
$PgData = Join-Path $Runtime "pgdata"
if (Test-Path -LiteralPath $PgCtl) {
    & $PgCtl -D $PgData status *> $null
    if ($LASTEXITCODE -ne 0) {
        & $PgCtl -D $PgData -l (Join-Path $Runtime "postgres.log") -o "-p 55432 -h 127.0.0.1" -w start
        if ($LASTEXITCODE -ne 0) { throw "PostgreSQL을 시작하지 못했습니다." }
    }
}
$BackendPort = Get-NetTCPConnection -LocalPort 9017 -State Listen -ErrorAction SilentlyContinue
if ($BackendPort) {
    try { $Health = Invoke-RestMethod "http://127.0.0.1:9017/api/health" -TimeoutSec 3 }
    catch { throw "9017 포트를 다른 프로그램이 사용 중이거나 기존 API를 다시 시작해야 합니다." }
    if ($Health.service -ne "cal01-monitor") { throw "9017 포트를 다른 프로그램이 사용 중입니다." }
} else {
    $Backend = Start-Process -FilePath $Python -ArgumentList @(
        "-m", "waitress", "--listen=127.0.0.1:9017", "--threads=4", "--max-request-body-size=537919488", "config.wsgi:application"
    ) -WorkingDirectory (Join-Path $Repository "backend") -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput (Join-Path $Runtime "backend.stdout.log") `
      -RedirectStandardError (Join-Path $Runtime "backend.stderr.log")
    Set-Content -LiteralPath (Join-Path $Runtime "backend.pid") -Value $Backend.Id
    Wait-ServiceReady -Process $Backend -Name "API" -Logs @(
        (Join-Path $Runtime "backend.stdout.log"), (Join-Path $Runtime "backend.stderr.log")
    ) -Check {
        $Response = Invoke-RestMethod "http://127.0.0.1:9017/api/health" -TimeoutSec 2
        $Response.service -eq "cal01-monitor"
    }
    Write-Output "API 시작 확인: PID $($Backend.Id)"
}
$FrontendPort = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if ($FrontendPort) {
    try { $Page = Invoke-WebRequest "http://127.0.0.1:5173" -UseBasicParsing -TimeoutSec 3 }
    catch { throw "5173 포트를 다른 프로그램이 사용 중이거나 화면 서버를 다시 시작해야 합니다." }
    if ($Page.Content -notmatch "<title>CAL01") { throw "5173 포트를 다른 프로그램이 사용 중입니다." }
} else {
    # Launch Vite with Node directly: no shell quoting or global npm installation needed.
    $Vite = Join-Path $Repository "frontend/node_modules/vite/bin/vite.js"
    if (-not (Test-Path -LiteralPath $Vite)) { throw "frontend 패키지를 먼저 설치하세요." }
    $Frontend = Start-Process -FilePath $Node -ArgumentList @(
        "`"$Vite`"", "--host", "127.0.0.1", "--port", "5173", "--strictPort"
    ) -WorkingDirectory (Join-Path $Repository "frontend") -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput (Join-Path $Runtime "frontend.stdout.log") `
      -RedirectStandardError (Join-Path $Runtime "frontend.stderr.log")
    Set-Content -LiteralPath (Join-Path $Runtime "frontend.pid") -Value $Frontend.Id
    Wait-ServiceReady -Process $Frontend -Name "화면 서버" -Logs @(
        (Join-Path $Runtime "frontend.stdout.log"), (Join-Path $Runtime "frontend.stderr.log")
    ) -Check {
        $Response = Invoke-WebRequest "http://127.0.0.1:5173" -UseBasicParsing -TimeoutSec 2
        $Response.Content -match "<title>CAL01"
    }
    Write-Output "화면 시작 확인: PID $($Frontend.Id)"
}
Write-Output "로컬 개발 화면: http://127.0.0.1:5173"
