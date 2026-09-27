using AcademicMarkdown.Core;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using Windows.System;

namespace AcademicMarkdown.Windows;

/// <summary>
/// Local-only WebView2 trust boundary. Windows integration/IME remain runtime-unverified.
/// No generic file/process commands or script evaluation are exposed to the editor.
/// </summary>
internal sealed class EditorWebViewHost(WebView2 view) : IDisposable
{
    internal const string EditorHost = "editor.academic-markdown.invalid";
    internal const string EditorOrigin = "https://" + EditorHost;
    internal const string EditorAddress = EditorOrigin + "/index.html";
    private readonly BridgeRequests requests = new();
    private readonly DocumentImageHandler images = new();
    private readonly CancellationTokenSource lifetime = new();
    private readonly TaskCompletionSource ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private CoreWebView2? core;
    private CoreWebView2Environment? environment;
    private bool initialNavigationAllowed = true;
    private bool disposed;

    public event Action<BridgeEnvelope>? Notification;
    public event Action<string>? Failure;
    public string? DocumentRoot { get => images.DocumentRoot; set => images.DocumentRoot = value; }

    public async Task InitializeAsync(string resourceRoot)
    {
        var webRoot = Path.Combine(resourceRoot, "Web");
        var dataRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "AcademicMarkdown", "WebView2");
        await Task.Run(() =>
        {
            SafePaths.ResolveExistingFile(resourceRoot, "Web/index.html");
            Directory.CreateDirectory(dataRoot);
        }, lifetime.Token);
        var options = new CoreWebView2EnvironmentOptions
        {
            // Browser background services are not a document networking API.
            AdditionalBrowserArguments = "--disable-background-networking --disable-component-update --disable-sync"
        };
        environment = await CoreWebView2Environment.CreateWithOptionsAsync(null, dataRoot, options);
        await view.EnsureCoreWebView2Async(environment);
        lifetime.Token.ThrowIfCancellationRequested();
        core = view.CoreWebView2;
        var settings = core.Settings;
        settings.AreHostObjectsAllowed = false;
        settings.IsWebMessageEnabled = true;
        settings.AreDefaultScriptDialogsEnabled = false;
        settings.AreDefaultContextMenusEnabled = false;
        settings.AreBrowserAcceleratorKeysEnabled = false;
        settings.AreDevToolsEnabled = false;
        settings.IsStatusBarEnabled = false;
        settings.IsZoomControlEnabled = false;
        settings.IsBuiltInErrorPageEnabled = false;
        settings.IsPasswordAutosaveEnabled = false;
        settings.IsGeneralAutofillEnabled = false;
        core.SetVirtualHostNameToFolderMapping(EditorHost, webRoot, CoreWebView2HostResourceAccessKind.Deny);
        core.WebMessageReceived += MessageReceived;
        core.NavigationStarting += NavigationStarting;
        core.NavigationCompleted += NavigationCompleted;
        core.FrameNavigationStarting += FrameNavigationStarting;
        core.PermissionRequested += PermissionRequested;
        core.DownloadStarting += DownloadStarting;
        core.NewWindowRequested += NewWindowRequested;
        core.LaunchingExternalUriScheme += LaunchingExternalUriScheme;
        core.ProcessFailed += ProcessFailed;
        core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All,
            CoreWebView2WebResourceRequestSourceKinds.All);
        core.WebResourceRequested += WebResourceRequested;
        core.Navigate(EditorAddress);
        await ready.Task.WaitAsync(TimeSpan.FromSeconds(30), lifetime.Token);
    }

    public void Send(BridgeEnvelope envelope)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        if (core is null || core.Source != EditorAddress)
            throw new InvalidOperationException("The local editor is not available.");
        core.PostWebMessageAsJson(envelope.ToJson());
    }

    public Task<BridgeEnvelope> RequestAsync(string type, object payload, string responseType,
        CancellationToken cancellationToken = default) =>
        requests.RequestAsync(Send, type, payload, responseType, cancellationToken);

    private void MessageReceived(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        try
        {
            if (disposed || args.Source != EditorAddress || sender.Source != EditorAddress) return;
            var envelope = BridgeEnvelope.Parse(args.WebMessageAsJson);
            if (requests.Receive(envelope)) return;
            if (envelope.RequestId is not null)
            {
                // This slice intentionally does not grant image-drop filesystem writes.
                if (envelope.Type == "editor.imageDrop")
                {
                    Send(BridgeEnvelope.Create("editor.imageDrop.result", envelope.RequestId,
                        new { relativePath = (string?)null }));
                    Failure?.Invoke("Image import is not available in this Windows slice. Use a relative image path.");
                }
                return;
            }
            if (envelope.Type == "editor.ready") ready.TrySetResult();
            else if (envelope.Type is "document.changed" or "editor.modeChanged" or
                "editor.pageInventoryChanged" or "editor.pageActionRequested")
                Notification?.Invoke(envelope);
        }
        catch (Exception error) { Failure?.Invoke($"Editor message rejected: {error.Message}"); }
    }

    private async void NavigationStarting(CoreWebView2 sender, CoreWebView2NavigationStartingEventArgs args)
    {
        if (initialNavigationAllowed && args.Uri == EditorAddress && !args.IsRedirected)
        {
            initialNavigationAllowed = false;
            return;
        }
        args.Cancel = true; // Including reload/back: never silently reset a dirty document.
        try
        {
            if (sender.Source == EditorAddress && args.IsUserInitiated && !args.IsRedirected)
                await OpenExternalAsync(args.Uri);
        }
        catch (Exception error) { Failure?.Invoke($"Cannot open link: {error.Message}"); }
    }

    private void NavigationCompleted(CoreWebView2 sender, CoreWebView2NavigationCompletedEventArgs args)
    {
        if (!args.IsSuccess && !ready.Task.IsCompleted)
            ready.TrySetException(new IOException($"Local editor failed to load ({args.WebErrorStatus})."));
    }

    private static void FrameNavigationStarting(CoreWebView2 sender, CoreWebView2NavigationStartingEventArgs args)
        => args.Cancel = true;

    private static void PermissionRequested(CoreWebView2 sender, CoreWebView2PermissionRequestedEventArgs args)
    {
        args.State = CoreWebView2PermissionState.Deny;
        args.SavesInProfile = false;
        args.Handled = true;
    }

    private static void DownloadStarting(CoreWebView2 sender, CoreWebView2DownloadStartingEventArgs args)
    {
        args.Cancel = true;
        args.Handled = true;
    }

    private async void NewWindowRequested(CoreWebView2 sender, CoreWebView2NewWindowRequestedEventArgs args)
    {
        args.Handled = true;
        try
        {
            if (sender.Source == EditorAddress && args.IsUserInitiated) await OpenExternalAsync(args.Uri);
        }
        catch (Exception error) { Failure?.Invoke($"Cannot open link: {error.Message}"); }
    }

    private async void LaunchingExternalUriScheme(CoreWebView2 sender,
        CoreWebView2LaunchingExternalUriSchemeEventArgs args)
    {
        args.Cancel = true;
        try
        {
            if (sender.Source == EditorAddress && args.IsUserInitiated &&
                args.InitiatingOrigin is EditorOrigin or EditorAddress)
                await OpenExternalAsync(args.Uri);
        }
        catch (Exception error) { Failure?.Invoke($"Cannot open link: {error.Message}"); }
    }

    private static async Task OpenExternalAsync(string address)
    {
        if (!Uri.TryCreate(address, UriKind.Absolute, out var uri) ||
            uri.Scheme is not ("https" or "http" or "mailto") || uri.UserInfo.Length != 0 ||
            uri.Host is EditorHost or DocumentImageHandler.HostName) return;
        if (!await Launcher.LaunchUriAsync(uri)) throw new IOException("No application could open this link.");
    }

    private async void WebResourceRequested(CoreWebView2 sender, CoreWebView2WebResourceRequestedEventArgs args)
    {
        if (environment is null) return;
        using var deferral = args.GetDeferral();
        try
        {
            if (Uri.TryCreate(args.Request.Uri, UriKind.Absolute, out var uri) &&
                uri.Scheme == "https" && uri.IsDefaultPort && uri.UserInfo.Length == 0 &&
                args.Request.Method == "GET")
            {
                if (uri.Host == EditorHost) return; // Only the bundled Web virtual-host mapping.
                if (uri.Host == DocumentImageHandler.HostName && sender.Source == EditorAddress &&
                    args.ResourceContext == CoreWebView2WebResourceContext.Image)
                {
                    args.Response = await images.RespondAsync(environment, args.Request.Uri,
                        images.DocumentRoot, lifetime.Token);
                    return;
                }
            }
            args.Response = DocumentImageHandler.EmptyResponse(environment, 403);
        }
        catch (Exception error)
        {
            if (!disposed)
            {
                args.Response = DocumentImageHandler.EmptyResponse(environment, 403);
                Failure?.Invoke($"Image request blocked: {error.Message}");
            }
        }
        finally
        {
            try { deferral.Complete(); }
            catch (Exception error)
            {
                if (!disposed) Failure?.Invoke($"Image response could not complete: {error.Message}");
            }
        }
    }

    private void ProcessFailed(CoreWebView2 sender, CoreWebView2ProcessFailedEventArgs args)
    {
        // Do not auto-reload: the editor may hold Markdown that has never been saved.
        var error = new IOException("The editor process stopped. Do not close while you have unsaved work.");
        ready.TrySetException(error);
        Failure?.Invoke(error.Message);
    }

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        lifetime.Cancel();
        requests.Dispose();
        if (core is not null)
        {
            core.WebMessageReceived -= MessageReceived;
            core.NavigationStarting -= NavigationStarting;
            core.NavigationCompleted -= NavigationCompleted;
            core.FrameNavigationStarting -= FrameNavigationStarting;
            core.PermissionRequested -= PermissionRequested;
            core.DownloadStarting -= DownloadStarting;
            core.NewWindowRequested -= NewWindowRequested;
            core.LaunchingExternalUriScheme -= LaunchingExternalUriScheme;
            core.ProcessFailed -= ProcessFailed;
            core.WebResourceRequested -= WebResourceRequested;
        }
        view.Close();
        lifetime.Dispose();
    }
}
