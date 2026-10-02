using AcademicMarkdown.Core;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using System.Text.Json;
using Windows.System;

namespace AcademicMarkdown.Windows;

/// <summary>Native controls/lifecycle only. Markdown and export semantics stay in TypeScript.</summary>
internal sealed partial class MainWindow : Window
{
    private readonly Grid root = new();
    private readonly WebView2 editor = new();
    private readonly Button inputBlocker = new()
    {
        Content = "Finishing document operation…",
        HorizontalAlignment = HorizontalAlignment.Stretch,
        VerticalAlignment = VerticalAlignment.Stretch,
        Opacity = 0.85,
        Visibility = Visibility.Visible
    };
    private readonly InfoBar notice = new() { IsClosable = true };
    private readonly TextBlock status = new() { Text = "Starting local editor…", VerticalAlignment = VerticalAlignment.Center };
    private readonly ToggleButton visual = new() { Content = "Visual", IsChecked = true };
    private readonly ToggleButton source = new() { Content = "Source" };
    private readonly ComboBox zoom = new() { Width = 92 };
    private readonly Button export = new() { Content = "Export PDF" };
    private readonly Button cancelExport = new() { Content = "Cancel export" };
    private readonly Button openPdf = new() { Content = "Open PDF" };
    private readonly List<Control> fileControls = [];
    private readonly List<Control> editorControls = [];
    private readonly DocumentSession session = new();
    private readonly AtomicDocumentStore store = new();
    private readonly CancellationTokenSource lifetime = new();
    private readonly EditorWebViewHost host;
    private readonly NativeDialogs dialogs;
    private readonly string resourceRoot = Path.Combine(AppContext.BaseDirectory, "Resources");
    private string persistedMarkdown = "";
    private bool contentDiffers;
    private bool initialized;
    private bool editorReady;
    private bool loadingDocument;
    private bool ioBusy;
    private bool committingExport;
    private bool allowClose;
    private bool closed;
    private bool hasLoadedDocument;
    private string currentMode = "visual";
    private string? lastPdf;
    private Task? exportTask;
    private CancellationTokenSource? exportCancellation;

    public MainWindow()
    {
        Title = "Academic Markdown — Windows engineering preview";
        AppWindow.Resize(new global::Windows.Graphics.SizeInt32(1280, 900));
        host = new EditorWebViewHost(editor);
        dialogs = new NativeDialogs(this, root);
        host.Notification += HostNotification;
        host.Failure += message => ShowNotice(message, InfoBarSeverity.Warning);
        CreateControls();
        Content = root;
        root.Loaded += RootLoaded;
        AppWindow.Closing += WindowClosing;
        Closed += WindowClosed;
        RefreshControls();
    }

    private void CreateControls()
    {
        root.Background = new Microsoft.UI.Xaml.Media.SolidColorBrush(Colors.Transparent);
        foreach (var height in new[] { GridLength.Auto, GridLength.Auto, GridLength.Auto,
            new GridLength(1, GridUnitType.Star), GridLength.Auto })
            root.RowDefinitions.Add(new RowDefinition { Height = height });

        // MenuBar's default style loads via ms-appx:///Microsoft.UI.Xaml/Themes/generic.xaml,
        // which requires package identity. This app is unpackaged/self-contained, so that
        // resource lookup fails and fails fast (0xc000027b) the moment MenuBar is constructed.
        // Button + MenuFlyout provide the same menu semantics without that dependency.
        var menu = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 4 };
        var fileMenu = new MenuFlyout();
        AddMenu(fileMenu, "New", "new", true);
        AddMenu(fileMenu, "Open…", "open", true);
        AddMenu(fileMenu, "Save", "save", true);
        AddMenu(fileMenu, "Save As…", "saveAs", true);
        fileMenu.Items.Add(new MenuFlyoutSeparator());
        AddMenu(fileMenu, "Export PDF…", "export");
        AddMenu(fileMenu, "Close", "close");
        menu.Children.Add(MenuButton("File", fileMenu));
        var editMenu = new MenuFlyout();
        AddMenu(editMenu, "Find", "find");
        AddMenu(editMenu, "Replace", "replace");
        AddMenu(editMenu, "Find Next", "next");
        AddMenu(editMenu, "Find Previous", "previous");
        AddMenu(editMenu, "Replace All", "replaceAll");
        menu.Children.Add(MenuButton("Edit", editMenu));
        Place(menu, 0);

        var toolbar = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        Wire(visual, "visual", "Visual editing");
        Wire(source, "source", "Markdown source editing");
        toolbar.Children.Add(visual);
        toolbar.Children.Add(source);
        toolbar.Children.Add(ToolButton("Find", "find"));
        toolbar.Children.Add(ToolButton("Replace", "replace"));
        toolbar.Children.Add(new TextBlock { Text = "Zoom", VerticalAlignment = VerticalAlignment.Center });
        foreach (var percent in new[] { 50, 75, 100, 125, 150, 175, 200 })
            zoom.Items.Add(new ComboBoxItem { Content = $"{percent}%", Tag = percent });
        zoom.SelectedIndex = 2;
        zoom.SelectionChanged += ZoomChanged;
        AutomationProperties.SetName(zoom, "Editor zoom");
        editorControls.Add(zoom);
        toolbar.Children.Add(zoom);
        toolbar.Children.Add(new TextBlock
        {
            Text = "Windows engineering preview · Theme Studio UI is not ported",
            VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(12, 0, 0, 0)
        });
        var scrollingToolbar = new ScrollViewer
        {
            Content = toolbar, Margin = new Thickness(12, 4, 12, 8),
            HorizontalScrollBarVisibility = ScrollBarVisibility.Auto,
            VerticalScrollBarVisibility = ScrollBarVisibility.Disabled
        };
        Place(scrollingToolbar, 1);
        Place(notice, 2);
        AutomationProperties.SetName(editor, "Markdown editor");
        Place(editor, 3);
        // WebView2 is a FrameworkElement, not a Control with IsEnabled. An overlay,
        // focus transfer and removal from tab order prevent edits during file commits.
        AutomationProperties.SetName(inputBlocker, "Editor paused while a document operation completes");
        Place(inputBlocker, 3);
        var footer = new Grid { Margin = new Thickness(12, 8, 12, 8), ColumnSpacing = 10 };
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        status.TextTrimming = TextTrimming.CharacterEllipsis;
        AutomationProperties.SetLiveSetting(status, Microsoft.UI.Xaml.Automation.Peers.AutomationLiveSetting.Polite);
        footer.Children.Add(status);
        var outputControls = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        foreach (var (button, command) in new[] { (export, "export"), (cancelExport, "cancelExport"), (openPdf, "openPdf") })
        {
            button.Tag = command;
            button.Click += CommandClicked;
            outputControls.Children.Add(button);
        }
        Grid.SetColumn(outputControls, 1);
        footer.Children.Add(outputControls);
        Place(footer, 4);
        Shortcut(VirtualKey.N, VirtualKeyModifiers.Control, "new");
        Shortcut(VirtualKey.O, VirtualKeyModifiers.Control, "open");
        Shortcut(VirtualKey.S, VirtualKeyModifiers.Control, "save");
        Shortcut(VirtualKey.S, VirtualKeyModifiers.Control | VirtualKeyModifiers.Shift, "saveAs");
        Shortcut(VirtualKey.F, VirtualKeyModifiers.Control, "find");
        Shortcut(VirtualKey.H, VirtualKeyModifiers.Control, "replace");
        Shortcut(VirtualKey.F3, VirtualKeyModifiers.None, "next");
        Shortcut(VirtualKey.F3, VirtualKeyModifiers.Shift, "previous");
        Shortcut(VirtualKey.E, VirtualKeyModifiers.Control, "export");
    }

    private void Place(FrameworkElement element, int row) { Grid.SetRow(element, row); root.Children.Add(element); }

    private void AddMenu(MenuFlyout menu, string text, string command, bool fileOperation = false)
    {
        var item = new MenuFlyoutItem { Text = text, Tag = command };
        item.Click += CommandClicked;
        menu.Items.Add(item);
        if (fileOperation) fileControls.Add(item);
    }

    private static Button MenuButton(string title, MenuFlyout flyout)
    {
        var button = new Button { Content = title, Flyout = flyout };
        AutomationProperties.SetName(button, $"{title} menu");
        return button;
    }

    private Button ToolButton(string title, string command)
    {
        var button = new Button { Content = title };
        Wire(button, command, title);
        return button;
    }

    private void Wire(ButtonBase button, string command, string name)
    {
        button.Tag = command;
        button.Click += CommandClicked;
        AutomationProperties.SetName(button, name);
        editorControls.Add(button);
    }

    private void Shortcut(VirtualKey key, VirtualKeyModifiers modifiers, string command)
    {
        var accelerator = new KeyboardAccelerator { Key = key, Modifiers = modifiers };
        accelerator.Invoked += async (_, args) =>
        {
            args.Handled = true;
            await ExecuteCommandAsync(command); // Event boundary; ExecuteCommandAsync catches failures.
        };
        root.KeyboardAccelerators.Add(accelerator);
    }

    private async void RootLoaded(object sender, RoutedEventArgs args)
    {
        if (initialized) return;
        initialized = true;
        ioBusy = true;
        try
        {
            await host.InitializeAsync(resourceRoot);
            await LoadDocumentAsync("", null, null);
            editorReady = true;
            status.Text = "Ready — Markdown is the source; PDF export is manual.";
        }
        catch (Exception error)
        {
            if (!closed) ShowNotice($"Editor startup failed: {error.Message}", InfoBarSeverity.Error);
        }
        finally { ioBusy = false; if (!closed) RefreshControls(); }
    }

    private async void CommandClicked(object sender, RoutedEventArgs args)
    {
        if (sender is FrameworkElement { Tag: string command }) await ExecuteCommandAsync(command);
    }

    private async Task ExecuteCommandAsync(string command)
    {
        try
        {
            if (closed) return;
            if (command == "close") { Close(); return; }
            if (command == "cancelExport") { exportCancellation?.Cancel(); return; }
            if (!editorReady || ioBusy || committingExport || dialogs.IsShowing) return;
            switch (command)
            {
                case "new": await FileOperationAsync(NewAsync); break;
                case "open": await FileOperationAsync(OpenAsync); break;
                case "save": await FileOperationAsync(async () => { await SaveAsync(false); }); break;
                case "saveAs": await FileOperationAsync(async () => { await SaveAsync(true); }); break;
                case "visual":
                case "source":
                    // Wait for editor.modeChanged before showing the new selection.
                    ApplyModeControls();
                    host.Send(BridgeEnvelope.Create("editor.setMode", null, new { mode = command }));
                    break;
                case "find":
                case "replace":
                case "replaceAll":
                case "next":
                case "previous":
                    host.Send(BridgeEnvelope.Create("editor.search", null,
                        new { action = command == "find" ? "open" : command }));
                    editor.Focus(FocusState.Programmatic);
                    break;
                case "export": StartExport(); break;
                case "openPdf": await OpenLastPdfAsync(); break;
            }
        }
        catch (OperationCanceledException) { if (!closed) status.Text = "Operation cancelled."; }
        catch (Exception error) { if (!closed) ShowNotice(error.Message, InfoBarSeverity.Error); }
    }

    private async Task FileOperationAsync(Func<Task> operation)
    {
        if (ioBusy) return;
        ioBusy = true;
        RefreshControls();
        try { await operation(); }
        finally { ioBusy = false; if (!closed) RefreshControls(); }
    }

    private async void HostNotification(BridgeEnvelope envelope)
    {
        try
        {
            switch (envelope.Type)
            {
                case "document.changed" when !loadingDocument:
                    session.ObserveRevision(envelope.ReadRevision());
                    if (committingExport) exportCancellation?.Cancel();
                    RefreshControls();
                    break;
                case "editor.modeChanged":
                    var payload = envelope.Payload;
                    if (!payload.TryGetProperty("mode", out var mode) || mode.ValueKind != JsonValueKind.String ||
                        mode.GetString() is not ("visual" or "source") ||
                        !payload.TryGetProperty("accepted", out var accepted) ||
                        accepted.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                        throw new InvalidDataException("Invalid editor mode response.");
                    currentMode = mode.GetString()!;
                    ApplyModeControls();
                    if (!accepted.GetBoolean())
                        ShowNotice("Visual mode was rejected. Your Markdown remains intact in Source mode; fix the source before switching.",
                            InfoBarSeverity.Warning);
                    break;
                case "editor.pageInventoryChanged": ReceivePageInventory(envelope.Payload); break;
                case "editor.pageActionRequested": await HandlePageActionAsync(envelope.Payload); break;
            }
        }
        catch (Exception error) { ShowNotice($"Editor notification rejected: {error.Message}", InfoBarSeverity.Error); }
    }

    private void ZoomChanged(object sender, SelectionChangedEventArgs args)
    {
        try
        {
            if (editorReady && !ioBusy && !committingExport && zoom.SelectedItem is ComboBoxItem { Tag: int percent })
                host.Send(BridgeEnvelope.Create("editor.setZoom", null,
                    new { magnification = percent / 100.0, interactive = false }));
        }
        catch (Exception error) { ShowNotice(error.Message, InfoBarSeverity.Error); }
    }

    private void ApplyModeControls()
    {
        visual.IsChecked = currentMode == "visual";
        source.IsChecked = currentMode == "source";
    }

    private void RefreshControls()
    {
        var available = editorReady && !ioBusy && !committingExport && !loadingDocument;
        foreach (var control in fileControls) control.IsEnabled = available;
        foreach (var control in editorControls) control.IsEnabled = available;
        editor.IsHitTestVisible = available;
        editor.IsTabStop = available;
        inputBlocker.Visibility = available ? Visibility.Collapsed : Visibility.Visible;
        if (!available) inputBlocker.Focus(FocusState.Programmatic);
        export.IsEnabled = available && exportTask is null;
        cancelExport.IsEnabled = exportTask is not null;
        openPdf.IsEnabled = available && lastPdf is not null;
        var dirty = session.IsDirty || contentDiffers;
        Title = $"{(dirty ? "• " : "")}{DocumentName} — Academic Markdown (Windows preview)";
    }

    private string DocumentName => session.Path is null ? "Untitled.md" : Path.GetFileName(session.Path);

    private void ShowNotice(string message, InfoBarSeverity severity)
    {
        if (closed) return;
        notice.Title = severity == InfoBarSeverity.Error ? "Operation stopped" : "Windows preview";
        notice.Message = message.Length <= 2400 ? message : message[..2400] + "…";
        notice.Severity = severity;
        notice.IsOpen = true;
    }

    private async void WindowClosing(AppWindow sender, AppWindowClosingEventArgs args)
    {
        if (allowClose) return;
        args.Cancel = true; // Set synchronously, before the first await.
        if (ioBusy || committingExport || dialogs.IsShowing)
        {
            status.Text = "Finish or cancel the current file operation before closing.";
            return;
        }
        try
        {
            await FileOperationAsync(async () =>
            {
                if (hasLoadedDocument)
                {
                    var consent = await GuardUnsavedAsync();
                    if (consent is null) return;
                    exportCancellation?.Cancel();
                    if (exportTask is not null) await exportTask;
                    if (!SameSnapshot(consent, await ReadSnapshotAsync()))
                    {
                        ShowNotice("The document changed while closing. Review the new edits and close again.",
                            InfoBarSeverity.Warning);
                        return;
                    }
                }
                allowClose = true;
                Close();
            });
        }
        catch (Exception error)
        {
            ShowNotice($"Close cancelled; your document remains open. {error.Message}", InfoBarSeverity.Error);
        }
    }

    private void WindowClosed(object sender, WindowEventArgs args)
    {
        closed = true;
        lifetime.Cancel();
        exportCancellation?.Cancel();
        host.Dispose();
        lifetime.Dispose();
    }
}
