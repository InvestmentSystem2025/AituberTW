# Embedding Model Setup Script
# Download and configure jeffh/intfloat-multilingual-e5-large-instruct:f16

Write-Host "=== Embedding Model Setup ===" -ForegroundColor Cyan
Write-Host ""

# Check if Ollama is running
Write-Host "Checking Ollama service..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -ErrorAction Stop
    Write-Host "Ollama service is running" -ForegroundColor Green
}
catch {
    Write-Host "Error: Ollama service is not running!" -ForegroundColor Red
    Write-Host "Please start Ollama first: docker-compose -f docker-compose.ollama.yml up -d ollama" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Check if embedding model already exists
Write-Host "Checking if embedding model already exists..." -ForegroundColor Yellow
$embeddingModel = "jeffh/intfloat-multilingual-e5-large-instruct:f16"
$modelExists = $false

try {
    $models = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -ErrorAction Stop
    $exists = $models.models | Where-Object { $_.name -eq $embeddingModel }
    if ($exists) {
        Write-Host "Embedding model already exists, skipping download" -ForegroundColor Green
        $modelExists = $true
    } else {
        Write-Host "Embedding model not found, downloading..." -ForegroundColor Yellow
    }
}
catch {
    Write-Host "Error checking models: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Download embedding model if not exists
if (-not $modelExists) {
    Write-Host "Downloading embedding model: $embeddingModel" -ForegroundColor Yellow
    Write-Host "This is a large model (~2.5GB), please be patient..." -ForegroundColor Gray
    
    docker exec ollama ollama pull $embeddingModel
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Failed to download embedding model!" -ForegroundColor Red
        Write-Host "Please manually execute: docker exec ollama ollama pull $embeddingModel" -ForegroundColor Yellow
        exit 1
    } else {
        Write-Host "Embedding model download completed" -ForegroundColor Green
    }
    Write-Host ""
}

# Test embedding model
Write-Host "Testing embedding model..." -ForegroundColor Yellow
$testText = "Hello, this is a test for embedding generation."
$embeddingBody = @{
    model = $embeddingModel
    prompt = $testText
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "http://localhost:11434/api/embeddings" -Method Post -Body $embeddingBody -ContentType "application/json" -ErrorAction Stop
    
    if ($response.embedding -and $response.embedding.Count -gt 0) {
        Write-Host "Embedding test successful" -ForegroundColor Green
        Write-Host "Vector dimensions: $($response.embedding.Count)" -ForegroundColor Gray
    } else {
        Write-Host "Warning: Embedding response is empty" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "Embedding test failed!" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Test multilingual embedding
Write-Host "Testing multilingual embedding..." -ForegroundColor Yellow
$multilingualTests = @(
    @{ text = "Hello world"; lang = "English" },
    @{ text = "你好世界"; lang = "Chinese" },
    @{ text = "こんにちは世界"; lang = "Japanese" }
)

foreach ($test in $multilingualTests) {
    $testBody = @{
        model = $embeddingModel
        prompt = $test.text
    } | ConvertTo-Json -Depth 10
    
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:11434/api/embeddings" -Method Post -Body $testBody -ContentType "application/json" -ErrorAction Stop
        if ($response.embedding -and $response.embedding.Count -gt 0) {
            Write-Host "  ✓ $($test.lang): $($test.text) -> $($response.embedding.Count) dimensions" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "  ✗ $($test.lang) test failed: $_" -ForegroundColor Red
    }
}
Write-Host ""

Write-Host "=== Embedding Setup Complete ===" -ForegroundColor Cyan
Write-Host "Embedding model is ready for use!" -ForegroundColor Green
Write-Host "Model: $embeddingModel" -ForegroundColor Gray
Write-Host ""
Write-Host "Next: The embedding API will be integrated into the application" -ForegroundColor Yellow
