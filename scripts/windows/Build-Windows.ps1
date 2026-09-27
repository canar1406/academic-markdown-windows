#Requires -Version 7.0
[CmdletBinding()]
param(
    [ValidateSet('Debug', 'Release')][string] $Configuration = 'Release',
    [string] $TectonicDirectory
)

. (Join-Path $PSScriptRoot 'Common.ps1')
if (!$IsWindows -or ![Environment]::Is64BitProcess -or
    [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString() -ne 'X64') {
    throw 'The WinUI build and real Tectonic smoke require an x64 Windows host and x64 PowerShell 7.'
}
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$manifest = Get-WindowsResourceManifest
$tools = $manifest.toolchain
$resourceTools = Join-Path $PSScriptRoot 'resource-tools.mjs'
$windowsProject = Join-Path $repo 'apps/windows/AcademicMarkdown.Windows/AcademicMarkdown.Windows.csproj'
$testsProject = Join-Path $repo 'apps/windows/AcademicMarkdown.Core.Tests/AcademicMarkdown.Core.Tests.csproj'
$resources = Join-Path $repo 'apps/windows/AcademicMarkdown.Windows/Resources'
$fixture = Join-Path $repo 'scripts/fixtures/offline-tex/report.tex'
foreach ($file in @($windowsProject, $testsProject, $fixture)) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing build input: $file" }
}

$nodeVersion = & node --version
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch "^v$($tools.nodeMajor)\.") {
    throw "Use Node $($tools.nodeMajor).x on PATH; found '$nodeVersion'."
}
$pnpmVersion = & pnpm --version
if ($LASTEXITCODE -ne 0 -or $pnpmVersion.Trim() -cne $tools.pnpm) {
    throw "Use pnpm $($tools.pnpm) on PATH; found '$pnpmVersion'. No global install is performed."
}
[xml] $project = Get-Content -LiteralPath $windowsProject -Raw
$sdkReference = $project.SelectSingleNode("//PackageReference[@Include='Microsoft.WindowsAppSDK']")
if (!$sdkReference -or $sdkReference.GetAttribute('Version') -cne $tools.windowsAppSdk) {
    throw "The WinUI project must pin Microsoft.WindowsAppSDK $($tools.windowsAppSdk)."
}

# Never clean the worktree or reuse a possibly stale publish directory.
$buildId = "build-$([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$buildRoot = Join-Path $repo "apps/windows/artifacts/$buildId"
$packageName = 'AcademicMarkdown-windows-x64-experimental'
$portable = Join-Path $buildRoot $packageName
$testResults = Join-Path $buildRoot 'test-results'
$driver = Join-Path $buildRoot 'sdk-driver'
[void][IO.Directory]::CreateDirectory($driver)
# Pin SDK selection for these invocations without adding/changing root global.json.
@{ sdk = @{ version = $tools.dotnetSdk; rollForward = 'disable'; allowPrerelease = $false } } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $driver 'global.json') -Encoding utf8NoBOM

Push-Location $repo
try {
    Invoke-Checked pnpm @('install', '--frozen-lockfile')
    Invoke-Checked pnpm @('typecheck')
    Invoke-Checked pnpm @('test')
    $scriptTests = @(Get-ChildItem -LiteralPath (Join-Path $repo 'scripts/test') -Filter 'windows-*.test.mjs' |
        Sort-Object Name | ForEach-Object { $_.FullName })
    if ($scriptTests.Count -eq 0) { throw 'Missing Windows packaging tests.' }
    Invoke-Checked node (@('--test') + $scriptTests)
    Invoke-Checked pnpm @('build:web')
    # Always consume the just-built apps/editor/dist, never the macOS Web copy.
    & (Join-Path $PSScriptRoot 'Stage-Resources.ps1') -RepoRoot $repo -TectonicDirectory $TectonicDirectory
}
finally { Pop-Location }

$previousResources = [Environment]::GetEnvironmentVariable('ACADEMIC_NATIVE_PDF_RESOURCES', 'Process')
$previousLatex = [Environment]::GetEnvironmentVariable('ACADEMIC_NATIVE_PDF_LATEX', 'Process')
$previousPdfOutput = [Environment]::GetEnvironmentVariable('ACADEMIC_NATIVE_PDF_OUTPUT', 'Process')
$previousTexCache = [Environment]::GetEnvironmentVariable('TECTONIC_CACHE_DIR', 'Process')
Push-Location $driver
try {
    $sdkVersion = & dotnet --version
    if ($LASTEXITCODE -ne 0 -or $sdkVersion.Trim() -cne $tools.dotnetSdk) {
        throw "Install .NET SDK $($tools.dotnetSdk); SDK roll-forward is disabled."
    }
    # The opt-in Core integration test runs the actual bundled Windows compiler
    # with isolated resources, --untrusted, --only-cached and the bundled TTB.
    $env:ACADEMIC_NATIVE_PDF_RESOURCES = $resources
    $env:ACADEMIC_NATIVE_PDF_LATEX = $fixture
    $env:ACADEMIC_NATIVE_PDF_OUTPUT = Join-Path $buildRoot 'smoke.pdf'
    $env:TECTONIC_CACHE_DIR = Join-Path $buildRoot 'smoke-tex-cache'
    [void][IO.Directory]::CreateDirectory($env:TECTONIC_CACHE_DIR)
    Invoke-Checked dotnet @('test', $testsProject, '--configuration', $Configuration,
        '--results-directory', $testResults, '--logger', 'trx;LogFileName=windows-core.trx')
    Assert-NativePdfSmokePassed (Join-Path $testResults 'windows-core.trx')

    $nativeProperties = @("-p:Platform=$($tools.platform)", '-p:SelfContained=true',
        '-p:WindowsAppSDKSelfContained=true', '-p:WindowsPackageType=None', '-p:PublishSingleFile=false')
    Invoke-Checked dotnet (@('restore', $windowsProject, '--runtime', $tools.runtimeIdentifier) + $nativeProperties)
    Invoke-Checked dotnet (@('build', $windowsProject, '--configuration', $Configuration,
        '--runtime', $tools.runtimeIdentifier, '--no-restore') + $nativeProperties)
    Invoke-Checked dotnet (@('publish', $windowsProject, '--configuration', $Configuration,
        '--runtime', $tools.runtimeIdentifier, '--self-contained', 'true', '--no-build',
        '--no-restore', '--output', $portable) + $nativeProperties)
}
finally {
    Pop-Location
    [Environment]::SetEnvironmentVariable('ACADEMIC_NATIVE_PDF_RESOURCES', $previousResources, 'Process')
    [Environment]::SetEnvironmentVariable('ACADEMIC_NATIVE_PDF_LATEX', $previousLatex, 'Process')
    [Environment]::SetEnvironmentVariable('ACADEMIC_NATIVE_PDF_OUTPUT', $previousPdfOutput, 'Process')
    [Environment]::SetEnvironmentVariable('TECTONIC_CACHE_DIR', $previousTexCache, 'Process')
}

$publishedResources = Join-Path $portable 'Resources'
Invoke-Checked node @($resourceTools, 'verify', $publishedResources)
$stagedInventory = (Get-FileHash -LiteralPath (Join-Path $resources 'resource-inventory.json') -Algorithm SHA256).Hash
$publishedInventory = (Get-FileHash -LiteralPath (Join-Path $publishedResources 'resource-inventory.json') -Algorithm SHA256).Hash
if ($stagedInventory -cne $publishedInventory) { throw 'Publish did not preserve the freshly staged resources.' }
foreach ($required in @('AcademicMarkdown.Windows.exe', 'AcademicMarkdown.Core.dll', 'coreclr.dll', 'Microsoft.UI.Xaml.dll')) {
    $file = Join-Path $portable $required
    if (!(Test-Path -LiteralPath $file -PathType Leaf) -or (Get-Item -LiteralPath $file).Length -eq 0) {
        throw "Missing self-contained publish output: $required"
    }
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'PORTABLE-README.md') -Destination (Join-Path $portable 'README.md')
Copy-Item -LiteralPath (Join-Path $repo 'THIRD_PARTY_NOTICES.md') -Destination (Join-Path $portable 'THIRD_PARTY_NOTICES.md')
Invoke-Checked node @($resourceTools, 'checksums', $portable)

# The archive contains the WHOLE publish directory. It is not a single-file executable.
$zip = Join-Path $buildRoot "$packageName.zip"
[IO.Compression.ZipFile]::CreateFromDirectory($portable, $zip, [IO.Compression.CompressionLevel]::Optimal, $true)
$zipHash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
"$zipHash  $packageName.zip" | Set-Content -LiteralPath "$zip.sha256" -Encoding utf8NoBOM
Copy-Item -LiteralPath (Join-Path $portable 'README.md') -Destination (Join-Path $buildRoot 'README.md')
Write-Host "Unsigned experimental portable ZIP: $zip"
Write-Host "SHA-256: $zipHash"
Write-Host 'Windows UI/IME/file-dialog validation and public redistribution clearance remain separate gates.'
if ($env:GITHUB_OUTPUT) {
    "artifact_directory=$buildRoot" | Add-Content -LiteralPath $env:GITHUB_OUTPUT -Encoding utf8NoBOM
}
