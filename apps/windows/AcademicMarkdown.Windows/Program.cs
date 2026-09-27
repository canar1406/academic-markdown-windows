using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;

namespace AcademicMarkdown.Windows;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        WinRT.ComWrappersSupport.InitializeComWrappers();
        Application.Start(initialization =>
        {
            SynchronizationContext.SetSynchronizationContext(
                new DispatcherQueueSynchronizationContext(DispatcherQueue.GetForCurrentThread()));
            _ = new AcademicMarkdownApplication();
        });
    }
}

internal sealed class AcademicMarkdownApplication : Application
{
    // Retain the window for the lifetime of the application. Code-only WinUI avoids
    // XAML code generation; it does not make Windows runtime testing unnecessary.
    private MainWindow? window;

    public AcademicMarkdownApplication()
    {
        Resources.MergedDictionaries.Add(new Microsoft.UI.Xaml.Controls.XamlControlsResources());
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        window = new MainWindow();
        window.Activate();
    }
}
