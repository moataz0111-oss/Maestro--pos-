@echo off
chcp 65001 >nul 2>&1
title Maestro EGP - Print Agent
color 0A

echo.
echo  ══════════════════════════════════════════
echo  ║   Maestro EGP - وسيط الطباعة المحلي  ║
echo  ║          الإصدار: 1.0.0               ║
echo  ══════════════════════════════════════════
echo.

:: Check if already running
netstat -an | findstr ":9999 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo  [!] وسيط الطباعة يعمل بالفعل على المنفذ 9999
    echo  [!] أغلق النافذة الأخرى أولاً
    pause
    exit /b
)

:: Ask to add to Windows startup (only if not already there)
if not exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MaestroPrintAgent.bat" (
    echo.
    echo  هل تريد تشغيل الوسيط تلقائياً عند بدء ويندوز؟
    echo  [1] نعم - تشغيل تلقائي ^(موصى به^)
    echo  [2] لا - تشغيل يدوي فقط
    echo.
    set /p choice="  اختيارك (1 أو 2): "
    if "%choice%"=="1" (
        copy "%~f0" "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MaestroPrintAgent.bat" >nul 2>&1
        echo  [✓] تمت إضافة الوسيط للتشغيل التلقائي
    )
)

echo.
echo  ══════════════════════════════════════════
echo  ║  جاري التشغيل على المنفذ 9999...      ║
echo  ║  لا تغلق هذه النافذة أثناء العمل!     ║
echo  ══════════════════════════════════════════
echo.

powershell -ExecutionPolicy Bypass -NoProfile -Command ^
$ErrorActionPreference = 'SilentlyContinue'; ^
$ESC = [byte]0x1b; ^
$GS = [byte]0x1d; ^
$LF = [byte]0x0a; ^
function Send-ToPrinter($ip, $port, [byte[]]$data) { ^
    try { ^
        $client = New-Object System.Net.Sockets.TcpClient; ^
        $client.Connect($ip, [int]$port); ^
        $stream = $client.GetStream(); ^
        $stream.Write($data, 0, $data.Length); ^
        $stream.Flush(); ^
        Start-Sleep -Milliseconds 500; ^
        $stream.Close(); ^
        $client.Close(); ^
        return @{success=$true; message='OK'}; ^
    } catch { ^
        return @{success=$false; message=$_.Exception.Message}; ^
    } ^
}; ^
function Build-TestPage($name, $ip, $port) { ^
    $enc = [System.Text.Encoding]::UTF8; ^
    $now = Get-Date -Format 'yyyy/MM/dd HH:mm:ss'; ^
    $lines = @(); ^
    $lines += [byte[]]@($ESC, 0x40); ^
    $lines += [byte[]]@($ESC, 0x61, 0x01); ^
    $lines += [byte[]]@($ESC, 0x45, 0x01); ^
    $lines += [byte[]]@($ESC, 0x21, 0x10); ^
    $lines += $enc.GetBytes('*** Test Print ***'); ^
    $lines += [byte[]]@($LF); ^
    $lines += [byte[]]@($ESC, 0x21, 0x00); ^
    $lines += [byte[]]@($ESC, 0x45, 0x00); ^
    $lines += $enc.GetBytes('--------------------------------'); ^
    $lines += [byte[]]@($LF); ^
    $lines += [byte[]]@($ESC, 0x61, 0x02); ^
    $lines += $enc.GetBytes($name); ^
    $lines += [byte[]]@($LF); ^
    $lines += $enc.GetBytes('IP: ' + $ip + ':' + $port); ^
    $lines += [byte[]]@($LF); ^
    $lines += $enc.GetBytes('--------------------------------'); ^
    $lines += [byte[]]@($LF); ^
    $lines += $enc.GetBytes($now); ^
    $lines += [byte[]]@($LF); ^
    $lines += $enc.GetBytes('--------------------------------'); ^
    $lines += [byte[]]@($LF); ^
    $lines += [byte[]]@($ESC, 0x61, 0x01); ^
    $lines += [byte[]]@($ESC, 0x45, 0x01); ^
    $lines += $enc.GetBytes('Print OK!'); ^
    $lines += [byte[]]@($LF); ^
    $lines += [byte[]]@($ESC, 0x45, 0x00); ^
    $lines += $enc.GetBytes('Maestro EGP v1.0'); ^
    $lines += [byte[]]@($LF, $LF, $LF, $LF, $LF); ^
    $lines += [byte[]]@($GS, 0x56, 0x42, 0x00); ^
    $all = [System.Collections.Generic.List[byte]]::new(); ^
    foreach ($b in $lines) { if ($b -is [byte[]]) { $all.AddRange($b) } else { $all.Add($b) } }; ^
    return $all.ToArray(); ^
}; ^
function Build-Receipt($orderJson, $configJson) { ^
    $enc = [System.Text.Encoding]::UTF8; ^
    $order = $orderJson; ^
    $showPrices = $configJson.show_prices -ne $false; ^
    $all = [System.Collections.Generic.List[byte]]::new(); ^
    $all.AddRange([byte[]]@($ESC, 0x40)); ^
    $all.AddRange([byte[]]@($ESC, 0x61, 0x01)); ^
    if ($order.restaurant_name) { ^
        $all.AddRange([byte[]]@($ESC, 0x45, 0x01)); ^
        $all.AddRange([byte[]]@($ESC, 0x21, 0x10)); ^
        $all.AddRange($enc.GetBytes($order.restaurant_name)); ^
        $all.AddRange([byte[]]@($LF)); ^
        $all.AddRange([byte[]]@($ESC, 0x21, 0x00)); ^
        $all.AddRange([byte[]]@($ESC, 0x45, 0x00)); ^
    }; ^
    $sep = $enc.GetBytes('--------------------------------'); ^
    $all.AddRange($sep); $all.Add($LF); ^
    $all.AddRange([byte[]]@($ESC, 0x61, 0x02)); ^
    if ($order.order_number) { ^
        $all.AddRange([byte[]]@($ESC, 0x45, 0x01)); ^
        $all.AddRange($enc.GetBytes('#' + $order.order_number)); ^
        $all.Add($LF); ^
        $all.AddRange([byte[]]@($ESC, 0x45, 0x00)); ^
    }; ^
    $all.AddRange($enc.GetBytes((Get-Date -Format 'yyyy/MM/dd HH:mm'))); ^
    $all.Add($LF); ^
    if ($order.customer_name) { $all.AddRange($enc.GetBytes($order.customer_name)); $all.Add($LF); }; ^
    $all.AddRange($sep); $all.Add($LF); ^
    foreach ($item in $order.items) { ^
        $n = if ($item.product_name) { $item.product_name } else { $item.name }; ^
        $q = if ($item.quantity) { $item.quantity } else { 1 }; ^
        if ($showPrices) { ^
            $p = [math]::Round($item.price * $q); ^
            $all.AddRange($enc.GetBytes("$n x$q  $p")); ^
        } else { ^
            $all.AddRange([byte[]]@($ESC, 0x45, 0x01)); ^
            $all.AddRange([byte[]]@($ESC, 0x21, 0x10)); ^
            $all.AddRange($enc.GetBytes("$n  x$q")); ^
            $all.AddRange([byte[]]@($ESC, 0x21, 0x00)); ^
            $all.AddRange([byte[]]@($ESC, 0x45, 0x00)); ^
        }; ^
        $all.Add($LF); ^
        if ($item.notes) { $all.AddRange($enc.GetBytes('  > ' + $item.notes)); $all.Add($LF); }; ^
    }; ^
    $all.AddRange($sep); $all.Add($LF); ^
    if ($showPrices -and $order.total) { ^
        $all.AddRange([byte[]]@($ESC, 0x61, 0x01)); ^
        $all.AddRange([byte[]]@($ESC, 0x45, 0x01)); ^
        $all.AddRange([byte[]]@($ESC, 0x21, 0x10)); ^
        $total = [math]::Round($order.total); ^
        $all.AddRange($enc.GetBytes("Total: $total IQD")); ^
        $all.Add($LF); ^
        $all.AddRange([byte[]]@($ESC, 0x21, 0x00)); ^
        $all.AddRange([byte[]]@($ESC, 0x45, 0x00)); ^
    }; ^
    $all.AddRange($sep); $all.Add($LF); ^
    $all.AddRange([byte[]]@($ESC, 0x61, 0x01)); ^
    $all.AddRange($enc.GetBytes('Thank you!')); ^
    $all.Add($LF); $all.Add($LF); $all.Add($LF); $all.Add($LF); $all.Add($LF); ^
    $all.AddRange([byte[]]@($GS, 0x56, 0x42, 0x00)); ^
    return $all.ToArray(); ^
}; ^
try { ^
    $listener = New-Object System.Net.HttpListener; ^
    $listener.Prefixes.Add('http://localhost:9999/'); ^
    $listener.Start(); ^
    Write-Host '  [OK] Print Agent is running on port 9999' -ForegroundColor Green; ^
    Write-Host '  [OK] Ready to receive print jobs!' -ForegroundColor Green; ^
    Write-Host ''; ^
    while ($listener.IsListening) { ^
        $ctx = $listener.GetContext(); ^
        $req = $ctx.Request; ^
        $res = $ctx.Response; ^
        $res.AddHeader('Access-Control-Allow-Origin', '*'); ^
        $res.AddHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS'); ^
        $res.AddHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); ^
        $res.ContentType = 'application/json'; ^
        if ($req.HttpMethod -eq 'OPTIONS') { ^
            $res.StatusCode = 200; ^
            $res.Close(); ^
            continue; ^
        }; ^
        $path = $req.Url.LocalPath; ^
        $json = ''; ^
        if ($path -eq '/status') { ^
            $json = '{\"status\":\"running\",\"version\":\"1.0.0\",\"agent\":\"Maestro Print Agent\"}'; ^
            Write-Host \"  [$(Get-Date -Format 'HH:mm:ss')] Status check - OK\" -ForegroundColor Cyan; ^
        } ^
        elseif ($path -eq '/check-printer') { ^
            $qip = $req.QueryString['ip']; ^
            $qport = if ($req.QueryString['port']) { $req.QueryString['port'] } else { '9100' }; ^
            try { ^
                $tc = New-Object System.Net.Sockets.TcpClient; ^
                $tc.Connect($qip, [int]$qport); ^
                $tc.Close(); ^
                $json = '{\"online\":true,\"ip\":\"' + $qip + '\"}'; ^
            } catch { ^
                $json = '{\"online\":false,\"ip\":\"' + $qip + '\"}'; ^
            }; ^
        } ^
        elseif ($path -eq '/print-test' -and $req.HttpMethod -eq 'POST') { ^
            $reader = New-Object System.IO.StreamReader($req.InputStream); ^
            $body = $reader.ReadToEnd() ^| ConvertFrom-Json; ^
            $testData = Build-TestPage $body.name $body.ip $body.port; ^
            $result = Send-ToPrinter $body.ip $body.port $testData; ^
            if ($result.success) { ^
                $json = '{\"success\":true,\"message\":\"OK\",\"printer\":\"' + $body.ip + ':' + $body.port + '\"}'; ^
                Write-Host \"  [$(Get-Date -Format 'HH:mm:ss')] Test print sent to $($body.ip):$($body.port)\" -ForegroundColor Green; ^
            } else { ^
                $errMsg = $result.message -replace '\"', ''; ^
                $json = '{\"success\":false,\"message\":\"' + $errMsg + '\"}'; ^
                Write-Host \"  [$(Get-Date -Format 'HH:mm:ss')] FAILED: $($body.ip):$($body.port) - $errMsg\" -ForegroundColor Red; ^
            }; ^
        } ^
        elseif ($path -eq '/print-receipt' -and $req.HttpMethod -eq 'POST') { ^
            $reader = New-Object System.IO.StreamReader($req.InputStream); ^
            $body = $reader.ReadToEnd() ^| ConvertFrom-Json; ^
            $receiptData = Build-Receipt $body.order $body.printer_config; ^
            $result = Send-ToPrinter $body.ip $body.port $receiptData; ^
            if ($result.success) { ^
                $json = '{\"success\":true,\"message\":\"OK\"}'; ^
                Write-Host \"  [$(Get-Date -Format 'HH:mm:ss')] Receipt sent to $($body.ip):$($body.port)\" -ForegroundColor Green; ^
            } else { ^
                $errMsg = $result.message -replace '\"', ''; ^
                $json = '{\"success\":false,\"message\":\"' + $errMsg + '\"}'; ^
                Write-Host \"  [$(Get-Date -Format 'HH:mm:ss')] FAILED: $errMsg\" -ForegroundColor Red; ^
            }; ^
        } ^
        elseif ($path -eq '/print-raw' -and $req.HttpMethod -eq 'POST') { ^
            $reader = New-Object System.IO.StreamReader($req.InputStream); ^
            $body = $reader.ReadToEnd() ^| ConvertFrom-Json; ^
            $rawData = [byte[]]@($ESC, 0x40) + [System.Text.Encoding]::UTF8.GetBytes($body.text) + [byte[]]@($LF,$LF,$LF,$LF,$LF,$GS,0x56,0x42,0x00); ^
            $result = Send-ToPrinter $body.ip $body.port $rawData; ^
            if ($result.success) { ^
                $json = '{\"success\":true,\"message\":\"OK\"}'; ^
            } else { ^
                $errMsg = $result.message -replace '\"', ''; ^
                $json = '{\"success\":false,\"message\":\"' + $errMsg + '\"}'; ^
            }; ^
        } ^
        else { ^
            $json = '{\"error\":\"not found\"}'; ^
            $res.StatusCode = 404; ^
        }; ^
        $buffer = [System.Text.Encoding]::UTF8.GetBytes($json); ^
        $res.OutputStream.Write($buffer, 0, $buffer.Length); ^
        $res.Close(); ^
    } ^
} catch { ^
    Write-Host ''; ^
    Write-Host \"  [ERROR] $($_.Exception.Message)\" -ForegroundColor Red; ^
    if ($_.Exception.Message -match 'Access is denied') { ^
        Write-Host '  [!] Please run as Administrator' -ForegroundColor Yellow; ^
    }; ^
}; ^
if ($listener) { $listener.Stop() }

echo.
echo  وسيط الطباعة توقف. اضغط أي مفتاح للإغلاق...
pause >nul
