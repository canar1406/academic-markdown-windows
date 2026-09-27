using System.Text;
using System.Text.Json;

namespace AcademicMarkdown.Core.Tests;

public sealed class ExportAndRequestsTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), $"academic-export-tests-{Guid.NewGuid():N}");

    public ExportAndRequestsTests() => Directory.CreateDirectory(root);
    public void Dispose() => Directory.Delete(root, true);

    [Fact]
    public async Task RegistersRequestBeforeSendingAndAcceptsOnlyMatchingResponse()
    {
        using var requests = new BridgeRequests();
        var response = await requests.RequestAsync(sent =>
        {
            Assert.False(requests.Receive(BridgeEnvelope.Create("export.latex", sent.RequestId, new { })));
            Assert.True(requests.Receive(BridgeEnvelope.Create("document.markdown", sent.RequestId,
                new { markdown = "# Tài liệu", revision = 2 })));
        }, "document.requestMarkdown", new { }, "document.markdown");
        Assert.Equal(2, response.ReadRevision());
    }

    [Fact]
    public async Task CancellationRemovesPendingRequestAndIgnoresLateResponse()
    {
        using var requests = new BridgeRequests();
        using var cancelled = new CancellationTokenSource();
        BridgeEnvelope? sent = null;
        var pending = requests.RequestAsync(message => sent = message, "document.requestMarkdown",
            new { }, "document.markdown", cancelled.Token);
        cancelled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => pending);
        Assert.False(requests.Receive(BridgeEnvelope.Create("document.markdown", sent!.RequestId, new { })));
    }

    [Fact]
    public async Task UnresponsiveEditorTimesOutRatherThanHangingSave()
    {
        using var requests = new BridgeRequests();
        await Assert.ThrowsAsync<TimeoutException>(() => requests.RequestAsync(_ => { },
            "document.requestMarkdown", new { }, "document.markdown", timeout: TimeSpan.FromMilliseconds(10)));
    }

    [Fact]
    public void ExportRejectsUnsafePathsBeforeInvokingCompiler()
    {
        var envelope = BridgeEnvelope.Create("export.latex", "id",
            new { latex = "latex", assetPaths = new[] { "../secret" }, revision = 1, diagnostics = new object[0] });
        Assert.Throws<InvalidDataException>(() => ExportSnapshot.Decode(envelope));
    }

    [Fact]
    public void ExportDecodesSourceErrorsWithoutDiscardingThem()
    {
        var export = ExportSnapshot.Decode(BridgeEnvelope.Create("export.latex", "id", new
        {
            // The shared exporter deliberately returns empty LaTeX on source errors.
            latex = "", assetPaths = new string[0], revision = 1,
            diagnostics = new[] { new { severity = "error", message = "Invalid directive" } }
        }));
        Assert.Equal(["Invalid directive"], export.Errors);
    }

    [Fact]
    public async Task CompilerStagesAssetsAndRunsOnlyWithRestrictedArguments()
    {
        var resources = CreateResources();
        var documentRoot = Path.Combine(root, "document");
        Directory.CreateDirectory(Path.Combine(documentRoot, "Hình"));
        await File.WriteAllTextAsync(Path.Combine(documentRoot, "Hình", "sơ đồ.png"), "image");
        string? workspace = null;
        var runner = new TestProcess(async (spec, _) =>
        {
            workspace = spec.WorkingDirectory;
            Assert.Equal(Path.Combine(resources, "Tools", "tectonic.exe"), spec.Executable);
            Assert.Contains("--untrusted", spec.Arguments);
            Assert.Contains("--only-cached", spec.Arguments);
            Assert.DoesNotContain("--shell-escape", spec.Arguments);
            var bundleArgument = spec.Arguments[spec.Arguments.ToList().IndexOf("--bundle") + 1];
            Assert.StartsWith("file:///", bundleArgument);
            Assert.Equal(Path.Combine(resources, "TeX", "support.ttb"), new Uri(bundleArgument).LocalPath);
            Assert.Equal("source latex", await File.ReadAllTextAsync(Path.Combine(workspace, "report.tex")));
            Assert.Equal("image", await File.ReadAllTextAsync(Path.Combine(workspace, "Hình", "sơ đồ.png")));
            await File.WriteAllBytesAsync(Path.Combine(workspace, "report.pdf"), Encoding.ASCII.GetBytes("%PDF-1.7\nfixture"));
            return new ProcessResult(0, "compiled");
        });
        var stamp = new RevisionStamp(Guid.NewGuid(), 4);
        var result = await new TectonicCompiler(resources, runner).CompileAsync(new CompilerRequest(
            new ExportSnapshot("source latex", ["Hình/sơ đồ.png"], 4, []), documentRoot, stamp));
        Assert.Equal(stamp, result.Stamp);
        Assert.StartsWith("%PDF-", Encoding.ASCII.GetString(result.Pdf));
        Assert.False(Directory.Exists(workspace));
    }

    [Fact]
    public async Task CompilerRefusesSourceErrorsAndReservedFileCollisions()
    {
        var resources = CreateResources();
        var runner = new TestProcess((_, _) => throw new Xunit.Sdk.XunitException("Compiler must not start"));
        var compiler = new TectonicCompiler(resources, runner);
        var stamp = new RevisionStamp(Guid.NewGuid(), 1);
        await Assert.ThrowsAsync<InvalidDataException>(() => compiler.CompileAsync(new CompilerRequest(
            new ExportSnapshot("bad source", [], 1, ["Malformed LMX"]), root, stamp)));
        await Assert.ThrowsAsync<InvalidDataException>(() => compiler.CompileAsync(new CompilerRequest(
            new ExportSnapshot("source", ["report.tex"], 1, []), root, stamp)));
    }

    [Fact]
    public async Task CompilerFailureDoesNotReturnPartialPdfAndCleansWorkspace()
    {
        string? workspace = null;
        var runner = new TestProcess(async (spec, _) =>
        {
            workspace = spec.WorkingDirectory;
            await File.WriteAllTextAsync(Path.Combine(workspace, "report.pdf"), "%PDF-partial");
            return new ProcessResult(1, "error: missing font");
        });
        var stamp = new RevisionStamp(Guid.NewGuid(), 1);
        var error = await Assert.ThrowsAsync<InvalidDataException>(() =>
            new TectonicCompiler(CreateResources(), runner).CompileAsync(new CompilerRequest(
                new ExportSnapshot("source", [], 1, []), root, stamp)));
        Assert.Contains("missing font", error.Message);
        Assert.False(Directory.Exists(workspace));
    }

    [Fact]
    public async Task CancelledCompilerCleansTemporaryFiles()
    {
        string? workspace = null;
        using var cancel = new CancellationTokenSource();
        var runner = new TestProcess((spec, _) =>
        {
            workspace = spec.WorkingDirectory;
            cancel.Cancel();
            throw new OperationCanceledException(cancel.Token);
        });
        var stamp = new RevisionStamp(Guid.NewGuid(), 1);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            new TectonicCompiler(CreateResources(), runner).CompileAsync(new CompilerRequest(
                new ExportSnapshot("source", [], 1, []), root, stamp), cancel.Token));
        Assert.False(Directory.Exists(workspace));
    }

    private string CreateResources()
    {
        var resources = Path.Combine(root, "Resources");
        Directory.CreateDirectory(Path.Combine(resources, "Tools"));
        Directory.CreateDirectory(Path.Combine(resources, "TeX"));
        File.WriteAllText(Path.Combine(resources, "Tools", "tectonic.exe"), "test process");
        File.WriteAllText(Path.Combine(resources, "TeX", "support.ttb"), "test bundle");
        File.WriteAllText(Path.Combine(resources, "runtime-resources.json"), JsonSerializer.Serialize(new
        {
            schemaVersion = 1, compiler = "Tools/tectonic.exe", supportBundle = "TeX/support.ttb",
            assets = new object[0]
        }));
        return resources;
    }

    private sealed class TestProcess(Func<ProcessSpec, CancellationToken, Task<ProcessResult>> run) : ICompilerProcess
    {
        public Task<ProcessResult> RunAsync(ProcessSpec spec, CancellationToken cancellationToken) => run(spec, cancellationToken);
    }
}
