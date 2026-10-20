# Regenerate LAN development certificates (mkcert).
# Run from repo root in PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\scripts\regen-lan-certs.ps1

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Tools = Join-Path $Root "tools"
$Certs = Join-Path $Root "certs"
$Mkcert = Join-Path $Tools "mkcert.exe"

New-Item -ItemType Directory -Force -Path $Tools, $Certs | Out-Null

if (-not (Test-Path $Mkcert)) {
    Write-Host "Downloading mkcert..."
    Invoke-WebRequest `
        -Uri "https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-windows-amd64.exe" `
        -OutFile $Mkcert `
        -UseBasicParsing
}

$LanIp = $env:LAN_IP
if (-not $LanIp) {
    $LanIp = (Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object {
            $_.IPAddress -notlike "127.*" -and
            $_.IPAddress -notlike "169.254.*" -and
            ($_.PrefixOrigin -eq "Dhcp" -or $_.PrefixOrigin -eq "Manual")
        } |
        Sort-Object {
            if ($_.IPAddress -like "192.168.*") { 0 }
            elseif ($_.IPAddress -like "10.*") { 1 }
            else { 2 }
        } |
        Select-Object -First 1 -ExpandProperty IPAddress)
}

if (-not $LanIp) {
    throw "Could not detect LAN IPv4. Set LAN_IP and retry."
}

$env:CAROOT = $Certs
& $Mkcert -install
& $Mkcert `
    -cert-file (Join-Path $Certs "lan.pem") `
    -key-file (Join-Path $Certs "lan-key.pem") `
    $LanIp localhost 127.0.0.1 ::1

Write-Host ""
Write-Host "Certificates ready for: $LanIp, localhost, 127.0.0.1, ::1"
Write-Host "Public CA (install on phones): $(Join-Path $Certs 'rootCA.pem')"
Write-Host "Never share rootCA-key.pem."
