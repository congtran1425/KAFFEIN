[CmdletBinding()]
param(
    [string]$TypstPath
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$thesisRoot = Join-Path $repoRoot 'thesis'
$thesisSource = Join-Path $thesisRoot '31231027506_TranChiCong_DATN.typst'
$thesisOutput = Join-Path $thesisRoot '31231027506_TranChiCong_DATN.pdf'

if (-not $TypstPath) {
    $typstCommand = Get-Command typst.exe -ErrorAction SilentlyContinue
    if (-not $typstCommand) {
        $typstCommand = Get-Command typst -ErrorAction SilentlyContinue
    }
    if ($typstCommand) {
        $TypstPath = $typstCommand.Source
    } else {
        $TypstPath = Join-Path $repoRoot 'recovery/private/tools/typst-0.15.1/typst-x86_64-pc-windows-msvc/typst.exe'
    }
}

if (-not (Test-Path -LiteralPath $TypstPath -PathType Leaf)) {
    throw 'Typst not found. Install the official compiler or pass -TypstPath to its executable.'
}
$TypstPath = (Resolve-Path -LiteralPath $TypstPath).Path
$compilerVersion = (& $TypstPath --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw 'Unable to read the Typst compiler version.'
}

# Compile separately so a failed build preserves the last reviewable PDF.
$buildDirectory = Join-Path $repoRoot ('recovery/private/artifacts/thesis-build/' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + $PID)
New-Item -ItemType Directory -Path $buildDirectory -Force | Out-Null
$candidatePdf = Join-Path $buildDirectory '31231027506_TranChiCong_DATN.pdf'
& $TypstPath compile --diagnostic-format short --root $thesisRoot $thesisSource $candidatePdf
if ($LASTEXITCODE -ne 0) {
    throw 'Thesis compilation failed; the existing PDF was preserved.'
}
if (-not (Test-Path -LiteralPath $candidatePdf -PathType Leaf)) {
    throw 'The compiler did not produce a PDF; the existing PDF was preserved.'
}

$previousPdf = Join-Path $buildDirectory 'previous.pdf'
if (Test-Path -LiteralPath $thesisOutput -PathType Leaf) {
    Copy-Item -LiteralPath $thesisOutput -Destination $previousPdf
}
Copy-Item -LiteralPath $candidatePdf -Destination $thesisOutput -Force

$buildRecord = [ordered]@{
    builtAtUtc = [DateTime]::UtcNow.ToString('o')
    compiler = $compilerVersion
    source = 'thesis/31231027506_TranChiCong_DATN.typst'
    sourceSha256 = (Get-FileHash -LiteralPath $thesisSource -Algorithm SHA256).Hash
    bibliographySha256 = (Get-FileHash -LiteralPath (Join-Path $thesisRoot 'references/bibliography.bib') -Algorithm SHA256).Hash
    output = 'thesis/31231027506_TranChiCong_DATN.pdf'
    outputSha256 = (Get-FileHash -LiteralPath $thesisOutput -Algorithm SHA256).Hash
}
$buildRecord | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $buildDirectory 'build.json') -Encoding UTF8
Write-Output ($compilerVersion + ': ' + $thesisOutput)
Write-Output ('Build record: ' + (Join-Path $buildDirectory 'build.json'))
