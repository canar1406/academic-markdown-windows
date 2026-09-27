using Microsoft.UI.Xaml;

namespace AcademicMarkdown.Windows;

/// <summary>
/// Use WinUI's generated application entrypoint, type metadata and resource
/// initialization rather than a partial hand-written substitute.
/// </summary>
public partial class AcademicMarkdownApplication : Application
{
    private MainWindow? window;

    public AcademicMarkdownApplication()
    {
        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
            RuntimeDiagnostics.Record("dotnet-unhandled", args.ExceptionObject as Exception);
        UnhandledException += (_, args) =>
            RuntimeDiagnostics.Record("xaml-unhandled", args.Exception);
        RuntimeDiagnostics.Record("application-initialize");
        InitializeComponent();
        RuntimeDiagnostics.Record("application-initialized");
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        try
        {
            RuntimeDiagnostics.Record("window-creating");
            window = new MainWindow();
            RuntimeDiagnostics.Record("window-activating");
            window.Activate();
        }
        catch (Exception error)
        {
            RuntimeDiagnostics.Record("window-failed", error);
            throw;
        }
    }
}
