#!/usr/bin/env bash
# Idempotent one-shot setup for toastmaster-auto-ah-counter.
# Ensures Node 20+ is available, then installs project deps.
# Safe to re-run.

set -euo pipefail

REQUIRED_NODE_MAJOR=20
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OS="$(uname -s)"

# --- pretty logging --------------------------------------------------------
if [[ -t 1 ]]; then
  BOLD=$(tput bold  2>/dev/null || echo '')
  GREEN=$(tput setaf 2 2>/dev/null || echo '')
  YELLOW=$(tput setaf 3 2>/dev/null || echo '')
  RED=$(tput setaf 1 2>/dev/null || echo '')
  RESET=$(tput sgr0 2>/dev/null || echo '')
else
  BOLD='' GREEN='' YELLOW='' RED='' RESET=''
fi
log()  { printf "%s==>%s %s\n" "$BOLD$GREEN"  "$RESET" "$*"; }
warn() { printf "%s==>%s %s\n" "$BOLD$YELLOW" "$RESET" "$*"; }
die()  { printf "%s==>%s %s\n" "$BOLD$RED"    "$RESET" "$*" >&2; exit 1; }

# --- node ------------------------------------------------------------------
check_node() {
  command -v node >/dev/null 2>&1 || return 1
  local v major
  v="$(node --version)"        # e.g. v22.5.1
  major="${v#v}"; major="${major%%.*}"
  if [[ "$major" -ge "$REQUIRED_NODE_MAJOR" ]]; then
    log "Node $v detected"
    return 0
  fi
  warn "Node $v is below required v$REQUIRED_NODE_MAJOR"
  return 1
}

ensure_brew_on_path() {
  if command -v brew >/dev/null 2>&1; then return; fi
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

install_node_macos() {
  ensure_brew_on_path
  if ! command -v brew >/dev/null 2>&1; then
    log "Homebrew not found — installing (will prompt for your password)…"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    ensure_brew_on_path
  fi
  log "Installing Node LTS via Homebrew…"
  brew install node@22
  local prefix
  prefix="$(brew --prefix node@22)"
  export PATH="$prefix/bin:$PATH"
  warn "node@22 is keg-only. Add this line to your ~/.zshrc so future shells find node:"
  printf '  export PATH="%s/bin:$PATH"\n' "$prefix"
}

install_node_linux() {
  if command -v apt-get >/dev/null 2>&1; then
    log "Installing Node 22 via NodeSource…"
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    log "Installing Node 22 via dnf…"
    sudo dnf install -y nodejs
  else
    die "Unsupported Linux distro. Install Node ${REQUIRED_NODE_MAJOR}+ manually and re-run."
  fi
}

install_node() {
  case "$OS" in
    Darwin) install_node_macos ;;
    Linux)  install_node_linux ;;
    *)      die "Unsupported OS: $OS. Install Node ${REQUIRED_NODE_MAJOR}+ manually and re-run." ;;
  esac
}

# --- main ------------------------------------------------------------------
log "Checking Node.js…"
if ! check_node; then
  install_node
  check_node || die "Node still not on PATH after install. Open a new terminal and re-run."
fi

log "Installing project dependencies (npm install)…"
cd "$SCRIPT_DIR"
npm install --no-audit --no-fund

log "Done. Start the dev server with:"
printf "  npm run dev\n"
