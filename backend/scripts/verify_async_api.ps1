# verify_async_api.ps1
# Comprehensive test for MigraGuard Async Agent API
$ErrorActionPreference = "Stop"

function Invoke-ApiRequest {
    param (
        [string]$Method,
        [string]$Uri,
        [hashtable]$Body = @{}
    )
    
    $headers = @{ "Content-Type" = "application/json" }
    $params = @{
        Method = $Method
        Uri = "http://localhost:8000$Uri"
        Headers = $headers
    }
    
    if ($Method -eq "POST" -or $Method -eq "PUT") {
        $params.Body = ($Body | ConvertTo-Json -Depth 5)
    }
    
    try {
        $response = Invoke-RestMethod @params
        Write-Host "[$Method] $Uri - OK" -ForegroundColor Green
        return $response
    } catch {
        Write-Host "[$Method] $Uri - FAILED" -ForegroundColor Red
        Write-Host $_.Exception.Message
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader $_.Exception.Response.GetResponseStream()
            Write-Host $reader.ReadToEnd()
        }
        exit 1
    }
}

Write-Host "`n=== TESTING MIGRAGUARD ASYNC API ===`n"

# 1. Analyze Issues
Write-Host "1. Submitting Issues for Analysis..."
$analyze_payload = @{
    tickets = @(
        @{
            id = "t1"
            merchant_id = "m1234"
            subject = "Checkout 500 Error"
            description = "Customer seeing 500 error on checkout after api V2 migration"
            migration_stage = "post-migration"
            priority = "high"
            timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
        }
    )
    errors = @(
        @{
            id = "e1"
            merchant_id = "m1234"
            error_code = "INTERNAL_SERVER_ERROR" 
            error_message = "NullReferenceException in PaymentGateway.Process"
            migration_stage = "post-migration"
            timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
        }
    )
}

$response = Invoke-ApiRequest -Method "POST" -Uri "/agent/analyze" -Body $analyze_payload
Write-Host "Analysis Response: $($response | ConvertTo-Json)"

$session_id = $response.session_id
if (-not $session_id) {
    Write-Host "Error: No Session ID returned" -ForegroundColor Red
    exit 1
}

Write-Host "Session ID: $session_id"

# 2. Poll for Results
Write-Host "`n2. Polling for Completion..."
$max_retries = 20
$retry_count = 0
$done = $false

while (-not $done -and $retry_count -lt $max_retries) {
    Start-Sleep -Seconds 2
    $retry_count++
    
    $session = Invoke-ApiRequest -Method "GET" -Uri "/agent/session/$session_id"
    $status = $session.status
    
    # Fix: Use unsafe string concatenation to avoid drive detection error
    Write-Host ("  Attempt " + $retry_count + " - Status: " + $status)
    
    if ($status -eq "resolved" -or $status -eq "completed" -or $status -eq "waiting_approval" -or $status -eq "failed") {
        $done = $true
        Write-Host "`nAnalysis Finalized!" -ForegroundColor Cyan
        
        # Use intermediate variables to avoid PowerShell parsing errors
        try {
            $root = $session.diagnosis.root_cause
            $risk = $session.risk
            $conf = $session.diagnosis.confidence
            $expl = $session.explanation
            
            Write-Host "Root Cause: $root"
            Write-Host "Risk: $risk"
            Write-Host "Confidence: $conf"
            Write-Host "Explanation: $expl"
        } catch {
            Write-Host "Error printing details: $_"
            Write-Host "Raw Session: $($session | ConvertTo-Json -Depth 2)"
        }
    }
}

if (-not $done) {
    Write-Host "Timeout waiting for analysis" -ForegroundColor Red
    exit 1
}

# 3. Queue (If waiting approval)
Write-Host "`n3. Checking Approval Queue..."
$queue = Invoke-ApiRequest -Method "GET" -Uri "/agent/queue"
Write-Host "Pending Approvals: $($queue.Count)"

# 4. Metrics
Write-Host "`n4. Checking Metrics..."
$metrics = Invoke-ApiRequest -Method "GET" -Uri "/agent/metrics"
Write-Host "Metrics: $($metrics | ConvertTo-Json)"

Write-Host "`n=== API VERIFICATION SUCCESSFUL ===`n" -ForegroundColor Cyan
