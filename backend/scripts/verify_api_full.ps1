$ErrorActionPreference = "Stop"
$BaseUrl = "http://localhost:8000/agent"

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Method = "Get",
        [string]$Body = $null
    )
    
    Write-Host "Testing $Name ($Url)..." -NoNewline
    try {
        if ($Body) {
            $response = Invoke-RestMethod -Uri $Url -Method $Method -ContentType "application/json" -Body $Body
        } else {
            $response = Invoke-RestMethod -Uri $Url -Method $Method
        }
        Write-Host " PASSED" -ForegroundColor Green
        return $response
    } catch {
        Write-Host " FAILED" -ForegroundColor Red
        Write-Host $_.Exception.ToString()
        return $null
    }
}

# 1. Test Analyze (create a session)
$ticketBody = '{
    "tickets": [{
        "merchant_id": "TEST-MCH-001",
        "subject": "System Failure",
        "description": "Nothing is working after migration",
        "migration_stage": "post-migration",
        "priority": "critical"
    }]
}'

$analyzeResult = Test-Endpoint -Name "Analyze Ticket" -Url "$BaseUrl/analyze" -Method "Post" -Body $ticketBody

if ($analyzeResult) {
    Write-Host "  > Root Cause: $($analyzeResult.root_cause)"
    Write-Host "  > Risk: $($analyzeResult.risk)"
    Write-Host "  > Action: $($analyzeResult.recommended_action.Substring(0, 50))..."
}

# 2. Test Queue
$queueResult = Test-Endpoint -Name "Get Approval Queue" -Url "$BaseUrl/queue"
if ($queueResult) {
    Write-Host "  > Pending Items: $($queueResult.pending_count)"
}

# 3. Test Metrics
$metricsResult = Test-Endpoint -Name "Get Metrics" -Url "$BaseUrl/metrics"
if ($metricsResult) {
    Write-Host "  > Success Rate: $($metricsResult.success_rate)"
    Write-Host "  > Total Sessions: $($metricsResult.total_sessions)"
}

# 4. Test History
$historyResult = Test-Endpoint -Name "Get History" -Url "$BaseUrl/history"
if ($historyResult) {
    Write-Host "  > Recorded Sessions: $($historyResult.sessions.Count)"
}

Write-Host "`nAll API tests completed."
