using System.Diagnostics;
using System.Text;

namespace AcademicMarkdown.Core;

public sealed class NativeCompilerProcess : ICompilerProcess
{
    private const int LogCharacterLimit = 2 * 1024 * 1024;

    public async Task<ProcessResult> RunAsync(ProcessSpec spec, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var start = new ProcessStartInfo
        {
            FileName = spec.Executable,
            WorkingDirectory = spec.WorkingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8
        };
        foreach (var argument in spec.Arguments) start.ArgumentList.Add(argument);
        using var process = new Process { StartInfo = start };
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        using var cancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeout.Token);
        if (!process.Start()) throw new IOException("Could not start the bundled Tectonic compiler.");
        // Drain both streams concurrently; continuing after the log cap prevents pipe deadlock.
        var stdout = ReadBoundedAsync(process.StandardOutput, cancellation.Token);
        var stderr = ReadBoundedAsync(process.StandardError, cancellation.Token);
        try
        {
            await process.WaitForExitAsync(cancellation.Token).ConfigureAwait(false);
            var logs = await Task.WhenAll(stdout, stderr).ConfigureAwait(false);
            return new ProcessResult(process.ExitCode, string.Join("\n", logs));
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
        {
            try { if (!process.HasExited) process.Kill(entireProcessTree: true); }
            catch (InvalidOperationException) { }
            await process.WaitForExitAsync(CancellationToken.None).ConfigureAwait(false);
            try { await Task.WhenAll(stdout, stderr).ConfigureAwait(false); }
            catch (OperationCanceledException) { }
            if (!cancellationToken.IsCancellationRequested && timeout.IsCancellationRequested)
                throw new TimeoutException("PDF compilation exceeded the 3-minute time limit.");
            throw;
        }
    }

    private static async Task<string> ReadBoundedAsync(StreamReader reader, CancellationToken token)
    {
        var text = new StringBuilder();
        var buffer = new char[8192];
        var truncated = false;
        while (true)
        {
            var count = await reader.ReadAsync(buffer.AsMemory(), token).ConfigureAwait(false);
            if (count == 0) break;
            var keep = Math.Min(count, Math.Max(0, LogCharacterLimit - text.Length));
            text.Append(buffer, 0, keep);
            truncated |= count > keep;
        }
        if (truncated) text.Append("\n[Compiler log truncated at 2 Mi characters]");
        return text.ToString();
    }
}
