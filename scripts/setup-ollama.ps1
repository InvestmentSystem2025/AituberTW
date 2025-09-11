# Ollama Setup Script for Windows
# This script will start Ollama and download gpt-oss:20b model if not already present

Write-Host "=== Ollama Setup Script ===" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "Checking Docker status..." -ForegroundColor Yellow
$dockerStatus = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Docker is not running or not installed!" -ForegroundColor Red
    Write-Host "Please start Docker Desktop first" -ForegroundColor Yellow
    exit 1
}
Write-Host "Docker is running normally" -ForegroundColor Green
Write-Host ""

# Start Ollama services
Write-Host "Starting Ollama services..." -ForegroundColor Yellow
docker-compose -f docker-compose.ollama.yml up -d ollama chromadb
Start-Sleep -Seconds 5
Write-Host "Ollama and ChromaDB services started" -ForegroundColor Green
Write-Host ""

# Wait for Ollama to fully start
Write-Host "Waiting for Ollama to fully start..." -ForegroundColor Yellow
$maxRetries = 30
$retryCount = 0
while ($retryCount -lt $maxRetries) {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -ErrorAction Stop
        Write-Host "Ollama is ready" -ForegroundColor Green
        break
    }
    catch {
        $retryCount++
        if ($retryCount -eq $maxRetries) {
            Write-Host "Error: Ollama startup timeout!" -ForegroundColor Red
            exit 1
        }
        Write-Host "Waiting... ($retryCount/$maxRetries)" -ForegroundColor Gray
        Start-Sleep -Seconds 2
    }
}
Write-Host ""

# Check if gpt-oss:20b model already exists
Write-Host "Checking if gpt-oss:20b model already exists..." -ForegroundColor Yellow
try {
    $models = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -ErrorAction Stop
    $exists = $models.models | Where-Object { $_.name -eq "gpt-oss:20b" }
    if ($exists) {
        Write-Host "Model gpt-oss:20b already exists, skipping download." -ForegroundColor Green
    } else {
        Write-Host "Model not found, downloading..." -ForegroundColor Yellow
        docker exec ollama ollama pull gpt-oss:20b
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Warning: Model download failed!" -ForegroundColor Red
            Write-Host "Please manually execute: docker exec ollama ollama pull gpt-oss:20b" -ForegroundColor Yellow
        } else {
            Write-Host "Model download completed" -ForegroundColor Green
        }
    }
}
catch {
    Write-Host "Error while checking models: $_" -ForegroundColor Red
}
Write-Host ""

# Test Ollama API
Write-Host "Testing Ollama API..." -ForegroundColor Yellow
$testMessage = @{
    model = "gpt-oss:20b"
    messages = @(
        @{
            role = "user"
            content = "Hello, please respond with 'OK' if you can understand this."
        }
    )
    stream = $false
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "http://ollama:11434/api/chat" -Method Post -Body $testMessage -ContentType "application/json" -ErrorAction Stop
    Write-Host "API test successful" -ForegroundColor Green
    Write-Host "Response: $($response.message.content)" -ForegroundColor Gray
}
catch {
    Write-Host "API test failed!" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
}
Write-Host ""

# Start main application
Write-Host "Starting main application..." -ForegroundColor Yellow
docker-compose -f docker-compose.ollama.yml up -d app
Write-Host "Application started" -ForegroundColor Green
Write-Host ""

Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host "You can now visit http://localhost:3000 to use the application" -ForegroundColor Green
Write-Host "Ollama API: http://localhost:11434" -ForegroundColor Gray
Write-Host "ChromaDB: http://localhost:8000" -ForegroundColor Gray
Write-Host ""
Write-Host "Tip: Select 'ollama' as AI service in application settings" -ForegroundColor Yellow
Write-Host "Set model name to: gpt-oss:20b" -ForegroundColor Yellow
