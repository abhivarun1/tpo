$ErrorActionPreference = 'Stop'
Write-Host "Initializing Word COM object..."
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
    $docxPath1 = "C:\Users\abhiv\OneDrive\Desktop\Mini Project\CSE TPO\TeddyRanks_Report.docx"
    $pdfPath1 = "C:\Users\abhiv\OneDrive\Desktop\Mini Project\CSE TPO\TeddyRanks_Report.pdf"
    $pdfPath2 = "C:\Users\abhiv\OneDrive\Desktop\Mini Project\CSE TPO\TeddyRanks_Report\TeddyRanks_Report.pdf"
    
    Write-Host "Opening $docxPath1..."
    $doc = $word.Documents.Open($docxPath1)
    
    # Update fields (e.g. page numbers / TOC if needed)
    $doc.Fields.Update()
    
    Write-Host "Exporting to $pdfPath1..."
    $doc.SaveAs([ref]$pdfPath1, [ref]17)
    
    Write-Host "Exporting to $pdfPath2..."
    $doc.SaveAs([ref]$pdfPath2, [ref]17)
    
    Write-Host "PDF export completed successfully!"
    $pages = $doc.ComputeStatistics(2) # 2 = wdStatisticPages
    Write-Host "Total Document Pages: $pages"
    
    $doc.Close([ref]$false)
}
finally {
    $word.Quit([ref]$false)
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
