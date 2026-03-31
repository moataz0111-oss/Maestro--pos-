$ErrorActionPreference = 'Continue'

function Send-ToPrinter {
    param([string]$ip, [int]$port, [byte[]]$data)
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect($ip, $port)
        $stream = $client.GetStream()
        $stream.Write($data, 0, $data.Length)
        $stream.Flush()
        Start-Sleep -Milliseconds 500
        $stream.Close()
        $client.Close()
        return @{success=$true; message='OK'}
    } catch {
        return @{success=$false; message=$_.Exception.Message}
    }
}

function Build-TestPage {
    param([string]$name, [string]$ip, [string]$port)
    $enc = [System.Text.Encoding]::UTF8
    $now = Get-Date -Format 'yyyy/MM/dd HH:mm:ss'
    $bytes = [System.Collections.Generic.List[byte]]::new()
    $bytes.AddRange([byte[]]@(0x1b, 0x40))
    $bytes.AddRange([byte[]]@(0x1b, 0x61, 0x01))
    $bytes.AddRange([byte[]]@(0x1b, 0x45, 0x01))
    $bytes.AddRange([byte[]]@(0x1b, 0x21, 0x10))
    $bytes.AddRange($enc.GetBytes('*** Test Print ***'))
    $bytes.Add(0x0a)
    $bytes.AddRange([byte[]]@(0x1b, 0x21, 0x00))
    $bytes.AddRange([byte[]]@(0x1b, 0x45, 0x00))
    $bytes.AddRange($enc.GetBytes('--------------------------------'))
    $bytes.Add(0x0a)
    $bytes.AddRange([byte[]]@(0x1b, 0x61, 0x00))
    $bytes.AddRange($enc.GetBytes("Printer: $name"))
    $bytes.Add(0x0a)
    $bytes.AddRange($enc.GetBytes("IP: ${ip}:${port}"))
    $bytes.Add(0x0a)
    $bytes.AddRange($enc.GetBytes('--------------------------------'))
    $bytes.Add(0x0a)
    $bytes.AddRange($enc.GetBytes("Date: $now"))
    $bytes.Add(0x0a)
    $bytes.AddRange($enc.GetBytes('--------------------------------'))
    $bytes.Add(0x0a)
    $bytes.AddRange([byte[]]@(0x1b, 0x61, 0x01))
    $bytes.AddRange([byte[]]@(0x1b, 0x45, 0x01))
    $bytes.AddRange($enc.GetBytes('Print Successful!'))
    $bytes.Add(0x0a)
    $bytes.AddRange([byte[]]@(0x1b, 0x45, 0x00))
    $bytes.AddRange($enc.GetBytes('Maestro EGP v2.0'))
    $bytes.Add(0x0a); $bytes.Add(0x0a); $bytes.Add(0x0a); $bytes.Add(0x0a); $bytes.Add(0x0a)
    $bytes.AddRange([byte[]]@(0x1d, 0x56, 0x42, 0x00))
    return $bytes.ToArray()
}

function Build-Receipt {
    param($order, $config)
    $enc = [System.Text.Encoding]::UTF8
    $showPrices = $true
    if ($config -and $config.show_prices -eq $false) { $showPrices = $false }
    $bytes = [System.Collections.Generic.List[byte]]::new()
    $bytes.AddRange([byte[]]@(0x1b, 0x40))
    $bytes.AddRange([byte[]]@(0x1b, 0x61, 0x01))
    if ($order.restaurant_name) {
        $bytes.AddRange([byte[]]@(0x1b, 0x45, 0x01, 0x1b, 0x21, 0x10))
        $bytes.AddRange($enc.GetBytes($order.restaurant_name))
        $bytes.Add(0x0a)
        $bytes.AddRange([byte[]]@(0x1b, 0x21, 0x00, 0x1b, 0x45, 0x00))
    }
    $sep = $enc.GetBytes('--------------------------------')
    $bytes.AddRange($sep); $bytes.Add(0x0a)
    $bytes.AddRange([byte[]]@(0x1b, 0x61, 0x00))
    if ($order.order_number) {
        $bytes.AddRange([byte[]]@(0x1b, 0x45, 0x01))
        $bytes.AddRange($enc.GetBytes('#' + $order.order_number))
        $bytes.Add(0x0a)
        $bytes.AddRange([byte[]]@(0x1b, 0x45, 0x00))
    }
    $bytes.AddRange($enc.GetBytes((Get-Date -Format 'yyyy/MM/dd HH:mm')))
    $bytes.Add(0x0a)
    if ($order.customer_name) { $bytes.AddRange($enc.GetBytes($order.customer_name)); $bytes.Add(0x0a) }
    $bytes.AddRange($sep); $bytes.Add(0x0a)
    foreach ($item in $order.items) {
        $n = if ($item.product_name) { $item.product_name } else { $item.name }
        $q = if ($item.quantity) { $item.quantity } else { 1 }
        if ($showPrices) {
            $p = [math]::Round($item.price * $q)
            $bytes.AddRange($enc.GetBytes("$n x$q  $p"))
        } else {
            $bytes.AddRange([byte[]]@(0x1b, 0x45, 0x01, 0x1b, 0x21, 0x10))
            $bytes.AddRange($enc.GetBytes("$n  x$q"))
            $bytes.AddRange([byte[]]@(0x1b, 0x21, 0x00, 0x1b, 0x45, 0x00))
        }
        $bytes.Add(0x0a)
        if ($item.notes) { $bytes.AddRange($enc.GetBytes('  > ' + $item.notes)); $bytes.Add(0x0a) }
    }
    $bytes.AddRange($sep); $bytes.Add(0x0a)
    if ($showPrices -and $order.total) {
        $bytes.AddRange([byte[]]@(0x1b, 0x61, 0x01, 0x1b, 0x45, 0x01, 0x1b, 0x21, 0x10))
        $total = [math]::Round($order.total)
        $bytes.AddRange($enc.GetBytes("Total: $total IQD"))
        $bytes.Add(0x0a)
        $bytes.AddRange([byte[]]@(0x1b, 0x21, 0x00, 0x1b, 0x45, 0x00))
    }
    $bytes.AddRange($sep); $bytes.Add(0x0a)
    $bytes.AddRange([byte[]]@(0x1b, 0x61, 0x01))
    $bytes.AddRange($enc.GetBytes('Thank you!'))
    $bytes.Add(0x0a); $bytes.Add(0x0a); $bytes.Add(0x0a); $bytes.Add(0x0a); $bytes.Add(0x0a)
    $bytes.AddRange([byte[]]@(0x1d, 0x56, 0x42, 0x00))
    return $bytes.ToArray()
}

try {
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add('http://localhost:9999/')
    $listener.Start()

    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response
        $res.AddHeader('Access-Control-Allow-Origin', '*')
        $res.AddHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        $res.AddHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        $res.ContentType = 'application/json'

        if ($req.HttpMethod -eq 'OPTIONS') {
            $res.StatusCode = 200
            $res.Close()
            continue
        }

        $path = $req.Url.LocalPath
        $jsonOut = ''

        if ($path -eq '/status') {
            $jsonOut = '{"status":"running","version":"2.0.0","agent":"Maestro Print Agent"}'
        }
        elseif ($path -eq '/check-printer') {
            $qip = $req.QueryString['ip']
            $qport = if ($req.QueryString['port']) { [int]$req.QueryString['port'] } else { 9100 }
            try {
                $tc = New-Object System.Net.Sockets.TcpClient
                $tc.Connect($qip, $qport)
                $tc.Close()
                $jsonOut = '{"online":true,"ip":"' + $qip + '"}'
            } catch {
                $jsonOut = '{"online":false,"ip":"' + $qip + '"}'
            }
        }
        elseif ($path -eq '/print-test' -and $req.HttpMethod -eq 'POST') {
            $reader = New-Object System.IO.StreamReader($req.InputStream)
            $body = $reader.ReadToEnd() | ConvertFrom-Json
            $pport = if ($body.port) { [int]$body.port } else { 9100 }
            $testData = Build-TestPage $body.name $body.ip $pport.ToString()
            $result = Send-ToPrinter $body.ip $pport $testData
            if ($result.success) {
                $jsonOut = '{"success":true,"message":"OK","printer":"' + $body.ip + ':' + $pport + '"}'
            } else {
                $em = $result.message -replace '"', '' -replace '\\', ''
                $jsonOut = '{"success":false,"message":"' + $em + '"}'
            }
        }
        elseif ($path -eq '/print-receipt' -and $req.HttpMethod -eq 'POST') {
            $reader = New-Object System.IO.StreamReader($req.InputStream)
            $body = $reader.ReadToEnd() | ConvertFrom-Json
            $pport = if ($body.port) { [int]$body.port } else { 9100 }
            $receiptData = Build-Receipt $body.order $body.printer_config
            $result = Send-ToPrinter $body.ip $pport $receiptData
            if ($result.success) {
                $jsonOut = '{"success":true,"message":"OK"}'
            } else {
                $em = $result.message -replace '"', '' -replace '\\', ''
                $jsonOut = '{"success":false,"message":"' + $em + '"}'
            }
        }
        elseif ($path -eq '/print-raw' -and $req.HttpMethod -eq 'POST') {
            $reader = New-Object System.IO.StreamReader($req.InputStream)
            $body = $reader.ReadToEnd() | ConvertFrom-Json
            $pport = if ($body.port) { [int]$body.port } else { 9100 }
            $rawBytes = [byte[]]@(0x1b, 0x40) + [System.Text.Encoding]::UTF8.GetBytes($body.text) + [byte[]]@(0x0a,0x0a,0x0a,0x0a,0x0a,0x1d,0x56,0x42,0x00)
            $result = Send-ToPrinter $body.ip $pport $rawBytes
            if ($result.success) {
                $jsonOut = '{"success":true,"message":"OK"}'
            } else {
                $em = $result.message -replace '"', '' -replace '\\', ''
                $jsonOut = '{"success":false,"message":"' + $em + '"}'
            }
        }
        else {
            $jsonOut = '{"error":"not found"}'
            $res.StatusCode = 404
        }

        $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonOut)
        $res.OutputStream.Write($buffer, 0, $buffer.Length)
        $res.Close()
    }
} catch {
    # Silent error handling for hidden mode
} finally {
    if ($listener) { $listener.Stop() }
}
