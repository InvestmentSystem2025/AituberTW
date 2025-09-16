# Test RSS Sources Availability
# Execute in VSCode PowerShell Terminal

Write-Host "=== RSS Sources Availability Test ===" -ForegroundColor Green

# Taiwan RSS Sources
$taiwanSources = @(
    @{ Name = "CNA Tech"; URL = "https://www.cna.com.tw/rss/ait.xml" }
    @{ Name = "TechNews"; URL = "https://technews.tw/feed/" }
    @{ Name = "UDN News"; URL = "https://udn.com/rssfeed/news/1/6638?ch=news" }
    @{ Name = "LTN All"; URL = "https://news.ltn.com.tw/rss/all.xml" }
)

# Japan RSS Sources
$japanSources = @(
    @{ Name = "NHK News"; URL = "https://www3.nhk.or.jp/rss/news/cat0.xml" }
    @{ Name = "NHK Tech"; URL = "https://www3.nhk.or.jp/rss/news/cat5.xml" }
    @{ Name = "ITmedia"; URL = "https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml" }
)

Write-Host "`n🇹🇼 Testing Taiwan RSS Sources..." -ForegroundColor Yellow
foreach ($source in $taiwanSources) {
    try {
        Write-Host "   Testing $($source.Name)..." -ForegroundColor Gray
        $response = Invoke-WebRequest -Uri $source.URL -TimeoutSec 10 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $contentLength = $response.Content.Length
            Write-Host "   ✓ $($source.Name) - OK ($contentLength bytes)" -ForegroundColor Green
        } else {
            Write-Host "   ⚠ $($source.Name) - Status: $($response.StatusCode)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ✗ $($source.Name) - Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    Start-Sleep -Seconds 1
}

Write-Host "`n🇯🇵 Testing Japan RSS Sources..." -ForegroundColor Yellow
foreach ($source in $japanSources) {
    try {
        Write-Host "   Testing $($source.Name)..." -ForegroundColor Gray
        $response = Invoke-WebRequest -Uri $source.URL -TimeoutSec 10 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $contentLength = $response.Content.Length
            Write-Host "   ✓ $($source.Name) - OK ($contentLength bytes)" -ForegroundColor Green
        } else {
            Write-Host "   ⚠ $($source.Name) - Status: $($response.StatusCode)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ✗ $($source.Name) - Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    Start-Sleep -Seconds 1
}

Write-Host "`n=== Test Complete ===" -ForegroundColor Green
Write-Host "Use the working RSS sources in your n8n workflow!" -ForegroundColor White

