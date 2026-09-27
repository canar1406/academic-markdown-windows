using AcademicMarkdown.Core;
using Microsoft.UI.Xaml.Controls;
using System.Text.Json;

namespace AcademicMarkdown.Windows;

internal sealed partial class MainWindow
{
    private sealed record MarkdownSnapshot(string Markdown, RevisionStamp Stamp);

    private async Task<MarkdownSnapshot> ReadSnapshotAsync(CancellationToken cancellationToken = default)
    {
        var documentId = session.DocumentId;
        var envelope = await host.RequestAsync("document.requestMarkdown", new { }, "document.markdown",
            cancellationToken);
        if (documentId != session.DocumentId)
            throw new InvalidOperationException("The document changed while reading its source.");
        if (!envelope.Payload.TryGetProperty("markdown", out var source) ||
            source.ValueKind != JsonValueKind.String || source.GetString() is not { } markdown)
            throw new InvalidDataException("The editor returned an invalid Markdown snapshot.");
        var revision = envelope.ReadRevision();
        if (revision < session.Revision)
            throw new InvalidOperationException("The editor returned an older snapshot. Please try again.");
        session.ObserveRevision(revision);
        contentDiffers = markdown != persistedMarkdown;
        RefreshControls();
        return new MarkdownSnapshot(markdown, new RevisionStamp(documentId, revision));
    }

    private static bool SameSnapshot(MarkdownSnapshot left, MarkdownSnapshot right) =>
        left.Stamp == right.Stamp && left.Markdown == right.Markdown;

    private async Task<MarkdownSnapshot?> GuardUnsavedAsync()
    {
        // Always read before IsDirty: debounced source/visual notifications can arrive late.
        var snapshot = await ReadSnapshotAsync(lifetime.Token);
        if (!session.IsDirty && !contentDiffers) return snapshot;
        var choice = await dialogs.UnsavedChangesAsync(DocumentName);
        if (choice == ContentDialogResult.None) return null;
        if (choice == ContentDialogResult.Primary)
        {
            if (!await SaveAsync(false)) return null;
            var afterSave = await ReadSnapshotAsync(lifetime.Token);
            if (session.IsDirty || contentDiffers)
            {
                ShowNotice("New edits arrived during Save. Review them before continuing.", InfoBarSeverity.Warning);
                return null;
            }
            return afterSave;
        }
        var afterPrompt = await ReadSnapshotAsync(lifetime.Token);
        if (!SameSnapshot(snapshot, afterPrompt))
        {
            ShowNotice("The document changed while confirmation was open. Review the new edits and try again.",
                InfoBarSeverity.Warning);
            return null;
        }
        return afterPrompt;
    }

    private async Task NewAsync()
    {
        if (await GuardUnsavedAsync() is null) return;
        exportCancellation?.Cancel();
        await LoadDocumentAsync("", null, null);
        status.Text = "New Markdown document.";
    }

    private async Task OpenAsync()
    {
        var path = await dialogs.OpenMarkdownAsync();
        if (path is null) return;
        // Validate before consent, then reread after Save/Discard: consent may
        // itself save to the same path being opened.
        var file = await new DocumentOpenFlow(store).PrepareAsync(path,
            async () => await GuardUnsavedAsync() is not null, lifetime.Token);
        if (file is null) return;
        exportCancellation?.Cancel();
        await LoadDocumentAsync(file.Markdown, file.Path, file.Fingerprint);
        status.Text = $"Opened {DocumentName}.";
    }

    private async Task LoadDocumentAsync(string markdown, string? path, string? fingerprint)
    {
        loadingDocument = true;
        RefreshControls();
        var previousRoot = host.DocumentRoot;
        try
        {
            host.DocumentRoot = path is null ? null : Path.GetDirectoryName(path);
            pages = [];
            inventoryGeneration++;
            host.Send(BridgeEnvelope.Create("document.loadMarkdown", null, new { markdown }));
            // PostWebMessageAsJson preserves message order. The request is the load ACK,
            // not an assumption that Navigate/DOM completion means the bridge is ready.
            var reply = await host.RequestAsync("document.requestMarkdown", new { }, "document.markdown", lifetime.Token);
            var revision = reply.ReadRevision();
            if (!reply.Payload.TryGetProperty("markdown", out var value) ||
                value.ValueKind != JsonValueKind.String || value.GetString() is not { } loaded)
                throw new InvalidDataException("The editor did not acknowledge the loaded Markdown.");
            session.Replace(path, fingerprint);
            session.ObserveRevision(revision);
            persistedMarkdown = markdown;
            contentDiffers = loaded != markdown;
            hasLoadedDocument = true;
            if (contentDiffers)
                ShowNotice("The visual editor normalized this document. Nothing has been written to disk; review Source before saving.",
                    InfoBarSeverity.Warning);
            if (zoom.SelectedItem is ComboBoxItem { Tag: int percent })
                host.Send(BridgeEnvelope.Create("editor.setZoom", null,
                    new { magnification = percent / 100.0, interactive = false }));
        }
        catch
        {
            // The editor state is unknown after a missing load ACK. Keep it visible,
            // refuse further operations, and never mark the previous document saved.
            host.DocumentRoot = previousRoot;
            editorReady = false;
            throw;
        }
        finally { loadingDocument = false; RefreshControls(); }
    }

    private async Task<bool> SaveAsync(bool saveAs)
    {
        var documentId = session.DocumentId;
        var destination = session.Path;
        var fingerprint = session.Fingerprint;
        if (saveAs || destination is null)
        {
            var selected = await dialogs.SaveDestinationAsync(Path.GetFileNameWithoutExtension(DocumentName), ".md");
            if (selected is null) return false;
            if (documentId != session.DocumentId) throw new InvalidOperationException("The active document changed.");
            destination = selected.Path;
            fingerprint = selected.Fingerprint;
            // Choosing the original path in Save As must not erase external-change detection.
            if (string.Equals(destination, session.Path, StringComparison.OrdinalIgnoreCase) &&
                fingerprint != session.Fingerprint) throw new FileConflictException(destination);
        }

        // Capture AFTER any native picker/overwrite prompt, never before.
        var snapshot = await ReadSnapshotAsync(lifetime.Token);
        var savedFingerprint = await store.SaveAsync(destination, snapshot.Markdown, fingerprint, lifetime.Token);
        session.Saved(snapshot.Stamp, destination, savedFingerprint);
        persistedMarkdown = snapshot.Markdown;
        host.DocumentRoot = Path.GetDirectoryName(destination);
        var afterSave = await ReadSnapshotAsync(lifetime.Token);
        status.Text = SameSnapshot(snapshot, afterSave)
            ? $"Saved {DocumentName}."
            : $"Saved {DocumentName}; newer edits are still unsaved.";
        RefreshControls();
        return true;
    }
}
