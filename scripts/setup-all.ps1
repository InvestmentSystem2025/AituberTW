<#
One-Click Setup Script (Windows PowerShell)

Usage (run in VSCode PowerShell Terminal):
  .\scripts\setup-all.ps1 [-SkipTests] [-SkipN8N] [-ChatModel <name>] [-EmbeddingModel <name>]

Defaults:
  -ChatModel gpt-oss:20b
  -EmbeddingModel jeffh/intfloat-multilingual-e5-large-instruct:f16

This script will:
  1) Ensure Docker is running and docker-compose file is present
  2) Ensure .env exists (copy from .env.example if available, otherwise create minimal .env)
  3) Start Ollama, ChromaDB, (optionally) n8n, and the app via docker compose
  4) Wait for services to be ready (11434, 8000, 5678, 3000)
  5) Pull required models if missing (chat + embedding)
  6) Optionally run validation tests (test-ollama, test-embedding, test-integration)
#>

param(
  [switch] $SkipTests,
  [switch] $SkipN8N,
  [string] $ChatModel = "gpt-oss:20b",
  [string] $EmbeddingModel = "jeffh/intfloat-multilingual-e5-large-instruct:f16"
)

Write-Host "=== AITuberKit One-Click Setup ===" -ForegroundColor Cyan
Write-Host "Environment: Windows PowerShell (VSCode Terminal recommended)" -ForegroundColor Gray
Write-Host ""

function Invoke-Compose {
  param([string] $ComposeArgs)
  $composeCmd = $null
  # Prefer new syntax first
  $ver = (& docker compose version) 2>$null
  if ($LASTEXITCODE -eq 0) {
    $composeCmd = "docker compose $ComposeArgs"
  } else {
    $ver = (& docker-compose version) 2>$null
    if ($LASTEXITCODE -eq 0) {
      $composeCmd = "docker-compose $ComposeArgs"
    }
  }
  if (-not $composeCmd) {
    throw "docker compose/ docker-compose not available"
  }
  Write-Host "$composeCmd" -ForegroundColor DarkGray
  iex $composeCmd
}

function Test-PortReady {
  param(
    [string] $Url,
    [int] $MaxRetries = 30,
    [int] $DelaySeconds = 2,
    [string] $Label = "service"
  )
  $attempt = 0
  while ($attempt -lt $MaxRetries) {
    $attempt++
    try {
      $resp = Invoke-WebRequest -Uri $Url -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
        Write-Host "   ✓ $Label is ready ($Url)" -ForegroundColor Green
        return $true
      }
    } catch {
      if ($attempt -eq $MaxRetries) {
        Write-Host "   ✗ $Label not ready after $MaxRetries tries ($Url)" -ForegroundColor Red
        return $false
      }
      Write-Host "   → Waiting for $Label... ($attempt/$MaxRetries)" -ForegroundColor Gray
      Start-Sleep -Seconds $DelaySeconds
    }
  }
  return $false
}

function Ensure-EnvFile {
  if (Test-Path .env) {
    Write-Host "Found .env" -ForegroundColor Green
    return
  }
  if (Test-Path .env.example) {
    try {
      Copy-Item .env.example .env -Force
      Write-Host "Created .env from .env.example" -ForegroundColor Green
      return
    } catch {
      Write-Host "   ⚠ Failed to copy .env.example, will create minimal .env" -ForegroundColor Yellow
    }
  }
  "# Minimal env created by setup-all.ps1`nOLLAMA_BASE_URL=http://ollama:11434`nCHROMA_URL=http://chromadb:8000`nOLLAMA_EMBEDDING_MODEL=$EmbeddingModel" | Out-File -FilePath .env -Encoding utf8 -Force
  Write-Host "Created minimal .env" -ForegroundColor Green
}

function Ensure-DockerRunning {
  Write-Host "Checking Docker status..." -ForegroundColor Yellow
  $info = docker info 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Docker is not running or not installed!" -ForegroundColor Red
    Write-Host "Please start Docker Desktop and try again." -ForegroundColor Yellow
    exit 1
  }
  Write-Host "Docker is running" -ForegroundColor Green
}

function Ensure-ProjectRoot {
  if (-not (Test-Path "docker-compose.ollama.yml")) {
    Write-Host "Please run this script from the project root (where docker-compose.ollama.yml exists)." -ForegroundColor Red
    exit 1
  }
}

function Ensure-Models {
  param([string] $ChatModelName, [string] $EmbeddingModelName)
  Write-Host "Checking Ollama models..." -ForegroundColor Yellow
  try {
    $tags = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -ErrorAction Stop
  } catch {
    Write-Host "   ✗ Could not query Ollama tags. Is Ollama up on 11434?" -ForegroundColor Red
    return
  }
  $available = @()
  if ($tags -and $tags.models) { $available = $tags.models | ForEach-Object { $_.name } }

  if ($available -contains $ChatModelName) {
    Write-Host "   ✓ Chat model exists: $ChatModelName" -ForegroundColor Green
  } else {
    Write-Host "   → Pulling chat model: $ChatModelName (this may take a while)" -ForegroundColor Yellow
    docker exec ollama ollama pull $ChatModelName
    if ($LASTEXITCODE -ne 0) { Write-Host "   ✗ Failed to pull $ChatModelName" -ForegroundColor Red }
  }

  if ($available -contains $EmbeddingModelName) {
    Write-Host "   ✓ Embedding model exists: $EmbeddingModelName" -ForegroundColor Green
  } else {
    Write-Host "   → Pulling embedding model: $EmbeddingModelName (large download)" -ForegroundColor Yellow
    docker exec ollama ollama pull $EmbeddingModelName
    if ($LASTEXITCODE -ne 0) { Write-Host "   ✗ Failed to pull $EmbeddingModelName" -ForegroundColor Red }
  }
}

# 0) Preconditions
Ensure-ProjectRoot
Ensure-DockerRunning
Ensure-EnvFile

# 1) Start core services
if ($SkipN8N) {
  Write-Host "Starting services (Ollama, ChromaDB)..." -ForegroundColor Yellow
} else {
  Write-Host "Starting services (Ollama, ChromaDB, n8n)..." -ForegroundColor Yellow
}
try {
  if ($SkipN8N) {
    Invoke-Compose "-f docker-compose.ollama.yml up -d ollama chromadb"
  } else {
    Invoke-Compose "-f docker-compose.ollama.yml up -d ollama chromadb n8n"
  }
} catch {
  Write-Host "Failed to start core services: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# 2) Wait for services
Write-Host "Waiting for services..." -ForegroundColor Yellow
$okOllama = Test-PortReady -Url "http://localhost:11434/api/tags" -Label "Ollama"
$okChroma = Test-PortReady -Url "http://localhost:8000/api/v1/heartbeat" -Label "ChromaDB"
$okN8n = $true
if (-not $SkipN8N) {
  $okN8n = Test-PortReady -Url "http://localhost:5678" -Label "n8n"
}

if (-not ($okOllama -and $okChroma -and $okN8n)) {
  Write-Host "Some services failed to start. Check logs and retry." -ForegroundColor Red
  Write-Host "- Logs (Ollama): docker logs ollama" -ForegroundColor Gray
  Write-Host "- Logs (Chroma): docker logs chromadb" -ForegroundColor Gray
  if (-not $SkipN8N) { Write-Host "- Logs (n8n): docker logs n8n" -ForegroundColor Gray }
  exit 1
}

# 3) Pull models if needed
Ensure-Models -ChatModelName $ChatModel -EmbeddingModelName $EmbeddingModel

# 4) Start app
Write-Host "Starting app..." -ForegroundColor Yellow
try {
  Invoke-Compose "-f docker-compose.ollama.yml up -d app"
} catch {
  Write-Host "Failed to start app: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
$okApp = Test-PortReady -Url "http://localhost:3000" -Label "App"
if (-not $okApp) {
  Write-Host "App is not responding. Check: docker logs app" -ForegroundColor Red
}

# 5) Optional tests
if (-not $SkipTests) {
  Write-Host "Running validation tests..." -ForegroundColor Yellow
  $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
  $tests = @(
    Join-Path $scriptRoot "test-ollama.ps1" ,
    Join-Path $scriptRoot "test-embedding.ps1" ,
    Join-Path $scriptRoot "test-integration.ps1"
  )
  foreach ($t in $tests) {
    if (Test-Path $t) {
      Write-Host "→ $([System.IO.Path]::GetFileName($t))" -ForegroundColor Gray
      try { & $t } catch { Write-Host "   ⚠ Test failed: $($_.Exception.Message)" -ForegroundColor Yellow }
      Write-Host "" 
    }
  }
}

Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host "App:        http://localhost:3000" -ForegroundColor Green
Write-Host "Ollama API: http://localhost:11434" -ForegroundColor Green
Write-Host "ChromaDB:   http://localhost:8000" -ForegroundColor Green
if (-not $SkipN8N) { Write-Host "n8n:        http://localhost:5678" -ForegroundColor Green }
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1) Open the app in browser and select 'ollama' as AI service." -ForegroundColor White
Write-Host "   Model: $ChatModel  |  Local LLM URL (container network): http://ollama:11434" -ForegroundColor Gray
if (-not $SkipN8N) {
  Write-Host "2) Open n8n (http://localhost:5678) and import 'n8n-workflows/RSS_News_Automation.json' manually." -ForegroundColor White
}
Write-Host "3) Test pages: /test-embedding-manual.html, /test-rag-integration.html, /test-news.html" -ForegroundColor White


