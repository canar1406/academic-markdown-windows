#Requires -Version 5.1
# Windows PowerShell/.NET Framework supplies UIAutomationClient for native WinUI.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $Executable,
    [Parameter(Mandatory)][string] $ReportPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'Native startup smoke requires a Windows desktop session.'
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$executablePath = (Resolve-Path -LiteralPath $Executable).Path
$process = Start-Process -FilePath $executablePath -WorkingDirectory (Split-Path $executablePath) -PassThru
$report = [ordered]@{
    status = 'failed'
    checked = 'Native WinUI startup and bundled editor.ready plus Markdown load acknowledgement'
    fullInteractiveAcceptance = $false
    processId = $process.Id
    observedText = @()
    error = $null
}
try {
    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    $ready = $false
    while ([DateTime]::UtcNow -lt $deadline) {
        $process.Refresh()
        if ($process.HasExited) { throw "App exited before editor readiness (exit $($process.ExitCode))." }
        $condition = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $process.Id)
        $window = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst(
            [System.Windows.Automation.TreeScope]::Children, $condition)
        if ($null -ne $window) {
            try {
                $elements = $window.FindAll(
                    [System.Windows.Automation.TreeScope]::Descendants,
                    [System.Windows.Automation.Condition]::TrueCondition)
                $names = @($elements | ForEach-Object { $_.Current.Name } | Where-Object { $_ } | Select-Object -Unique)
                $report.observedText = @($names | Select-Object -First 80)
                $startupError = @($names | Where-Object { $_ -like '*Editor startup failed*' })
                if ($startupError.Count -gt 0) { throw ($startupError -join '; ') }
                $ready = @($names | Where-Object {
                    $_ -like 'Ready*' -and $_ -like '*PDF export is manual*'
                }).Count -gt 0
                if ($ready) { break }
            }
            catch [System.Windows.Automation.ElementNotAvailableException] {
                # The native tree can be replaced while WebView2 initializes.
            }
        }
        Start-Sleep -Milliseconds 500
    }
    if (!$ready) { throw 'No native Ready status after 90 seconds; do not treat process creation as successful startup.' }
    $report.status = 'passed'
    Write-Host 'Native startup smoke passed: WinUI window and local editor load acknowledgement are visible.'
}
catch {
    $report.error = $_.Exception.Message
    throw
}
finally {
    [void][IO.Directory]::CreateDirectory((Split-Path -Parent $ReportPath))
    $report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ReportPath -Encoding UTF8
    $process.Refresh()
    if (!$process.HasExited) {
        # Only this script's empty-document test process; never search/kill by app name.
        [void]$process.CloseMainWindow()
        if (!$process.WaitForExit(5000)) {
            & taskkill.exe /PID $process.Id /T /F | Out-Null
        }
    }
    $process.Dispose()
}
