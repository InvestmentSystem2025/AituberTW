# Setup n8n RSS News Automation Workflow
# Execute in VSCode PowerShell Terminal

Write-Host "=== n8n RSS News Automation Workflow Setup ===" -ForegroundColor Green

# 1. Check if n8n is running
Write-Host "`n1. Checking n8n service status..." -ForegroundColor Yellow
try {
    $n8nStatus = docker ps --filter "name=n8n" --filter "status=running" --format "{{.Names}}"
    if ($n8nStatus -eq "n8n") {
        Write-Host "   ✓ n8n service is running" -ForegroundColor Green
    } else {
        Write-Host "   ✗ n8n service is not running, starting..." -ForegroundColor Yellow
        docker-compose -f docker-compose.ollama.yml up -d n8n
        Start-Sleep -Seconds 10
    }
} catch {
    Write-Host "   ✗ Unable to check n8n status: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 2. Wait for n8n to be ready
Write-Host "`n2. Waiting for n8n to be ready..." -ForegroundColor Yellow
$maxAttempts = 20
$attempt = 0

do {
    $attempt++
    Write-Host "   Attempt $attempt/$maxAttempts..." -ForegroundColor Gray
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5678" -TimeoutSec 5 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "   ✓ n8n is ready!" -ForegroundColor Green
            break
        }
    } catch {
        if ($attempt -eq $maxAttempts) {
            Write-Host "   ✗ n8n not ready after $maxAttempts attempts" -ForegroundColor Red
            Write-Host "   Check logs: docker-compose -f docker-compose.ollama.yml logs n8n" -ForegroundColor Yellow
            exit 1
        }
        Start-Sleep -Seconds 3
    }
} while ($attempt -lt $maxAttempts)

# 3. Check if workflow file exists
Write-Host "`n3. Checking workflow file..." -ForegroundColor Yellow
$workflowPath = "n8n-workflows/RSS_News_Automation.json"
if (Test-Path $workflowPath) {
    Write-Host "   ✓ Found workflow file: $workflowPath" -ForegroundColor Green
} else {
    Write-Host "   ✗ Workflow file not found: $workflowPath" -ForegroundColor Red
    exit 1
}

# 4. Test news APIs
Write-Host "`n4. Testing News APIs..." -ForegroundColor Yellow

# Test fetch API
Write-Host "   Testing fetch API..." -ForegroundColor Gray
try {
    $testUrl = "http://localhost:3000/api/news/fetch?source=test&limit=1"
    $webRequest = [System.Net.WebRequest]::Create($testUrl)
    $webRequest.Method = "GET"
    $webRequest.Timeout = 10000
    
    $response = $webRequest.GetResponse()
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    $responseText = $reader.ReadToEnd()
    $reader.Close()
    $response.Close()
    
    $data = $responseText | ConvertFrom-Json
    if ($data.count -gt 0) {
        Write-Host "   ✓ Fetch API OK" -ForegroundColor Green
    } else {
        Write-Host "   ⚠ Fetch API returned unexpected response" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠ Fetch API test skipped ($($_.Exception.Message))" -ForegroundColor Yellow
}

# Test ingest API
Write-Host "   Testing ingest API..." -ForegroundColor Gray
try {
    $testData = @{
        newsItems = @(
            @{
                id = "test_$(Get-Date -Format 'yyyyMMddHHmmss')"
                title = "Test News Title"
                content = "This is a test news item used to validate API."
                url = "https://example.com/test"
                publishedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                source = "Test Source"
                language = "en"
            }
        )
        collection = "news_test_automation"
    } | ConvertTo-Json -Depth 10
    
    $ingestUrl = "http://localhost:3000/api/news/ingest/"
    $webRequest = [System.Net.WebRequest]::Create($ingestUrl)
    $webRequest.Method = "POST"
    $webRequest.ContentType = "application/json"
    $webRequest.Timeout = 15000
    
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($testData)
    $webRequest.ContentLength = $bytes.Length
    
    $requestStream = $webRequest.GetRequestStream()
    $requestStream.Write($bytes, 0, $bytes.Length)
    $requestStream.Close()
    
    $response = $webRequest.GetResponse()
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    $responseText = $reader.ReadToEnd()
    $reader.Close()
    $response.Close()
    
    $data = $responseText | ConvertFrom-Json
    if ($data.count -gt 0) {
        Write-Host "   ✓ Ingest API OK" -ForegroundColor Green
        Write-Host "   Saved file: $($data.savedFile)" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠ Ingest API returned unexpected response" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠ Ingest API test skipped ($($_.Exception.Message))" -ForegroundColor Yellow
}

Write-Host "`n=== Setup Complete ===" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Open n8n in browser: http://localhost:5678" -ForegroundColor White
Write-Host "2. Import workflow: n8n-workflows/RSS_News_Automation.json" -ForegroundColor White
Write-Host "3. Configure RSS sources (real feeds if needed)" -ForegroundColor White
Write-Host "4. Enable workflow and test execution" -ForegroundColor White
Write-Host "5. Check news-data/ folder for JSON backups" -ForegroundColor White
