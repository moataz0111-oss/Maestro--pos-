@echo off
chcp 65001 >nul 2>&1
title Maestro EGP - Print Agent
color 0A

echo.
echo  ══════════════════════════════════════
echo  ║  Maestro EGP - Print Agent v1.1   ║
echo  ══════════════════════════════════════
echo.

:: Check if already running
netstat -an 2>nul | findstr ":9999 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo  [!] Agent already running on port 9999
    echo  [!] Close the other window first
    pause
    exit /b
)

:: Auto-start setup
if not exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MaestroPrintAgent.bat" (
    echo  Auto-start with Windows?
    echo  [1] Yes (recommended)
    echo  [2] No
    set /p choice="  Choice (1 or 2): "
    if "%choice%"=="1" (
        copy "%~f0" "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MaestroPrintAgent.bat" >nul 2>&1
        echo  [OK] Added to Windows startup
    )
    echo.
)

:: Write PowerShell script to temp file
set "PS_SCRIPT=%TEMP%\maestro_print_agent.ps1"

(
echo $ErrorActionPreference = 'Continue'
echo.
echo function Send-ToPrinter {
echo     param([string]$ip, [int]$port, [byte[]]$data^)
echo     try {
echo         $client = New-Object System.Net.Sockets.TcpClient
echo         $client.Connect($ip, $port^)
echo         $stream = $client.GetStream(^)
echo         $stream.Write($data, 0, $data.Length^)
echo         $stream.Flush(^)
echo         Start-Sleep -Milliseconds 500
echo         $stream.Close(^)
echo         $client.Close(^)
echo         return @{success=$true; message='OK'}
echo     } catch {
echo         return @{success=$false; message=$_.Exception.Message}
echo     }
echo }
echo.
echo function Build-TestPage {
echo     param([string]$name, [string]$ip, [string]$port^)
echo     $enc = [System.Text.Encoding]::UTF8
echo     $now = Get-Date -Format 'yyyy/MM/dd HH:mm:ss'
echo     $bytes = [System.Collections.Generic.List[byte]]::new(^)
echo     $bytes.AddRange([byte[]]@(0x1b, 0x40^)^)
echo     $bytes.AddRange([byte[]]@(0x1b, 0x61, 0x01^)^)
echo     $bytes.AddRange([byte[]]@(0x1b, 0x45, 0x01^)^)
echo     $bytes.AddRange([byte[]]@(0x1b, 0x21, 0x10^)^)
echo     $bytes.AddRange($enc.GetBytes('*** Test Print ***'^)^)
echo     $bytes.Add(0x0a^)
echo     $bytes.AddRange([byte[]]@(0x1b, 0x21, 0x00^)^)
echo     $bytes.AddRange([byte[]]@(0x1b, 0x45, 0x00^)^)
echo     $bytes.AddRange($enc.GetBytes('--------------------------------'^)^)
echo     $bytes.Add(0x0a^)
echo     $bytes.AddRange([byte[]]@(0x1b, 0x61, 0x00^)^)
echo     $bytes.AddRange($enc.GetBytes("Printer: $name"^)^)
echo     $bytes.Add(0x0a^)
echo     $bytes.AddRange($enc.GetBytes("IP: ${ip}:${port}"^)^)
echo     $bytes.Add(0x0a^)
echo     $bytes.AddRange($enc.GetBytes('--------------------------------'^)^)
echo     $bytes.Add(0x0a^)
echo     $bytes.AddRange($enc.GetBytes("Date: $now"^)^)
echo     $bytes.Add(0x0a^)
echo     $bytes.AddRange($enc.GetBytes('--------------------------------'^)^)
echo     $bytes.Add(0x0a^)
echo     $bytes.AddRange([byte[]]@(0x1b, 0x61, 0x01^)^)
echo     $bytes.AddRange([byte[]]@(0x1b, 0x45, 0x01^)^)
echo     $bytes.AddRange($enc.GetBytes('Print Successful!'^)^)
echo     $bytes.Add(0x0a^)
echo     $bytes.AddRange([byte[]]@(0x1b, 0x45, 0x00^)^)
echo     $bytes.AddRange($enc.GetBytes('Maestro EGP v1.1'^)^)
echo     $bytes.Add(0x0a^); $bytes.Add(0x0a^); $bytes.Add(0x0a^); $bytes.Add(0x0a^); $bytes.Add(0x0a^)
echo     $bytes.AddRange([byte[]]@(0x1d, 0x56, 0x42, 0x00^)^)
echo     return $bytes.ToArray(^)
echo }
echo.
echo function Build-Receipt {
echo     param($order, $config^)
echo     $enc = [System.Text.Encoding]::UTF8
echo     $showPrices = $true
echo     if ($config -and $config.show_prices -eq $false^) { $showPrices = $false }
echo     $bytes = [System.Collections.Generic.List[byte]]::new(^)
echo     $bytes.AddRange([byte[]]@(0x1b, 0x40^)^)
echo     $bytes.AddRange([byte[]]@(0x1b, 0x61, 0x01^)^)
echo     if ($order.restaurant_name^) {
echo         $bytes.AddRange([byte[]]@(0x1b, 0x45, 0x01^)^)
echo         $bytes.AddRange([byte[]]@(0x1b, 0x21, 0x10^)^)
echo         $bytes.AddRange($enc.GetBytes($order.restaurant_name^)^)
echo         $bytes.Add(0x0a^)
echo         $bytes.AddRange([byte[]]@(0x1b, 0x21, 0x00, 0x1b, 0x45, 0x00^)^)
echo     }
echo     $sep = $enc.GetBytes('--------------------------------'^)
echo     $bytes.AddRange($sep^); $bytes.Add(0x0a^)
echo     $bytes.AddRange([byte[]]@(0x1b, 0x61, 0x00^)^)
echo     if ($order.order_number^) {
echo         $bytes.AddRange([byte[]]@(0x1b, 0x45, 0x01^)^)
echo         $bytes.AddRange($enc.GetBytes('#' + $order.order_number^)^)
echo         $bytes.Add(0x0a^)
echo         $bytes.AddRange([byte[]]@(0x1b, 0x45, 0x00^)^)
echo     }
echo     $bytes.AddRange($enc.GetBytes((Get-Date -Format 'yyyy/MM/dd HH:mm'^)^)^)
echo     $bytes.Add(0x0a^)
echo     if ($order.customer_name^) { $bytes.AddRange($enc.GetBytes($order.customer_name^)^); $bytes.Add(0x0a^) }
echo     $bytes.AddRange($sep^); $bytes.Add(0x0a^)
echo     foreach ($item in $order.items^) {
echo         $n = if ($item.product_name^) { $item.product_name } else { $item.name }
echo         $q = if ($item.quantity^) { $item.quantity } else { 1 }
echo         if ($showPrices^) {
echo             $p = [math]::Round($item.price * $q^)
echo             $bytes.AddRange($enc.GetBytes("$n x$q  $p"^)^)
echo         } else {
echo             $bytes.AddRange([byte[]]@(0x1b, 0x45, 0x01, 0x1b, 0x21, 0x10^)^)
echo             $bytes.AddRange($enc.GetBytes("$n  x$q"^)^)
echo             $bytes.AddRange([byte[]]@(0x1b, 0x21, 0x00, 0x1b, 0x45, 0x00^)^)
echo         }
echo         $bytes.Add(0x0a^)
echo         if ($item.notes^) { $bytes.AddRange($enc.GetBytes('  ^> ' + $item.notes^)^); $bytes.Add(0x0a^) }
echo     }
echo     $bytes.AddRange($sep^); $bytes.Add(0x0a^)
echo     if ($showPrices -and $order.total^) {
echo         $bytes.AddRange([byte[]]@(0x1b, 0x61, 0x01, 0x1b, 0x45, 0x01, 0x1b, 0x21, 0x10^)^)
echo         $total = [math]::Round($order.total^)
echo         $bytes.AddRange($enc.GetBytes("Total: $total IQD"^)^)
echo         $bytes.Add(0x0a^)
echo         $bytes.AddRange([byte[]]@(0x1b, 0x21, 0x00, 0x1b, 0x45, 0x00^)^)
echo     }
echo     $bytes.AddRange($sep^); $bytes.Add(0x0a^)
echo     $bytes.AddRange([byte[]]@(0x1b, 0x61, 0x01^)^)
echo     $bytes.AddRange($enc.GetBytes('Thank you!'^)^)
echo     $bytes.Add(0x0a^); $bytes.Add(0x0a^); $bytes.Add(0x0a^); $bytes.Add(0x0a^); $bytes.Add(0x0a^)
echo     $bytes.AddRange([byte[]]@(0x1d, 0x56, 0x42, 0x00^)^)
echo     return $bytes.ToArray(^)
echo }
echo.
echo try {
echo     $listener = New-Object System.Net.HttpListener
echo     $listener.Prefixes.Add('http://localhost:9999/'^)
echo     $listener.Start(^)
echo     Write-Host ''
echo     Write-Host '  [OK] Maestro Print Agent is RUNNING' -ForegroundColor Green
echo     Write-Host '  [OK] Listening on http://localhost:9999' -ForegroundColor Green
echo     Write-Host '  [OK] Ready for print jobs!' -ForegroundColor Green
echo     Write-Host ''
echo     Write-Host '  DO NOT close this window!' -ForegroundColor Yellow
echo     Write-Host ''
echo.
echo     while ($listener.IsListening^) {
echo         $ctx = $listener.GetContext(^)
echo         $req = $ctx.Request
echo         $res = $ctx.Response
echo         $res.AddHeader('Access-Control-Allow-Origin', '*'^)
echo         $res.AddHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS'^)
echo         $res.AddHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'^)
echo         $res.ContentType = 'application/json'
echo.
echo         if ($req.HttpMethod -eq 'OPTIONS'^) {
echo             $res.StatusCode = 200
echo             $res.Close(^)
echo             continue
echo         }
echo.
echo         $path = $req.Url.LocalPath
echo         $jsonOut = ''
echo.
echo         if ($path -eq '/status'^) {
echo             $jsonOut = '{"status":"running","version":"1.1.0","agent":"Maestro Print Agent"}'
echo             Write-Host "  [$(Get-Date -Format 'HH:mm:ss'^)] Status check - OK" -ForegroundColor Cyan
echo         }
echo         elseif ($path -eq '/check-printer'^) {
echo             $qip = $req.QueryString['ip']
echo             $qport = if ($req.QueryString['port']^) { [int]$req.QueryString['port'] } else { 9100 }
echo             try {
echo                 $tc = New-Object System.Net.Sockets.TcpClient
echo                 $tc.Connect($qip, $qport^)
echo                 $tc.Close(^)
echo                 $jsonOut = '{"online":true,"ip":"' + $qip + '"}'
echo                 Write-Host "  [$(Get-Date -Format 'HH:mm:ss'^)] Printer $qip - ONLINE" -ForegroundColor Green
echo             } catch {
echo                 $jsonOut = '{"online":false,"ip":"' + $qip + '"}'
echo                 Write-Host "  [$(Get-Date -Format 'HH:mm:ss'^)] Printer $qip - OFFLINE" -ForegroundColor Red
echo             }
echo         }
echo         elseif ($path -eq '/print-test' -and $req.HttpMethod -eq 'POST'^) {
echo             $reader = New-Object System.IO.StreamReader($req.InputStream^)
echo             $body = $reader.ReadToEnd(^) ^| ConvertFrom-Json
echo             $pport = if ($body.port^) { [int]$body.port } else { 9100 }
echo             $testData = Build-TestPage $body.name $body.ip $pport.ToString(^)
echo             $result = Send-ToPrinter $body.ip $pport $testData
echo             if ($result.success^) {
echo                 $jsonOut = '{"success":true,"message":"OK","printer":"' + $body.ip + ':' + $pport + '"}'
echo                 Write-Host "  [$(Get-Date -Format 'HH:mm:ss'^)] Test print to $($body.ip):$pport - OK" -ForegroundColor Green
echo             } else {
echo                 $em = ($result.message -replace '"', ''^) -replace '\\', ''
echo                 $jsonOut = '{"success":false,"message":"' + $em + '"}'
echo                 Write-Host "  [$(Get-Date -Format 'HH:mm:ss'^)] Test print FAILED: $em" -ForegroundColor Red
echo             }
echo         }
echo         elseif ($path -eq '/print-receipt' -and $req.HttpMethod -eq 'POST'^) {
echo             $reader = New-Object System.IO.StreamReader($req.InputStream^)
echo             $body = $reader.ReadToEnd(^) ^| ConvertFrom-Json
echo             $pport = if ($body.port^) { [int]$body.port } else { 9100 }
echo             $receiptData = Build-Receipt $body.order $body.printer_config
echo             $result = Send-ToPrinter $body.ip $pport $receiptData
echo             if ($result.success^) {
echo                 $jsonOut = '{"success":true,"message":"OK"}'
echo                 Write-Host "  [$(Get-Date -Format 'HH:mm:ss'^)] Receipt sent to $($body.ip):$pport - OK" -ForegroundColor Green
echo             } else {
echo                 $em = ($result.message -replace '"', ''^) -replace '\\', ''
echo                 $jsonOut = '{"success":false,"message":"' + $em + '"}'
echo                 Write-Host "  [$(Get-Date -Format 'HH:mm:ss'^)] Receipt FAILED: $em" -ForegroundColor Red
echo             }
echo         }
echo         elseif ($path -eq '/print-raw' -and $req.HttpMethod -eq 'POST'^) {
echo             $reader = New-Object System.IO.StreamReader($req.InputStream^)
echo             $body = $reader.ReadToEnd(^) ^| ConvertFrom-Json
echo             $pport = if ($body.port^) { [int]$body.port } else { 9100 }
echo             $rawData = [byte[]]@(0x1b, 0x40^) + [System.Text.Encoding]::UTF8.GetBytes($body.text^) + [byte[]]@(0x0a,0x0a,0x0a,0x0a,0x0a,0x1d,0x56,0x42,0x00^)
echo             $result = Send-ToPrinter $body.ip $pport $rawData
echo             if ($result.success^) {
echo                 $jsonOut = '{"success":true,"message":"OK"}'
echo             } else {
echo                 $em = ($result.message -replace '"', ''^) -replace '\\', ''
echo                 $jsonOut = '{"success":false,"message":"' + $em + '"}'
echo             }
echo         }
echo         else {
echo             $jsonOut = '{"error":"not found"}'
echo             $res.StatusCode = 404
echo         }
echo.
echo         $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonOut^)
echo         $res.OutputStream.Write($buffer, 0, $buffer.Length^)
echo         $res.Close(^)
echo     }
echo } catch {
echo     Write-Host ''
echo     Write-Host "  [ERROR] $($_.Exception.Message^)" -ForegroundColor Red
echo     Write-Host ''
echo     if ($_.Exception.Message -match 'denied'^) {
echo         Write-Host '  Try: Right-click this file ^> Run as Administrator' -ForegroundColor Yellow
echo     }
echo     if ($_.Exception.Message -match 'use'^) {
echo         Write-Host '  Port 9999 is already in use. Close the other agent window.' -ForegroundColor Yellow
echo     }
echo } finally {
echo     if ($listener^) { $listener.Stop(^) }
echo }
) > "%PS_SCRIPT%"

echo  Starting Print Agent...
echo.
powershell -ExecutionPolicy Bypass -NoProfile -File "%PS_SCRIPT%"

echo.
echo  Agent stopped. Press any key to close...
pause >nul
