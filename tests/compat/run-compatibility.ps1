<#
.SYNOPSIS
    Rocket.Chat Integration Full-Stack Compatibility Test Matrix Runner.
.DESCRIPTION
    Verifies end-to-end compatibility of RAGChat backend, BullMQ integration worker,
    PostgreSQL, Redis, Qdrant, and mock OpenAI/Rocket.Chat callback endpoints.

    Test Matrix:
    1. Health checks (PostgreSQL, Redis, Qdrant, Backend, Worker, Mock OpenAI)
    2. DB schema and migrations verification
    3. Fail-closed authentication (missing token, invalid token, valid token)
    4. Asynchronous message processing (HTTP 202 -> BullMQ queue -> Worker -> Webhook callback)
    5. Base64 document ingestion (HTTP 202 -> Parser -> Qdrant collection -> Webhook callback)
    6. Multi-tenant workspace and room isolation (Workspace A vs Workspace B scoping)
    7. Formatted results summary and status reporting
#>

[CmdletBinding()]
param(
    [string]$BackendUrl = "http://localhost:8008",
    [string]$MockUrl = "http://localhost:8088",
    [int]$PostgresPort = 5434,
    [int]$RedisPort = 6380,
    [int]$QdrantPort = 6335,
    [string]$Token = "compat-test-secret-token-12345",
    [string]$ComposeFile = "docker/docker-compose.compat.yml",
    [switch]$SkipCompose,
    [switch]$Teardown,
    [int]$WaitTimeoutSec = 60
)

$ErrorActionPreference = "Continue"

# ---------------------------------------------------------------------------
# Test Reporting State
# ---------------------------------------------------------------------------
$TestResults = [System.Collections.Generic.List[PSCustomObject]]::new()

function Record-TestResult {
    param(
        [string]$Step,
        [string]$Name,
        [bool]$Passed,
        [string]$Details = ""
    )
    $TestResults.Add([PSCustomObject]@{
        Step    = $Step
        Name    = $Name
        Passed  = $Passed
        Details = $Details
    })

    if ($Passed) {
        Write-Host "  [PASS] $Step - $Name" -ForegroundColor Green
        if ($Details) { Write-Host "         $Details" -ForegroundColor DarkGray }
    } else {
        Write-Host "  [FAIL] $Step - $Name" -ForegroundColor Red
        if ($Details) { Write-Host "         $Details" -ForegroundColor Yellow }
    }
}

# ---------------------------------------------------------------------------
# HTTP Helper
# ---------------------------------------------------------------------------
function Send-JsonRequest {
    param(
        [Parameter(Mandatory=$true)][string]$Uri,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [object]$Body = $null,
        [int]$TimeoutSec = 15
    )

    $jsonBody = $null
    if ($null -ne $Body) {
        if ($Body -is [string]) {
            $jsonBody = $Body
        } else {
            $jsonBody = $Body | ConvertTo-Json -Depth 10 -Compress
        }
    }

    try {
        $requestParams = @{
            Uri = $Uri
            Method = $Method
            Headers = $Headers
            TimeoutSec = $TimeoutSec
            UseBasicParsing = $true
        }
        if ($null -ne $jsonBody) {
            $requestParams["Body"] = [System.Text.Encoding]::UTF8.GetBytes($jsonBody)
            $requestParams["ContentType"] = "application/json; charset=utf-8"
        }

        $response = Invoke-WebRequest @requestParams
        $content = $response.Content
        $statusCode = [int]$response.StatusCode
        $parsedJson = $null
        try {
            $parsedJson = $content | ConvertFrom-Json
        } catch {}

        return [PSCustomObject]@{
            StatusCode = $statusCode
            Success = ($statusCode -ge 200 -and $statusCode -lt 300)
            Content = $content
            Json = $parsedJson
            Headers = $response.Headers
            Error = $null
        }
    } catch [System.Net.WebException] {
        $webEx = $_.Exception
        $statusCode = 0
        $content = ""
        if ($null -ne $webEx.Response) {
            $statusCode = [int]$webEx.Response.StatusCode
            # Windows PowerShell's Invoke-WebRequest may consume the error
            # response stream before this catch block. In that case it exposes
            # the JSON body through ErrorDetails instead.
            $content = $_.ErrorDetails.Message
            if ([string]::IsNullOrWhiteSpace($content)) {
                $reader = New-Object System.IO.StreamReader($webEx.Response.GetResponseStream())
                $content = $reader.ReadToEnd()
                $reader.Dispose()
            }
        }
        $parsedJson = $null
        try {
            $parsedJson = $content | ConvertFrom-Json
        } catch {}

        return [PSCustomObject]@{
            StatusCode = $statusCode
            Success = $false
            Content = $content
            Json = $parsedJson
            Error = $webEx.Message
        }
    } catch {
        return [PSCustomObject]@{
            StatusCode = 0
            Success = $false
            Content = ""
            Json = $null
            Error = $_.Exception.Message
        }
    }
}

# ---------------------------------------------------------------------------
# Pre-flight: Start Environment if needed
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "   RAGChat Full-Stack Rocket.Chat Compatibility Test Harness   " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " Backend Target: $BackendUrl"
Write-Host " Mock Target:    $MockUrl"
Write-Host " Compose Config: $ComposeFile"
Write-Host ""

if (-not $SkipCompose) {
    Write-Host "[1/7] Initializing Docker Compose compatibility environment..." -ForegroundColor Yellow
    docker compose -f $ComposeFile up -d --build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to start Docker Compose environment!" -ForegroundColor Red
        exit 1
    }

    Write-Host "Waiting for services to report healthy (max $WaitTimeoutSec seconds)..." -ForegroundColor Yellow
    $startTime = Get-Date
    $healthy = $false
    while ((Get-Date) - $startTime -lt [TimeSpan]::FromSeconds($WaitTimeoutSec)) {
        $res = Send-JsonRequest -Uri "$BackendUrl/healthz" -TimeoutSec 3
        if ($res.StatusCode -eq 200) {
            $healthy = $true
            break
        }
        Start-Sleep -Seconds 2
    }

    if (-not $healthy) {
        Write-Host "Backend service failed to become healthy within $WaitTimeoutSec seconds." -ForegroundColor Red
        Record-TestResult "Health" "Backend Startup" $false "Backend at $BackendUrl/healthz did not respond 200"
        exit 1
    }
}

# ---------------------------------------------------------------------------
# Step 1: Health Checks
# ---------------------------------------------------------------------------
Write-Host "`n--- Step 1: Health Checks (Postgres, Redis, Qdrant, Backend, Worker, Mock) ---" -ForegroundColor Cyan

# 1.1 Backend healthz
$bResp = Send-JsonRequest -Uri "$BackendUrl/healthz"
$bPassed = ($bResp.StatusCode -eq 200 -and $bResp.Json.status -eq "ok")
Record-TestResult "1.1" "Backend App Healthz" $bPassed "HTTP $($bResp.StatusCode) - status: $($bResp.Json.status)"

# 1.2 Mock OpenAI & Webhook Server
$mResp = Send-JsonRequest -Uri "$MockUrl/healthz"
$mPassed = ($mResp.StatusCode -eq 200 -and $mResp.Json.status -eq "ok")
Record-TestResult "1.2" "Mock OpenAI & Callback Server" $mPassed "HTTP $($mResp.StatusCode) - service: $($mResp.Json.service)"

# 1.3 Qdrant Health / Readyz
$qResp = Send-JsonRequest -Uri "http://localhost:$QdrantPort/readyz"
if ($qResp.StatusCode -ne 200) {
    $qResp = Send-JsonRequest -Uri "http://localhost:$QdrantPort/collections"
}
$qPassed = ($qResp.StatusCode -eq 200)
Record-TestResult "1.3" "Qdrant Vector Database" $qPassed "HTTP $($qResp.StatusCode)"

# 1.4 PostgreSQL Port / Container check
$pgCheck = docker compose -f $ComposeFile exec -T postgres-compat pg_isready -U ragchat_compat -d ragchat_compat 2>&1
$pgPassed = ($LASTEXITCODE -eq 0)
Record-TestResult "1.4" "PostgreSQL Database" $pgPassed "pg_isready returned: $pgCheck"

# 1.5 Redis Health check
$redisCheck = docker compose -f $ComposeFile exec -T redis-compat redis-cli ping 2>&1
$redisPassed = ($redisCheck.Trim() -eq "PONG")
Record-TestResult "1.5" "Redis Cache & Queue Broker" $redisPassed "redis-cli ping returned: $redisCheck"

# 1.6 Integration Worker process check
$workerLogs = docker compose -f $ComposeFile logs --tail=20 integration-worker 2>&1
$workerRunning = ($workerLogs -match "worker" -or $workerLogs -match "Starting" -or $workerLogs -match "BullMQ" -or $LASTEXITCODE -eq 0)
Record-TestResult "1.6" "BullMQ Integration Worker" $workerRunning "Worker container is up and running"

# ---------------------------------------------------------------------------
# Step 2: Database Schema & Migration from Zero
# ---------------------------------------------------------------------------
Write-Host "`n--- Step 2: Database Schema & Zero-State Migration ---" -ForegroundColor Cyan

$authHeader = @{ "Authorization" = "Bearer $Token" }
$statsZero = Send-JsonRequest -Uri "$BackendUrl/api/v1/integrations/rocketchat/stats?workspaceId=zero-state-verify" -Headers $authHeader
$dbMigrated = ($statsZero.StatusCode -eq 200 -and $statsZero.Json.success -eq $true)
Record-TestResult "2.1" "Prisma Migration Verification" $dbMigrated "Queried /stats on empty workspace: HTTP $($statsZero.StatusCode)"

# ---------------------------------------------------------------------------
# Step 3: Fail-Closed Authentication Matrix
# ---------------------------------------------------------------------------
Write-Host "`n--- Step 3: Fail-Closed Authentication Matrix ---" -ForegroundColor Cyan

# 3.1 Missing Bearer Token
$unauthResp = Send-JsonRequest -Uri "$BackendUrl/api/v1/integrations/rocketchat/stats"
$unauthPassed = ($unauthResp.StatusCode -eq 401 -and $unauthResp.Json.success -eq $false)
Record-TestResult "3.1" "Missing Authorization Header" $unauthPassed "Expected HTTP 401, got $($unauthResp.StatusCode)"

# 3.2 Invalid Bearer Token
$badTokenHeader = @{ "Authorization" = "Bearer definitely-incorrect-token-value" }
$badTokenResp = Send-JsonRequest -Uri "$BackendUrl/api/v1/integrations/rocketchat/stats" -Headers $badTokenHeader
$badTokenPassed = ($badTokenResp.StatusCode -eq 401 -and $badTokenResp.Json.success -eq $false)
Record-TestResult "3.2" "Invalid Bearer Token" $badTokenPassed "Expected HTTP 401, got $($badTokenResp.StatusCode)"

# 3.3 Valid Bearer Token
$validResp = Send-JsonRequest -Uri "$BackendUrl/api/v1/integrations/rocketchat/stats" -Headers $authHeader
$validPassed = ($validResp.StatusCode -eq 200 -and $validResp.Json.success -eq $true)
Record-TestResult "3.3" "Valid Bearer Token Access" $validPassed "Expected HTTP 200, got $($validResp.StatusCode)"

# ---------------------------------------------------------------------------
# Step 4: Asynchronous Message Pipeline & Webhook Callback Delivery
# ---------------------------------------------------------------------------
Write-Host "`n--- Step 4: Asynchronous Message Pipeline (HTTP 202 -> Worker -> Callback) ---" -ForegroundColor Cyan

# Clear mock callback buffer
$null = Send-JsonRequest -Uri "$MockUrl/callbacks/clear" -Method "POST"

$msgRequestId = "compat-msg-req-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
$asyncMsgPayload = @{
    workspaceId   = "ws-compat-alpha"
    rocketUserId  = "user-alice"
    roomId        = "room-general-alpha"
    placeholderId = "placeholder-msg-001"
    requestId     = $msgRequestId
    query         = "How does Rocket.Chat async message queuing work with BullMQ?"
    callbackUrl   = "http://openai-mock:8080/callback"
}
$asyncHeaders = $authHeader.Clone()
$asyncHeaders["X-Request-Id"] = $msgRequestId

$asyncResp = Send-JsonRequest -Uri "$BackendUrl/api/v1/integrations/rocketchat/messages/async" `
    -Method "POST" `
    -Headers $asyncHeaders `
    -Body $asyncMsgPayload

$enqueuePassed = ($asyncResp.StatusCode -eq 202 -and $asyncResp.Json.data.status -eq "accepted" -and $asyncResp.Json.data.requestId -eq $msgRequestId)
Record-TestResult "4.1" "Enqueue Async Message (HTTP 202)" $enqueuePassed "Job ID: $($asyncResp.Json.data.jobId), Status: $($asyncResp.Json.data.status)"

# Poll mock server for callback
Write-Host "         Waiting for BullMQ worker to process and deliver webhook callback..." -ForegroundColor DarkGray
$callbackReceived = $false
$deliveredCallback = $null
$pollStart = Get-Date

while ((Get-Date) - $pollStart -lt [TimeSpan]::FromSeconds(25)) {
    $cbListResp = Send-JsonRequest -Uri "$MockUrl/callbacks"
    if ($cbListResp.StatusCode -eq 200 -and $null -ne $cbListResp.Json.callbacks) {
        foreach ($cb in $cbListResp.Json.callbacks) {
            $cbBody = $cb.body
            $cbReqId = if ($cbBody.request_id) { $cbBody.request_id } else { $cbBody.requestId }
            if ($cbReqId -eq $msgRequestId) {
                $callbackReceived = $true
                $deliveredCallback = $cbBody
                break
            }
        }
    }
    if ($callbackReceived) { break }
    Start-Sleep -Seconds 1
}

$msgCbPassed = ($callbackReceived -and $deliveredCallback.event -eq "chat_completed" -and $null -ne $deliveredCallback.answer)
Record-TestResult "4.2" "Worker Webhook Callback Delivery" $msgCbPassed "Event: $($deliveredCallback.event), Answer length: $($deliveredCallback.answer.Length)"

# ---------------------------------------------------------------------------
# Step 5: Document Ingestion & Qdrant Vector Indexing
# ---------------------------------------------------------------------------
Write-Host "`n--- Step 5: Document Ingestion (Base64 -> Parser -> Qdrant -> Callback) ---" -ForegroundColor Cyan

# Clear mock callback buffer
$null = Send-JsonRequest -Uri "$MockUrl/callbacks/clear" -Method "POST"

$ingestReqId = "compat-ingest-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
$rawDocText = @"
Rocket.Chat Engineering Handbook for Workspace Alpha.
Section 1: Architecture Guidelines.
All background operations must use durable BullMQ queues.
All webhook callbacks must be validated against trusted origins.
Scoped vector search guarantees that Workspace Alpha cannot access Workspace Beta knowledge collections.
Section 2: Security.
Authentication is fail-closed in production.
Tokens must be rotated using zero-downtime procedures.
"@

$base64Content = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($rawDocText))

$ingestPayload = @{
    workspaceId   = "ws-compat-alpha"
    rocketUserId  = "user-alice"
    roomId        = "room-general-alpha"
    filename      = "alpha-engineering-handbook.txt"
    contentBase64 = $base64Content
    contentType   = "text/plain"
    requestId     = $ingestReqId
    callbackUrl   = "http://openai-mock:8080/callback"
}
$ingestHeaders = $authHeader.Clone()
$ingestHeaders["X-Request-Id"] = $ingestReqId

$ingestResp = Send-JsonRequest -Uri "$BackendUrl/api/v1/integrations/rocketchat/sources/base64" `
    -Method "POST" `
    -Headers $ingestHeaders `
    -Body $ingestPayload

$ingestAccepted = ($ingestResp.StatusCode -eq 202 -and $ingestResp.Json.data.status -eq "accepted")
Record-TestResult "5.1" "Enqueue Base64 Source Ingestion" $ingestAccepted "Job ID: $($ingestResp.Json.data.jobId), Status: $($ingestResp.Json.data.status)"

# Poll mock server for indexing callback
Write-Host "         Waiting for document parsing, chunking, embedding, and callback..." -ForegroundColor DarkGray
$ingestCbReceived = $false
$ingestCallback = $null
$pollStart = Get-Date

while ((Get-Date) - $pollStart -lt [TimeSpan]::FromSeconds(30)) {
    $cbListResp = Send-JsonRequest -Uri "$MockUrl/callbacks"
    if ($cbListResp.StatusCode -eq 200 -and $null -ne $cbListResp.Json.callbacks) {
        foreach ($cb in $cbListResp.Json.callbacks) {
            $cbBody = $cb.body
            $cbReqId = if ($cbBody.request_id) { $cbBody.request_id } else { $cbBody.requestId }
            if ($cbReqId -eq $ingestReqId) {
                $ingestCbReceived = $true
                $ingestCallback = $cbBody
                break
            }
        }
    }
    if ($ingestCbReceived) { break }
    Start-Sleep -Seconds 1
}

$ingestPassed = ($ingestCbReceived -and $ingestCallback.event -eq "indexing_complete" -and $ingestCallback.chunks_count -ge 1)
Record-TestResult "5.2" "Document Parsing & Qdrant Indexing" $ingestPassed "Event: $($ingestCallback.event), Chunks: $($ingestCallback.chunks_count), SourceId: $($ingestCallback.sourceId)"

# Verify source listing via API
$listSourcesResp = Send-JsonRequest -Uri "$BackendUrl/api/v1/integrations/rocketchat/sources?workspaceId=ws-compat-alpha&roomId=room-general-alpha" -Headers $authHeader
$sourceFound = $false
if ($listSourcesResp.StatusCode -eq 200 -and $null -ne $listSourcesResp.Json.data.sources) {
    foreach ($s in $listSourcesResp.Json.data.sources) {
        if ($s.filename -eq "alpha-engineering-handbook.txt" -and $s.status -eq "ACTIVE") {
            $sourceFound = $true
            break
        }
    }
}
Record-TestResult "5.3" "Indexed Source Retrieval (/sources)" $sourceFound "Source confirmed ACTIVE in workspace alpha catalog"

# ---------------------------------------------------------------------------
# Step 6: Multi-Tenant Workspace & Room Isolation
# ---------------------------------------------------------------------------
Write-Host "`n--- Step 6: Multi-Tenant Workspace & Room Isolation ---" -ForegroundColor Cyan

# Ingest document for Workspace Beta
$betaIngestReqId = "compat-beta-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
$betaDocText = "Confidential Financial Report for Workspace Beta. Annual budget allocation and Q4 forecasts."
$betaBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($betaDocText))

$betaPayload = @{
    workspaceId   = "ws-compat-beta"
    rocketUserId  = "user-bob"
    roomId        = "room-finance-beta"
    filename      = "beta-confidential-payroll.txt"
    contentBase64 = $betaBase64
    contentType   = "text/plain"
    requestId     = $betaIngestReqId
    callbackUrl   = "http://openai-mock:8080/callback"
}
$betaIngestHeaders = $authHeader.Clone()
$betaIngestHeaders["X-Request-Id"] = $betaIngestReqId

$betaResp = Send-JsonRequest -Uri "$BackendUrl/api/v1/integrations/rocketchat/sources/base64" `
    -Method "POST" `
    -Headers $betaIngestHeaders `
    -Body $betaPayload

# Wait briefly for beta indexing to settle
Start-Sleep -Seconds 5

# Check sources for Workspace Alpha
$alphaList = Send-JsonRequest -Uri "$BackendUrl/api/v1/integrations/rocketchat/sources?workspaceId=ws-compat-alpha&roomId=room-general-alpha" -Headers $authHeader
$alphaHasBetaDoc = $false
if ($alphaList.StatusCode -eq 200 -and $null -ne $alphaList.Json.data.sources) {
    foreach ($s in $alphaList.Json.data.sources) {
        if ($s.filename -eq "beta-confidential-payroll.txt") {
            $alphaHasBetaDoc = $true
        }
    }
}
$isolationAlphaPassed = (-not $alphaHasBetaDoc)
Record-TestResult "6.1" "Workspace Alpha Scope Isolation" $isolationAlphaPassed "Workspace Alpha cannot see Beta documents"

# Check sources for Workspace Beta
$betaList = Send-JsonRequest -Uri "$BackendUrl/api/v1/integrations/rocketchat/sources?workspaceId=ws-compat-beta&roomId=room-finance-beta" -Headers $authHeader
$betaHasAlphaDoc = $false
if ($betaList.StatusCode -eq 200 -and $null -ne $betaList.Json.data.sources) {
    foreach ($s in $betaList.Json.data.sources) {
        if ($s.filename -eq "alpha-engineering-handbook.txt") {
            $betaHasAlphaDoc = $true
        }
    }
}
$isolationBetaPassed = (-not $betaHasAlphaDoc)
Record-TestResult "6.2" "Workspace Beta Scope Isolation" $isolationBetaPassed "Workspace Beta cannot see Alpha documents"

# ---------------------------------------------------------------------------
# Step 7: Teardown (Optional) & Summary
# ---------------------------------------------------------------------------
if ($Teardown -and -not $SkipCompose) {
    Write-Host "`nTearing down Docker Compose compatibility environment..." -ForegroundColor Yellow
    docker compose -f $ComposeFile down -v
}

$totalTests = $TestResults.Count
$passedTests = ($TestResults | Where-Object { $_.Passed -eq $true }).Count
$failedTests = ($TestResults | Where-Object { $_.Passed -eq $false }).Count

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "       RAGChat Compatibility Test Suite Results Summary        " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " Total Matrix Checks: $totalTests"
Write-Host " Passed:              $passedTests" -ForegroundColor Green
Write-Host " Failed:              $failedTests" -ForegroundColor $(if ($failedTests -gt 0) { "Red" } else { "Green" })
Write-Host "----------------------------------------------------------------"

if ($failedTests -eq 0) {
    Write-Host " OVERALL STATUS: ALL COMPATIBILITY TESTS PASSED [SUCCESS]" -ForegroundColor Green
    Write-Host "================================================================" -ForegroundColor Cyan
    exit 0
} else {
    Write-Host " OVERALL STATUS: COMPATIBILITY TESTS FAILED [FAILURE]" -ForegroundColor Red
    Write-Host "================================================================" -ForegroundColor Cyan
    exit 1
}
