param([switch]$LiveSandbox)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path $PSScriptRoot -Parent
$dockerExe = Get-Command docker -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1
if (-not $dockerExe) { $dockerExe = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe' }
if (-not (Test-Path -LiteralPath $dockerExe)) { throw 'Docker CLI not found; open a new terminal after installing Docker Desktop.' }
$containerName = 'kaffein-momo-polling-e2e'
$environmentNames = @('DATABASE_URL', 'POS_E2E_ALLOW_DB_WRITE', 'POS_MOMO_LIVE_SANDBOX', 'NODE_ENV')
$savedEnvironment = @{}
foreach ($name in $environmentNames) { $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
function Invoke-Checked([string]$exe, [string[]]$arguments) {
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) { throw "$exe failed with exit code $LASTEXITCODE" }
}
Push-Location $projectPath
try {
    $existingNames = & $dockerExe ps -a --format '{{.Names}}'
    if ($LASTEXITCODE -ne 0) { throw 'Docker Engine is unavailable.' }
    if ($existingNames -contains $containerName) {
        $details = (& $dockerExe inspect $containerName | ConvertFrom-Json)[0]
        if ($details.Config.Labels.'kaffein.purpose' -ne 'momo-polling-e2e' -or
            $details.HostConfig.PortBindings.'5432/tcp'[0].HostPort -ne '55435' -or
            $details.HostConfig.PortBindings.'5432/tcp'[0].HostIp -ne '127.0.0.1') {
            throw 'Refusing a container with a different purpose or port binding.'
        }
        if (-not $details.State.Running) { Invoke-Checked $dockerExe @('start', $containerName) }
    } else {
        if (Get-NetTCPConnection -LocalPort 55435 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 55435 is in use.' }
        Invoke-Checked $dockerExe @('run', '--detach', '--name', $containerName,
            '--label', 'kaffein.purpose=momo-polling-e2e', '--publish', '127.0.0.1:55435:5432',
            '--env', 'POSTGRES_USER=momo_test', '--env', 'POSTGRES_PASSWORD=synthetic-momo-e2e-only',
            '--env', 'POSTGRES_DB=coffee_pos_momo_e2e', 'postgres:17-alpine')
    }
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        & $dockerExe exec $containerName pg_isready -U momo_test -d coffee_pos_momo_e2e *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Isolated PostgreSQL is not ready.' }
    $env:DATABASE_URL = 'postgresql://momo_test:synthetic-momo-e2e-only@127.0.0.1:55435/coffee_pos_momo_e2e'
    $env:POS_E2E_ALLOW_DB_WRITE = 'YES_I_ACCEPT_DB_MUTATION'
    $env:POS_MOMO_LIVE_SANDBOX = $null
    $env:NODE_ENV = 'test'
    Invoke-Checked 'npm.cmd' @('run', 'db:deploy', '-w', 'api')
    Invoke-Checked 'npm.cmd' @('run', 'build', '-w', 'api')
    Invoke-Checked 'npm.cmd' @('run', 'test', '-w', 'api', '--', '--runInBand')
    $env:NODE_ENV = 'production'
    Invoke-Checked 'npm.cmd' @('run', 'build', '-w', 'web')
    Invoke-Checked 'npm.cmd' @('run', 'test', '-w', 'web')
    $env:NODE_ENV = 'test'
    Push-Location apps/api
    try {
        Invoke-Checked 'node' @('--experimental-vm-modules', '-e', "require('jest').run(['--config','./test/jest-e2e.json','--runInBand'])")
        if ($LiveSandbox) {
            $env:POS_MOMO_LIVE_SANDBOX = '1'
            Invoke-Checked 'node' @('--experimental-vm-modules', '-e', "require('jest').run(['--config','./test/jest-e2e.json','--runInBand','--runTestsByPath','test/momo-polling.e2e-spec.ts','--testNamePattern','live sandbox'])")
        }
    } finally { Pop-Location }
    Write-Output 'MoMo polling checks passed. Isolated test database retained; no operational database was reset.'
    if ($LiveSandbox) { Write-Output 'A real Sandbox QR was created and queried, without paying. Its evidence remains in the isolated database.' }
} finally {
    Pop-Location
    foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
}
