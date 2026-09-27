using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Markup;
using Microsoft.UI.Xaml.XamlTypeInfo;

namespace AcademicMarkdown.Windows;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
            RuntimeDiagnostics.Record("dotnet-unhandled", args.ExceptionObject as Exception);
        RuntimeDiagnostics.Record("program-entry");
        try
        {
            WinRT.ComWrappersSupport.InitializeComWrappers();
            Application.Start(initialization =>
            {
                RuntimeDiagnostics.Record("application-start");
                SynchronizationContext.SetSynchronizationContext(
                    new DispatcherQueueSynchronizationContext(DispatcherQueue.GetForCurrentThread()));
                _ = new AcademicMarkdownApplication();
            });
        }
        catch (Exception error)
        {
            RuntimeDiagnostics.Record("program-failed", error);
            throw;
        }
    }
}

internal sealed class AcademicMarkdownApplication : Application, IXamlMetadataProvider
{
    // Retain the window for the lifetime of the application. Code-only WinUI avoids
    // XAML code generation; it does not make Windows runtime testing unnecessary.
    private MainWindow? window;
    private XamlControlsXamlMetaDataProvider? metadataProvider;

    // Code-only applications must provide the metadata wiring normally generated
    // from App.xaml. Lazy initialization also supports queries during resource loading.
    private XamlControlsXamlMetaDataProvider MetadataProvider => metadataProvider ??= new();

    public IXamlType GetXamlType(Type type) => MetadataProvider.GetXamlType(type);

    public IXamlType GetXamlType(string fullName) => MetadataProvider.GetXamlType(fullName);

    public XmlnsDefinition[] GetXmlnsDefinitions() => MetadataProvider.GetXmlnsDefinitions();

    public AcademicMarkdownApplication()
    {
        UnhandledException += (_, args) => RuntimeDiagnostics.Record("xaml-unhandled", args.Exception);
        RuntimeDiagnostics.Record("application-resources");
        Resources.MergedDictionaries.Add(new Microsoft.UI.Xaml.Controls.XamlControlsResources());
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
