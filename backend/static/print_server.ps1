$ErrorActionPreference = 'Continue'
$agentLog = "$PSScriptRoot\agent.log"
"$(Get-Date) - Agent v{{AGENT_VERSION}} starting..." | Out-File $agentLog

# ============================================
# === AUTO-CLEANUP: Kill old agent & files ===
# ============================================
try {
    # Kill any process still listening on port 9999 (old agent)
    $netstat = netstat -ano 2>$null | Select-String 'LISTENING' | Select-String ':9999 '
    if ($netstat) {
        $pids = $netstat | ForEach-Object {
            ($_.ToString().Trim() -split '\s+')[-1]
        } | Sort-Object -Unique | Where-Object { $_ -ne '0' -and $_ -ne $PID }
        foreach ($oldPid in $pids) {
            try {
                Stop-Process -Id ([int]$oldPid) -Force -ErrorAction SilentlyContinue
                "$(Get-Date) - Killed old agent process PID: $oldPid" | Out-File $agentLog -Append
            } catch {}
        }
        Start-Sleep -Seconds 1
    }
    # Delete old/backup agent files
    $cleanupFiles = @(
        "$PSScriptRoot\print_server_old.ps1",
        "$PSScriptRoot\print_server_v2.3.ps1",
        "$PSScriptRoot\print_server_backup.ps1",
        "$PSScriptRoot\agent_old.log"
    )
    foreach ($f in $cleanupFiles) {
        if (Test-Path $f) {
            Remove-Item $f -Force -ErrorAction SilentlyContinue
            "$(Get-Date) - Cleaned up old file: $f" | Out-File $agentLog -Append
        }
    }
    "$(Get-Date) - Old agent cleanup complete" | Out-File $agentLog -Append
} catch {
    "$(Get-Date) - Cleanup warning: $_" | Out-File $agentLog -Append
}

# === BACKEND API URL (for Print Queue polling) ===
$configPath = "$PSScriptRoot\config.json"
$backendUrl = ""
if (Test-Path $configPath) {
    try { $cfg = Get-Content $configPath -Raw | ConvertFrom-Json; $backendUrl = $cfg.backend_url } catch {}
}
if (-not $backendUrl) {
    # Try to read from script download URL
    $backendUrl = ""
}
"$(Get-Date) - Backend URL for polling: $backendUrl" | Out-File $agentLog -Append

# === RAW USB PRINTER SUPPORT via Windows Print Spooler ===
try {
$csharpCode = @'
using System;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Drawing.Imaging;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;

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

    [DllImport("kernel32.dll")]
    public static extern void Sleep(int milliseconds);

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

        bool success = true;
        int chunkSize = 1024;
        int offset = 0;

        while (offset < data.Length) {
            int remaining = data.Length - offset;
            int currentSize = remaining < chunkSize ? remaining : chunkSize;

            IntPtr pChunk = Marshal.AllocCoTaskMem(currentSize);
            Marshal.Copy(data, offset, pChunk, currentSize);
            int written;
            bool ok = WritePrinter(hPrinter, pChunk, currentSize, out written);
            Marshal.FreeCoTaskMem(pChunk);

            if (!ok) { success = false; break; }
            offset += currentSize;

            if (offset < data.Length) Sleep(15);
        }

        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
        ClosePrinter(hPrinter);
        return success;
    }
}

public class ReceiptRenderer {
    // تحويل صورة إلى ESC/POS raster bitmap (للشعارات)
    public static byte[] ImageToEscPos(byte[] imageBytes, int maxWidth) {
        try {
            using (var ms = new MemoryStream(imageBytes)) {
                var img = Image.FromStream(ms);
                // تغيير حجم الصورة للعرض المطلوب مع الحفاظ على النسبة
                int newWidth = Math.Min(img.Width, maxWidth);
                int newHeight = (int)((float)img.Height / img.Width * newWidth);
                if (newHeight > 400) newHeight = 400; // حد أقصى للارتفاع
                
                var bmp = new Bitmap(maxWidth, newHeight);
                var g = Graphics.FromImage(bmp);
                g.Clear(Color.White);
                g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                // توسيط الصورة
                int x = (maxWidth - newWidth) / 2;
                g.DrawImage(img, x, 0, newWidth, newHeight);
                g.Dispose();
                img.Dispose();
                
                var result = new List<byte>();
                // Center alignment
                result.AddRange(new byte[] { 0x1b, 0x61, 1 });
                int bytesPerRow = (maxWidth + 7) / 8;
                // GS v 0 - Print raster bit image
                result.AddRange(new byte[] { 0x1d, 0x76, 0x30, 0x00 });
                result.Add((byte)(bytesPerRow & 0xFF));
                result.Add((byte)((bytesPerRow >> 8) & 0xFF));
                result.Add((byte)(newHeight & 0xFF));
                result.Add((byte)((newHeight >> 8) & 0xFF));
                
                var bmpData = bmp.LockBits(new Rectangle(0, 0, maxWidth, newHeight), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
                int stride = bmpData.Stride;
                byte[] rgb = new byte[stride * newHeight];
                Marshal.Copy(bmpData.Scan0, rgb, 0, rgb.Length);
                bmp.UnlockBits(bmpData);
                
                for (int row = 0; row < newHeight; row++) {
                    for (int col = 0; col < bytesPerRow; col++) {
                        byte b = 0;
                        for (int bit = 0; bit < 8; bit++) {
                            int px = col * 8 + bit;
                            if (px < maxWidth) {
                                int idx = row * stride + px * 3;
                                float brightness = rgb[idx + 2] * 0.299f + rgb[idx + 1] * 0.587f + rgb[idx] * 0.114f;
                                if (brightness < 128) b |= (byte)(0x80 >> bit);
                            }
                        }
                        result.Add(b);
                    }
                }
                bmp.Dispose();
                result.Add(0x0a);
                return result.ToArray();
            }
        } catch {
            return new byte[0];
        }
    }

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

// =============================================
// === ZKTeco Protocol Handler (UDP + TCP)   ===
// =============================================
public class ZKHelper {
    // ZK Protocol Commands
    const ushort CMD_CONNECT = 1000;
    const ushort CMD_EXIT = 1001;
    const ushort CMD_ENABLEDEVICE = 1002;
    const ushort CMD_DISABLEDEVICE = 1003;
    const ushort CMD_RESTART = 1004;
    const ushort CMD_USERTEMP_RRQ = 9;
    const ushort CMD_ATTLOG_RRQ = 13;
    const ushort CMD_CLEAR_ATTLOG = 14;
    const ushort CMD_GET_FREE_SIZES = 50;
    const ushort CMD_GET_SERIALNUMBER = 67;
    const ushort CMD_GET_DEVICE_NAME = 68;
    const ushort CMD_ACK_OK = 2000;
    const ushort CMD_ACK_ERROR = 2001;
    const ushort CMD_ACK_DATA = 2002;
    const ushort CMD_ACK_UNAUTH = 2005;
    const ushort CMD_AUTH = 29;
    const ushort CMD_OPTIONS_RRQ = 11;
    const ushort CMD_PREPARE_DATA = 1500;
    const ushort CMD_DATA = 1501;
    const ushort CMD_FREE_DATA = 1502;
    const ushort CMD_DATA_WRRQ = 1503;
    const ushort CMD_DATA_RDY = 1504;

    private static ushort CreateChecksum(byte[] p) {
        int l = p.Length;
        if (l % 2 != 0) {
            byte[] padded = new byte[l + 1];
            Array.Copy(p, padded, l);
            p = padded;
            l++;
        }
        uint chksum = 0;
        int idx = 0;
        while (l > 1) {
            chksum += (uint)BitConverter.ToUInt16(p, idx);
            idx += 2;
            l -= 2;
        }
        while (chksum > 0xFFFF) {
            chksum = (chksum & 0xFFFF) + (chksum >> 16);
        }
        return (ushort)(~chksum & 0xFFFF);
    }

    private static byte[] BuildPacket(ushort command, ushort sessionId, ushort replyId, byte[] data) {
        int payloadLen = 8 + (data != null ? data.Length : 0);
        byte[] payload = new byte[payloadLen];
        payload[0] = (byte)(command & 0xFF);
        payload[1] = (byte)((command >> 8) & 0xFF);
        payload[2] = 0; payload[3] = 0;
        payload[4] = (byte)(sessionId & 0xFF);
        payload[5] = (byte)((sessionId >> 8) & 0xFF);
        payload[6] = (byte)(replyId & 0xFF);
        payload[7] = (byte)((replyId >> 8) & 0xFF);
        if (data != null && data.Length > 0) {
            Array.Copy(data, 0, payload, 8, data.Length);
        }
        ushort chk = CreateChecksum(payload);
        payload[2] = (byte)(chk & 0xFF);
        payload[3] = (byte)((chk >> 8) & 0xFF);
        // UDP: send raw payload without transport header
        // TCP needs 50 50 82 7D header, but UDP does not
        return payload;
    }

    private static byte[] ExtractPayload(byte[] raw) {
        if (raw != null && raw.Length >= 8 && raw[0] == 0x50 && raw[1] == 0x50 && raw[2] == 0x82 && raw[3] == 0x7D) {
            int pSize = BitConverter.ToInt32(raw, 4);
            if (pSize > 0 && raw.Length >= 8 + pSize) {
                byte[] p = new byte[pSize];
                Array.Copy(raw, 8, p, 0, pSize);
                return p;
            }
        }
        return raw;
    }

    private static string HexDump(byte[] data, int maxLen) {
        if (data == null) return "null";
        int len = Math.Min(data.Length, maxLen);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < len; i++) {
            sb.Append(data[i].ToString("X2"));
            if (i < len - 1) sb.Append(" ");
        }
        if (data.Length > maxLen) sb.Append("...");
        return "[" + data.Length + "B] " + sb.ToString();
    }

    private static byte[] SendAndReceive(UdpClient client, string ip, int port, byte[] packet, int timeout) {
        client.Client.ReceiveTimeout = timeout;
        client.Send(packet, packet.Length, ip, port);
        IPEndPoint ep = new IPEndPoint(IPAddress.Any, 0);
        byte[] raw = client.Receive(ref ep);
        return ExtractPayload(raw);
    }

    // ZKTeco comm key scramble (from pyzk make_commkey)
    private static byte[] MakeCommKey(int commKey, ushort sessionId) {
        uint k = 0;
        for (int i = 0; i < 32; i++) {
            if ((commKey & (1 << i)) != 0)
                k = (k << 1) | 1;
            else
                k = k << 1;
        }
        k += sessionId;
        byte[] kb = BitConverter.GetBytes(k);
        kb[0] ^= (byte)'Z';
        kb[1] ^= (byte)'K';
        kb[2] ^= (byte)'S';
        kb[3] ^= (byte)'O';
        uint v = BitConverter.ToUInt32(kb, 0);
        byte[] result = new byte[4];
        result[0] = (byte)((v >> 24) & 0xFF);
        result[1] = (byte)((v >> 16) & 0xFF);
        result[2] = (byte)((v >> 8) & 0xFF);
        result[3] = (byte)(v & 0xFF);
        return result;
    }

    // Connect + Auth helper - returns [sessionId, success]
    private static ushort ConnectAndAuth(UdpClient client, string ip, int port, int timeoutMs, int commKey, out bool success) {
        success = false;
        byte[] connectPkt = BuildPacket(CMD_CONNECT, 0, 0, null);
        byte[] resp = SendAndReceive(client, ip, port, connectPkt, timeoutMs);
        if (resp.Length < 8) return 0;
        ushort cmd = BitConverter.ToUInt16(resp, 0);
        ushort sessionId = BitConverter.ToUInt16(resp, 4);
        if (cmd == CMD_ACK_OK) {
            success = true;
            return sessionId;
        }
        if (cmd == CMD_ACK_UNAUTH) {
            byte[] authData = MakeCommKey(commKey, sessionId);
            byte[] authPkt = BuildPacket(CMD_AUTH, sessionId, 1, authData);
            byte[] authResp = SendAndReceive(client, ip, port, authPkt, timeoutMs);
            if (authResp.Length >= 8 && BitConverter.ToUInt16(authResp, 0) == CMD_ACK_OK) {
                success = true;
                return sessionId;
            }
        }
        return sessionId;
    }

    private static string DecodeTime(uint t) {
        int second = (int)(t % 60); t /= 60;
        int minute = (int)(t % 60); t /= 60;
        int hour = (int)(t % 24); t /= 24;
        int day = (int)(t % 31) + 1; t /= 31;
        int month = (int)(t % 12) + 1; t /= 12;
        int year = (int)(t + 2000);
        return string.Format("{0:D4}-{1:D2}-{2:D2}T{3:D2}:{4:D2}:{5:D2}", year, month, day, hour, minute, second);
    }

    private static string EscJson(string s) {
        if (s == null) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r","").Replace("\n","");
    }

    // ===== Test Connection =====
    public static string TestConnection(string ip, int port, int timeoutMs) {
        UdpClient client = null;
        try {
            client = new UdpClient();
            client.Client.ReceiveTimeout = timeoutMs;
            client.Client.SendTimeout = timeoutMs;

            bool ok;
            ushort sessionId = ConnectAndAuth(client, ip, port, timeoutMs, 0, out ok);

            if (ok) {
                ushort replyId = 2;

                // Get serial number
                string serial = "N/A";
                try {
                    byte[] snPkt = BuildPacket(CMD_GET_SERIALNUMBER, sessionId, replyId++, null);
                    byte[] snResp = SendAndReceive(client, ip, port, snPkt, timeoutMs);
                    if (snResp.Length > 8) {
                        serial = Encoding.UTF8.GetString(snResp, 8, snResp.Length - 8).TrimEnd('\0');
                    }
                } catch {}

                // Get device name
                string deviceName = "ZKTeco";
                try {
                    byte[] dnPkt = BuildPacket(CMD_GET_DEVICE_NAME, sessionId, replyId++, null);
                    byte[] dnResp = SendAndReceive(client, ip, port, dnPkt, timeoutMs);
                    if (dnResp.Length > 8) {
                        deviceName = Encoding.UTF8.GetString(dnResp, 8, dnResp.Length - 8).TrimEnd('\0');
                    }
                } catch {}

                // Disconnect
                try {
                    byte[] exitPkt = BuildPacket(CMD_EXIT, sessionId, replyId++, null);
                    client.Send(exitPkt, exitPkt.Length, ip, port);
                } catch {}

                client.Close();
                return "{\"success\":true,\"message\":\"Connected + Authenticated\",\"serial_number\":\"" + EscJson(serial) + "\",\"device_name\":\"" + EscJson(deviceName) + "\",\"session_id\":" + sessionId + "}";
            }

            client.Close();
            return "{\"success\":false,\"message\":\"Authentication failed\"}";
        } catch (SocketException ex) {
            if (client != null) try { client.Close(); } catch {}
            if (ex.SocketErrorCode == SocketError.TimedOut)
                return "{\"success\":false,\"message\":\"Connection timeout - device not reachable\"}";
            return "{\"success\":false,\"message\":\"Socket: " + EscJson(ex.Message) + " (code:" + ex.SocketErrorCode + ")\"}";
        } catch (Exception ex) {
            if (client != null) try { client.Close(); } catch {}
            return "{\"success\":false,\"message\":\"Error: " + EscJson(ex.Message) + "\"}";
        }
    }

    // ===== Get Users =====
    public static string GetUsers(string ip, int port, int timeoutMs) {
        UdpClient client = null;
        try {
            client = new UdpClient();
            client.Client.ReceiveTimeout = timeoutMs;
            client.Client.SendTimeout = timeoutMs;

            bool ok;
            ushort sessionId = ConnectAndAuth(client, ip, port, timeoutMs, 0, out ok);
            if (!ok) {
                client.Close();
                return "{\"success\":false,\"message\":\"Connection/Auth failed\"}";
            }
            ushort replyId = 2;

            // Disable device (prevent interference)
            byte[] disablePkt = BuildPacket(CMD_DISABLEDEVICE, sessionId, replyId++, null);
            try { SendAndReceive(client, ip, port, disablePkt, timeoutMs); } catch {}

            // Request user data
            byte[] userPkt = BuildPacket(CMD_USERTEMP_RRQ, sessionId, replyId++, null);
            byte[] userResp = SendAndReceive(client, ip, port, userPkt, timeoutMs * 2);

            List<string> users = new List<string>();
            List<byte> allData = new List<byte>();
            int uHeaderSize = 0;
            int recordSize = 72;
            ushort respCmd = BitConverter.ToUInt16(userResp, 0);

            if (respCmd == CMD_PREPARE_DATA && userResp.Length >= 12) {
                uint dataSize = BitConverter.ToUInt32(userResp, 8);
                // Read data packets
                while (allData.Count < dataSize) {
                    try {
                        IPEndPoint ep2 = new IPEndPoint(IPAddress.Any, 0);
                        byte[] rawPkt = client.Receive(ref ep2);
                        byte[] dataPkt = ExtractPayload(rawPkt);
                        if (dataPkt.Length > 0) {
                            ushort dCmd = BitConverter.ToUInt16(dataPkt, 0);
                            if (dCmd == CMD_DATA) {
                                byte[] chunk = new byte[dataPkt.Length - 8];
                                Array.Copy(dataPkt, 8, chunk, 0, chunk.Length);
                                allData.AddRange(chunk);
                            } else if (dCmd == CMD_ACK_OK) {
                                break;
                            }
                        }
                    } catch { break; }
                }

                // Free data buffer
                try {
                    byte[] freePkt = BuildPacket(CMD_FREE_DATA, sessionId, replyId++, null);
                    client.Send(freePkt, freePkt.Length, ip, port);
                } catch {}

                // Parse user records - pyzk format
                // ZKTeco data often has 4-byte header before actual records
                byte[] userData = allData.ToArray();
                int uDataLen = userData.Length;

                // Detect 4-byte header
                if (uDataLen > 4) {
                    if ((uDataLen - 4) % 72 == 0 && uDataLen % 72 != 0) uHeaderSize = 4;
                    else if (uDataLen % 72 == 0) uHeaderSize = 0;
                    else if ((uDataLen - 4) % 28 == 0 && uDataLen % 28 != 0) { uHeaderSize = 4; recordSize = 28; }
                    else if (uDataLen % 28 == 0) { uHeaderSize = 0; recordSize = 28; }
                }

                int uParseLen = uDataLen - uHeaderSize;
                int userCount = uParseLen / recordSize;
                for (int i = 0; i < userCount; i++) {
                    int offset = uHeaderSize + (i * recordSize);
                    if (offset + recordSize > uDataLen) break;
                    try {
                        int uidNum = BitConverter.ToUInt16(userData, offset);
                        int privilege = userData[offset + 2];
                        string name = "";
                        string userId = "";
                        if (recordSize == 72) {
                            // pyzk 72-byte: uid(2)+priv(1)+pass(8)+name(24)+card(4)+...+group(1)+userId(23)
                            // Try UTF-8 first, then Unicode for Arabic/Chinese names
                            byte[] nameRaw = new byte[24];
                            Array.Copy(userData, offset + 11, nameRaw, 0, 24);
                            name = Encoding.UTF8.GetString(nameRaw).Split('\0')[0].Trim();
                            // If UTF-8 gives garbage (control chars), try UTF-16LE
                            if (name.Length > 0) {
                                bool hasControlChars = false;
                                foreach (char c in name) { if (c > 0 && c < 32 && c != 10 && c != 13) { hasControlChars = true; break; } }
                                if (hasControlChars) {
                                    name = Encoding.Unicode.GetString(nameRaw).Split('\0')[0].Trim();
                                }
                            }
                            userId = Encoding.UTF8.GetString(userData, offset + 48, 24).Split('\0')[0].Trim();
                            if (string.IsNullOrEmpty(userId)) userId = uidNum.ToString();
                        } else {
                            // 28-byte: uid(2)+priv(1)+pass(8)+name(8)+card(4)+...+userId(?)
                            byte[] nameRaw = new byte[Math.Min(8, recordSize - 11)];
                            Array.Copy(userData, offset + 11, nameRaw, 0, nameRaw.Length);
                            name = Encoding.UTF8.GetString(nameRaw).Split('\0')[0].Trim();
                            if (name.Length > 0) {
                                bool hasControlChars = false;
                                foreach (char c in name) { if (c > 0 && c < 32 && c != 10 && c != 13) { hasControlChars = true; break; } }
                                if (hasControlChars) {
                                    name = Encoding.Unicode.GetString(nameRaw).Split('\0')[0].Trim();
                                }
                            }
                            userId = uidNum.ToString();
                        }
                        if (uidNum > 0) {
                            users.Add("{\"uid\":\"" + userId + "\",\"uid_num\":" + uidNum + ",\"name\":\"" + EscJson(name) + "\",\"privilege\":" + privilege + "}");
                        }
                    } catch {}
                }
            } else if (respCmd == CMD_ACK_DATA && userResp.Length > 8) {
                // Small data - inline in response
                // Similar parsing for inline data
            }

            // Enable device & disconnect
            try {
                byte[] enablePkt = BuildPacket(CMD_ENABLEDEVICE, sessionId, replyId++, null);
                client.Send(enablePkt, enablePkt.Length, ip, port);
                byte[] exitPkt = BuildPacket(CMD_EXIT, sessionId, replyId++, null);
                client.Send(exitPkt, exitPkt.Length, ip, port);
            } catch {}

            client.Close();
            return "{\"success\":true,\"users\":[" + string.Join(",", users.ToArray()) + "],\"count\":" + users.Count + ",\"raw_bytes\":" + allData.Count + ",\"header\":" + uHeaderSize + ",\"record_size\":" + recordSize + ",\"resp_cmd\":" + respCmd + ",\"debug\":\"dataLen=" + allData.Count + " hdr=" + uHeaderSize + " recSz=" + recordSize + "\"}";
        } catch (Exception ex) {
            if (client != null) try { client.Close(); } catch {}
            return "{\"success\":false,\"message\":\"" + EscJson(ex.Message) + "\"}";
        }
    }

    // ===== Sync Attendance =====
    public static string SyncAttendance(string ip, int port, int timeoutMs) {
        UdpClient client = null;
        try {
            client = new UdpClient();
            client.Client.ReceiveTimeout = timeoutMs;
            client.Client.SendTimeout = timeoutMs;

            bool ok;
            ushort sessionId = ConnectAndAuth(client, ip, port, timeoutMs, 0, out ok);
            if (!ok) {
                client.Close();
                return "{\"success\":false,\"message\":\"Connection/Auth failed\"}";
            }
            ushort replyId = 2;

            // Disable device to get exclusive access
            try {
                byte[] disablePkt = BuildPacket(CMD_DISABLEDEVICE, sessionId, replyId++, null);
                SendAndReceive(client, ip, port, disablePkt, timeoutMs);
            } catch {}

            // Request attendance data
            byte[] attPkt = BuildPacket(CMD_ATTLOG_RRQ, sessionId, replyId++, null);
            byte[] attResp;
            try {
                attResp = SendAndReceive(client, ip, port, attPkt, timeoutMs * 3);
            } catch (Exception rex) {
                // Re-enable and disconnect
                try {
                    byte[] enPkt = BuildPacket(CMD_ENABLEDEVICE, sessionId, replyId++, null);
                    client.Send(enPkt, enPkt.Length, ip, port);
                    byte[] exPkt = BuildPacket(CMD_EXIT, sessionId, replyId++, null);
                    client.Send(exPkt, exPkt.Length, ip, port);
                } catch {}
                client.Close();
                return "{\"success\":false,\"message\":\"Attendance request failed: " + EscJson(rex.Message) + "\"}";
            }

            List<string> records = new List<string>();
            List<byte> allData = new List<byte>();
            ushort respCmd = (attResp.Length >= 2) ? BitConverter.ToUInt16(attResp, 0) : (ushort)0;
            string debugInfo = "cmd=0x" + respCmd.ToString("X4") + " len=" + attResp.Length;

            if (respCmd == CMD_PREPARE_DATA && attResp.Length >= 12) {
                uint dataSize = BitConverter.ToUInt32(attResp, 8);
                debugInfo += " dataSize=" + dataSize;

                // Read data packets
                int maxWait = 60000;
                DateTime start = DateTime.Now;
                while (allData.Count < (int)dataSize && (DateTime.Now - start).TotalMilliseconds < maxWait) {
                    try {
                        IPEndPoint ep2 = new IPEndPoint(IPAddress.Any, 0);
                        byte[] rawPkt = client.Receive(ref ep2);
                        byte[] dataPkt = ExtractPayload(rawPkt);
                        if (dataPkt.Length > 0) {
                            ushort dCmd = BitConverter.ToUInt16(dataPkt, 0);
                            if (dCmd == CMD_DATA) {
                                byte[] chunk = new byte[dataPkt.Length - 8];
                                Array.Copy(dataPkt, 8, chunk, 0, chunk.Length);
                                allData.AddRange(chunk);
                            } else if (dCmd == CMD_ACK_OK) {
                                break;
                            }
                        }
                    } catch { break; }
                }

                // Free data buffer
                try {
                    byte[] freePkt = BuildPacket(CMD_FREE_DATA, sessionId, replyId++, null);
                    client.Send(freePkt, freePkt.Length, ip, port);
                } catch {}

                // Parse attendance records - pyzk format
                // ZKTeco data often has 4-byte header before actual records
                byte[] attData = allData.ToArray();
                int dataLen = attData.Length;
                int headerSize = 0;
                int recordSize = 40;

                // Detect 4-byte header: (len-4) divisible by record size but len isn't
                if (dataLen > 4) {
                    if ((dataLen - 4) % 40 == 0 && dataLen % 40 != 0) headerSize = 4;
                    else if (dataLen % 40 == 0) headerSize = 0;
                    else if ((dataLen - 4) % 16 == 0 && dataLen % 16 != 0) { headerSize = 4; recordSize = 16; }
                    else if (dataLen % 16 == 0) { headerSize = 0; recordSize = 16; }
                    else if ((dataLen - 4) % 8 == 0 && dataLen % 8 != 0) { headerSize = 4; recordSize = 8; }
                    else if (dataLen % 8 == 0) { headerSize = 0; recordSize = 8; }
                }

                int parseLen = dataLen - headerSize;
                int recCount = parseLen / recordSize;
                debugInfo += " header=" + headerSize + " recSize=" + recordSize + " recs=" + recCount;

                for (int i = 0; i < recCount; i++) {
                    int offset = headerSize + (i * recordSize);
                    if (offset + recordSize > dataLen) break;
                    try {
                        string uid;
                        uint timestamp;
                        int status;
                        int punchType;

                        if (recordSize == 40) {
                            // pyzk 40-byte: uid(2)+user_id(24)+status(1)+timestamp(4)+punch(1)+space(8)
                            int uidNum = BitConverter.ToUInt16(attData, offset);
                            string userId = Encoding.UTF8.GetString(attData, offset + 2, 24).Split('\0')[0];
                            uid = string.IsNullOrEmpty(userId) ? uidNum.ToString() : userId;
                            status = attData[offset + 26];
                            timestamp = BitConverter.ToUInt32(attData, offset + 27);
                            punchType = attData[offset + 31];
                        } else if (recordSize == 8) {
                            // pyzk 8-byte: uid(2)+status(1)+punch(1)+timestamp(4)
                            uid = BitConverter.ToUInt16(attData, offset).ToString();
                            status = attData[offset + 2];
                            punchType = attData[offset + 3];
                            timestamp = BitConverter.ToUInt32(attData, offset + 4);
                        } else {
                            // 16-byte fallback
                            uid = BitConverter.ToUInt16(attData, offset).ToString();
                            timestamp = BitConverter.ToUInt32(attData, offset + 4);
                            status = attData[offset + 8];
                            punchType = attData[offset + 10];
                        }

                        string time = DecodeTime(timestamp);
                        string pType = status == 0 ? "in" : "out";
                        if (!string.IsNullOrEmpty(uid) && uid != "0") {
                            records.Add("{\"uid\":\"" + EscJson(uid) + "\",\"timestamp\":\"" + time + "\",\"status\":" + status + ",\"punch_type\":\"" + pType + "\"}");
                        }
                    } catch {}
                }
            }

            // Enable device & disconnect
            try {
                byte[] enablePkt = BuildPacket(CMD_ENABLEDEVICE, sessionId, replyId++, null);
                client.Send(enablePkt, enablePkt.Length, ip, port);
                byte[] exitPkt = BuildPacket(CMD_EXIT, sessionId, replyId++, null);
                client.Send(exitPkt, exitPkt.Length, ip, port);
            } catch {}

            client.Close();
            return "{\"success\":true,\"records\":[" + string.Join(",", records.ToArray()) + "],\"count\":" + records.Count + ",\"raw_bytes\":" + allData.Count + ",\"debug\":\"" + EscJson(debugInfo) + "\"}";
        } catch (Exception ex) {
            if (client != null) try { client.Close(); } catch {}
            return "{\"success\":false,\"message\":\"" + EscJson(ex.Message) + "\"}";
        }
    }
    // ===== Push User to Device =====
    public static string SetUser(string ip, int port, int timeoutMs, int uid, string userId, string name, int privilege) {
        UdpClient client = null;
        try {
            client = new UdpClient();
            client.Client.ReceiveTimeout = timeoutMs;
            client.Client.SendTimeout = timeoutMs;

            bool ok;
            ushort sessionId = ConnectAndAuth(client, ip, port, timeoutMs, 0, out ok);
            if (!ok) {
                client.Close();
                return "{\"success\":false,\"message\":\"Connection/Auth failed\"}";
            }
            ushort replyId = 2;

            // Disable device for exclusive access during write
            try {
                byte[] disablePkt = BuildPacket(CMD_DISABLEDEVICE, sessionId, replyId++, null);
                SendAndReceive(client, ip, port, disablePkt, timeoutMs);
            } catch {}

            // Build user data (72 bytes for modern devices)
            // pyzk 72-byte format: uid(2)+priv(1)+pass(8)+name(24)+card(4)+...+userId(24@offset48)
            byte[] userData = new byte[72];
            // uid (2 bytes at offset 0)
            userData[0] = (byte)(uid & 0xFF);
            userData[1] = (byte)((uid >> 8) & 0xFF);
            // privilege (1 byte at offset 2)
            userData[2] = (byte)privilege;
            // password (8 bytes at offset 3) - empty
            // name (24 bytes at offset 11) - always UTF-8 (supports Arabic/English)
            if (!string.IsNullOrEmpty(name)) {
                byte[] nameBytes = Encoding.UTF8.GetBytes(name);
                int nameCopyLen = Math.Min(nameBytes.Length, 24);
                Array.Copy(nameBytes, 0, userData, 11, nameCopyLen);
            }
            // userId string (24 bytes at offset 48) - always ASCII
            byte[] uidBytes = Encoding.UTF8.GetBytes(userId ?? uid.ToString());
            int uidCopyLen = Math.Min(uidBytes.Length, 24);
            Array.Copy(uidBytes, 0, userData, 48, uidCopyLen);

            // Send CMD_USER_WRQ (8)
            byte[] userPkt = BuildPacket(8, sessionId, replyId++, userData);
            byte[] userResp = SendAndReceive(client, ip, port, userPkt, timeoutMs);

            bool success = false;
            if (userResp.Length >= 8) {
                ushort respCmd = BitConverter.ToUInt16(userResp, 0);
                success = (respCmd == CMD_ACK_OK);
            }

            // Enable device & disconnect
            try {
                byte[] enablePkt = BuildPacket(CMD_ENABLEDEVICE, sessionId, replyId++, null);
                client.Send(enablePkt, enablePkt.Length, ip, port);
                byte[] exitPkt = BuildPacket(CMD_EXIT, sessionId, replyId++, null);
                client.Send(exitPkt, exitPkt.Length, ip, port);
            } catch {}

            client.Close();
            if (success) {
                return "{\"success\":true,\"message\":\"User pushed to device\",\"uid\":" + uid + "}";
            } else {
                return "{\"success\":false,\"message\":\"Device rejected user data\"}";
            }
        } catch (Exception ex) {
            if (client != null) try { client.Close(); } catch {}
            return "{\"success\":false,\"message\":\"" + EscJson(ex.Message) + "\"}";
        }
    }

    // ===== Delete User from Device =====
    public static string DeleteUser(string ip, int port, int timeoutMs, int uid) {
        UdpClient client = null;
        try {
            client = new UdpClient();
            client.Client.ReceiveTimeout = timeoutMs;
            client.Client.SendTimeout = timeoutMs;

            bool ok;
            ushort sessionId = ConnectAndAuth(client, ip, port, timeoutMs, 0, out ok);
            if (!ok) {
                client.Close();
                return "{\"success\":false,\"message\":\"Connection/Auth failed\"}";
            }
            ushort replyId = 2;

            // CMD_DELETE_USER = 18, data = uid (2 bytes)
            byte[] uidData = new byte[2];
            uidData[0] = (byte)(uid & 0xFF);
            uidData[1] = (byte)((uid >> 8) & 0xFF);
            byte[] delPkt = BuildPacket(18, sessionId, replyId++, uidData);
            byte[] delResp = SendAndReceive(client, ip, port, delPkt, timeoutMs);

            bool success = false;
            if (delResp.Length >= 8) {
                success = (BitConverter.ToUInt16(delResp, 0) == CMD_ACK_OK);
            }

            try {
                byte[] exitPkt = BuildPacket(CMD_EXIT, sessionId, replyId++, null);
                client.Send(exitPkt, exitPkt.Length, ip, port);
            } catch {}

            client.Close();
            return success
                ? "{\"success\":true,\"message\":\"User deleted from device\"}"
                : "{\"success\":false,\"message\":\"Failed to delete user\"}";
        } catch (Exception ex) {
            if (client != null) try { client.Close(); } catch {}
            return "{\"success\":false,\"message\":\"" + EscJson(ex.Message) + "\"}";
        }
    }

    // ===== Helper: Read HTTP photo from URL =====
    private static byte[] HttpGetPhoto(string url, string user, string pass, int timeout) {
        try {
            System.Net.HttpWebRequest req = (System.Net.HttpWebRequest)System.Net.WebRequest.Create(url);
            req.Timeout = timeout;
            req.Method = "GET";
            req.AllowAutoRedirect = true;
            if (!string.IsNullOrEmpty(user)) {
                req.Credentials = new System.Net.NetworkCredential(user, pass);
                string authB64 = Convert.ToBase64String(Encoding.ASCII.GetBytes(user + ":" + pass));
                req.Headers["Authorization"] = "Basic " + authB64;
            }
            using (System.Net.HttpWebResponse resp = (System.Net.HttpWebResponse)req.GetResponse()) {
                if ((int)resp.StatusCode >= 200 && (int)resp.StatusCode < 300) {
                    using (System.IO.Stream stream = resp.GetResponseStream()) {
                        using (System.IO.MemoryStream ms = new System.IO.MemoryStream()) {
                            byte[] buffer = new byte[8192];
                            int read;
                            while ((read = stream.Read(buffer, 0, buffer.Length)) > 0) {
                                ms.Write(buffer, 0, read);
                            }
                            return ms.ToArray();
                        }
                    }
                }
            }
        } catch {}
        return null;
    }

    // ===== Helper: Receive large data following ZK exchange protocol =====
    private static byte[] ReceiveLargeData(UdpClient client, string ip, int port, ushort sessionId, ref ushort replyId, byte[] firstResp, int timeoutMs) {
        if (firstResp == null || firstResp.Length < 8) return null;
        ushort respCmd = BitConverter.ToUInt16(firstResp, 0);

        // Case 1: Small data returned directly in CMD_DATA
        if (respCmd == CMD_DATA && firstResp.Length > 8) {
            byte[] smallData = new byte[firstResp.Length - 8];
            Array.Copy(firstResp, 8, smallData, 0, smallData.Length);
            return smallData;
        }

        // Case 2: CMD_ACK_DATA with inline data
        if (respCmd == CMD_ACK_DATA && firstResp.Length > 8) {
            byte[] inlineData = new byte[firstResp.Length - 8];
            Array.Copy(firstResp, 8, inlineData, 0, inlineData.Length);
            return inlineData;
        }

        // Case 3: Large data exchange - CMD_ACK_OK with size info
        if (respCmd == CMD_ACK_OK && firstResp.Length >= 13) {
            uint dataSize = BitConverter.ToUInt32(firstResp, 9);
            if (dataSize == 0 || dataSize > 10000000) return null;

            // Send CMD_DATA_RDY
            byte[] rdyData = new byte[8];
            rdyData[0] = 0; rdyData[1] = 0; rdyData[2] = 0; rdyData[3] = 0;
            rdyData[4] = (byte)(dataSize & 0xFF);
            rdyData[5] = (byte)((dataSize >> 8) & 0xFF);
            rdyData[6] = (byte)((dataSize >> 16) & 0xFF);
            rdyData[7] = (byte)((dataSize >> 24) & 0xFF);
            byte[] rdyPkt = BuildPacket(CMD_DATA_RDY, sessionId, replyId, rdyData);
            client.Send(rdyPkt, rdyPkt.Length, ip, port);

            // Receive CMD_PREPARE_DATA + CMD_DATA + CMD_ACK_OK
            var allData = new System.IO.MemoryStream();
            int maxPackets = (int)(dataSize / 1000) + 100;
            for (int i = 0; i < maxPackets && allData.Length < dataSize; i++) {
                try {
                    IPEndPoint ep = new IPEndPoint(IPAddress.Any, 0);
                    client.Client.ReceiveTimeout = timeoutMs;
                    byte[] rawPkt = client.Receive(ref ep);
                    byte[] pkt = ExtractPayload(rawPkt);
                    if (pkt == null || pkt.Length < 8) continue;
                    ushort pktCmd = BitConverter.ToUInt16(pkt, 0);
                    if (pktCmd == CMD_DATA && pkt.Length > 8) {
                        allData.Write(pkt, 8, pkt.Length - 8);
                    } else if (pktCmd == CMD_PREPARE_DATA) {
                        continue;
                    } else if (pktCmd == CMD_ACK_OK) {
                        break;
                    }
                } catch { break; }
            }

            // Free data buffer
            replyId++;
            try {
                byte[] freePkt = BuildPacket(CMD_FREE_DATA, sessionId, replyId++, null);
                client.Send(freePkt, freePkt.Length, ip, port);
            } catch {}

            byte[] result = allData.ToArray();
            allData.Close();
            return result.Length > 0 ? result : null;
        }

        return null;
    }

    // ===== Probe Device - Diagnostic endpoint =====
    public static string ProbeDevice(string ip) {
        var results = new List<string>();
        int[] httpPorts = new int[] { 80, 8080, 8081, 8088, 443 };
        string[][] credentials = new string[][] {
            new string[] { "", "" },
            new string[] { "admin", "" },
            new string[] { "admin", "admin" },
            new string[] { "admin", "12345" },
            new string[] { "admin", "123456" },
            new string[] { "admin", "00000" },
            new string[] { "admin", "0" },
            new string[] { "admin", "1234" },
            new string[] { "admin", "8888" },
            new string[] { "administrator", "" },
            new string[] { "administrator", "admin" }
        };

        foreach (int p in httpPorts) {
            foreach (string[] cred in credentials) {
                string url = "http://" + ip + ":" + p + "/";
                try {
                    System.Net.HttpWebRequest req = (System.Net.HttpWebRequest)System.Net.WebRequest.Create(url);
                    req.Timeout = 3000;
                    req.Method = "GET";
                    req.AllowAutoRedirect = false;
                    if (!string.IsNullOrEmpty(cred[0])) {
                        req.Credentials = new System.Net.NetworkCredential(cred[0], cred[1]);
                        string authB64 = Convert.ToBase64String(Encoding.ASCII.GetBytes(cred[0] + ":" + cred[1]));
                        req.Headers["Authorization"] = "Basic " + authB64;
                    }
                    using (System.Net.HttpWebResponse resp = (System.Net.HttpWebResponse)req.GetResponse()) {
                        int code = (int)resp.StatusCode;
                        string ct = resp.ContentType ?? "";
                        long cl = resp.ContentLength;
                        string credStr = string.IsNullOrEmpty(cred[0]) ? "none" : cred[0] + ":" + cred[1];
                        results.Add("{\"port\":" + p + ",\"cred\":\"" + EscJson(credStr) + "\",\"status\":" + code + ",\"content_type\":\"" + EscJson(ct) + "\",\"size\":" + cl + "}");
                        if (code == 200) {
                            // Found working port+cred, try photo paths
                            string[] photoPaths = new string[] {
                                "/biophoto/", "/auth_files/biophoto/", "/files/photo/",
                                "/csl/ex/photo/", "/cust-files/data/biophoto/",
                                "/iclock/biophoto", "/media/", "/uploads/"
                            };
                            foreach (string pp in photoPaths) {
                                try {
                                    System.Net.HttpWebRequest req2 = (System.Net.HttpWebRequest)System.Net.WebRequest.Create("http://" + ip + ":" + p + pp);
                                    req2.Timeout = 2000;
                                    if (!string.IsNullOrEmpty(cred[0])) {
                                        req2.Credentials = new System.Net.NetworkCredential(cred[0], cred[1]);
                                        string ab = Convert.ToBase64String(Encoding.ASCII.GetBytes(cred[0] + ":" + cred[1]));
                                        req2.Headers["Authorization"] = "Basic " + ab;
                                    }
                                    using (System.Net.HttpWebResponse r2 = (System.Net.HttpWebResponse)req2.GetResponse()) {
                                        results.Add("{\"port\":" + p + ",\"path\":\"" + EscJson(pp) + "\",\"status\":" + (int)r2.StatusCode + "}");
                                    }
                                } catch (System.Net.WebException wex) {
                                    if (wex.Response != null) {
                                        int sc = (int)((System.Net.HttpWebResponse)wex.Response).StatusCode;
                                        if (sc != 404) results.Add("{\"port\":" + p + ",\"path\":\"" + EscJson(pp) + "\",\"status\":" + sc + "}");
                                    }
                                } catch {}
                            }
                        }
                    }
                } catch (System.Net.WebException wex) {
                    if (wex.Response != null) {
                        int sc = (int)((System.Net.HttpWebResponse)wex.Response).StatusCode;
                        string credStr = string.IsNullOrEmpty(cred[0]) ? "none" : cred[0] + ":" + cred[1];
                        results.Add("{\"port\":" + p + ",\"cred\":\"" + EscJson(credStr) + "\",\"status\":" + sc + "}");
                    }
                } catch {}
            }
        }

        // Test UDP connection on port 4370
        string udpResult = "false";
        try {
            UdpClient testClient = new UdpClient();
            testClient.Client.ReceiveTimeout = 5000;
            testClient.Client.SendTimeout = 5000;
            bool testOk;
            ushort testSid = ConnectAndAuth(testClient, ip, 4370, 5000, 0, out testOk);
            udpResult = testOk ? "true" : "false";
            try { testClient.Close(); } catch {}
        } catch {}

        return "{\"success\":true,\"ip\":\"" + EscJson(ip) + "\",\"udp_4370\":" + udpResult + ",\"http_probes\":[" + string.Join(",", results.ToArray()) + "]}";
    }

    // ===== Photo fetch cache (speeds up repeated requests) =====
    public static string LastSuccessfulPhotoUser = "";
    public static string LastSuccessfulPhotoPass = "";
    public static int LastSuccessfulPhotoPort = 0;
    public static string LastSuccessfulPhotoPathTpl = "";

    // ===== Get Face Photo from Device =====
    public static string GetFacePhoto(string ip, int port, int timeoutMs, int uid) {
        var debugLog = new List<string>();
        try {
            // === Method 1: HTTP - try many credentials and iFace990-specific paths ===
            string[][] httpCreds = new string[][] {
                new string[] { "", "" },
                new string[] { "admin", "" },
                new string[] { "admin", "12345" },
                new string[] { "admin", "123456" },
                new string[] { "admin", "00000" },
                new string[] { "admin", "0" },
                new string[] { "admin", "1234" },
                new string[] { "admin", "8888" },
                new string[] { "admin", "admin" },
                new string[] { "administrator", "" },
                new string[] { "administrator", "12345" }
            };
            string[] photoPaths = new string[] {
                "/biophoto/{uid}.jpg",
                "/auth_files/biophoto/{uid}.jpg",
                "/files/photo/{uid}.jpg",
                "/csl/ex/photo/{uid}.jpg",
                "/cust-files/data/biophoto/{uid}.jpg",
                "/iclock/biophoto?Pin={uid}",
                "/user/photo?uid={uid}",
                "/uploads/users/{uid}/photo.jpg",
                "/ISAPI/AccessControl/UserInfo/photo/{uid}",
                "/cgi-bin/snapshot.cgi?user={uid}",
                "/media/biophoto/{uid}.jpg",
                "/data/biophoto/{uid}.jpg",
                "/biophoto/{uid}.bmp",
                "/photo/{uid}.jpg",
                "/face/{uid}.jpg",
                "/capture/{uid}.jpg"
            };
            int[] httpPorts = new int[] { 80, 8080, 8081, 8088 };

            // === Fast path: try last successful combo first (cache) ===
            if (LastSuccessfulPhotoPort != 0 && !string.IsNullOrEmpty(LastSuccessfulPhotoPathTpl)) {
                string cachedPath = LastSuccessfulPhotoPathTpl.Replace("{uid}", uid.ToString());
                string cachedUrl = "http://" + ip + ":" + LastSuccessfulPhotoPort + cachedPath;
                byte[] cachedData = HttpGetPhoto(cachedUrl, LastSuccessfulPhotoUser, LastSuccessfulPhotoPass, 2500);
                if (cachedData != null && cachedData.Length > 100) {
                    bool cachedIsImage = (cachedData.Length > 2 && cachedData[0] == 0xFF && cachedData[1] == 0xD8) ||
                                         (cachedData.Length > 4 && cachedData[0] == 0x89 && cachedData[1] == 0x50) ||
                                         (cachedData.Length > 2 && cachedData[0] == 0x42 && cachedData[1] == 0x4D);
                    if (cachedIsImage) {
                        string cachedMime = "image/jpeg";
                        if (cachedData[0] == 0x89) cachedMime = "image/png";
                        else if (cachedData[0] == 0x42) cachedMime = "image/bmp";
                        string cachedB64 = Convert.ToBase64String(cachedData);
                        return "{\"success\":true,\"uid\":" + uid + ",\"photo\":\"data:" + cachedMime + ";base64," + cachedB64 + "\",\"source\":\"http-cache\",\"url\":\"" + EscJson(cachedUrl) + "\",\"size\":" + cachedData.Length + "}";
                    }
                }
            }

            foreach (string[] cred in httpCreds) {
                foreach (int hp in httpPorts) {
                    foreach (string pathTpl in photoPaths) {
                        string urlPath = pathTpl.Replace("{uid}", uid.ToString());
                        string url = "http://" + ip + ":" + hp + urlPath;
                        byte[] imgData = HttpGetPhoto(url, cred[0], cred[1], 1500);
                        if (imgData != null && imgData.Length > 100) {
                            // Check if it looks like an image (JPEG, PNG, BMP)
                            bool isImage = (imgData.Length > 2 && imgData[0] == 0xFF && imgData[1] == 0xD8) || // JPEG
                                           (imgData.Length > 4 && imgData[0] == 0x89 && imgData[1] == 0x50) || // PNG
                                           (imgData.Length > 2 && imgData[0] == 0x42 && imgData[1] == 0x4D);   // BMP
                            if (isImage) {
                                string mimeType = "image/jpeg";
                                if (imgData[0] == 0x89) mimeType = "image/png";
                                else if (imgData[0] == 0x42) mimeType = "image/bmp";
                                string base64 = Convert.ToBase64String(imgData);
                                // حفظ في الكاش للاستخدام السريع التالي
                                LastSuccessfulPhotoUser = cred[0];
                                LastSuccessfulPhotoPass = cred[1];
                                LastSuccessfulPhotoPort = hp;
                                LastSuccessfulPhotoPathTpl = pathTpl;
                                return "{\"success\":true,\"uid\":" + uid + ",\"photo\":\"data:" + mimeType + ";base64," + base64 + "\",\"source\":\"http\",\"url\":\"" + EscJson(url) + "\",\"size\":" + imgData.Length + "}";
                            }
                        }
                    }
                }
            }
            debugLog.Add("HTTP: no photo found on any port/path/cred combo");

            // === Method 2: UDP Protocol - Face template retrieval ===
            UdpClient client = null;
            try {
                client = new UdpClient();
                client.Client.ReceiveTimeout = timeoutMs;
                client.Client.SendTimeout = timeoutMs;

                bool ok;
                ushort sessionId = ConnectAndAuth(client, ip, port, timeoutMs, 0, out ok);
                if (!ok) {
                    client.Close();
                    debugLog.Add("UDP: connection/auth failed");
                    return "{\"success\":false,\"message\":\"No photo found - HTTP and UDP both failed\",\"debug\":[\"" + string.Join("\",\"", debugLog.ToArray()) + "\"]}";
                }
                ushort replyId = 2;
                debugLog.Add("UDP: connected, sessionId=" + sessionId);

                // Disable device for data operations
                try {
                    byte[] disablePkt = BuildPacket(CMD_DISABLEDEVICE, sessionId, replyId++, null);
                    SendAndReceive(client, ip, port, disablePkt, timeoutMs);
                } catch {}

                byte[] photoData = null;

                // Method 2a: CMD_USERTEMP_RRQ with face-specific finger indexes
                // On iFace devices, face template indexes are typically 50-55
                int[] faceIndexes = new int[] { 50, 51, 52, 53, 54, 55 };
                foreach (int fIdx in faceIndexes) {
                    try {
                        // fp tmp req: user_sn(2 bytes LE) + finger_index(1 byte)
                        byte[] reqData = new byte[3];
                        reqData[0] = (byte)(uid & 0xFF);
                        reqData[1] = (byte)((uid >> 8) & 0xFF);
                        reqData[2] = (byte)fIdx;
                        byte[] tmpPkt = BuildPacket(CMD_USERTEMP_RRQ, sessionId, replyId++, reqData);
                        byte[] tmpResp = SendAndReceive(client, ip, port, tmpPkt, timeoutMs);
                        if (tmpResp != null && tmpResp.Length >= 8) {
                            ushort tmpCmd = BitConverter.ToUInt16(tmpResp, 0);
                            if (tmpCmd == CMD_ACK_ERROR) {
                                continue; // No template at this index
                            }
                            // Try to receive data (could be large)
                            byte[] faceData = ReceiveLargeData(client, ip, port, sessionId, ref replyId, tmpResp, timeoutMs);
                            if (faceData != null && faceData.Length > 100) {
                                // Check if it contains JPEG data
                                for (int i = 0; i < faceData.Length - 1; i++) {
                                    if (faceData[i] == 0xFF && faceData[i + 1] == 0xD8) {
                                        int jpegLen = faceData.Length - i;
                                        byte[] jpeg = new byte[jpegLen];
                                        Array.Copy(faceData, i, jpeg, 0, jpegLen);
                                        photoData = jpeg;
                                        debugLog.Add("UDP: found JPEG in face template index " + fIdx);
                                        break;
                                    }
                                }
                                if (photoData != null) break;
                                debugLog.Add("UDP: got data at index " + fIdx + " (" + faceData.Length + "B) but no JPEG header");
                            }
                        }
                    } catch (Exception ex) {
                        debugLog.Add("UDP: index " + fIdx + " error: " + ex.Message);
                    }
                }

                // Method 2b: CMD_DATA_WRRQ with biophoto data IDs
                if (photoData == null) {
                    string[] queryPatterns = new string[] {
                        "biophoto Pin=" + uid + "\0",
                        "BioPhoto Pin=" + uid + "\0",
                        "FacePhoto" + uid + "\0",
                        "~BioPhoto Pin=" + uid + "\0",
                        "biophoto " + uid + "\0",
                        "UserPicture " + uid + "\0"
                    };
                    foreach (string query in queryPatterns) {
                        try {
                            byte[] queryBytes = Encoding.UTF8.GetBytes(query);
                            byte[] wrrqPkt = BuildPacket(CMD_DATA_WRRQ, sessionId, replyId++, queryBytes);
                            byte[] wrrqResp = SendAndReceive(client, ip, port, wrrqPkt, timeoutMs);
                            if (wrrqResp != null && wrrqResp.Length >= 8) {
                                ushort wCmd = BitConverter.ToUInt16(wrrqResp, 0);
                                if (wCmd == CMD_ACK_ERROR) {
                                    debugLog.Add("UDP WRRQ: query '" + query.TrimEnd('\0') + "' -> ACK_ERROR");
                                    continue;
                                }
                                byte[] wData = ReceiveLargeData(client, ip, port, sessionId, ref replyId, wrrqResp, timeoutMs);
                                if (wData != null && wData.Length > 100) {
                                    for (int i = 0; i < wData.Length - 1; i++) {
                                        if (wData[i] == 0xFF && wData[i + 1] == 0xD8) {
                                            int jpegLen = wData.Length - i;
                                            byte[] jpeg = new byte[jpegLen];
                                            Array.Copy(wData, i, jpeg, 0, jpegLen);
                                            photoData = jpeg;
                                            debugLog.Add("UDP WRRQ: found JPEG via query '" + query.TrimEnd('\0') + "'");
                                            break;
                                        }
                                    }
                                    if (photoData == null) {
                                        // Check for PNG
                                        for (int i = 0; i < wData.Length - 3; i++) {
                                            if (wData[i] == 0x89 && wData[i + 1] == 0x50 && wData[i + 2] == 0x4E && wData[i + 3] == 0x47) {
                                                int pngLen = wData.Length - i;
                                                byte[] png = new byte[pngLen];
                                                Array.Copy(wData, i, png, 0, pngLen);
                                                photoData = png;
                                                debugLog.Add("UDP WRRQ: found PNG via query '" + query.TrimEnd('\0') + "'");
                                                break;
                                            }
                                        }
                                    }
                                    if (photoData != null) break;
                                    debugLog.Add("UDP WRRQ: got " + wData.Length + "B data but no image header");
                                }
                            }
                        } catch (Exception ex) {
                            debugLog.Add("UDP WRRQ: error: " + ex.Message);
                        }
                    }
                }

                // Enable device + disconnect
                try {
                    byte[] enablePkt = BuildPacket(CMD_ENABLEDEVICE, sessionId, replyId++, null);
                    SendAndReceive(client, ip, port, enablePkt, timeoutMs);
                } catch {}
                try {
                    byte[] exitPkt = BuildPacket(CMD_EXIT, sessionId, replyId++, null);
                    client.Send(exitPkt, exitPkt.Length, ip, port);
                } catch {}
                client.Close();

                if (photoData != null && photoData.Length > 100) {
                    string mimeType = (photoData[0] == 0x89) ? "image/png" : "image/jpeg";
                    string base64 = Convert.ToBase64String(photoData);
                    return "{\"success\":true,\"uid\":" + uid + ",\"photo\":\"data:" + mimeType + ";base64," + base64 + "\",\"source\":\"udp\",\"size\":" + photoData.Length + "}";
                }

                return "{\"success\":false,\"message\":\"No photo found for UID " + uid + "\",\"debug\":[\"" + string.Join("\",\"", debugLog.ToArray()) + "\"]}";
            } catch (Exception ex2) {
                if (client != null) try { client.Close(); } catch {}
                debugLog.Add("UDP fatal: " + ex2.Message);
                return "{\"success\":false,\"message\":\"" + EscJson(ex2.Message) + "\",\"debug\":[\"" + string.Join("\",\"", debugLog.ToArray()) + "\"]}";
            }
        } catch (Exception ex) {
            return "{\"success\":false,\"message\":\"" + EscJson(ex.Message) + "\"}";
        }
    }
}
'@
Add-Type -TypeDefinition $csharpCode -ReferencedAssemblies System.Drawing -ErrorAction Stop
"$(Get-Date) - C# RawPrinterHelper + ZKHelper compiled OK" | Out-File $agentLog -Append
} catch {
    "$(Get-Date) - C# compile warning: $_" | Out-File $agentLog -Append
}

# === NETWORK PRINTER: Send via TCP (chunked) ===
function Send-ToPrinter {
    param([string]$ip, [int]$port, [byte[]]$data)
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect($ip, $port)
        $stream = $client.GetStream()
        $chunkSize = 1024
        $offset = 0
        while ($offset -lt $data.Length) {
            $remaining = $data.Length - $offset
            $currentSize = [Math]::Min($chunkSize, $remaining)
            $stream.Write($data, $offset, $currentSize)
            $stream.Flush()
            $offset += $currentSize
            if ($offset -lt $data.Length) { Start-Sleep -Milliseconds 10 }
        }
        Start-Sleep -Milliseconds 300
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
    $bytes.AddRange($enc.GetBytes('Maestro EGP v2.4'))
    $bytes.Add(0x0a); $bytes.Add(0x0a); $bytes.Add(0x0a); $bytes.Add(0x0a); $bytes.Add(0x0a)
    $bytes.AddRange([byte[]]@(0x1d, 0x56, 0x42, 0x00))
    return $bytes.ToArray()
}

function Get-ImageBytes {
    param([string]$base64, [string]$url)
    try {
        if ($base64) {
            # Remove data:image prefix if present
            $clean = $base64 -replace '^data:image/[^;]+;base64,', ''
            return [System.Convert]::FromBase64String($clean)
        }
        if ($url) {
            $wc = New-Object System.Net.WebClient
            $wc.Headers.Add('User-Agent', 'MaestroAgent/3.7')
            return $wc.DownloadData($url)
        }
    } catch {
        "$(Get-Date) - Get-ImageBytes error: $_" | Out-File $agentLog -Append
    }
    return $null
}

function Build-Receipt {
    param($order, $config)
    $showPrices = $true
    $isKitchen = $false
    if ($config) {
        if ($config.show_prices -eq $false) { $showPrices = $false }
        if ($config.printer_type -eq 'kitchen' -or $config.print_mode -eq 'orders_only' -or $config.print_mode -eq 'selected_products') {
            $isKitchen = $true
        }
    }
    $lang = if ($order.language) { $order.language } else { 'ar' }

    $lines = [System.Collections.Generic.List[string]]::new()
    $sizes = [System.Collections.Generic.List[int]]::new()
    $bolds = [System.Collections.Generic.List[bool]]::new()
    $aligns = [System.Collections.Generic.List[string]]::new()

    # === رأس الإيصال ===
    if ($order.restaurant_name) {
        $lines.Add([string]$order.restaurant_name)
        $sizes.Add(20)
        $bolds.Add($true)
        $aligns.Add('center')
    }

    if ($order.phone) {
        $lines.Add([string]$order.phone)
        $sizes.Add(10)
        $bolds.Add($false)
        $aligns.Add('center')
    }

    if ($order.address) {
        $lines.Add([string]$order.address)
        $sizes.Add(10)
        $bolds.Add($false)
        $aligns.Add('center')
    }

    if ($order.branch_name) {
        $lines.Add([string]$order.branch_name)
        $sizes.Add(11)
        $bolds.Add($false)
        $aligns.Add('center')
    }

    $lines.Add('--------------------------------')
    $sizes.Add(10)
    $bolds.Add($false)
    $aligns.Add('center')

    # === قسم المطبخ إذا كان kitchen ===
    if ($isKitchen -and $order.section_name) {
        $lines.Add([string]$order.section_name)
        $sizes.Add(16)
        $bolds.Add($true)
        $aligns.Add('center')
    }

    # === رقم الفاتورة ===
    if ($order.order_number) {
        $invoiceLabel = if ($lang -eq 'ar') { "$([char]0x0641)$([char]0x0627)$([char]0x062A)$([char]0x0648)$([char]0x0631)$([char]0x0629) $([char]0x0631)$([char]0x0642)$([char]0x0645): #" } else { 'Invoice #' }
        $lines.Add([string]($invoiceLabel + $order.order_number))
        $sizes.Add(16)
        $bolds.Add($true)
        $aligns.Add('center')
    }

    # === التاريخ والوقت ===
    $now = Get-Date
    $hour = $now.Hour
    $ampm = if ($hour -ge 12) { 'PM' } else { 'AM' }
    $h12 = if ($hour -eq 0) { 12 } elseif ($hour -gt 12) { $hour - 12 } else { $hour }
    $timeStr = "$($now.ToString('d/M/yyyy')) - $($h12):$($now.ToString('mm')) $ampm"
    $lines.Add($timeStr)
    $sizes.Add(10)
    $bolds.Add($false)
    $aligns.Add('center')

    # === الكاشير ===
    if ($order.cashier_name) {
        $cashierLabel = if ($lang -eq 'ar') { "$([char]0x0627)$([char]0x0644)$([char]0x0643)$([char]0x0627)$([char]0x0634)$([char]0x064A)$([char]0x0631): " } else { 'Cashier: ' }
        $lines.Add([string]($cashierLabel + $order.cashier_name))
        $sizes.Add(10)
        $bolds.Add($false)
        $aligns.Add('center')
    }

    $lines.Add('--------------------------------')
    $sizes.Add(10)
    $bolds.Add($false)
    $aligns.Add('center')

    # === نوع الطلب ===
    if ($order.order_type) {
        $typeText = switch ($order.order_type) {
            'dine_in' { if ($lang -eq 'ar') { "$([char]0x0637)$([char]0x0644)$([char]0x0628) $([char]0x062F)$([char]0x0627)$([char]0x062E)$([char]0x0644)$([char]0x064A)" } else { 'Dine In' } }
            'takeaway' { if ($lang -eq 'ar') { "$([char]0x0637)$([char]0x0644)$([char]0x0628) $([char]0x0633)$([char]0x0641)$([char]0x0631)$([char]0x064A)" } else { 'Takeaway' } }
            'delivery' { if ($lang -eq 'ar') { "$([char]0x062A)$([char]0x0648)$([char]0x0635)$([char]0x064A)$([char]0x0644)" } else { 'Delivery' } }
            default { $order.order_type }
        }
        $lines.Add([string]$typeText)
        $sizes.Add(14)
        $bolds.Add($true)
        $aligns.Add('center')
    }

    # === شركة التوصيل ===
    if ($order.delivery_company) {
        $lines.Add([string]$order.delivery_company)
        $sizes.Add(13)
        $bolds.Add($true)
        $aligns.Add('center')
    }

    # === الطاولة ===
    if ($order.table_number) {
        $tableLabel = if ($lang -eq 'ar') { "$([char]0x0637)$([char]0x0627)$([char]0x0648)$([char]0x0644)$([char]0x0629): " } else { 'Table: ' }
        $lines.Add([string]($tableLabel + $order.table_number))
        $sizes.Add(13)
        $bolds.Add($true)
        $aligns.Add('center')
    }

    # === البزر ===
    if ($order.buzzer_number) {
        $buzzerLabel = if ($lang -eq 'ar') { "$([char]0x0628)$([char]0x0632)$([char]0x0648)$([char]0x0646): " } else { 'Buzzer: ' }
        $lines.Add([string]($buzzerLabel + $order.buzzer_number))
        $sizes.Add(13)
        $bolds.Add($true)
        $aligns.Add('center')
    }

    # === العميل ===
    if ($order.customer_name) {
        $lines.Add([string]$order.customer_name)
        $sizes.Add(12)
        $bolds.Add($true)
        $aligns.Add('center')
    }
    if ($order.customer_phone) {
        $lines.Add([string]$order.customer_phone)
        $sizes.Add(10)
        $bolds.Add($false)
        $aligns.Add('center')
    }
    if ($order.delivery_address) {
        $lines.Add([string]$order.delivery_address)
        $sizes.Add(10)
        $bolds.Add($false)
        $aligns.Add('center')
    }

    # === ترحيب / custom_header ===
    if ($order.custom_header) {
        $lines.Add([string]$order.custom_header)
        $sizes.Add(13)
        $bolds.Add($true)
        $aligns.Add('center')
    }

    # === إشعار الإلغاء/الارجاع ===
    if ($order.is_refund -or $order.is_cancel) {
        $statusLabel = if ($order.is_refund) { '*** مرتجع ***' } else { '*** تم الإلغاء ***' }
        $lines.Add([string]$statusLabel)
        $sizes.Add(16)
        $bolds.Add($true)
        $aligns.Add('center')
    }

    $lines.Add('--------------------------------')
    $sizes.Add(10)
    $bolds.Add($false)
    $aligns.Add('center')

    # === عناوين الأعمدة (فقط مع الأسعار) ===
    if ($showPrices) {
        $colHeader = if ($lang -eq 'ar') { "$([char]0x0627)$([char]0x0644)$([char]0x0635)$([char]0x0646)$([char]0x0641)        $([char]0x0627)$([char]0x0644)$([char]0x0643)$([char]0x0645)$([char]0x064A)$([char]0x0629)      $([char]0x0627)$([char]0x0644)$([char]0x0633)$([char]0x0639)$([char]0x0631)" } else { 'Item      Qty      Price' }
        $lines.Add($colHeader)
        $sizes.Add(10)
        $bolds.Add($true)
        $aligns.Add('center')
        $lines.Add('--------------------------------')
        $sizes.Add(10)
        $bolds.Add($false)
        $aligns.Add('center')
    }

    # === المنتجات ===
    foreach ($item in $order.items) {
        $n = if ($item.product_name) { [string]$item.product_name } else { [string]$item.name }
        $q = if ($item.quantity) { $item.quantity } else { 1 }

        # تمييز المنتج الملغى/المرتجع
        if ($order.is_refund -or $order.is_cancel) {
            $lines.Add('XXXXXXXXXXXXXXXXXXXXXXX')
            $sizes.Add(10)
            $bolds.Add($false)
            $aligns.Add('center')
        }

        if ($showPrices) {
            $p = '{0:N0}' -f [math]::Round($item.price * $q)
            $lines.Add("$n    $q    $p IQD")
            $sizes.Add(12)
            $bolds.Add($true)
            $aligns.Add('right')
        } else {
            $lines.Add("$n  x$q")
            $sizes.Add(16)
            $bolds.Add($true)
            $aligns.Add('right')
        }

        if ($order.is_refund -or $order.is_cancel) {
            $itemStatus = if ($order.is_refund) { '>> تم الارجاع <<' } else { '>> تم الإلغاء <<' }
            $lines.Add([string]$itemStatus)
            $sizes.Add(12)
            $bolds.Add($true)
            $aligns.Add('center')
            $lines.Add('XXXXXXXXXXXXXXXXXXXXXXX')
            $sizes.Add(10)
            $bolds.Add($false)
            $aligns.Add('center')
        }

        if ($item.notes) {
            $lines.Add('  >> ' + [string]$item.notes)
            $sizes.Add(10)
            $bolds.Add($false)
            $aligns.Add('right')
        }
        if ($item.extras) {
            foreach ($extra in $item.extras) {
                $eName = if ($extra.name) { [string]$extra.name } else { '' }
                if ($eName) {
                    $eQty = if ($extra.quantity) { [int]$extra.quantity } else { 1 }
                    if ($showPrices -and $extra.price) {
                        $eTotal = '{0:N0}' -f [math]::Round($extra.price * $eQty)
                        if ($eQty -gt 1) { $lines.Add("  + $eName x$eQty  $eTotal") }
                        else { $lines.Add("  + $eName  $eTotal") }
                    } else {
                        if ($eQty -gt 1) { $lines.Add("  + $eName x$eQty") }
                        else { $lines.Add("  + $eName") }
                    }
                    $sizes.Add(10)
                    $bolds.Add($false)
                    $aligns.Add('right')
                }
            }
        }
    }

    $lines.Add('--------------------------------')
    $sizes.Add(10)
    $bolds.Add($false)
    $aligns.Add('center')

    # === الخصم ===
    if ($showPrices -and $order.discount -and $order.discount -gt 0) {
        $discLabel = if ($lang -eq 'ar') { "$([char]0x062E)$([char]0x0635)$([char]0x0645): -" } else { 'Discount: -' }
        $dVal = '{0:N0}' -f [math]::Round($order.discount)
        $lines.Add([string]($discLabel + $dVal + ' IQD'))
        $sizes.Add(12)
        $bolds.Add($true)
        $aligns.Add('center')
    }

    # === الإجمالي النهائي ===
    if ($showPrices -and $order.total) {
        $totalLabel = if ($lang -eq 'ar') { "$([char]0x0627)$([char]0x0644)$([char]0x0625)$([char]0x062C)$([char]0x0645)$([char]0x0627)$([char]0x0644)$([char]0x064A) $([char]0x0627)$([char]0x0644)$([char]0x0646)$([char]0x0647)$([char]0x0627)$([char]0x0626)$([char]0x064A): " } else { 'Final Total: ' }
        $tVal = '{0:N0}' -f [math]::Round($order.total)
        $lines.Add([string]($totalLabel + $tVal + ' IQD'))
        $sizes.Add(16)
        $bolds.Add($true)
        $aligns.Add('center')
    }

    $lines.Add('--------------------------------')
    $sizes.Add(10)
    $bolds.Add($false)
    $aligns.Add('center')

    # === طريقة الدفع ===
    if ($showPrices -and $order.payment_method) {
        $pmText = switch ($order.payment_method) {
            'cash' { if ($lang -eq 'ar') { "$([char]0x0646)$([char]0x0642)$([char]0x062F)$([char]0x064A)" } else { 'Cash' } }
            'card' { if ($lang -eq 'ar') { "$([char]0x0628)$([char]0x0637)$([char]0x0627)$([char]0x0642)$([char]0x0629)" } else { 'Card' } }
            'credit' { if ($lang -eq 'ar') { "$([char]0x0622)$([char]0x062C)$([char]0x0644)" } else { 'Credit' } }
            'delivery_company' { if ($lang -eq 'ar') { "$([char]0x0634)$([char]0x0631)$([char]0x0643)$([char]0x0629) $([char]0x062A)$([char]0x0648)$([char]0x0635)$([char]0x064A)$([char]0x0644)" } else { 'Delivery Co.' }  }
            default { [string]$order.payment_method }
        }
        $pmLabel = if ($lang -eq 'ar') { "$([char]0x0627)$([char]0x0644)$([char]0x062F)$([char]0x0641)$([char]0x0639): " } else { 'Payment: ' }
        $lines.Add([string]($pmLabel + $pmText))
        $sizes.Add(11)
        $bolds.Add($true)
        $aligns.Add('center')
    }

    # === ملاحظات ===
    $notes = if ($order.order_notes) { $order.order_notes } elseif ($order.notes) { $order.notes } else { $null }
    if ($notes) {
        $lines.Add([string]$notes)
        $sizes.Add(10)
        $bolds.Add($false)
        $aligns.Add('center')
    }

    # === التذييل المخصص ===
    if ($order.custom_footer) {
        $lines.Add('--------------------------------')
        $sizes.Add(10)
        $bolds.Add($false)
        $aligns.Add('center')
        $lines.Add([string]$order.custom_footer)
        $sizes.Add(11)
        $bolds.Add($false)
        $aligns.Add('center')
    }

    $lines.Add('--------------------------------')
    $sizes.Add(10)
    $bolds.Add($false)
    $aligns.Add('center')

    # === شكراً ===
    $thankMsg = if ($order.thank_you_message) { $order.thank_you_message } else {
        if ($lang -eq 'ar') { "$([char]0x0634)$([char]0x0643)$([char]0x0631)$([char]0x0627)$([char]0x064B) $([char]0x0644)$([char]0x0632)$([char]0x064A)$([char]0x0627)$([char]0x0631)$([char]0x062A)$([char]0x0643)$([char]0x0645)" } else { 'Thank you!' }
    }
    $lines.Add([string]$thankMsg)
    $sizes.Add(13)
    $bolds.Add($true)
    $aligns.Add('center')

    # system_name, contact_message, و QR code يُطبعون بعد شعار النظام (في قسم ESC/POS)

    # === بناء ESC/POS ===
    $enc = [System.Text.Encoding]::UTF8
    $bytes = [System.Collections.Generic.List[byte]]::new()
    $bytes.AddRange([byte[]]@(0x1b, 0x40))  # Reset

    if ($isKitchen) {
        # === وضع المطبخ: ESC/POS نصي سريع ===
        $bytes.AddRange([byte[]]@(0x1b, 0x74, 22))  # Arabic codepage
        foreach ($i in 0..($lines.Count - 1)) {
            $line = $lines[$i]; $bold = $bolds[$i]; $align = $aligns[$i]; $size = $sizes[$i]
            if ($align -eq 'center') { $bytes.AddRange([byte[]]@(0x1b, 0x61, 1)) }
            elseif ($align -eq 'right') { $bytes.AddRange([byte[]]@(0x1b, 0x61, 2)) }
            else { $bytes.AddRange([byte[]]@(0x1b, 0x61, 0)) }
            if ($bold) { $bytes.AddRange([byte[]]@(0x1b, 0x45, 1)) }
            if ($size -ge 16) { $bytes.AddRange([byte[]]@(0x1d, 0x21, 0x11)) }
            elseif ($size -ge 13) { $bytes.AddRange([byte[]]@(0x1d, 0x21, 0x01)) }
            else { $bytes.AddRange([byte[]]@(0x1d, 0x21, 0x00)) }
            $bytes.AddRange($enc.GetBytes($line)); $bytes.Add(0x0a)
            if ($bold) { $bytes.AddRange([byte[]]@(0x1b, 0x45, 0)) }
            if ($size -ge 13) { $bytes.AddRange([byte[]]@(0x1d, 0x21, 0x00)) }
        }
        $bytes.Add(0x0a); $bytes.Add(0x0a); $bytes.Add(0x0a)
        $bytes.AddRange([byte[]]@(0x1d, 0x56, 0x42, 3))  # Cut
    } else {
        # === وضع الفاتورة: bitmap كامل (نفس شكل الصورة الأصلية) ===
        
        # 1. شعار المطعم (صورة bitmap)
        $logoImgBytes = Get-ImageBytes -base64 $order.logo_base64 -url $order.logo_url
        if ($logoImgBytes) {
            try {
                $logoEscPos = [ReceiptRenderer]::ImageToEscPos($logoImgBytes, 384)
                if ($logoEscPos.Length -gt 0) { $bytes.AddRange($logoEscPos) }
            } catch { "$(Get-Date) - Logo error: $_" | Out-File $agentLog -Append }
        }

        # 2. إضافة system_name و contact_message للنص
        $sysName = if ($order.system_name) { $order.system_name } else { 'Maestro EGP' }
        $lines.Add([string]$sysName)
        $sizes.Add(10)
        $bolds.Add($false)
        $aligns.Add('center')

        if ($order.contact_message) {
            $lines.Add([string]$order.contact_message)
            $sizes.Add(9)
            $bolds.Add($false)
            $aligns.Add('center')
        }

        # 3. النص الكامل كصورة bitmap (بنفس جودة الأصل)
        try {
            $receiptBitmap = [ReceiptRenderer]::RenderTextToEscPos(
                [string[]]$lines.ToArray(),
                [int[]]$sizes.ToArray(),
                [bool[]]$bolds.ToArray(),
                [string[]]$aligns.ToArray(),
                384
            )
            if ($receiptBitmap.Length -gt 0) {
                # RenderTextToEscPos يتضمن Reset و Cut - نحتاج فقط البيانات بدون Cut
                # نأخذ كل البيانات ما عدا آخر 6 bytes (feed + cut)
                $cutLen = 8  # 4 feed + 4 cut bytes
                $dataLen = $receiptBitmap.Length - $cutLen
                if ($dataLen -gt 0) {
                    # نتخطى أول 2 bytes (Reset من RenderTextToEscPos) لأن عندنا reset بالفعل
                    $bytes.AddRange($receiptBitmap[2..($dataLen - 1)])
                }
            }
        } catch {
            "$(Get-Date) - RenderTextToEscPos error: $_ - using text fallback" | Out-File $agentLog -Append
            # Fallback: ESC/POS نصي
            $bytes.AddRange([byte[]]@(0x1b, 0x74, 22))
            foreach ($i in 0..($lines.Count - 1)) {
                $line = $lines[$i]; $bold = $bolds[$i]; $align = $aligns[$i]; $size = $sizes[$i]
                if ($align -eq 'center') { $bytes.AddRange([byte[]]@(0x1b, 0x61, 1)) }
                elseif ($align -eq 'right') { $bytes.AddRange([byte[]]@(0x1b, 0x61, 2)) }
                else { $bytes.AddRange([byte[]]@(0x1b, 0x61, 0)) }
                if ($bold) { $bytes.AddRange([byte[]]@(0x1b, 0x45, 1)) }
                if ($size -ge 16) { $bytes.AddRange([byte[]]@(0x1d, 0x21, 0x11)) }
                elseif ($size -ge 13) { $bytes.AddRange([byte[]]@(0x1d, 0x21, 0x01)) }
                else { $bytes.AddRange([byte[]]@(0x1d, 0x21, 0x00)) }
                $bytes.AddRange($enc.GetBytes($line)); $bytes.Add(0x0a)
                if ($bold) { $bytes.AddRange([byte[]]@(0x1b, 0x45, 0)) }
                if ($size -ge 13) { $bytes.AddRange([byte[]]@(0x1d, 0x21, 0x00)) }
            }
        }

        # 4. شعار النظام (صورة bitmap)
        $sysLogoBytes = Get-ImageBytes -base64 $order.system_logo_base64 -url $order.system_logo_url
        if ($sysLogoBytes) {
            try {
                $sysLogoEscPos = [ReceiptRenderer]::ImageToEscPos($sysLogoBytes, 200)
                if ($sysLogoEscPos.Length -gt 0) { $bytes.AddRange($sysLogoEscPos) }
            } catch { "$(Get-Date) - SysLogo error: $_" | Out-File $agentLog -Append }
        }

        # 5. QR Code (أوامر ESC/POS الأصلية - سريع)
        if ($order.qr_url) {
            $bytes.AddRange([byte[]]@(0x1b, 0x61, 1))
            $qrData = $enc.GetBytes($order.qr_url)
            $qrLen = $qrData.Length + 3
            $bytes.AddRange([byte[]]@(0x1d, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00))
            $bytes.AddRange([byte[]]@(0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x43, 4))
            $bytes.AddRange([byte[]]@(0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x30))
            $bytes.AddRange([byte[]]@(0x1d, 0x28, 0x6b))
            $bytes.Add([byte]($qrLen -band 0xFF))
            $bytes.Add([byte](($qrLen -shr 8) -band 0xFF))
            $bytes.AddRange([byte[]]@(0x31, 0x50, 0x30))
            $bytes.AddRange($qrData)
            $bytes.AddRange([byte[]]@(0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30))
            $bytes.Add(0x0a)
        }

        # Feed + Cut
        $bytes.Add(0x0a); $bytes.Add(0x0a); $bytes.Add(0x0a)
        $bytes.AddRange([byte[]]@(0x1d, 0x56, 0x42, 3))
    }

    return $bytes.ToArray()
}

# ============================================
# === HTTP LISTENER WITH AUTO-RESTART      ===
# === الوسيط يعيد التشغيل تلقائياً أبداً   ===
# ============================================
$maxRestarts = 9999
$restartCount = 0

while ($restartCount -lt $maxRestarts) {
  $listener = $null
  try {
    # تنظيف المنفذ قبل البدء
    $netstat = netstat -ano 2>$null | Select-String 'LISTENING' | Select-String ':9999 '
    if ($netstat -and $restartCount -gt 0) {
        $pids = $netstat | ForEach-Object { ($_.ToString().Trim() -split '\s+')[-1] } | Sort-Object -Unique | Where-Object { $_ -ne '0' -and $_ -ne $PID }
        foreach ($oldPid in $pids) { try { Stop-Process -Id ([int]$oldPid) -Force -ErrorAction SilentlyContinue } catch {} }
        Start-Sleep -Seconds 2
    }

    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add('http://localhost:9999/')
    try { $listener.Prefixes.Add('https://localhost:9443/') } catch {}
    $listener.Start()
    "$(Get-Date) - HttpListener started on port 9999 (v{{AGENT_VERSION}}) [restart #$restartCount]" | Out-File $agentLog -Append

    # === Print Queue Polling (Background Job) ===
    # يسحب أوامر الطباعة من السيرفر كل 3 ثواني
    $pollingJob = $null
    if ($backendUrl) {
        $pollingJob = Start-Job -ScriptBlock {
            param($apiUrl, $logPath)
            Add-Type -AssemblyName System.Drawing
            $ErrorActionPreference = 'Continue'
            "$(Get-Date) - Print Queue polling started: $apiUrl" | Out-File $logPath -Append
            
            # === تجميع كود USB/Bitmap داخل الـ Job (لأن Start-Job عملية منفصلة) ===
            try {
$jobCsharp = @'
using System;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Drawing.Imaging;
using System.Collections.Generic;
using System.IO;
using System.Text;

public class JobRawPrinter {
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

    public static bool SendBytes(string printerName, byte[] data) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "Maestro POS Receipt";
        di.pDataType = "RAW";
        if (!StartDocPrinter(hPrinter, 1, ref di)) { ClosePrinter(hPrinter); return false; }
        if (!StartPagePrinter(hPrinter)) { EndDocPrinter(hPrinter); ClosePrinter(hPrinter); return false; }
        bool success = true;
        int chunkSize = 1024;
        int offset = 0;
        while (offset < data.Length) {
            int remaining = data.Length - offset;
            int currentSize = remaining < chunkSize ? remaining : chunkSize;
            IntPtr pChunk = Marshal.AllocCoTaskMem(currentSize);
            Marshal.Copy(data, offset, pChunk, currentSize);
            int written;
            bool ok = WritePrinter(hPrinter, pChunk, currentSize, out written);
            Marshal.FreeCoTaskMem(pChunk);
            if (!ok) { success = false; break; }
            offset += currentSize;
        }
        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
        ClosePrinter(hPrinter);
        return success;
    }
}

public class JobReceiptRenderer {
    public static byte[] RenderText(string[] lines, int[] sizes, bool[] bolds, string[] aligns, int paperWidth) {
        var bmp = new Bitmap(paperWidth, 3000);
        var g = Graphics.FromImage(bmp);
        g.Clear(Color.White);
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        float y = 5;
        for (int i = 0; i < lines.Length; i++) {
            var style = bolds[i] ? FontStyle.Bold : FontStyle.Regular;
            var font = new Font("Arial", sizes[i], style);
            var sf = new StringFormat();
            if (aligns[i] == "center") sf.Alignment = StringAlignment.Center;
            else if (aligns[i] == "right") sf.Alignment = StringAlignment.Far;
            else sf.Alignment = StringAlignment.Near;
            foreach (char c in lines[i]) {
                if (c >= 0x0600 && c <= 0x06FF) { sf.FormatFlags = StringFormatFlags.DirectionRightToLeft; break; }
            }
            var rect = new RectangleF(3, y, paperWidth - 6, 200);
            var measured = g.MeasureString(lines[i], font, paperWidth - 6, sf);
            g.DrawString(lines[i], font, Brushes.Black, rect, sf);
            y += measured.Height + 1;
            font.Dispose(); sf.Dispose();
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
                Add-Type -TypeDefinition $jobCsharp -ReferencedAssemblies System.Drawing -ErrorAction Stop
                "$(Get-Date) - Job: C# USB+Bitmap compiled OK" | Out-File $logPath -Append
            } catch {
                "$(Get-Date) - Job: C# compile warning: $_" | Out-File $logPath -Append
            }
            
            while ($true) {
                try {
                    # إرسال agent_version و device_id و branch_id (لعزل الفروع)
                    $r = Invoke-WebRequest -Uri "$apiUrl/api/print-queue/pending?limit=10&agent_version={{AGENT_VERSION}}&device_id={{BRANCH_ID}}&branch_id={{BRANCH_ID}}" -UseBasicParsing -TimeoutSec 10
                    $data = $r.Content | ConvertFrom-Json
                    
                    foreach ($job in $data.jobs) {
                        try {
                            $printed = $false
                            
                            if ($job.raw_data) {
                                # طباعة bitmap مباشرة
                                $bytes = [System.Convert]::FromBase64String($job.raw_data)
                                
                                if ($job.usb_printer_name) {
                                    [JobRawPrinter]::SendBytes($job.usb_printer_name, $bytes)
                                    $printed = $true
                                    "$(Get-Date) - Queue: USB print $($bytes.Length) bytes to $($job.usb_printer_name)" | Out-File $logPath -Append
                                } elseif ($job.ip_address) {
                                    $pport = if ($job.port) { [int]$job.port } else { 9100 }
                                    $tcp = New-Object System.Net.Sockets.TcpClient
                                    $tcp.Connect($job.ip_address, $pport)
                                    $stream = $tcp.GetStream()
                                    $stream.Write($bytes, 0, $bytes.Length)
                                    $stream.Flush()
                                    $tcp.Close()
                                    $printed = $true
                                }
                            } elseif ($job.order_data -and $job.usb_printer_name) {
                                # طباعة طلب مطبخ USB - بناء الإيصال محلياً
                                $od = $job.order_data
                                $pc = $job.printer_config
                                $lines = @(); $sizes = @(); $bolds = @(); $aligns = @()
                                $paperW = 560
                                
                                # عنوان القسم
                                $sectionName = if ($od.section_name) { $od.section_name } else { '' }
                                if ($sectionName) {
                                    $lines += $sectionName; $sizes += 16; $bolds += $true; $aligns += 'center'
                                }
                                # رقم الطلب
                                $orderNum = if ($od.order_number) { $od.order_number } else { '' }
                                $lines += "# $orderNum"; $sizes += 18; $bolds += $true; $aligns += 'center'
                                # نوع الطلب
                                $orderType = if ($od.order_type) { $od.order_type } else { '' }
                                if ($orderType) {
                                    $lines += $orderType; $sizes += 14; $bolds += $true; $aligns += 'center'
                                }
                                # اسم العميل
                                if ($od.customer_name) {
                                    $lines += $od.customer_name; $sizes += 12; $bolds += $false; $aligns += 'center'
                                }
                                # رقم الطاولة
                                if ($od.table_number) {
                                    $lines += "Table: $($od.table_number)"; $sizes += 14; $bolds += $true; $aligns += 'center'
                                }
                                $lines += '--------------------------------'; $sizes += 10; $bolds += $false; $aligns += 'center'
                                # العناصر
                                foreach ($item in $od.items) {
                                    $qty = if ($item.quantity) { $item.quantity } else { 1 }
                                    $itemName = if ($item.name) { $item.name } else { $item.product_name }
                                    $lines += "$qty x $itemName"; $sizes += 13; $bolds += $true; $aligns += 'right'
                                    if ($item.notes) {
                                        $lines += "  $($item.notes)"; $sizes += 10; $bolds += $false; $aligns += 'right'
                                    }
                                    if ($item.extras -or $item.selectedExtras) {
                                        $extras = if ($item.extras) { $item.extras } else { $item.selectedExtras }
                                        foreach ($ex in $extras) {
                                            $exName = if ($ex.name) { $ex.name } else { $ex.extra_name }
                                            $lines += "  + $exName"; $sizes += 10; $bolds += $false; $aligns += 'right'
                                        }
                                    }
                                }
                                $lines += '--------------------------------'; $sizes += 10; $bolds += $false; $aligns += 'center'
                                if ($od.order_notes) {
                                    $lines += $od.order_notes; $sizes += 11; $bolds += $false; $aligns += 'center'
                                }
                                $lines += ' '; $sizes += 10; $bolds += $false; $aligns += 'center'
                                
                                $receiptBytes = [JobReceiptRenderer]::RenderText($lines, $sizes, $bolds, $aligns, $paperW)
                                [JobRawPrinter]::SendBytes($job.usb_printer_name, $receiptBytes)
                                $printed = $true
                            }
                            
                            if ($printed) {
                                Invoke-WebRequest -Uri "$apiUrl/api/print-queue/$($job.id)/complete" -Method PUT -ContentType 'application/json' -Body '{}' -UseBasicParsing -TimeoutSec 5 | Out-Null
                                "$(Get-Date) - Queue: Printed job $($job.id) on $($job.printer_name)" | Out-File $logPath -Append
                            }
                        } catch {
                            try { Invoke-WebRequest -Uri "$apiUrl/api/print-queue/$($job.id)/failed" -Method PUT -ContentType 'application/json' -Body "{`"error`":`"$_`"}" -UseBasicParsing -TimeoutSec 5 | Out-Null } catch {}
                            "$(Get-Date) - Queue: FAILED job $($job.id): $_" | Out-File $logPath -Append
                        }
                    }
                } catch {
                    # Polling error - silent
                }
                Start-Sleep -Seconds 3
            }
        } -ArgumentList $backendUrl, $agentLog
        "$(Get-Date) - Print Queue polling job started (ID: $($pollingJob.Id))" | Out-File $agentLog -Append
    }

    while ($listener.IsListening) {
      try {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response
        $origin = $req.Headers['Origin']
        if (-not $origin) { $origin = '*' }
        $res.AddHeader('Access-Control-Allow-Origin', $origin)
        $res.AddHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        $res.AddHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Access-Control-Request-Private-Network')
        $res.AddHeader('Access-Control-Allow-Private-Network', 'true')
        $res.AddHeader('Access-Control-Max-Age', '86400')
        $res.AddHeader('Vary', 'Origin')
        $res.ContentType = 'application/json'

        if ($req.HttpMethod -eq 'OPTIONS') {
            $res.StatusCode = 200
            $res.Close()
            continue
        }

        $path = $req.Url.LocalPath
        $jsonOut = ''
        "$(Get-Date) - $($req.HttpMethod) $path" | Out-File $agentLog -Append

        if ($path -eq '/status') {
            $jsonOut = '{"status":"running","version":"{{AGENT_VERSION}}","agent":"Maestro Print Agent","usb_support":true,"zk_support":true}'
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
            $bodyText = ''
            try {
                $ms = New-Object System.IO.MemoryStream
                $req.InputStream.CopyTo($ms)
                $bodyText = [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
                $ms.Dispose()
                "$(Get-Date) - Received print-receipt body: $($bodyText.Length) chars" | Out-File $agentLog -Append
            } catch {
                "$(Get-Date) - Error reading request body: $_" | Out-File $agentLog -Append
                $jsonOut = '{"success":false,"message":"Failed to read request body"}'
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonOut)
                $res.OutputStream.Write($buffer, 0, $buffer.Length)
                $res.Close()
                continue
            }

            $body = $null
            try {
                $body = $bodyText | ConvertFrom-Json
            } catch {
                "$(Get-Date) - JSON parse error: $_" | Out-File $agentLog -Append
                $jsonOut = '{"success":false,"message":"Invalid JSON in request"}'
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonOut)
                $res.OutputStream.Write($buffer, 0, $buffer.Length)
                $res.Close()
                continue
            }

            $receiptData = $null
            if ($body.raw_data) {
                try {
                    $receiptData = [System.Convert]::FromBase64String($body.raw_data)
                    "$(Get-Date) - Using server-rendered bitmap ($($receiptData.Length) bytes)" | Out-File $agentLog -Append
                } catch {
                    "$(Get-Date) - Base64 decode error: $_ - falling back to local build" | Out-File $agentLog -Append
                }
            } else {
                "$(Get-Date) - No raw_data in payload, using local Build-Receipt" | Out-File $agentLog -Append
            }
            if (-not $receiptData) {
                $receiptData = Build-Receipt $body.order $body.printer_config
            }

            if ($body.usb_printer_name) {
                "$(Get-Date) - Sending to USB: $($body.usb_printer_name) ($($receiptData.Length) bytes)" | Out-File $agentLog -Append
                $result = Send-ToUsbPrinter $body.usb_printer_name $receiptData
            } else {
                $pport = if ($body.port) { [int]$body.port } else { 9100 }
                "$(Get-Date) - Sending to Network: $($body.ip):$pport ($($receiptData.Length) bytes)" | Out-File $agentLog -Append
                $result = Send-ToPrinter $body.ip $pport $receiptData
            }

            if ($result.success) {
                "$(Get-Date) - Print OK" | Out-File $agentLog -Append
                $jsonOut = '{"success":true,"message":"OK"}'
            } else {
                "$(Get-Date) - Print FAILED: $($result.message)" | Out-File $agentLog -Append
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
        # ============================================
        # === ZKTeco Biometric Endpoints           ===
        # ============================================
        elseif ($path -eq '/zk-test' -and $req.HttpMethod -eq 'POST') {
            $reader = New-Object System.IO.StreamReader($req.InputStream)
            $body = $reader.ReadToEnd() | ConvertFrom-Json
            $zkIp = $body.ip
            $zkPort = if ($body.port) { [int]$body.port } else { 4370 }
            $zkTimeout = if ($body.timeout) { [int]$body.timeout } else { 5000 }
            "$(Get-Date) - ZK Test: $zkIp`:$zkPort (timeout: ${zkTimeout}ms)" | Out-File $agentLog -Append
            try {
                $jsonOut = [ZKHelper]::TestConnection($zkIp, $zkPort, $zkTimeout)
                "$(Get-Date) - ZK Test result: $jsonOut" | Out-File $agentLog -Append
            } catch {
                $em = $_.Exception.Message -replace '"', '' -replace '\\', ''
                $jsonOut = '{"success":false,"message":"' + $em + '"}'
                "$(Get-Date) - ZK Test error: $em" | Out-File $agentLog -Append
            }
        }
        elseif ($path -eq '/zk-users' -and $req.HttpMethod -eq 'POST') {
            $reader = New-Object System.IO.StreamReader($req.InputStream)
            $body = $reader.ReadToEnd() | ConvertFrom-Json
            $zkIp = $body.ip
            $zkPort = if ($body.port) { [int]$body.port } else { 4370 }
            $zkTimeout = if ($body.timeout) { [int]$body.timeout } else { 10000 }
            "$(Get-Date) - ZK Users: $zkIp`:$zkPort" | Out-File $agentLog -Append
            try {
                $jsonOut = [ZKHelper]::GetUsers($zkIp, $zkPort, $zkTimeout)
                "$(Get-Date) - ZK Users result: $($jsonOut.Substring(0, [Math]::Min(200, $jsonOut.Length)))..." | Out-File $agentLog -Append
            } catch {
                $em = $_.Exception.Message -replace '"', '' -replace '\\', ''
                $jsonOut = '{"success":false,"message":"' + $em + '"}'
                "$(Get-Date) - ZK Users error: $em" | Out-File $agentLog -Append
            }
        }
        elseif ($path -eq '/zk-sync' -and $req.HttpMethod -eq 'POST') {
            $reader = New-Object System.IO.StreamReader($req.InputStream)
            $body = $reader.ReadToEnd() | ConvertFrom-Json
            $zkIp = $body.ip
            $zkPort = if ($body.port) { [int]$body.port } else { 4370 }
            $zkTimeout = if ($body.timeout) { [int]$body.timeout } else { 15000 }
            "$(Get-Date) - ZK Sync: $zkIp`:$zkPort" | Out-File $agentLog -Append
            try {
                $jsonOut = [ZKHelper]::SyncAttendance($zkIp, $zkPort, $zkTimeout)
                "$(Get-Date) - ZK Sync result: $($jsonOut.Substring(0, [Math]::Min(200, $jsonOut.Length)))..." | Out-File $agentLog -Append
            } catch {
                $em = $_.Exception.Message -replace '"', '' -replace '\\', ''
                $jsonOut = '{"success":false,"message":"' + $em + '"}'
                "$(Get-Date) - ZK Sync error: $em" | Out-File $agentLog -Append
            }
        }
        elseif ($path -eq '/zk-push-user' -and $req.HttpMethod -eq 'POST') {
            $reader = New-Object System.IO.StreamReader($req.InputStream)
            $body = $reader.ReadToEnd() | ConvertFrom-Json
            $zkIp = $body.ip
            $zkPort = if ($body.port) { [int]$body.port } else { 4370 }
            $zkTimeout = if ($body.timeout) { [int]$body.timeout } else { 5000 }
            $uid = [int]$body.uid
            $userId = if ($body.user_id) { [string]$body.user_id } else { [string]$uid }
            $userName = if ($body.name) { [string]$body.name } else { '' }
            $privilege = if ($body.privilege) { [int]$body.privilege } else { 0 }
            "$(Get-Date) - ZK Push User: $zkIp`:$zkPort uid=$uid name=$userName" | Out-File $agentLog -Append
            try {
                $jsonOut = [ZKHelper]::SetUser($zkIp, $zkPort, $zkTimeout, $uid, $userId, $userName, $privilege)
                "$(Get-Date) - ZK Push User result: $jsonOut" | Out-File $agentLog -Append
            } catch {
                $em = $_.Exception.Message -replace '"', '' -replace '\\', ''
                $jsonOut = '{"success":false,"message":"' + $em + '"}'
                "$(Get-Date) - ZK Push User error: $em" | Out-File $agentLog -Append
            }
        }
        elseif ($path -eq '/zk-delete-user' -and $req.HttpMethod -eq 'POST') {
            $reader = New-Object System.IO.StreamReader($req.InputStream)
            $body = $reader.ReadToEnd() | ConvertFrom-Json
            $zkIp = $body.ip
            $zkPort = if ($body.port) { [int]$body.port } else { 4370 }
            $zkTimeout = if ($body.timeout) { [int]$body.timeout } else { 5000 }
            $uid = [int]$body.uid
            "$(Get-Date) - ZK Delete User: $zkIp`:$zkPort uid=$uid" | Out-File $agentLog -Append
            try {
                $jsonOut = [ZKHelper]::DeleteUser($zkIp, $zkPort, $zkTimeout, $uid)
                "$(Get-Date) - ZK Delete User result: $jsonOut" | Out-File $agentLog -Append
            } catch {
                $em = $_.Exception.Message -replace '"', '' -replace '\\', ''
                $jsonOut = '{"success":false,"message":"' + $em + '"}'
                "$(Get-Date) - ZK Delete User error: $em" | Out-File $agentLog -Append
            }
        }
        elseif ($path -eq '/zk-face-photo' -and $req.HttpMethod -eq 'POST') {
            $reader = New-Object System.IO.StreamReader($req.InputStream)
            $body = $reader.ReadToEnd() | ConvertFrom-Json
            $zkIp = $body.ip
            $zkPort = if ($body.port) { [int]$body.port } else { 4370 }
            $zkTimeout = if ($body.timeout) { [int]$body.timeout } else { 10000 }
            $uid = [int]$body.uid
            "$(Get-Date) - ZK Face Photo: $zkIp`:$zkPort uid=$uid" | Out-File $agentLog -Append
            try {
                $jsonOut = [ZKHelper]::GetFacePhoto($zkIp, $zkPort, $zkTimeout, $uid)
                "$(Get-Date) - ZK Face Photo result: $($jsonOut.Substring(0, [Math]::Min(200, $jsonOut.Length)))" | Out-File $agentLog -Append
            } catch {
                $em = $_.Exception.Message -replace '"', '' -replace '\\', ''
                $jsonOut = '{"success":false,"message":"' + $em + '"}'
                "$(Get-Date) - ZK Face Photo error: $em" | Out-File $agentLog -Append
            }
        }
        elseif ($path -eq '/zk-probe-device' -and $req.HttpMethod -eq 'POST') {
            $reader = New-Object System.IO.StreamReader($req.InputStream)
            $body = $reader.ReadToEnd() | ConvertFrom-Json
            $zkIp = $body.ip
            "$(Get-Date) - ZK Probe Device: $zkIp" | Out-File $agentLog -Append
            try {
                $jsonOut = [ZKHelper]::ProbeDevice($zkIp)
                "$(Get-Date) - ZK Probe result: $($jsonOut.Substring(0, [Math]::Min(300, $jsonOut.Length)))" | Out-File $agentLog -Append
            } catch {
                $em = $_.Exception.Message -replace '"', '' -replace '\\', ''
                $jsonOut = '{"success":false,"message":"' + $em + '"}'
                "$(Get-Date) - ZK Probe error: $em" | Out-File $agentLog -Append
            }
        }
        else {
            $jsonOut = '{"error":"not found"}'
            $res.StatusCode = 404
        }

        $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonOut)
        $res.OutputStream.Write($buffer, 0, $buffer.Length)
        $res.Close()
      } catch {
        "$(Get-Date) - REQUEST ERROR (agent continues): $_" | Out-File $agentLog -Append
        try { $res.Close() } catch {}
      }
    }
  } catch {
    "$(Get-Date) - LISTENER ERROR (will auto-restart in 3s): $_" | Out-File $agentLog -Append
  } finally {
    if ($listener) { try { $listener.Stop(); $listener.Close() } catch {} }
  }

  $restartCount++
  "$(Get-Date) - Agent restarting... (attempt $restartCount)" | Out-File $agentLog -Append
  Start-Sleep -Seconds 3
}

"$(Get-Date) - Agent stopped after $maxRestarts restarts" | Out-File $agentLog -Append
