namespace AcademicMarkdown.Core.Tests;

public sealed class DocumentOpenFlowTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), $"academic-open-{Guid.NewGuid():N}");
    public DocumentOpenFlowTests() => Directory.CreateDirectory(root);
    public void Dispose() => Directory.Delete(root, true);

    [Fact]
    public async Task OpeningSameFileAfterSavingUnsavedChangesUsesNewBytes()
    {
        var path = Path.Combine(root, "report.md");
        var store = new AtomicDocumentStore();
        var fingerprint = await store.SaveAsync(path, "# Old source", null);
        var file = await new DocumentOpenFlow(store).PrepareAsync(path, async () =>
        {
            // The native unsaved-changes dialog chose Save before opening this same file.
            fingerprint = await store.SaveAsync(path, "# Nội dung vừa lưu", fingerprint);
            return true;
        });
        Assert.Equal("# Nội dung vừa lưu", file!.Markdown);
        Assert.Equal(fingerprint, file.Fingerprint);
    }

    [Fact]
    public async Task CancellationNeverReplacesTheCurrentDocument()
    {
        var path = Path.Combine(root, "other.md");
        await File.WriteAllTextAsync(path, "# Other");
        var result = await new DocumentOpenFlow(new AtomicDocumentStore())
            .PrepareAsync(path, () => Task.FromResult(false));
        Assert.Null(result);
    }

    [Fact]
    public async Task InvalidInputIsRejectedBeforeAskingToDiscardCurrentWork()
    {
        var consentAsked = false;
        await Assert.ThrowsAsync<FileNotFoundException>(() =>
            new DocumentOpenFlow(new AtomicDocumentStore()).PrepareAsync(Path.Combine(root, "missing.md"), () =>
            {
                consentAsked = true;
                return Task.FromResult(true);
            }));
        Assert.False(consentAsked);
    }
}
