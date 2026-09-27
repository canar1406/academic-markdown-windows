namespace AcademicMarkdown.Core;

/// <summary>Validates input before prompting and reads the final bytes after Save/Discard consent.</summary>
public sealed class DocumentOpenFlow(AtomicDocumentStore store)
{
    public async Task<FileSnapshot?> PrepareAsync(string path, Func<Task<bool>> consent,
        CancellationToken cancellationToken = default)
    {
        // Preserve the caller's UI synchronization context for native consent.
        // Store IO/decoding already runs asynchronously/off the UI thread.
        await store.ReadAsync(path, cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
        if (!await consent()) return null;
        cancellationToken.ThrowIfCancellationRequested();
        // Consent may have saved the current document over this same path.
        // Reusing the pre-prompt snapshot would reopen stale Markdown.
        return await store.ReadAsync(path, cancellationToken);
    }
}
