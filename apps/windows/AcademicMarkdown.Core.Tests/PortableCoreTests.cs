using System.Text;

namespace AcademicMarkdown.Core.Tests;

public sealed class UnixSymlinkFactAttribute : FactAttribute
{
    public UnixSymlinkFactAttribute()
    {
        if (OperatingSystem.IsWindows())
            Skip = "Requires Windows symlink/junction privilege setup; retain the Windows reparse-point manual gate.";
    }
}

public sealed class PortableCoreTests : IDisposable
{
    private readonly string root = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"academic-tests-{Guid.NewGuid():N}");

    public PortableCoreTests() => Directory.CreateDirectory(root);
    public void Dispose() => Directory.Delete(root, true);

    [Theory]
    [InlineData("../report.md")]
    [InlineData("/etc/passwd")]
    [InlineData("C:/report.md")]
    [InlineData(@"images\..\report.md")]
    [InlineData("image.png:secret")]
    [InlineData("Images//a.png")]
    [InlineData("Images/./a.png")]
    [InlineData("NUL.png")]
    [InlineData("Images/COM1.txt")]
    [InlineData("Images/COM¹.png")]
    [InlineData("Images/LPT².png")]
    [InlineData("Images/bad. /a.png")]
    [InlineData("Images/a?.png")]
    public void RejectsWindowsAndUnixPathAttacks(string path)
        => Assert.Throws<InvalidDataException>(() => SafePaths.ValidateRelative(path));

    [Fact]
    public void ResolvesUnicodeImageUnderRoot()
    {
        Directory.CreateDirectory(System.IO.Path.Combine(root, "Hình ảnh"));
        var path = System.IO.Path.Combine(root, "Hình ảnh", "sơ đồ.png");
        File.WriteAllText(path, "image");
        Assert.Equal(path, SafePaths.ResolveExistingFile(root, "Hình ảnh/sơ đồ.png"));
    }

    [UnixSymlinkFact]
    public void RejectsSymlinkEvenWhenLexicallyInsideRoot()
    {
        var outside = System.IO.Path.Combine(root, "outside.png");
        File.WriteAllText(outside, "not an approved asset");
        Directory.CreateDirectory(System.IO.Path.Combine(root, "images"));
        File.CreateSymbolicLink(System.IO.Path.Combine(root, "images", "link.png"), outside);
        Assert.Throws<InvalidDataException>(() => SafePaths.ResolveExistingFile(
            System.IO.Path.Combine(root, "images"), "link.png"));
    }

    [Fact]
    public async Task SavesAndReopensVietnameseAndMalformedSourceWithoutRewriting()
    {
        const string source = "---\nfuture: [invalid YAML\n---\n# Võ Nguyễn Hoàng Long\n\n:::unknown {future=true}\nNội dung\n";
        var path = System.IO.Path.Combine(root, "Báo cáo.md");
        var store = new AtomicDocumentStore();
        var fingerprint = await store.SaveAsync(path, source, null);
        var read = await store.ReadAsync(path);
        Assert.Equal(source, read.Markdown);
        Assert.Equal(fingerprint, read.Fingerprint);
        Assert.Equal(new UTF8Encoding(false).GetBytes(source), await File.ReadAllBytesAsync(path));
    }

    [Fact]
    public async Task ExternalChangeDoesNotGetOverwritten()
    {
        var path = System.IO.Path.Combine(root, "report.md");
        var store = new AtomicDocumentStore();
        var fingerprint = await store.SaveAsync(path, "Original", null);
        await File.WriteAllTextAsync(path, "Changed by another program");
        await Assert.ThrowsAsync<FileConflictException>(() => store.SaveAsync(path, "My edits", fingerprint));
        Assert.Equal("Changed by another program", await File.ReadAllTextAsync(path));
        Assert.Single(Directory.GetFiles(root));
    }

    [Fact]
    public async Task SaveAsCannotSilentlyClobberAnExistingFile()
    {
        var path = System.IO.Path.Combine(root, "report.md");
        await File.WriteAllTextAsync(path, "Keep me");
        await Assert.ThrowsAsync<FileConflictException>(() => new AtomicDocumentStore().SaveAsync(path, "New", null));
        Assert.Equal("Keep me", await File.ReadAllTextAsync(path));
    }

    [Fact]
    public async Task RejectsInvalidUtf8InsteadOfReplacingCharacters()
    {
        var path = System.IO.Path.Combine(root, "broken.md");
        await File.WriteAllBytesAsync(path, [0xC3, 0x28]);
        await Assert.ThrowsAsync<DecoderFallbackException>(() => new AtomicDocumentStore().ReadAsync(path));
    }

    [Fact]
    public async Task CancelledSaveDoesNotTouchExistingSource()
    {
        var path = System.IO.Path.Combine(root, "report.md");
        var store = new AtomicDocumentStore();
        var fingerprint = await store.SaveAsync(path, "Keep me", null);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            store.SaveAsync(path, "New", fingerprint, new CancellationToken(true)));
        Assert.Equal("Keep me", await File.ReadAllTextAsync(path));
    }

    [Fact]
    public void OldDocumentBuildCannotBeReusedAtSameRevisionInNewDocument()
    {
        var session = new DocumentSession();
        var old = session.Stamp;
        session.Replace("new.md", "fingerprint");
        Assert.False(session.IsCurrent(old));
        Assert.False(session.IsDirty);
    }

    [Fact]
    public void SavingSnapshotDoesNotMarkLaterEditsAsSaved()
    {
        var session = new DocumentSession();
        session.ObserveRevision(3);
        var saved = session.Stamp;
        session.ObserveRevision(4);
        session.Saved(saved, "report.md", "fingerprint");
        Assert.True(session.IsDirty);
        Assert.Equal(3, session.PersistedRevision);
        session.ObserveRevision(2);
        Assert.Equal(4, session.Revision);
    }

    [Fact]
    public void BridgePreservesUnicodeAndTreatsCodeLikeTextAsData()
    {
        var envelope = BridgeEnvelope.Create("document.loadMarkdown", "123",
            new { markdown = "# Tiếng Việt '); alert('not code');" });
        var decoded = BridgeEnvelope.Parse(envelope.ToJson());
        Assert.Equal(envelope.Payload.GetProperty("markdown").GetString(),
            decoded.Payload.GetProperty("markdown").GetString());
    }

    [Theory]
    [InlineData("null")]
    [InlineData("[]")]
    [InlineData("{\"protocolVersion\":2,\"type\":\"editor.ready\",\"requestId\":null,\"payload\":{}}")]
    [InlineData("{\"protocolVersion\":1,\"type\":\"\",\"requestId\":null,\"payload\":{}}")]
    [InlineData("{\"protocolVersion\":1,\"type\":\"   \",\"requestId\":null,\"payload\":{}}")]
    [InlineData("{\"protocolVersion\":1,\"type\":\"editor.ready\",\"requestId\":2,\"payload\":{}}")]
    [InlineData("{\"protocolVersion\":1,\"type\":\"editor.ready\",\"requestId\":null,\"payload\":[]}")]
    [InlineData("{\"protocolVersion\":1,\"protocolVersion\":2,\"type\":\"editor.ready\",\"requestId\":null,\"payload\":{}}")]
    public void RejectsMalformedEnvelope(string json)
        => Assert.Throws<InvalidDataException>(() => BridgeEnvelope.Parse(json));

    [Theory]
    [InlineData(-1)]
    [InlineData(9007199254740992)]
    public void RejectsInvalidRevisions(long revision)
        => Assert.Throws<InvalidDataException>(() => BridgeEnvelope.Create(
            "document.changed", null, new { revision }).ReadRevision());
}
