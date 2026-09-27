using System.Text;

namespace AcademicMarkdown.Core.Tests;

public sealed class NativePdfFactAttribute : FactAttribute
{
    public NativePdfFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ACADEMIC_NATIVE_PDF_RESOURCES")) ||
            string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ACADEMIC_NATIVE_PDF_LATEX")))
            Skip = "Opt-in: provide staged native resources and a trusted LaTeX fixture to test the real compiler.";
    }
}

public sealed class NativePdfSmokeTests
{
    [NativePdfFact]
    public async Task BundledNativeCompilerProducesOfflineVietnamesePdf()
    {
        var resources = Environment.GetEnvironmentVariable("ACADEMIC_NATIVE_PDF_RESOURCES")!;
        var fixture = Path.GetFullPath(Environment.GetEnvironmentVariable("ACADEMIC_NATIVE_PDF_LATEX")!);
        var latex = await File.ReadAllTextAsync(fixture, new UTF8Encoding(false, true));
        var stamp = new RevisionStamp(Guid.NewGuid(), 1);
        using var deadline = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        var result = await new TectonicCompiler(resources, new NativeCompilerProcess()).CompileAsync(
            new CompilerRequest(new ExportSnapshot(latex, [], 1, []), Path.GetDirectoryName(fixture)!, stamp),
            deadline.Token);
        Assert.Equal(stamp, result.Stamp);
        Assert.True(result.Pdf.Length > 1000);
        Assert.StartsWith("%PDF-", Encoding.ASCII.GetString(result.Pdf, 0, 5));
        var output = Environment.GetEnvironmentVariable("ACADEMIC_NATIVE_PDF_OUTPUT");
        if (!string.IsNullOrEmpty(output))
            await AtomicDocumentStore.WriteBytesAsync(output, result.Pdf, null, deadline.Token);
    }
}
