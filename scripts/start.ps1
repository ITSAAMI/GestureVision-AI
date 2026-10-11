# Start script for GestureVision AI (Windows PowerShell)
# Usage: .\scripts\start.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  GestureVision AI - Starting Services  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

# Check if models exist
$modelsDir = Join-Path $projectRoot "backend\models"
if (-not (Test-Path (Join-Path $modelsDir "yolo11n.onnx"))) {
    Write-Host "[!] AI models not found. Downloading..." -ForegroundColor Yellow
    python (Join-Path $projectRoot "scripts\download_models.py")
    Write-Host ""
}

# Copy .env if not exists
$envFile = Join-Path $projectRoot "backend\.env"
$envExample = Join-Path $projectRoot "backend\.env.example"
if (-not (Test-Path $envFile) -and (Test-Path $envExample)) {
    Copy-Item $envExample $envFile
    Write-Host "[+] Created .env from .env.example" -ForegroundColor Green
}

# Start backend
Write-Host "[1/2] Starting Backend (FastAPI)..." -ForegroundColor Yellow
$backendDir = Join-Path $projectRoot "backend"
$backendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    python main.py 2>&1
} -ArgumentList $backendDir

Start-Sleep -Seconds 3

# Start frontend
Write-Host "[2/2] Starting Frontend (Vite)..." -ForegroundColor Yellow
$frontendDir = Join-Path $projectRoot "frontend"
$frontendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    npm run dev 2>&1
} -ArgumentList $frontendDir

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  GestureVision AI is running!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend:  http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Backend:   http://localhost:8000" -ForegroundColor Cyan
Write-Host "  API Docs:  http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop all services" -ForegroundColor Gray

try {
    while ($true) {
        # Check if jobs are still running
        $backendState = (Get-Job -Id $backendJob.Id).State
        $frontendState = (Get-Job -Id $frontendJob.Id).State

        if ($backendState -eq "Failed") {
            Write-Host "[ERROR] Backend crashed. Output:" -ForegroundColor Red
            Receive-Job -Id $backendJob.Id
        }
        if ($frontendState -eq "Failed") {
            Write-Host "[ERROR] Frontend crashed. Output:" -ForegroundColor Red
            Receive-Job -Id $frontendJob.Id
        }
        Start-Sleep -Seconds 5
    }
}
finally {
    Write-Host ""
    Write-Host "Stopping services..." -ForegroundColor Yellow
    Stop-Job -Id $backendJob.Id -ErrorAction SilentlyContinue
    Stop-Job -Id $frontendJob.Id -ErrorAction SilentlyContinue
    Remove-Job -Id $backendJob.Id -Force -ErrorAction SilentlyContinue
    Remove-Job -Id $frontendJob.Id -Force -ErrorAction SilentlyContinue
    Write-Host "All services stopped." -ForegroundColor Green
}

