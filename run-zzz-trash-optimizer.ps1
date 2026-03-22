param(
    [string]$Action,
    [string]$InventoryPath,
    [int]$Steps = 10,
    [ValidateSet("conservative", "strict")]
    [string]$Policy = "conservative"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue

$inventoryDirectoryName = "disc-jsons"
$explicitActions = @("score", "solve", "validate", "crawl", "optimize")

function Get-ProcessInfo {
    param([int]$ProcessId)

    try {
        return Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
    }
    catch {
        return $null
    }
}

function Test-ExplorerLaunch {
    $current = Get-ProcessInfo -ProcessId $PID
    if (-not $current) {
        return $false
    }

    $parent = Get-ProcessInfo -ProcessId $current.ParentProcessId
    if (-not $parent -or $parent.Name -notmatch '^cmd(?:\.exe)?$') {
        return $false
    }

    $grandParent = Get-ProcessInfo -ProcessId $parent.ParentProcessId
    return $grandParent -and $grandParent.Name -ieq 'explorer.exe'
}

function Wait-ForExitIfNeeded {
    param([bool]$ShouldPause)

    if ($ShouldPause) {
        Write-Host ""
        [void](Read-Host "Press Enter to close this window")
    }
}

function Get-RepoRoot {
    if ($PSScriptRoot) {
        return $PSScriptRoot
    }

    return Split-Path -Parent $PSCommandPath
}

function Get-InventoryRoot {
    param([string]$RepoRoot)

    $inventoryRoot = Join-Path $RepoRoot $inventoryDirectoryName
    if (Test-Path -LiteralPath $inventoryRoot -PathType Container) {
        return $inventoryRoot
    }

    return $RepoRoot
}

function Resolve-InventoryPath {
    param(
        [string]$RepoRoot,
        [string]$RequestedPath
    )

    if (-not $RequestedPath) {
        return $null
    }

    if ([System.IO.Path]::IsPathRooted($RequestedPath)) {
        return $RequestedPath
    }

    $candidates = @(
        (Join-Path $RepoRoot $RequestedPath),
        (Join-Path (Get-InventoryRoot -RepoRoot $RepoRoot) $RequestedPath)
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return $candidate
        }
    }

    return (Join-Path $RepoRoot $RequestedPath)
}

function Get-NodeCommand {
    param([string]$RepoRoot)

    $candidates = @()

    $fromPath = Get-Command node -ErrorAction SilentlyContinue
    if ($fromPath) {
        $candidates += $fromPath.Source
    }

    $candidates += @(
        (Join-Path $RepoRoot "tools\node\node.exe"),
        (Join-Path $RepoRoot "node.exe"),
        (Join-Path ${env:ProgramFiles} "nodejs\node.exe"),
        (Join-Path ${env:LOCALAPPDATA} "Programs\nodejs\node.exe")
    )

    if (${env:ProgramFiles(x86)}) {
        $candidates += (Join-Path ${env:ProgramFiles(x86)} "nodejs\node.exe")
    }

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return $candidate
        }
    }

    throw "Node.js was not found. Install Node.js, add it to PATH, or place node.exe at tools\node\node.exe."
}

function Get-InventoryFilePath {
    param([string]$InitialDirectory)

    if (-not ("System.Windows.Forms.OpenFileDialog" -as [type])) {
        return $null
    }

    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = "Select a ZZZ inventory export"
    $dialog.Filter = "ZZZ JSON exports (*.ZOD.json)|*.ZOD.json|JSON files (*.json)|*.json|All files (*.*)|*.*"
    $dialog.InitialDirectory = $InitialDirectory
    $dialog.Multiselect = $false

    try {
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            return $dialog.FileName
        }
        return $null
    }
    finally {
        $dialog.Dispose()
    }
}

function Show-OptimizeIntro {
    Write-Host "ZZZ Trash Optimizer"
    Write-Host "This tool will read your ZZZ disc export, score your discs against the bundled character database, and generate a safe trash-filter sequence."
    Write-Host "No JSON path was provided."
    [void](Read-Host "Press Enter to select your ZZZ inventory JSON export")
    Write-Host ""
}

function Show-ActionStatus {
    param(
        [string]$ResolvedAction,
        [string]$ResolvedInventoryPath
    )

    switch ($ResolvedAction) {
        "optimize" {
            Write-Host "Scoring disc inventory and generating a trash-filter sequence..."
            Write-Host "Inventory: $ResolvedInventoryPath"
            Write-Host ""
        }
        "score" {
            Write-Host "Scoring disc inventory..."
            Write-Host "Inventory: $ResolvedInventoryPath"
            Write-Host ""
        }
        "solve" {
            Write-Host "Scoring disc inventory and generating a trash-filter sequence..."
            Write-Host "Inventory: $ResolvedInventoryPath"
            Write-Host ""
        }
        "validate" {
            Write-Host "Running validation pipeline..."
            Write-Host "Inventory: $ResolvedInventoryPath"
            Write-Host ""
        }
        "crawl" {
            Write-Host "Refreshing bundled character database..."
            Write-Host ""
        }
    }
}

function Test-InventoryFile {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Inventory file not found: $Path"
    }

    if ([System.IO.Path]::GetExtension($Path).ToLowerInvariant() -ne ".json") {
        throw "Inventory file must be a .json file: $Path"
    }

    try {
        $raw = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    }
    catch {
        throw "Inventory file is not valid JSON: $Path"
    }

    if (-not $raw.discs -or -not ($raw.discs -is [System.Collections.IEnumerable])) {
        throw "Inventory file does not contain a discs array: $Path"
    }
}

function Resolve-RequestedAction {
    param(
        [string]$RequestedAction,
        [string]$RequestedInventoryPath
    )

    if ($RequestedAction) {
        $normalized = $RequestedAction.ToLowerInvariant()
        if ($explicitActions -contains $normalized) {
            return $normalized
        }

        if (-not $RequestedInventoryPath) {
            $script:InventoryPath = $RequestedAction
            return "optimize"
        }

        throw "Unknown action: $RequestedAction"
    }

    return "optimize"
}

function Invoke-NodeTool {
    param(
        [string]$NodePath,
        [string]$RepoRoot,
        [string]$ToolPath,
        [string[]]$Arguments = @()
    )

    $resolvedTool = Join-Path $RepoRoot $ToolPath
    if (-not (Test-Path -LiteralPath $resolvedTool -PathType Leaf)) {
        throw "Required tool not found: $resolvedTool"
    }

    & $NodePath $resolvedTool @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $ToolPath $($Arguments -join ' ')"
    }
}

function Invoke-ProjectBuild {
    param(
        [string]$NodePath,
        [string]$RepoRoot
    )

    Write-Host "Building project..."
    Invoke-NodeTool -NodePath $NodePath -RepoRoot $RepoRoot -ToolPath "node_modules\rimraf\dist\esm\bin.mjs" -Arguments @("dist")
    Invoke-NodeTool -NodePath $NodePath -RepoRoot $RepoRoot -ToolPath "node_modules\typescript\bin\tsc"
}

$shouldPauseOnExit = Test-ExplorerLaunch
$exitCode = 0

try {
    $repoRoot = Get-RepoRoot
    Set-Location -LiteralPath $repoRoot

    $nodePath = Get-NodeCommand -RepoRoot $repoRoot
    $cliPath = Join-Path $repoRoot "dist\cli.js"

    if (-not (Test-Path -LiteralPath $cliPath -PathType Leaf)) {
        Write-Host "Build output not found."
        Invoke-ProjectBuild -NodePath $nodePath -RepoRoot $repoRoot
    }

    $Action = Resolve-RequestedAction -RequestedAction $Action -RequestedInventoryPath $InventoryPath

    if ($Action -eq "optimize" -and -not $InventoryPath) {
        Show-OptimizeIntro
    }

    if ($Action -ne "crawl") {
        if (-not $InventoryPath) {
            $InventoryPath = Get-InventoryFilePath -InitialDirectory (Get-InventoryRoot -RepoRoot $repoRoot)
            if (-not $InventoryPath) {
                $InventoryPath = Read-Host "Enter the full path to your ZZZ inventory JSON"
            }
        }

        $InventoryPath = Resolve-InventoryPath -RepoRoot $repoRoot -RequestedPath $InventoryPath
        Test-InventoryFile -Path $InventoryPath
    }

    Show-ActionStatus -ResolvedAction $Action -ResolvedInventoryPath $InventoryPath

    $arguments = @($cliPath, $Action)
    switch ($Action) {
        "optimize" {
            $arguments += @("--inventory", $InventoryPath, "--policy", $Policy, "--steps", "$Steps")
        }
        "score" {
            $arguments += @("--inventory", $InventoryPath, "--policy", $Policy)
        }
        "solve" {
            $arguments += @("--inventory", $InventoryPath, "--policy", $Policy, "--steps", "$Steps")
        }
        "validate" {
            $arguments += @("--inventory", $InventoryPath)
        }
    }

    & $nodePath @arguments
    $exitCode = $LASTEXITCODE
}
catch {
    Write-Host ""
    Write-Host $_.Exception.Message -ForegroundColor Red
    $exitCode = 1
}
finally {
    Wait-ForExitIfNeeded -ShouldPause $shouldPauseOnExit
}

exit $exitCode
