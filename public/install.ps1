# ModUpdater bootstrap (Windows).
#
#   irm https://mod.th7bo.dev/install.ps1 | iex
#
# Downloads the latest installer package and runs it. Kept separate from the
# installer itself: a script run through iex has no path of its own, so it
# cannot find the JAR shipped alongside it.

$ErrorActionPreference = 'Stop'

$releaseUrl = if ($env:MODUPDATER_RELEASE_URL) {
    $env:MODUPDATER_RELEASE_URL
} else {
    'https://github.com/Th7bo/modupdater-cli/releases/latest/download/modupdater-installer.zip'
}

$pkgDir = if ($env:MODUPDATER_PKG_DIR) {
    $env:MODUPDATER_PKG_DIR
} else {
    Join-Path $env:LOCALAPPDATA 'modupdater\pkg'
}

function Stop-With ($m) {
    Write-Host $m -ForegroundColor Red
    Write-Host ''
    Read-Host 'Press Enter to close'
    exit 1
}

Write-Host ''
Write-Host 'ModUpdater' -ForegroundColor White
Write-Host ''

if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    Stop-With 'Java is not installed. Install Java 21 or newer, then run this again.'
}

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("modupdater-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

try {
    Write-Host 'Downloading the latest version...'
    $zip = Join-Path $tmp 'installer.zip'
    try {
        Invoke-WebRequest -Uri $releaseUrl -OutFile $zip -UseBasicParsing
    } catch {
        Stop-With "Could not download the installer from $releaseUrl"
    }

    # Replace the previous copy rather than expanding over it, so files removed
    # in a later version don't linger and get picked up.
    if (Test-Path $pkgDir) { Remove-Item -Recurse -Force $pkgDir }
    New-Item -ItemType Directory -Force -Path $pkgDir | Out-Null
    Expand-Archive -LiteralPath $zip -DestinationPath $pkgDir -Force

    # Files that came out of a downloaded zip carry the mark of the web, which
    # blocks them under the default RemoteSigned policy even for their own owner.
    Get-ChildItem -LiteralPath $pkgDir -Recurse -File |
        Unblock-File -ErrorAction SilentlyContinue

    $installer = Join-Path $pkgDir 'install.ps1'
    if (-not (Test-Path $installer)) {
        Stop-With 'The package is missing install.ps1 - please report this.'
    }

    Write-Host ''

    # Started as a child process rather than called directly.
    #
    # This bootstrap runs through `iex`, which executes a string and so is never
    # subject to the execution policy — but `& $installer` runs a *file*, and on a
    # default Windows install that is refused outright. The user is usually not an
    # administrator and cannot lift the machine policy, so the policy is bypassed
    # for this one child process instead, exactly as install.bat does. It shares
    # this console, so the installer's prompts still work.
    $child = if ($PSVersionTable.PSEdition -eq 'Core') { 'pwsh' } else { 'powershell' }
    & $child -NoProfile -ExecutionPolicy Bypass -File $installer
} finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
