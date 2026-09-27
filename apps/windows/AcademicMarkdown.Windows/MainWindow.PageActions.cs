using AcademicMarkdown.Core;
using Microsoft.UI.Xaml.Controls;
using System.Text.Json;

namespace AcademicMarkdown.Windows;

internal sealed partial class MainWindow
{
    private sealed record PageInfo(int Index, string Kind, bool Deletable);
    private PageInfo[] pages = [];
    private long inventoryGeneration;

    private void ReceivePageInventory(JsonElement payload)
    {
        pages = [];
        inventoryGeneration++;
        if (!payload.TryGetProperty("layoutRevision", out var layout) || layout.ValueKind != JsonValueKind.Number ||
            !layout.TryGetInt64(out var revision) ||
            revision < 0 || !payload.TryGetProperty("pages", out var items) || items.ValueKind != JsonValueKind.Array ||
            items.GetArrayLength() > 10000) throw new InvalidDataException("Invalid page inventory.");
        var next = new List<PageInfo>();
        foreach (var item in items.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty("pageIndex", out var index) ||
                index.ValueKind != JsonValueKind.Number || !index.TryGetInt32(out var pageIndex) || pageIndex != next.Count ||
                !item.TryGetProperty("kind", out var kind) || kind.ValueKind != JsonValueKind.String ||
                kind.GetString() is not ("semantic" or "content" or "blank") ||
                !item.TryGetProperty("deletable", out var deletable) ||
                deletable.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                throw new InvalidDataException("Invalid page inventory entry.");
            next.Add(new PageInfo(pageIndex, kind.GetString()!, deletable.GetBoolean()));
        }
        pages = next.ToArray();
    }

    private async Task HandlePageActionAsync(JsonElement payload)
    {
        try
        {
            if (!editorReady || ioBusy || committingExport || dialogs.IsShowing || currentMode != "visual")
            {
                ShowNotice("Page controls are unavailable during a file operation or outside Visual mode.",
                    InfoBarSeverity.Warning);
                return;
            }
            if (!payload.TryGetProperty("pageIndex", out var index) || index.ValueKind != JsonValueKind.Number ||
                !index.TryGetInt32(out var pageIndex) ||
                !payload.TryGetProperty("action", out var value) || value.ValueKind != JsonValueKind.String ||
                value.GetString() is not ("addAfter" or "delete" or "moveUp" or "moveDown"))
                throw new InvalidDataException("Invalid page action request.");
            var action = value.GetString()!;
            await FileOperationAsync(async () =>
            {
                var snapshot = await ReadSnapshotAsync(lifetime.Token);
                if (pageIndex < 0 || pageIndex >= pages.Length)
                    throw new InvalidDataException("This page is no longer in the current inventory.");
                var page = pages[pageIndex];
                if (action != "addAfter" && !page.Deletable)
                    throw new InvalidDataException("This structural page cannot be removed or moved.");
                if (action == "moveUp" && (pageIndex == 0 || page.Kind == "blank" ||
                    !pages[pageIndex - 1].Deletable || pages[pageIndex - 1].Kind == "blank") ||
                    action == "moveDown" && (pageIndex + 1 >= pages.Length || page.Kind == "blank" ||
                        (!pages[pageIndex + 1].Deletable && pages[pageIndex + 1].Kind != "blank")))
                    throw new InvalidDataException("That page move is not available.");
                var generation = inventoryGeneration;
                var title = action switch
                {
                    "delete" => $"Delete page {pageIndex + 1} and its content?",
                    "addAfter" => $"Add a page after page {pageIndex + 1}?",
                    "moveUp" => $"Move page {pageIndex + 1} up?",
                    _ => $"Move page {pageIndex + 1} down?"
                };
                if (!await dialogs.ConfirmPageActionAsync(title)) return;
                if (!SameSnapshot(snapshot, await ReadSnapshotAsync(lifetime.Token)) || generation != inventoryGeneration)
                    throw new InvalidOperationException("The page layout changed. Review it and try the action again.");
                var type = action switch
                {
                    "addAfter" => "editor.addPage",
                    "delete" => "editor.deletePage",
                    _ => "editor.movePage"
                };
                object arguments = action == "addAfter" ? new { afterPageIndex = pageIndex } :
                    action == "delete" ? new { pageIndex } :
                    new { pageIndex, direction = action == "moveUp" ? "up" : "down" };
                host.Send(BridgeEnvelope.Create(type, null, arguments));
                status.Text = "Page action sent to the shared editor.";
            });
        }
        catch (Exception error) { ShowNotice(error.Message, InfoBarSeverity.Warning); }
    }
}
