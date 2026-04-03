$ErrorActionPreference = 'Continue'
$agentLog = "$PSScriptRoot\agent.log"
"$(Get-Date) - Agent v2.1 starting..." | Out-File $agentLog

# === RAW USB PRINTER SUPPORT via Windows Print Spooler ===
try {
$csharpCode = @'
using System;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Drawing.Imaging;
using System.Collections.Generic;

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

public class ReceiptRenderer {
    public static byte[] RenderTextToEscPos(string[] lines, int[] sizes, bool[] bolds, string[] aligns, int paperWidth) {
        var bmp = new Bitmap(paperWidth, 3000);
        var g = Graphics.FromImage(bmp);
        g.Clear(Color.White);
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        float y = 5;
        for (int i = 0; i < lines.Length; i++) {
            var style = bolds[i] ? FontStyle.Bold : FontStyle.Regular;
            var font = new Font("Arial", sizes[i], style);
            var brush = Brushes.Black;
            var sf = new StringFormat();
            if (aligns[i] == "center") sf.Alignment = StringAlignment.Center;
            else if (aligns[i] == "right") sf.Alignment = StringAlignment.Far;
            else sf.Alignment = StringAlignment.Near;
            foreach (char c in lines[i]) {
                if (c >= 0x0600 && c <= 0x06FF) { sf.FormatFlags = StringFormatFlags.DirectionRightToLeft; break; }
            }
            var rect = new RectangleF(3, y, paperWidth - 6, 200);
            var measured = g.MeasureString(lines[i], font, paperWidth - 6, sf);
            g.DrawString(lines[i], font, brush, rect, sf);
            y += measured.Height + 1;
            font.Dispose();
            sf.Dispose();
        }
        g.Dispose();
        int height = (int)y + 20;
        if (height > 2999) height = 2999;
        var result = new List<byte>();
        result.AddRange(new byte[] { 0x1b, 0x40 });
        int bytesPerRow = (paperWidth + 7) / 8;
        result.AddRange(new byte[] { 0x1d, 0x76, 0x30, 0x00 });
        result.Add((byte)(bytesPerRow & 0xFF));
        result.Add((byte)((bytesPerRow >> 8) & 0xFF));
        result.Add((byte)(height & 0xFF));
        result.Add((byte)((height >> 8) & 0xFF));
        var bmpData = bmp.LockBits(new Rectangle(0, 0, paperWidth, height), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
        int stride = bmpData.Stride;
        byte[] rgb = new byte[stride * height];
        Marshal.Copy(bmpData.Scan0, rgb, 0, rgb.Length);
        bmp.UnlockBits(bmpData);
        for (int row = 0; row < height; row++) {
            for (int col = 0; col < bytesPerRow; col++) {
                byte b = 0;
                for (int bit = 0; bit < 8; bit++) {
                    int px = col * 8 + bit;
                    if (px < paperWidth) {
                        int idx = row * stride + px * 3;
                        float brightness = rgb[idx + 2] * 0.299f + rgb[idx + 1] * 0.587f + rgb[idx] * 0.114f;
                        if (brightness < 128) b |= (byte)(0x80 >> bit);
                    }
                }
                result.Add(b);
            }
        }
        bmp.Dispose();
        result.Add(0x0a); result.Add(0x0a); result.Add(0x0a); result.Add(0x0a);
        result.AddRange(new byte[] { 0x1d, 0x56, 0x42, 0x00 });
        return result.ToArray();
    }
}
'@
Add-Type -TypeDefinition $csharpCode -ReferencedAssemblies System.Drawing -ErrorAction Stop
"$(Get-Date) - C# RawPrinterHelper compiled OK" | Out-File $agentLog -Append
} catch {
    "$(Get-Date) - C# compile warning: $_" | Out-File $agentLog -Append
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
    $bytes.AddRange($enc.GetBytes('Maestro EGP v2.1'))
    $bytes.Add(0x0a); $bytes.Add(0x0a); $bytes.Add(0x0a); $bytes.Add(0x0a); $bytes.Add(0x0a)
    $bytes.AddRange([byte[]]@(0x1d, 0x56, 0x42, 0x00))
    return $bytes.ToArray()
}

function Build-Receipt {
    param($order, $config)
    $showPrices = $true
    if ($config -and $config.show_prices -eq $false) { $showPrices = $false }
    $lang = if ($order.language) { $order.language } else { 'ar' }
    $paperWidth = 384

    # بناء مصفوفات النص لتحويلها لصورة bitmap عبر ReceiptRenderer
    $lines = [System.Collections.Generic.List[string]]::new()
    $sizes = [System.Collections.Generic.List[int]]::new()
    $bolds = [System.Collections.Generic.List[bool]]::new()
    $aligns = [System.Collections.Generic.List[string]]::new()

    # اسم المطعم
    if ($order.restaurant_name) {
        $lines.Add([string]$order.restaurant_name)
        $sizes.Add(20)
        $bolds.Add($true)
        $aligns.Add('center')
    }

    # خط فاصل
    $lines.Add('================================')
    $sizes.Add(10)
    $bolds.Add($false)
    $aligns.Add('center')

    # رقم الطلب
    if ($order.order_number) {
        $lines.Add('#' + [string]$order.order_number)
        $sizes.Add(16)
        $bolds.Add($true)
        $aligns.Add('left')
    }

    # نوع الطلب
    if ($order.order_type) {
        $typeText = switch ($order.order_type) {
            'dine_in' { if ($lang -eq 'ar') { "$([char]0x0637)$([char]0x0644)$([char]0x0628) $([char]0x062F)$([char]0x0627)$([char]0x062E)$([char]0x0644)$([char]0x064A)" } else { 'Dine In' } }
            'takeaway' { if ($lang -eq 'ar') { "$([char]0x0637)$([char]0x0644)$([char]0x0628) $([char]0x0633)$([char]0x0641)$([char]0x0631)$([char]0x064A)" } else { 'Takeaway' } }
            'delivery' { if ($lang -eq 'ar') { "$([char]0x062A)$([char]0x0648)$([char]0x0635)$([char]0x064A)$([char]0x0644)" } else { 'Delivery' } }
            default { $order.order_type }
        }
        $lines.Add([string]$typeText)
        $sizes.Add(16)
        $bolds.Add($true)
        $aligns.Add('center')
    }

    # رقم الطاولة
    if ($order.table_number) {
        $tableLabel = if ($lang -eq 'ar') { "$([char]0x0637)$([char]0x0627)$([char]0x0648)$([char]0x0644)$([char]0x0629): " } else { 'Table: ' }
        $lines.Add([string]($tableLabel + $order.table_number))
        $sizes.Add(14)
        $bolds.Add($true)
        $aligns.Add('center')
    }

    # رقم البزون
    if ($order.buzzer_number) {
        $buzzerLabel = if ($lang -eq 'ar') { "$([char]0x0628)$([char]0x0632)$([char]0x0648)$([char]0x0646): " } else { 'Buzzer: ' }
        $lines.Add([string]($buzzerLabel + $order.buzzer_number))
        $sizes.Add(14)
        $bolds.Add($true)
        $aligns.Add('center')
    }

    # التاريخ
    $lines.Add((Get-Date -Format 'yyyy/MM/dd HH:mm'))
    $sizes.Add(10)
    $bolds.Add($false)
    $aligns.Add('center')

    # اسم العميل
    if ($order.customer_name) {
        $lines.Add([string]$order.customer_name)
        $sizes.Add(12)
        $bolds.Add($true)
        $aligns.Add('center')
    }

    # خط فاصل قبل العناصر
    $lines.Add('================================')
    $sizes.Add(10)
    $bolds.Add($false)
    $aligns.Add('center')

    # عناصر الطلب
    foreach ($item in $order.items) {
        $n = if ($item.product_name) { [string]$item.product_name } else { [string]$item.name }
        $q = if ($item.quantity) { $item.quantity } else { 1 }
        if ($showPrices) {
            $p = [math]::Round($item.price * $q)
            $lines.Add("$n x$q  $p")
            $sizes.Add(13)
            $bolds.Add($true)
            $aligns.Add('left')
        } else {
            $lines.Add("$n  x$q")
            $sizes.Add(18)
            $bolds.Add($true)
            $aligns.Add('left')
        }
        # ملاحظات
        if ($item.notes) {
            $lines.Add('  >> ' + [string]$item.notes)
            $sizes.Add(10)
            $bolds.Add($false)
            $aligns.Add('left')
        }
        # إضافات
        if ($item.extras) {
            foreach ($extra in $item.extras) {
                $eName = if ($extra.name) { [string]$extra.name } else { '' }
                if ($eName) {
                    if ($showPrices -and $extra.price) {
                        $lines.Add("  + $eName  $([math]::Round($extra.price))")
                    } else {
                        $lines.Add("  + $eName")
                    }
                    $sizes.Add(10)
                    $bolds.Add($false)
                    $aligns.Add('left')
                }
            }
        }
    }

    # خط فاصل بعد العناصر
    $lines.Add('================================')
    $sizes.Add(10)
    $bolds.Add($false)
    $aligns.Add('center')

    # الخصم
    if ($showPrices -and $order.discount -and $order.discount -gt 0) {
        $discLabel = if ($lang -eq 'ar') { "$([char]0x062E)$([char]0x0635)$([char]0x0645): -" } else { 'Discount: -' }
        $lines.Add([string]($discLabel + [math]::Round($order.discount)))
        $sizes.Add(13)
        $bolds.Add($true)
        $aligns.Add('center')
    }

    # الإجمالي
    if ($showPrices -and $order.total) {
        $totalLabel = if ($lang -eq 'ar') { "$([char]0x0627)$([char]0x0644)$([char]0x0625)$([char]0x062C)$([char]0x0645)$([char]0x0627)$([char]0x0644)$([char]0x064A): " } else { 'Total: ' }
        $total = [math]::Round($order.total)
        $lines.Add([string]($totalLabel + $total))
        $sizes.Add(18)
        $bolds.Add($true)
        $aligns.Add('center')
    }

    # طريقة الدفع (للفاتورة فقط)
    if ($showPrices -and $order.payment_method) {
        $pmText = switch ($order.payment_method) {
            'cash' { if ($lang -eq 'ar') { "$([char]0x0646)$([char]0x0642)$([char]0x062F)$([char]0x064A)" } else { 'Cash' } }
            'card' { if ($lang -eq 'ar') { "$([char]0x0628)$([char]0x0637)$([char]0x0627)$([char]0x0642)$([char]0x0629)" } else { 'Card' } }
            'credit' { if ($lang -eq 'ar') { "$([char]0x0622)$([char]0x062C)$([char]0x0644)" } else { 'Credit' } }
            default { [string]$order.payment_method }
        }
        $pmLabel = if ($lang -eq 'ar') { "$([char]0x0627)$([char]0x0644)$([char]0x062F)$([char]0x0641)$([char]0x0639): " } else { 'Payment: ' }
        $lines.Add([string]($pmLabel + $pmText))
        $sizes.Add(12)
        $bolds.Add($true)
        $aligns.Add('center')
    }

    # اسم الكاشير (للفاتورة فقط)
    if ($showPrices -and $order.cashier_name) {
        $cashierLabel = if ($lang -eq 'ar') { "$([char]0x0627)$([char]0x0644)$([char]0x0643)$([char]0x0627)$([char]0x0634)$([char]0x064A)$([char]0x0631): " } else { 'Cashier: ' }
        $lines.Add([string]($cashierLabel + $order.cashier_name))
        $sizes.Add(10)
        $bolds.Add($false)
        $aligns.Add('center')
    }

    # خط فاصل نهائي
    $lines.Add('================================')
    $sizes.Add(10)
    $bolds.Add($false)
    $aligns.Add('center')

    # شكراً لزيارتكم
    $thankText = if ($lang -eq 'ar') { "$([char]0x0634)$([char]0x0643)$([char]0x0631)$([char]0x0627)$([char]0x064B) $([char]0x0644)$([char]0x0632)$([char]0x064A)$([char]0x0627)$([char]0x0631)$([char]0x062A)$([char]0x0643)$([char]0x0645)" } else { 'Thank you!' }
    $lines.Add([string]$thankText)
    $sizes.Add(14)
    $bolds.Add($true)
    $aligns.Add('center')

    # Maestro
    $lines.Add('Maestro EGP')
    $sizes.Add(9)
    $bolds.Add($false)
    $aligns.Add('center')

    # تحويل النص لصورة bitmap عبر ReceiptRenderer (يدعم العربية)
    try {
        $result = [ReceiptRenderer]::RenderTextToEscPos(
            [string[]]$lines.ToArray(),
            [int[]]$sizes.ToArray(),
            [bool[]]$bolds.ToArray(),
            [string[]]$aligns.ToArray(),
            $paperWidth
        )
        return $result
    } catch {
        "$(Get-Date) - ReceiptRenderer error: $_ - falling back to UTF8" | Out-File $agentLog -Append
        # Fallback: استخدام UTF-8 العادي (قد لا يدعم العربية)
        $enc = [System.Text.Encoding]::UTF8
        $bytes = [System.Collections.Generic.List[byte]]::new()
        $bytes.AddRange([byte[]]@(0x1b, 0x40))
        foreach ($i in 0..($lines.Count - 1)) {
            if ($bolds[$i]) { $bytes.AddRange([byte[]]@(0x1b, 0x45, 0x01)) }
            $bytes.AddRange($enc.GetBytes($lines[$i]))
            $bytes.Add(0x0a)
            if ($bolds[$i]) { $bytes.AddRange([byte[]]@(0x1b, 0x45, 0x00)) }
        }
        $bytes.Add(0x0a); $bytes.Add(0x0a); $bytes.Add(0x0a); $bytes.Add(0x0a)
        $bytes.AddRange([byte[]]@(0x1d, 0x56, 0x42, 0x00))
        return $bytes.ToArray()
    }
}

try {
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add('http://localhost:9999/')
    $listener.Start()
    "$(Get-Date) - HttpListener started on port 9999" | Out-File $agentLog -Append

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
            try {
                $wmiPrinters = $null
                try {
                    $wmiPrinters = Get-CimInstance -ClassName Win32_Printer -ErrorAction Stop | Select-Object Name, Default, PrinterStatus, PortName
                } catch {
                    $wmiPrinters = Get-WmiObject -Class Win32_Printer -ErrorAction Stop | Select-Object Name, Default, PrinterStatus, PortName
                }
                $printerList = @()
                foreach ($p in $wmiPrinters) {
                    $printerList += @{
                        name = [string]$p.Name
                        is_default = [bool]$p.Default
                        status = if ($p.PrinterStatus) { [int]$p.PrinterStatus } else { 0 }
                        port = [string]$p.PortName
                    }
                }
                if ($printerList.Count -eq 0) {
                    $jsonOut = '[]'
                } elseif ($printerList.Count -eq 1) {
                    $single = $printerList[0]
                    $jsonOut = '[{"name":"' + ($single.name -replace '"','\"') + '","is_default":' + $single.is_default.ToString().ToLower() + ',"status":' + $single.status + ',"port":"' + ($single.port -replace '"','\"') + '"}]'
                } else {
                    $items = @()
                    foreach ($pr in $printerList) {
                        $items += '{"name":"' + ($pr.name -replace '"','\"') + '","is_default":' + $pr.is_default.ToString().ToLower() + ',"status":' + $pr.status + ',"port":"' + ($pr.port -replace '"','\"') + '"}'
                    }
                    $jsonOut = '[' + ($items -join ',') + ']'
                }
            } catch {
                $em = $_.Exception.Message -replace '"', '' -replace '\\', ''
                $jsonOut = '{"error":"' + $em + '","printers":[]}'
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
                $testData = Build-TestPage $body.name $body.usb_printer_name 'USB'
                $result = Send-ToUsbPrinter $body.usb_printer_name $testData
                if ($result.success) {
                    $jsonOut = '{"success":true,"message":"OK","printer":"' + ($body.usb_printer_name -replace '"','') + '","type":"usb"}'
                } else {
                    $em = $result.message -replace '"', '' -replace '\\', ''
                    $jsonOut = '{"success":false,"message":"' + $em + '","type":"usb"}'
                }
            } else {
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
                $result = Send-ToUsbPrinter $body.usb_printer_name $receiptData
            } else {
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
    "$(Get-Date) - FATAL ERROR: $_" | Out-File $agentLog -Append
} finally {
    if ($listener) { $listener.Stop() }
    "$(Get-Date) - Agent stopped" | Out-File $agentLog -Append
}
