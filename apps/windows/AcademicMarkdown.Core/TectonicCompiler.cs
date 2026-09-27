using System.Text;
using System.Text.Json;

namespace AcademicMarkdown.Core;

public sealed record CompilerRequest(ExportSnapshot Export, string DocumentRoot, RevisionStamp Stamp);
public sealed record CompilerResult(byte[] Pdf, string Log, RevisionStamp Stamp);
public sealed record ProcessSpec(string Executable, string WorkingDirectory, IReadOnlyList<string> Arguments);
public sealed record ProcessResult(int ExitCode, string Log);

public interface ICompilerProcess
{
    Task<ProcessResult> RunAsync(ProcessSpec spec, CancellationToken cancellationToken);
}

public sealed class TectonicCompiler
{
    private readonly string resourceRoot;
    private readonly ICompilerProcess process;

    public TectonicCompiler(string resourceRoot, ICompilerProcess process)
    {
        this.resourceRoot = resourceRoot;
        this.process = process;
    }

    public Task<CompilerResult> CompileAsync(CompilerRequest request, CancellationToken cancellationToken = default)
        => Task.Run(() => CompileInWorkspaceAsync(request, cancellationToken), cancellationToken);

    private async Task<CompilerResult> CompileInWorkspaceAsync(CompilerRequest request, CancellationToken token)
    {
        if (request.Export.Errors.Count > 0)
            throw new InvalidDataException(string.Join("\n", request.Export.Errors.Take(8)));
        if (request.Export.Revision != request.Stamp.Revision)
            throw new InvalidDataException("LaTeX snapshot revision does not match the build request.");
        var resources = await ReadResourcesAsync(token).ConfigureAwait(false);
        var workspace = Path.Combine(Path.GetTempPath(), $"AcademicMarkdown-{Guid.NewGuid():N}");
        Directory.CreateDirectory(workspace);
        try
        {
            var occupied = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                { "report.tex", "report.pdf", "report.log", "report.synctex.gz" };
            foreach (var asset in resources.Assets)
            {
                if (!occupied.Add(asset.Target)) throw new InvalidDataException("Duplicate runtime resource target.");
                await CopyAsync(SafePaths.ResolveExistingFile(resourceRoot, asset.Source),
                    Path.Combine(workspace, asset.Target), token).ConfigureAwait(false);
            }
            foreach (var relative in request.Export.AssetPaths)
            {
                SafePaths.ValidateRelative(relative);
                if (!occupied.Add(relative) || !AllowedAsset(relative))
                    throw new InvalidDataException($"Unsupported or reserved export asset path: {relative}");
                await CopyAsync(SafePaths.ResolveExistingFile(request.DocumentRoot, relative),
                    Path.Combine(workspace, relative), token).ConfigureAwait(false);
            }
            var tex = Path.Combine(workspace, "report.tex");
            await File.WriteAllTextAsync(tex, request.Export.Latex, new UTF8Encoding(false, true), token)
                .ConfigureAwait(false);
            var spec = new ProcessSpec(
                SafePaths.ResolveExistingFile(resourceRoot, resources.Compiler), workspace,
                ["--untrusted", "--only-cached", "--bundle",
                    SafePaths.ResolveExistingFile(resourceRoot, resources.SupportBundle),
                    "--keep-logs", "--synctex", "--outdir", workspace, tex]);
            var result = await process.RunAsync(spec, token).ConfigureAwait(false);
            token.ThrowIfCancellationRequested();
            if (result.ExitCode != 0)
                throw new InvalidDataException($"PDF compilation failed ({result.ExitCode}).\n{DiagnosticSummary(result.Log)}");
            var path = Path.Combine(workspace, "report.pdf");
            if (!File.Exists(path) || new FileInfo(path).Length > 128 * 1024 * 1024)
                throw new InvalidDataException("The compiler did not produce a supported PDF (maximum 128 MiB).");
            var bytes = await File.ReadAllBytesAsync(path, token).ConfigureAwait(false);
            if (bytes.Length < 5 || !bytes.AsSpan(0, 5).SequenceEqual("%PDF-"u8))
                throw new InvalidDataException("The compiler output is not a PDF.");
            return new CompilerResult(bytes, result.Log, request.Stamp);
        }
        finally
        {
            // A failed cleanup must not replace a useful compiler error or cancellation.
            try { Directory.Delete(workspace, recursive: true); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }

    private sealed record ResourceAsset(string Source, string Target);
    private sealed record RuntimeResources(string Compiler, string SupportBundle, IReadOnlyList<ResourceAsset> Assets);

    private async Task<RuntimeResources> ReadResourcesAsync(CancellationToken token)
    {
        var manifest = SafePaths.ResolveExistingFile(resourceRoot, "runtime-resources.json");
        using var json = JsonDocument.Parse(await File.ReadAllTextAsync(manifest, token).ConfigureAwait(false));
        var data = json.RootElement;
        if (data.GetProperty("schemaVersion").GetInt32() != 1)
            throw new InvalidDataException("Unsupported runtime resource manifest.");
        var compiler = SafePaths.ValidateRelative(data.GetProperty("compiler").GetString() ?? "");
        var bundle = SafePaths.ValidateRelative(data.GetProperty("supportBundle").GetString() ?? "");
        var assets = data.GetProperty("assets").EnumerateArray().Select(asset =>
            new ResourceAsset(
                SafePaths.ValidateRelative(asset.GetProperty("source").GetString() ?? ""),
                SafePaths.ValidateRelative(asset.GetProperty("target").GetString() ?? ""))).ToArray();
        return new RuntimeResources(compiler, bundle, assets);
    }

    private static bool AllowedAsset(string relative)
        => Path.GetExtension(relative).ToLowerInvariant() is ".png" or ".jpg" or ".jpeg" or ".pdf";

    private static async Task CopyAsync(string source, string destination, CancellationToken token)
    {
        if (new FileInfo(source).Length > 64 * 1024 * 1024)
            throw new InvalidDataException("An export asset exceeds the 64 MiB limit.");
        Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
        await using var input = new FileStream(source, FileMode.Open, FileAccess.Read, FileShare.Read,
            64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
        await using var output = new FileStream(destination, FileMode.CreateNew, FileAccess.Write, FileShare.None,
            64 * 1024, FileOptions.Asynchronous);
        await input.CopyToAsync(output, token).ConfigureAwait(false);
    }

    private static string DiagnosticSummary(string log)
    {
        var lines = log.Split('\n');
        var errors = lines.Where(line => line.Contains("error", StringComparison.OrdinalIgnoreCase) ||
            line.StartsWith('!')).Take(8).ToArray();
        var summary = string.Join("\n", errors.Length > 0 ? errors : lines.TakeLast(12));
        return summary.Length > 4000 ? summary[..4000] : summary;
    }
}
