$appJsonPath = "C:\vantro-mobile\app.json"
$appJson = [System.IO.File]::ReadAllText($appJsonPath, [System.Text.UTF8Encoding]::new($false))
$app = $appJson | ConvertFrom-Json

# ── iOS plist strings ──────────────────────────────────────────────────────────
$plist = $app.expo.ios.infoPlist

# Primary permission dialog (what the user sees on device)
$plist.NSLocationAlwaysAndWhenInUseUsageDescription = "Vantro uses your location only to confirm you're within range of a job site when signing in and out. No movement is tracked, recorded, or shared — location is checked at the site boundary only."

# WhenInUse fallback (foreground only prompt)
$plist.NSLocationWhenInUseUsageDescription = "Vantro checks you're within range of the job site when you sign in or out. No movement is tracked or recorded."

# Remove the deprecated Always-only key if it still exists
if ($plist.PSObject.Properties.Name -contains "NSLocationAlwaysUsageDescription") {
    $plist.PSObject.Properties.Remove("NSLocationAlwaysUsageDescription")
    Write-Host "[OK] Removed deprecated NSLocationAlwaysUsageDescription"
}

# ── expo-location plugin string ────────────────────────────────────────────────
$newPlugins = @()
foreach ($p in $app.expo.plugins) {
    if ($p -is [System.Array] -and $p[0] -eq "expo-location") {
        $config = $p[1]
        $config.locationAlwaysAndWhenInUsePermission = "Used to confirm you're at the job site when signing in or out. No tracking, no movement recording."
        $config.locationAlwaysPermission             = "Used to confirm you're at the job site when signing in or out. No tracking, no movement recording."
        $newPlugins += , @("expo-location", $config)
        Write-Host "[OK] Updated expo-location plugin permission strings"
    } else {
        $newPlugins += , $p
    }
}
$app.expo.plugins = $newPlugins

# ── Write back ─────────────────────────────────────────────────────────────────
$output = $app | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($appJsonPath, $output, [System.Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "Done. Verify the strings look right:"
Write-Host ""
$verify = [System.IO.File]::ReadAllText($appJsonPath) | ConvertFrom-Json
Write-Host "NSLocationAlwaysAndWhenInUseUsageDescription:"
Write-Host "  $($verify.expo.ios.infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription)"
Write-Host ""
Write-Host "NSLocationWhenInUseUsageDescription:"
Write-Host "  $($verify.expo.ios.infoPlist.NSLocationWhenInUseUsageDescription)"
