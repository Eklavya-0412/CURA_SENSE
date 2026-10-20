"""
CURA_SENSE / MigraGuard - Unified Application Launcher
Starts the FastAPI backend and Vite React frontend together with health checks,
automatic browser launch, and clean process management.
"""

import os
import sys
import time
import signal
import argparse
import subprocess
import webbrowser
import urllib.request
from pathlib import Path

# Ensure UTF-8 output on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT_DIR / "frontend"
BACKEND_PORT = 8000
FRONTEND_PORT = 5173

# Determine Python / uv executable
VENV_PYTHON = ROOT_DIR / ".venv" / "Scripts" / "python.exe"
if not VENV_PYTHON.exists():
    VENV_PYTHON = ROOT_DIR / ".venv" / "bin" / "python"
if not VENV_PYTHON.exists():
    VENV_PYTHON = Path(sys.executable)

processes = []


def cleanup():
    """Terminate all running sub-processes cleanly."""
    print("\n[*] Stopping servers...")
    for proc in processes:
        if proc.poll() is None:
            try:
                if sys.platform == "win32":
                    subprocess.call(
                        ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL
                    )
                else:
                    proc.terminate()
            except Exception:
                pass
    print("[*] All servers stopped.")


def signal_handler(sig, frame):
    cleanup()
    sys.exit(0)


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def check_backend_health(proc=None, timeout=15):
    """Wait for backend /health endpoint to return 200 OK."""
    url = f"http://127.0.0.1:{BACKEND_PORT}/health"
    start_time = time.time()
    print(" [*] Waiting for backend to become ready...", end="", flush=True)
    while time.time() - start_time < timeout:
        if proc and proc.poll() is not None:
            print(f" [CRASHED with code {proc.returncode}]")
            return False
        try:
            with urllib.request.urlopen(url, timeout=1) as resp:
                if resp.status == 200:
                    print(" [READY]")
                    return True
        except Exception:
            pass
        print(".", end="", flush=True)
        time.sleep(0.4)
    print(" [TIMEOUT]")
    return False


def start_backend(reload=True):
    """Start the FastAPI backend server."""
    print(f"\n[+] Starting Backend on http://localhost:{BACKEND_PORT}...")
    cmd = [
        str(VENV_PYTHON), "-m", "uvicorn", "main:app",
        "--app-dir", "backend",
        "--host", "0.0.0.0",
        "--port", str(BACKEND_PORT)
    ]
    if reload:
        cmd.append("--reload")

    proc = subprocess.Popen(
        cmd,
        cwd=str(ROOT_DIR),
        stdout=sys.stdout,
        stderr=sys.stderr
    )
    processes.append(proc)
    return proc


def start_frontend(script="dev"):
    """Start the Vite frontend development server."""
    print(f"[+] Starting Frontend ({script})...")
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"

    # Verify node_modules exists
    if not (FRONTEND_DIR / "node_modules").exists():
        print(" [*] node_modules not found, running npm install...")
        subprocess.run([npm_cmd, "install"], cwd=str(FRONTEND_DIR), check=True)

    proc = subprocess.Popen(
        [npm_cmd, "run", script],
        cwd=str(FRONTEND_DIR),
        stdout=sys.stdout,
        stderr=sys.stderr
    )
    processes.append(proc)
    return proc


def ingest_demo_data():
    """Run data ingestion script to pre-populate tickets."""
    print("\n[+] Populating demo tickets...")
    subprocess.run(
        [str(VENV_PYTHON), "backend/scripts/ingest_initial.py"],
        cwd=str(ROOT_DIR)
    )


def run_webhook_simulation():
    """Simulate a checkout failure webhook."""
    print("\n[+] Triggering webhook simulation...")
    subprocess.run(
        [str(VENV_PYTHON), "verify_fix.py"],
        cwd=str(ROOT_DIR)
    )


def print_banner():
    banner = r"""
 ================================================================
   ____ _   _ ____      _        ____  _____ _   _ ____  _____ 
  / ___| | | |  _ \    / \      / ___|| ____| \ | / ___|| ____|
 | |   | | | | |_) |  / _ \ ____\___ \|  _| |  \| \___ \|  _|  
 | |___| |_| |  _ <  / ___ \_____|__) | |___| |\  |___) | |___ 
  \____|\___/|_| \_\/_/   \_\   |____/|_____|_| \_|____/|_____|
           MigraGuard Autonomous Self-Healing Sentinel          
 ================================================================
"""
    print(banner)


def show_menu():
    print_banner()
    print(" Select an option:")
    print("   [1] Launch Full App (Backend + Frontend + Browser)")
    print("   [2] Launch Backend Only (:8000)")
    print("   [3] Launch Frontend Only (:5173)")
    print("   [4] Launch Merchant Portal (:3000)")
    print("   [5] Launch Support Sentinel Portal (:3001)")
    print("   [6] Ingest Demo Tickets into Database")
    print("   [7] Run Webhook Test (verify_fix.py)")
    print("   [0] Exit")
    print()
    try:
        choice = input("Enter option [1-7, 0] (Default: 1): ").strip()
    except (KeyboardInterrupt, EOFError):
        print("\nExiting...")
        sys.exit(0)
    return choice if choice else "1"


def main():
    parser = argparse.ArgumentParser(description="CURA_SENSE / MigraGuard Launcher")
    parser.add_argument("--backend", action="store_true", help="Launch backend server only")
    parser.add_argument("--frontend", action="store_true", help="Launch frontend server only")
    parser.add_argument("--merchant", action="store_true", help="Launch merchant portal only")
    parser.add_argument("--support", action="store_true", help="Launch support portal only")
    parser.add_argument("--demo", action="store_true", help="Ingest demo tickets into backend")
    parser.add_argument("--test-webhook", action="store_true", help="Run webhook test")
    parser.add_argument("--menu", action="store_true", help="Show interactive menu")
    parser.add_argument("--no-browser", action="store_true", help="Do not auto-open browser")
    args = parser.parse_args()

    choice = None
    if args.menu:
        choice = show_menu()
    elif not any([args.backend, args.frontend, args.merchant, args.support, args.demo, args.test_webhook]):
        if sys.stdin.isatty():
            choice = show_menu()
        else:
            choice = "1"

    if choice == "0":
        print("Goodbye!")
        return

    # Check for .env file
    env_file = ROOT_DIR / ".env"
    if not env_file.exists():
        example_env = ROOT_DIR / ".env.example"
        if example_env.exists():
            import shutil
            shutil.copyfile(example_env, env_file)
            print("[!] Created .env from .env.example. Please check GROQ_API_KEY in .env.")

    # Action dispatch
    if choice == "2" or args.backend:
        print_banner()
        start_backend()
    elif choice == "3" or args.frontend:
        print_banner()
        start_frontend("dev")
    elif choice == "4" or args.merchant:
        print_banner()
        start_frontend("dev:merchant")
    elif choice == "5" or args.support:
        print_banner()
        start_frontend("dev:support")
    elif choice == "6" or args.demo:
        ingest_demo_data()
        return
    elif choice == "7" or args.test_webhook:
        run_webhook_simulation()
        return
    else:
        # Default: Full stack launch
        print_banner()
        b_proc = start_backend()

        # Wait for backend before frontend/browser
        if check_backend_health(b_proc):
            print(" [+] Backend is operational.")
        else:
            print(" [!] Backend check timed out, continuing frontend startup...")

        start_frontend("dev")

        target_url = f"http://localhost:{FRONTEND_PORT}"
        if not args.no_browser:
            print(f"\n[*] Opening {target_url} in your browser...")
            webbrowser.open(target_url)

        print("\n" + "=" * 64)
        print(" [OK] CURA_SENSE / MigraGuard is Running!")
        print("=" * 64)
        print(f" • Unified Dashboard:      http://localhost:{FRONTEND_PORT}")
        print(f" • Merchant Portal:        http://localhost:{FRONTEND_PORT}/merchant.html")
        print(f" • Support Sentinel:       http://localhost:{FRONTEND_PORT}/support.html")
        print(f" • Backend API & Health:   http://localhost:{BACKEND_PORT}/health")
        print(f" • Swagger Documentation:  http://localhost:{BACKEND_PORT}/docs")
        print("=" * 64)
        print(" Press Ctrl+C at any time to shut down all servers.\n")

    # Keep alive and monitor processes
    try:
        while True:
            time.sleep(1)
            for proc in processes:
                if proc.poll() is not None:
                    print(f"\n[!] Process {proc.pid} exited with code {proc.returncode}.")
                    cleanup()
                    return
    except KeyboardInterrupt:
        cleanup()


if __name__ == "__main__":
    main()
