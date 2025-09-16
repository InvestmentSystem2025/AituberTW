# Setup n8n News Automation System
# Execute in VSCode PowerShell Terminal

Write-Host "=== n8n News Automation Setup ===" -ForegroundColor Green

# 1. Start n8n service
Write-Host "`n1. Starting n8n service..." -ForegroundColor Yellow
Write-Host "   Executing: docker-compose -f docker-compose.ollama.yml up -d n8n" -ForegroundColor Gray

try {
    $result = docker-compose -f docker-compose.ollama.yml up -d n8n 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✓ n8n service started successfully" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Failed to start n8n service" -ForegroundColor Red
        Write-Host "   Error: $result" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ✗ Error starting n8n: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 2. Wait for n8n to be ready
Write-Host "`n2. Waiting for n8n to be ready..." -ForegroundColor Yellow
$maxAttempts = 30
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
            Write-Host "   ✗ n8n failed to start after $maxAttempts attempts" -ForegroundColor Red
            Write-Host "   Please check: docker-compose -f docker-compose.ollama.yml logs n8n" -ForegroundColor Yellow
            exit 1
        }
        Start-Sleep -Seconds 2
    }
} while ($attempt -lt $maxAttempts)

# 3. Test news fetch API
Write-Host "`n3. Testing news fetch API..." -ForegroundColor Yellow
try {
    $newsResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/news/fetch?source=taiwan&limit=2" -Method GET
    Write-Host "   ✓ News fetch API working" -ForegroundColor Green
    Write-Host "   Fetched $($newsResponse.count) news items" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ News fetch API test failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Test news ingestion
Write-Host "`n4. Testing news ingestion..." -ForegroundColor Yellow
try {
    # Get sample news
    $sampleNews = Invoke-RestMethod -Uri "http://localhost:3000/api/news/fetch?source=all&limit=3" -Method GET
    
    # Ingest to ChromaDB
    $ingestBody = @{
        newsItems = $sampleNews.newsItems
        collection = "news_test"
    } | ConvertTo-Json -Depth 10
    
    $ingestResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/news/ingest" -Method POST -Body $ingestBody -ContentType "application/json"
    
    Write-Host "   ✓ News ingestion successful" -ForegroundColor Green
    Write-Host "   Added $($ingestResponse.count) items to collection '$($ingestResponse.collection)'" -ForegroundColor Gray
    Write-Host "   Saved to file: $($ingestResponse.savedFile)" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ News ingestion test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Setup Complete ===" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Visit http://localhost:5678 to access n8n" -ForegroundColor White
Write-Host "   Username: admin" -ForegroundColor Gray
Write-Host "   Password: password123" -ForegroundColor Gray
Write-Host "2. Check news-data/ folder for saved JSON files" -ForegroundColor White
Write-Host "3. Test RAG with news: 'What's the latest news?'" -ForegroundColor White
