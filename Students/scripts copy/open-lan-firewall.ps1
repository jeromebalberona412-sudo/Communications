# Run elevated (Right-click PowerShell → Run as administrator):
#   powershell -ExecutionPolicy Bypass -File .\scripts\open-lan-firewall.ps1

$ErrorActionPreference = "Stop"

$rules = @(
    @{ Name = "Students HTTPS 8440"; Port = 8440 },
    @{ Name = "Teachers HTTPS 8441"; Port = 8441 },
    @{ Name = "Students Laravel 8005"; Port = 8005 },
    @{ Name = "Teachers Laravel 8006"; Port = 8006 }
)

foreach ($r in $rules) {
    $existing = Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "Already exists: $($r.Name)"
        continue
    }

    New-NetFirewallRule `
        -DisplayName $r.Name `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort $r.Port `
        -Action Allow `
        -Profile Private | Out-Null

    Write-Host "Created: $($r.Name) (TCP $($r.Port), Private)"
}

Write-Host "Done. Do not expose these ports to the public internet."
