$ErrorActionPreference = 'Continue'

# === RAW USB PRINTER SUPPORT via Windows Print Spooler ===
try {
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential)]
    public struct DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOA di);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    public static bool SendBytesToPrinter(string printerName, byte[] data) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;

        DOCINFOA di = new DOCINFOA();
        di.pDocName = "Maestro POS Receipt";
        di.pDataType = "RAW";

        if (!StartDocPrinter(hPrinter, 1, ref di)) { ClosePrinter(hPrinter); return false; }
        if (!StartPagePrinter(hPrinter)) { EndDocPrinter(hPrinter); ClosePrinter(hPrinter); return false; }

        IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(data.Length);
        Marshal.Copy(data, 0, pUnmanagedBytes, data.Length);
        int written;
        bool success = WritePrinter(hPrinter, pUnmanagedBytes, data.Length, out written);
        Marshal.FreeCoTaskMem(pUnmanagedBytes);

        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
        ClosePrinter(hPrinter);
        return success;
    }
}
"@
} catch {
    # Type already added - ignore
}

# === NETWORK PRINTER: Send via TCP ===
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

# === USB PRINTER: Send via Windows Spooler ===
function Send-ToUsbPrinter {
    param([string]$printerName, [byte[]]$data)
    try {
        $result = [RawPrinterHelper]::SendBytesToPrinter($printerName, $data)
        if ($result) {
            return @{success=$true; message='OK'}
        } else {
            return @{success=$false; message="Failed to send to printer: $printerName"}
        }
    } catch {
        return @{success=$false; message=$_.Exception.Message}
    }
}

function Build-TestPage {
    param([string]$name, [string]$info, [string]$connType)
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
    $bytes.AddRange($enc.GetBytes("Connection: $connType"))
    $bytes.Add(0x0a)
    $bytes.AddRange($enc.GetBytes("Info: $info"))
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
            $jsonOut = '{"status":"running","version":"2.1.0","agent":"Maestro Print Agent","usb_support":true}'
        }
        elseif ($path -eq '/list-printers') {
            # List all Windows printers
            try {
                $wmiPrinters = Get-WmiObject -Class Win32_Printer | Select-Object Name, Default, PrinterStatus, PortName
                $printerList = @()
                foreach ($p in $wmiPrinters) {
                    $printerList += @{
                        name = $p.Name
                        is_default = $p.Default
                        status = $p.PrinterStatus
                        port = $p.PortName
                    }
                }
                $jsonOut = ($printerList | ConvertTo-Json -Compress)
                if (-not $jsonOut -or $jsonOut -eq 'null') { $jsonOut = '[]' }
                if ($jsonOut[0] -ne '[') { $jsonOut = "[$jsonOut]" }
            } catch {
                $jsonOut = '[]'
            }
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

            if ($body.usb_printer_name) {
                # USB printer test
                $testData = Build-TestPage $body.name $body.usb_printer_name 'USB'
                $result = Send-ToUsbPrinter $body.usb_printer_name $testData
                if ($result.success) {
                    $jsonOut = '{"success":true,"message":"OK","printer":"' + ($body.usb_printer_name -replace '"','') + '","type":"usb"}'
                } else {
                    $em = $result.message -replace '"', '' -replace '\\', ''
                    $jsonOut = '{"success":false,"message":"' + $em + '","type":"usb"}'
                }
            } else {
                # Network printer test
                $pport = if ($body.port) { [int]$body.port } else { 9100 }
                $testData = Build-TestPage $body.name ($body.ip + ':' + $pport) 'Network'
                $result = Send-ToPrinter $body.ip $pport $testData
                if ($result.success) {
                    $jsonOut = '{"success":true,"message":"OK","printer":"' + $body.ip + ':' + $pport + '","type":"network"}'
                } else {
                    $em = $result.message -replace '"', '' -replace '\\', ''
                    $jsonOut = '{"success":false,"message":"' + $em + '","type":"network"}'
                }
            }
        }
        elseif ($path -eq '/print-receipt' -and $req.HttpMethod -eq 'POST') {
            $reader = New-Object System.IO.StreamReader($req.InputStream)
            $body = $reader.ReadToEnd() | ConvertFrom-Json
            $receiptData = Build-Receipt $body.order $body.printer_config

            if ($body.usb_printer_name) {
                # USB printer receipt
                $result = Send-ToUsbPrinter $body.usb_printer_name $receiptData
            } else {
                # Network printer receipt
                $pport = if ($body.port) { [int]$body.port } else { 9100 }
                $result = Send-ToPrinter $body.ip $pport $receiptData
            }

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
            $rawBytes = [byte[]]@(0x1b, 0x40) + [System.Text.Encoding]::UTF8.GetBytes($body.text) + [byte[]]@(0x0a,0x0a,0x0a,0x0a,0x0a,0x1d,0x56,0x42,0x00)

            if ($body.usb_printer_name) {
                $result = Send-ToUsbPrinter $body.usb_printer_name $rawBytes
            } else {
                $pport = if ($body.port) { [int]$body.port } else { 9100 }
                $result = Send-ToPrinter $body.ip $pport $rawBytes
            }

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
