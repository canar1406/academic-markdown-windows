using AcademicMarkdown.Core;
using Microsoft.UI.Xaml.Controls;
using Windows.Storage;
using Windows.System;

namespace AcademicMarkdown.Windows;

internal sealed partial class MainWindow
{
    private void StartExport()
    {
        if (exportTask is not null) return;
        exportCancellation = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        exportTask = ExportAsync(exportCancellation);
        RefreshControls();
    }

    private async Task ExportAsync(CancellationTokenSource cancellation)
    {
        // Ensure StartExport stores the task before even a synchronous early failure.
        await Task.Yield();
        var token = cancellation.Token;
        try
        {
            var documentId = session.DocumentId;
            var destination = await dialogs.SaveDestinationAsync(Path.GetFileNameWithoutExtension(DocumentName), ".pdf");
            if (destination is null) { status.Text = "PDF export cancelled."; return; }
            token.ThrowIfCancellationRequested();
            if (session.DocumentId != documentId) throw new InvalidOperationException("The active document changed.");
            if (string.Equals(destination.Path, session.Path, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("PDF output cannot replace the Markdown source.");
            if (!string.Equals(Path.GetExtension(destination.Path), ".pdf", StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Choose a destination with a .pdf extension.");

            var documentPath = session.Path;
            var response = await host.RequestAsync("export.requestLatex", new { }, "export.latex", token);
            var snapshot = ExportSnapshot.Decode(response);
            if (snapshot.Errors.Count > 0)
                throw new InvalidDataException(string.Join("\n", snapshot.Errors.Take(8)));
            session.ObserveRevision(snapshot.Revision);
            var stamp = new RevisionStamp(documentId, snapshot.Revision);
            var sourceSnapshot = await ReadSnapshotAsync(token);
            if (!session.IsCurrent(stamp) || sourceSnapshot.Stamp != stamp)
                throw new InvalidOperationException("The document changed while preparing PDF export. Try again.");
            if (documentPath is null && snapshot.AssetPaths.Count > 0)
                throw new InvalidDataException("Save this Markdown document before exporting relative images.");
            // Unsaved documents without assets need no filesystem authority over a document folder.
            var documentRoot = documentPath is null ? resourceRoot : Path.GetDirectoryName(documentPath)!;
            status.Text = "Building PDF… You can keep editing; changed documents will discard this result.";
            var compiler = new TectonicCompiler(resourceRoot, new NativeCompilerProcess());
            var result = await compiler.CompileAsync(new CompilerRequest(snapshot, documentRoot, stamp), token);
            token.ThrowIfCancellationRequested();

            // Only final validation/write pauses input; compilation never does.
            if (ioBusy || dialogs.IsShowing)
                throw new InvalidOperationException("PDF result discarded because a file operation is in progress. Export again when it finishes.");
            committingExport = true;
            RefreshControls();
            var current = await ReadSnapshotAsync(token);
            if (!session.IsCurrent(result.Stamp) || !SameSnapshot(sourceSnapshot, current) ||
                documentPath != session.Path)
                throw new InvalidOperationException("PDF result discarded because the document changed. Existing PDF is unchanged.");
            token.ThrowIfCancellationRequested();
            await Task.Run(() => AtomicDocumentStore.WriteBytesAsync(destination.Path, result.Pdf,
                destination.Fingerprint, token), token);
            lastPdf = destination.Path;
            status.Text = $"Exported {Path.GetFileName(lastPdf)}.";
        }
        catch (OperationCanceledException) { if (!closed) status.Text = "PDF export cancelled; existing output was not replaced."; }
        catch (Exception error) { if (!closed) ShowNotice(error.Message, InfoBarSeverity.Error); }
        finally
        {
            committingExport = false;
            exportTask = null;
            exportCancellation = null;
            cancellation.Dispose();
            if (!closed) RefreshControls();
        }
    }

    private async Task OpenLastPdfAsync()
    {
        if (lastPdf is null) return;
        var file = await StorageFile.GetFileFromPathAsync(lastPdf);
        if (!await Launcher.LaunchFileAsync(file)) throw new IOException("No application could open the exported PDF.");
    }
}
