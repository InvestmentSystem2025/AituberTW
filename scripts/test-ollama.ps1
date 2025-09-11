# Ollama Test Script
# Used to test Ollama service and gpt-oss:20b model integration

Write-Host "=== Ollama Test Script ===" -ForegroundColor Cyan
Write-Host ""

# 1. Test Ollama service connection
Write-Host "1. Testing Ollama service connection..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -ErrorAction Stop
    Write-Host "   ✓ Ollama service connected successfully" -ForegroundColor Green
    
    # List available models
    Write-Host "   Available models:" -ForegroundColor Gray
    foreach ($model in $response.models) {
        Write-Host "   - $($model.name)" -ForegroundColor Gray
    }
}
catch {
    Write-Host "   ✗ Failed to connect to Ollama service" -ForegroundColor Red
    Write-Host "   Please ensure Ollama is running: docker-compose -f docker-compose.ollama.yml up -d ollama" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# 2. Test gpt-oss:20b model
Write-Host "2. Testing gpt-oss:20b model..." -ForegroundColor Yellow
$testMessages = @(
    @{
        role = "system"
        content = "You are a helpful assistant."
    },
    @{
        role = "user"
        content = "Please reply with 'Test successful' if you can read this."
    }
)

$body = @{
    model = "gpt-oss:20b"
    messages = $testMessages
    stream = $false
    options = @{
        temperature = 0.7
        num_predict = 100
    }
} | ConvertTo-Json -Depth 10

try {
    Write-Host "   Sending test request..." -ForegroundColor Gray
    $response = Invoke-RestMethod -Uri "http://localhost:11434/api/chat" -Method Post -Body $body -ContentType "application/json" -ErrorAction Stop
    Write-Host "   ✓ Model responded successfully" -ForegroundColor Green
    Write-Host ""
    Write-Host "   Model response:" -ForegroundColor Cyan
    Write-Host "   $($response.message.content)" -ForegroundColor White
}
catch {
    Write-Host "   ✗ Model test failed" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
    Write-Host "   Please ensure the model is downloaded: docker exec ollama ollama pull gpt-oss-20b" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# 3. Test streaming mode
Write-Host "3. Testing streaming mode..." -ForegroundColor Yellow
$streamBody = @{
    model = "gpt-oss:20b"
    messages = @(
        @{
            role = "user"
            content = "Count from 1 to 5"
        }
    )
    stream = $true
} | ConvertTo-Json -Depth 10

try {
    Write-Host "   Sending streaming request..." -ForegroundColor Gray
    $webRequest = [System.Net.WebRequest]::Create("http://localhost:11434/api/chat")
    $webRequest.Method = "POST"
    $webRequest.ContentType = "application/json"
    
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($streamBody)
    $webRequest.ContentLength = $bytes.Length
    
    $stream = $webRequest.GetRequestStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
    
    $response = $webRequest.GetResponse()
    $responseStream = $response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($responseStream)
    
    Write-Host "   ✓ Streaming connection successful" -ForegroundColor Green
    Write-Host "   Streaming response:" -ForegroundColor Cyan
    
    $lineCount = 0
    while (-not $reader.EndOfStream -and $lineCount -lt 5) {
        $line = $reader.ReadLine()
        if ($line) {
            try {
                $json = $line | ConvertFrom-Json
                if ($json.message.content) {
                    Write-Host "   $($json.message.content)" -NoNewline -ForegroundColor White
                }
            }
            catch {
                # Ignore parse errors
            }
            $lineCount++
        }
    }
    Write-Host ""
    
    $reader.Close()
    $responseStream.Close()
    $response.Close()
    
    Write-Host "   ✓ Streaming test successful" -ForegroundColor Green
}
catch {
    Write-Host "   ✗ Streaming test failed" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
}
Write-Host ""

# 4. Test application API integration (Skip due to PowerShell HTTP handling issues)
Write-Host "4. Testing application API integration..." -ForegroundColor Yellow
Write-Host "   → Skipping automated API test due to PowerShell HTTP issues" -ForegroundColor Gray
$appBody = @{
    messages = @(
        @{
            role = "user"
            content = "Hello"
        }
    )
    apiKey = ""
    aiService = "ollama"
    model = "gpt-oss:20b"
    localLlmUrl = "http://ollama:11434"
    stream = $false
    temperature = 0.7
    maxTokens = 100
} | ConvertTo-Json -Depth 10

try {
    $healthCheck = Invoke-WebRequest -Uri "http://localhost:3000" -Method Get -TimeoutSec 10 -UseBasicParsing
    if ($healthCheck.StatusCode -eq 200) {
        Write-Host "   ✓ Application is responding on port 3000" -ForegroundColor Green
        Write-Host "   ✓ Manual test required: Please verify chat works in browser" -ForegroundColor Green
        Write-Host "   → Visit http://localhost:3000 and test chat functionality" -ForegroundColor Gray
    }
}
catch {
    Write-Host "   ✗ Application is not responding" -ForegroundColor Red
    Write-Host "   Please ensure the app is running: docker-compose -f docker-compose.ollama.yml up -d app" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "=== Test Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "If all tests passed, you can:" -ForegroundColor Green
Write-Host "1. Visit http://localhost:3000" -ForegroundColor White
Write-Host "2. Select 'ollama' as the AI service in settings" -ForegroundColor White
Write-Host "3. Set model name to 'gpt-oss:20b'" -ForegroundColor White
Write-Host "4. Set Local LLM URL to 'http://ollama:11434' (container network)" -ForegroundColor White
Write-Host "   OR leave Local LLM URL empty to use default" -ForegroundColor Gray
