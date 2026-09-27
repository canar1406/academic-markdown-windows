using System.Diagnostics;

namespace AcademicMarkdown.Core.Tests;

public sealed class NativeCompilerProcessTests
{
    [Fact]
    public async Task DrainsStdoutAndStderrBeyondPipeCapacity()
    {
        // Tests exercise the real process boundary, never a fake exit code.
        // The scripts are fixed test fixtures, not application shell support.
        var spec = OperatingSystem.IsWindows()
            ? new ProcessSpec("powershell.exe", Path.GetTempPath(),
                ["-NoProfile", "-NonInteractive", "-Command",
                    "1..10000 | ForEach-Object { [Console]::Out.WriteLine('out line 123456789'); [Console]::Error.WriteLine('err line 123456789') }"])
            : new ProcessSpec("/bin/sh", Path.GetTempPath(),
                ["-c", "i=0; while [ $i -lt 10000 ]; do printf 'out line 123456789\\n'; printf 'err line 123456789\\n' >&2; i=$((i+1)); done"]);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        var result = await new NativeCompilerProcess().RunAsync(spec, deadline.Token);
        Assert.Equal(0, result.ExitCode);
        Assert.Contains("out line", result.Log);
        Assert.Contains("err line", result.Log);
        Assert.True(result.Log.Length > 200_000);
    }

    [Fact]
    public async Task CancellationTerminatesRunningProcess()
    {
        var spec = OperatingSystem.IsWindows()
            ? new ProcessSpec("powershell.exe", Path.GetTempPath(),
                ["-NoProfile", "-NonInteractive", "-Command", "Start-Sleep -Seconds 60"])
            : new ProcessSpec("/bin/sleep", Path.GetTempPath(), ["60"]);
        using var cancellation = new CancellationTokenSource(TimeSpan.FromMilliseconds(200));
        var stopwatch = Stopwatch.StartNew();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            new NativeCompilerProcess().RunAsync(spec, cancellation.Token));
        Assert.True(stopwatch.Elapsed < TimeSpan.FromSeconds(10));
    }
}
