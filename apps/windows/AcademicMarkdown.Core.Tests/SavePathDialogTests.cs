using System.Runtime.InteropServices;
using AcademicMarkdown.Windows;

namespace AcademicMarkdown.Core.Tests;

public sealed class SavePathDialogTests
{
    [Fact]
    public void NativeDialogContractPreventsPrecreatingOutputAndChangingProcessDirectory()
    {
        var options = SavePathDialog.CreateOptions((nint)123, "Báo cáo", ".pdf");
        Assert.Equal((nint)123, options.Owner);
        Assert.NotEqual(0u, options.Flags & SavePathDialog.NoTestFileCreate);
        Assert.NotEqual(0u, options.Flags & SavePathDialog.NoChangeDirectory);
        Assert.NotEqual(0u, options.Flags & SavePathDialog.PathMustExist);
        Assert.NotEqual(0u, options.Flags & SavePathDialog.NoDereferenceLinks);
        Assert.Equal("pdf", options.DefaultExtension);
        Assert.Contains("*.pdf\0", options.Filter);
        // ABI-only assertion; this does not invoke a Windows dialog on macOS.
        Assert.Equal(152, Marshal.SizeOf<SavePathDialog.OpenFileName>());
        Assert.Equal((uint)Marshal.SizeOf<SavePathDialog.OpenFileName>(), options.StructSize);
    }

    [Theory]
    [InlineData(".exe")]
    [InlineData("*.pdf")]
    [InlineData("")]
    public void DestinationDialogCannotSelectExecutableTypes(string extension)
        => Assert.Throws<ArgumentException>(() => SavePathDialog.CreateOptions(0, "report", extension));
}
