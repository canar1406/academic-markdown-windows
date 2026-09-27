#Requires -Version 7.0
[CmdletBinding()]
param(
    [string] $RepoRoot = (Join-Path $PSScriptRoot '../..'),
    # Optional offline, pre-provisioned directory containing the pinned tectonic.exe and LICENSE.
    [string] $TectonicDirectory
)

. (Join-Path $PSScriptRoot 'Common.ps1')
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$manifest = Get-WindowsResourceManifest
$resourceTools = Join-Path $PSScriptRoot 'resource-tools.mjs'
$destination = Join-Path $RepoRoot 'apps/windows/AcademicMarkdown.Windows/Resources'
$temporary = $null

try {
    if (!$TectonicDirectory) {
        $cache = Join-Path $RepoRoot "apps/windows/.cache/tectonic-$($manifest.tectonic.version)-win-x64"
        [void][IO.Directory]::CreateDirectory($cache)
        $archive = Get-PinnedDownload $manifest.tectonic.archive $cache
        $license = Get-PinnedDownload $manifest.tectonic.license $cache
        $temporary = Join-Path $cache "extract-$([guid]::NewGuid().ToString('N'))"
        [void][IO.Directory]::CreateDirectory($temporary)

        # The verified upstream MSVC archive contains exactly tectonic.exe. Do not
        # Expand-Archive an unvalidated tree or permit archive path traversal.
        $zip = [IO.Compression.ZipFile]::OpenRead($archive)
        try {
            if ($zip.Entries.Count -ne 1 -or
                $zip.Entries[0].FullName -cne $manifest.tectonic.executable.name) {
                throw 'Unexpected Tectonic archive layout; review the pin before proceeding.'
            }
            [IO.Compression.ZipFileExtensions]::ExtractToFile(
                $zip.Entries[0], (Join-Path $temporary $manifest.tectonic.executable.name))
        }
        finally { $zip.Dispose() }
        Copy-Item -LiteralPath $license -Destination (Join-Path $temporary $manifest.tectonic.license.name)
        $TectonicDirectory = $temporary
    }
    $TectonicDirectory = (Resolve-Path -LiteralPath $TectonicDirectory).Path
    Assert-FileHash (Join-Path $TectonicDirectory $manifest.tectonic.executable.name) $manifest.tectonic.executable.sha256
    Assert-FileHash (Join-Path $TectonicDirectory $manifest.tectonic.license.name) $manifest.tectonic.license.sha256
    Invoke-Checked node @($resourceTools, 'stage', $RepoRoot, $TectonicDirectory, $destination)
    Write-Host "Verified Windows resources staged at $destination"
}
finally {
    # Only this invocation's extraction scratch directory is removed.
    if ($temporary -and (Test-Path -LiteralPath $temporary)) {
        Remove-Item -LiteralPath $temporary -Recurse
    }
}
