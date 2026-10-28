param(
    [string]$AndroidSerial,
    [string]$AdbPath = 'C:\Users\ADMIN\AppData\Local\Android\Sdk\platform-tools\adb.exe',
    [string]$JavaHome = 'C:\Program Files\Android\Android Studio\jbr'
)

# Never uses root .env's database or resets existing data. Synthetic credentials only.
$ErrorActionPreference = 'Stop'
$projectPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$containerName = 'kaffein-rehearsal-db-20261009'
$environmentNames = @('DATABASE_URL', 'POS_E2E_ALLOW_DB_WRITE', 'POS_ANDROID_REHEARSAL_SERIAL', 'POS_REHEARSAL_ADB', 'JWT_ACCESS_SECRET', 'JAVA_HOME')
$savedEnvironment = @{}
foreach ($name in $environmentNames) { $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }

function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed: $Command (exit $LASTEXITCODE)" }
}

try {
    Push-Location $projectPath
    Invoke-Checked 'docker' @('info', '--format', '{{.ServerVersion}}')
    $existing = & docker ps -a --filter "name=^/$containerName`$" --format '{{.Names}}'
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect sandbox container.' }
    if ($existing -eq $containerName) {
        $details = (& docker inspect $containerName | ConvertFrom-Json)[0]
        $mappedPort = $details.HostConfig.PortBindings.'5432/tcp'[0]
        if ($details.Config.Labels.'kaffein.purpose' -ne 'isolated-rehearsal' -or
            $mappedPort.HostIp -ne '127.0.0.1' -or $mappedPort.HostPort -ne '55434' -or
            $details.Config.Env -notcontains 'POSTGRES_DB=coffee_pos_rehearsal_e2e') {
            throw 'Existing container is not the expected isolated sandbox; refusing to use it.'
        }
        if (-not $details.State.Running) { Invoke-Checked 'docker' @('start', $containerName) }
    } else {
        if (Get-NetTCPConnection -LocalPort 55434 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 55434 is in use.' }
        Invoke-Checked 'docker' @('run', '--detach', '--name', $containerName, '--label', 'kaffein.purpose=isolated-rehearsal',
            '--publish', '127.0.0.1:55434:5432', '--env', 'POSTGRES_USER=rehearsal',
            '--env', 'POSTGRES_PASSWORD=synthetic-rehearsal-only', '--env', 'POSTGRES_DB=coffee_pos_rehearsal_e2e', 'postgres:17-alpine')
    }
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        & docker exec $containerName pg_isready -U rehearsal -d coffee_pos_rehearsal_e2e *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Sandbox PostgreSQL is not ready.' }
    $env:DATABASE_URL = 'postgresql://rehearsal:synthetic-rehearsal-only@127.0.0.1:55434/coffee_pos_rehearsal_e2e'
    $env:POS_E2E_ALLOW_DB_WRITE = 'YES_I_ACCEPT_DB_MUTATION'
    $env:POS_ANDROID_REHEARSAL_SERIAL = $null
    $env:POS_REHEARSAL_ADB = $null
    $env:JWT_ACCESS_SECRET = 'synthetic-rehearsal-only-not-for-deployment'
    Invoke-Checked 'npm.cmd' @('run', 'db:deploy', '-w', 'api')
    Invoke-Checked 'npm.cmd' @('run', 'build', '-w', 'api')
    Invoke-Checked 'npm.cmd' @('run', 'build', '-w', 'web')
    Invoke-Checked 'npm.cmd' @('run', 'test', '-w', 'web')
    Push-Location (Join-Path $projectPath 'apps/api')
    try { Invoke-Checked 'node' @('--experimental-vm-modules', '-e', "require('jest').run(['--runInBand'])") }
    finally { Pop-Location }
    if ($AndroidSerial) {
        if ($AndroidSerial -ne 'emulator-5554') { throw 'This runbook currently requires emulator-5554 for the separate integration AVD.' }
        if (-not (Test-Path -LiteralPath $AdbPath)) { throw 'ADB not found.' }
        $avdName = & $AdbPath -s $AndroidSerial emu avd name
        if ($LASTEXITCODE -ne 0 -or $avdName[0].Trim() -ne 'Coffee_POS_Integration_20261008') { throw 'Refusing to install on a non-integration AVD.' }
        if (Get-NetTCPConnection -LocalPort 3010,3011 -State Listen -ErrorAction SilentlyContinue) { throw 'Sandbox API/gateway ports 3010/3011 are in use.' }
        $env:JAVA_HOME = $JavaHome
        Push-Location (Join-Path $projectPath 'apps/pos')
        try { Invoke-Checked '.\gradlew.bat' @('-PposEnvironment=local', ':app:assembleDebug', ':app:assembleDebugAndroidTest', ':app:testDebugUnitTest') }
        finally { Pop-Location }
        $apkPath = Join-Path $projectPath 'apps/pos/app/build/outputs/apk/debug/app-debug.apk'
        Invoke-Checked $AdbPath @('-s', $AndroidSerial, 'install', '-r', $apkPath)
        Invoke-Checked $AdbPath @('-s', $AndroidSerial, 'install', '-r', (Join-Path $projectPath 'apps/pos/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'))
        $packageLine = & $AdbPath -s $AndroidSerial shell pm path vn.id.congtc145.coffeepos
        $installedPath = ($packageLine | Where-Object { $_ -match '^package:.*base.apk' } | Select-Object -First 1).Substring(8).Trim()
        $hashLine = & $AdbPath -s $AndroidSerial shell sha256sum $installedPath
        $installedHash = (($hashLine -join '').Trim() -split '\s+')[0]
        $sourceHash = (Get-FileHash -LiteralPath $apkPath -Algorithm SHA256).Hash
        if ($installedHash -ne $sourceHash) { throw 'Installed APK hash differs from the built APK.' }
        Write-Output "Verified integration APK SHA256: $sourceHash"
        $env:POS_ANDROID_REHEARSAL_SERIAL = $AndroidSerial
        $env:POS_REHEARSAL_ADB = $AdbPath
    }
    Push-Location (Join-Path $projectPath 'apps/api')
    try { Invoke-Checked 'node' @('--experimental-vm-modules', '-e', "require('jest').run(['--config','./test/jest-e2e.json','--runInBand'])") }
    finally { Pop-Location }
    Write-Output 'Rehearsal passed. Isolated PostgreSQL container remains available; no operational database was reset.'
} finally {
    Pop-Location
    foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
}
