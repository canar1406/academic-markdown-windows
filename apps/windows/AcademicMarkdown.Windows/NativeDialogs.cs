using AcademicMarkdown.Core;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Storage.Pickers;
using WinRT.Interop;

namespace AcademicMarkdown.Windows;

internal sealed record SaveDestination(string Path, string? Fingerprint);

/// <summary>Owns HWND-bound file dialogs and serializes native confirmation UI.</summary>
internal sealed class NativeDialogs(Window owner, FrameworkElement root)
{
    private readonly SemaphoreSlim dialogGate = new(1, 1);
    public bool IsShowing { get; private set; }

    public async Task<string?> OpenMarkdownAsync()
    {
        await dialogGate.WaitAsync();
        try
        {
            IsShowing = true;
            var picker = new FileOpenPicker
            {
                SuggestedStartLocation = PickerLocationId.DocumentsLibrary,
                ViewMode = PickerViewMode.List
            };
            picker.FileTypeFilter.Add(".md");
            picker.FileTypeFilter.Add(".markdown");
            InitializeWithWindow.Initialize(picker, WindowNative.GetWindowHandle(owner));
            return (await picker.PickSingleFileAsync())?.Path;
        }
        finally { IsShowing = false; dialogGate.Release(); }
    }

    public async Task<SaveDestination?> SaveDestinationAsync(string name, string extension)
    {
        await dialogGate.WaitAsync();
        try
        {
            IsShowing = true;
            // A path-only Win32 dialog avoids StorageFile creation/replacement before
            // compilation succeeds. It pumps its own modal UI messages on this STA.
            var path = SavePathDialog.Pick(WindowNative.GetWindowHandle(owner), name, extension);
            if (path is null) return null;

            var fingerprint = await Task.Run(() => AtomicDocumentStore.FingerprintAsync(path));
            if (fingerprint is not null)
            {
                // Capture BEFORE confirmation; never refresh this fingerprint after consent.
                var result = await CreateDialog("Replace the selected file?",
                    $"Replace “{Path.GetFileName(path)}”? If it changes after this confirmation, saving will stop.",
                    "Replace", null, "Cancel").ShowAsync();
                if (result != ContentDialogResult.Primary) return null;
            }
            return new SaveDestination(path, fingerprint);
        }
        finally { IsShowing = false; dialogGate.Release(); }
    }

    public async Task<ContentDialogResult> UnsavedChangesAsync(string name)
    {
        await dialogGate.WaitAsync();
        try
        {
            IsShowing = true;
            return await CreateDialog("Save changes?",
                $"“{name}” has unsaved changes.", "Save", "Discard", "Cancel").ShowAsync();
        }
        finally { IsShowing = false; dialogGate.Release(); }
    }

    public async Task<bool> ConfirmPageActionAsync(string title)
    {
        await dialogGate.WaitAsync();
        try
        {
            IsShowing = true;
            return await CreateDialog(title,
                "This changes your Markdown document. You can use Undo in the editor.",
                "Continue", null, "Cancel").ShowAsync() == ContentDialogResult.Primary;
        }
        finally { IsShowing = false; dialogGate.Release(); }
    }

    private ContentDialog CreateDialog(string title, string message, string primary,
        string? secondary, string close) => new()
    {
        XamlRoot = root.XamlRoot,
        Title = title,
        Content = new TextBlock { Text = message, TextWrapping = TextWrapping.Wrap, MaxWidth = 460 },
        PrimaryButtonText = primary,
        SecondaryButtonText = secondary ?? "",
        CloseButtonText = close,
        DefaultButton = ContentDialogButton.Close
    };
}
