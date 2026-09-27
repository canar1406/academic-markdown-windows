# Requires PowerShell 7; these functions never install tools or change global settings.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Checked {
    param(
        [Parameter(Mandatory)][string] $Command,
        [Parameter(Mandatory)][string[]] $Arguments
    )
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "'$Command $($Arguments -join ' ')' failed with exit code $LASTEXITCODE."
    }
}

function Get-WindowsResourceManifest {
    $manifestPath = Join-Path $PSScriptRoot 'resources.manifest.json'
    Invoke-Checked node @((Join-Path $PSScriptRoot 'resource-tools.mjs'), 'validate') | Out-Host
    return Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
}

function Assert-FileHash {
    param(
        [Parameter(Mandatory)][string] $Path,
        [Parameter(Mandatory)][string] $Sha256
    )
    if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing resource: $Path" }
    $item = Get-Item -LiteralPath $Path
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $item.Length -eq 0) {
        throw "Empty or reparse-point resource refused: $Path"
    }
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $Sha256) {
        throw "SHA-256 checksum mismatch: $Path"
    }
}

function Get-PinnedDownload {
    param(
        [Parameter(Mandatory)] $Pin,
        [Parameter(Mandatory)][string] $Directory
    )
    $target = Join-Path $Directory $Pin.name
    if (Test-Path -LiteralPath $target) {
        # A bad cache is an error, not an excuse to silently substitute another download.
        Assert-FileHash $target $Pin.sha256
        return $target
    }
    $temporary = "$target.download-$([guid]::NewGuid().ToString('N'))"
    try {
        Invoke-WebRequest -Uri $Pin.url -OutFile $temporary -TimeoutSec 180 -MaximumRedirection 5
        Assert-FileHash $temporary $Pin.sha256
        Move-Item -LiteralPath $temporary -Destination $target
        return $target
    }
    finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
    }
}

function Assert-NativePdfSmokePassed {
    param([Parameter(Mandatory)][string] $TrxPath)
    if (!(Test-Path -LiteralPath $TrxPath -PathType Leaf)) { throw "Missing native test results: $TrxPath" }
    [xml] $results = Get-Content -LiteralPath $TrxPath -Raw
    $namespace = [Xml.XmlNamespaceManager]::new($results.NameTable)
    $namespace.AddNamespace('t', 'http://microsoft.com/schemas/VisualStudio/TeamTest/2010')
    $smoke = @($results.SelectNodes('//t:UnitTestResult', $namespace) |
        Where-Object { $_.testName -match 'NativePdfSmoke' })
    if ($smoke.Count -eq 0 -or @($smoke | Where-Object { $_.outcome -cne 'Passed' }).Count -gt 0) {
        throw 'NativePdfSmoke must exist and pass with real staged Windows resources. No portable ZIP will be created.'
    }
}
