# Setup Google Apps Script projects in SMMC-AI
# Run this after fixing folder permissions

$projects = @{
    "Backup Script to" = "1L2BKWGOAkoaYMjvZE-VXrWaitrEsLQoO4vsqvUjx1DSVIcq23FZcfK_U"
    "Annual Calendar Automation" = "1TA0bcJTwu3qn2XJQQuM0iqm1CKFdVfKVSjZDC_5w8UKSF4s-kovElLGh"
    "Weather Data" = "1rhSREmIR4a1xxBWOT5M5T339V03wL-KqSfwXqFYbSwXwdu4nAEyPFHAA"
    "facebook posting" = "1t_4AngCIRlMPJvQeABmv0ZLsrGv-6d7tKc3QmOHsfo1jYv9ksd1LWvWj"
    "Facebook Post Queue" = "1yqtHzPcBDnKoNKvddCOsYAa1GguuoEdCA95lu3rSRlQEaD7cBq1H7X4w"
    "Membership Applications" = "1TpCuoyHvdi5GgaB7-GGLmsjcjDXB3_yRwhLPWMFLoF26GDQGGuODji62"
    "ClubManagement" = "1CklFv0bdDtj4SUP0010nvMmmdqk0qPraLMk0r0r4202LjfM-uLEhBDEs"
    "Race Results Automation" = "1WcTxzpaVic0UVdHvXtjkGDZDFgr8r7AriJUOENVAJC6mJavk1P08Xjq7"
    "Race Result Template" = "10Of4M_rXrlHsZAsh1RmigE3tu7zxnSWJKxC00g-5FwfcFuhIEGJOsteM"
    "SMMC Racesheet" = "15Kzf3BMxSxtSpwD-Du9e7kQXqLYdo4ULvJsPGw5je6O9g9TDCM0d8VQ4"
    "Round Tracker" = "1O_gsSxjDQGKCmGtMgWpP3NBl1BTLeOdYc8x0jmnfr4C6H0QQCnVabPBH"
    "Voice Race Recording" = "1GG_3_ek-AkhPaZjvtSCzH_pgvRgVXsfBrSh_77ns7WRqkSzpyZYiIpjt"
    "add race result" = "1g8fkg2Yz1yRMGWXdWOujv36xl2oN7MwXXUibwBFwYrHcsJLI9SWB41N2"
    "Committee nominations" = "1uGkYJYVH5PEdcEzFZs289mTyzNIJIUX58jCgY8ms-I5Fk-wSeq8AxW2v"
    "Test Formatting" = "1Y_al7m6QHfdd5ABIvbjE2pwF0phyZ4FlY4591fGiWY2orUYLyR6JmxvS"
    "ResultsSheetParser" = "1bBlxmEEVSWsQmvV46rRKxw38GESqLptRTVXtQALC3ZxZG4_9c2LA-dc6"
    "Results Scheduler" = "1UbOp9FCdkfjDCzZT66GXGczfz-qOdVTIqTVDrH4-ivljHD-rPl_MHOoe"
    "Liquid Glass html" = "1UGHQZksw14UkEdx2Z-W3lJUhTwy-6ZNENrVF2LF44oa_6t2Whh6jZVYC"
    "Get File Sheets" = "1kbAni013fUAaV1M7bl5lPHmkL4SqT5tv2lFPRV3zkJ3wR7Bo-zizoxLA"
    "Image Generator" = "1qHQmJtB2A9-fR68FNqaCbiTThrf0GSOb53L7y0uP4mUOxOs0amrq2Pct"
}

$baseDir = "d:\AI Coding\smmc-AI"

Write-Output "Setting up $($projects.Count) Google Apps Script projects..."

foreach ($name in $projects.Keys) {
    $dirName = $name -replace ' \(1\)$', ''  # Remove trailing (1) if present
    $dir = Join-Path $baseDir $dirName
    $scriptId = $projects[$name]
    
    # Create directory
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force $dir | Out-Null
        Write-Output "Created: $dir"
    }
    
    # Create .clasp.json
    $claspJson = @{
        scriptId = $scriptId
        rootDir = "."
        scriptExtensions = @(".js", ".gs")
        htmlExtensions = @(".html")
        jsonExtensions = @(".json")
    } | ConvertTo-Json
    
    $claspPath = Join-Path $dir ".clasp.json"
    Set-Content -Path $claspPath -Value $claspJson -Encoding UTF8 -Force
    Write-Output "Created: $claspPath"
}

Write-Output "`nAll directories and .clasp.json files created."
Write-Output "Next: Run 'clasp.cmd pull' in each directory to download files."
