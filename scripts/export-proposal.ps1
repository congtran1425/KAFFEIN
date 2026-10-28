$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$markdownPath = Join-Path $projectRoot 'docs\09-proposal.md'
$docxPath = Join-Path $projectRoot 'docs\09-proposal.docx'
$pdfPath = Join-Path $projectRoot 'docs\09-proposal.pdf'

$pandocCommand = Get-Command pandoc.exe -ErrorAction SilentlyContinue
$pandocPath = if ($pandocCommand) {
    $pandocCommand.Source
} else {
    Join-Path $env:LOCALAPPDATA 'Pandoc\pandoc.exe'
}

if (-not (Test-Path -LiteralPath $pandocPath)) {
    throw 'Pandoc was not found. Install it with: winget install JohnMacFarlane.Pandoc'
}

$typstCommand = Get-Command typst.exe -ErrorAction SilentlyContinue
$typstPath = if ($typstCommand) {
    $typstCommand.Source
} else {
    Get-ChildItem `
        -LiteralPath (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages') `
        -Filter typst.exe `
        -File `
        -Recurse `
        -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
}

if (-not $typstPath -or -not (Test-Path -LiteralPath $typstPath)) {
    throw 'Typst was not found. Install it with: winget install Typst.Typst'
}

# Both files are generated artifacts. Removing the previous outputs prevents
# hidden Microsoft Word overwrite dialogs from blocking an automated export.
if (Test-Path -LiteralPath $docxPath) {
    Remove-Item -LiteralPath $docxPath -Force
}
if (Test-Path -LiteralPath $pdfPath) {
    Remove-Item -LiteralPath $pdfPath -Force
}

& $pandocPath $markdownPath '--from=gfm' '--to=docx' "--output=$docxPath"
if ($LASTEXITCODE -ne 0) {
    throw "Pandoc DOCX export failed with exit code $LASTEXITCODE"
}

& $pandocPath `
    $markdownPath `
    '--from=gfm' `
    "--pdf-engine=$typstPath" `
    '--variable=papersize:a4' `
    '--variable=fontsize:11pt' `
    '--variable=mainfont:Arial' `
    "--output=$pdfPath"

if ($LASTEXITCODE -ne 0) {
    throw "Pandoc PDF export failed with exit code $LASTEXITCODE"
}

Write-Output "Created: $docxPath"
Write-Output "Created: $pdfPath"
