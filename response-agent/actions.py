"""
actions.py
-----------
Each action has two modes, controlled by RESPONSE_MODE env var:
  - "simulate" (default): logs what WOULD happen, makes no real system change
  - "live": actually performs the action

This split exists so you can demo/test safely and only flip to live when
you mean it.
"""

import os
import platform
import subprocess
import shutil
import stat
import time

import psutil

RESPONSE_MODE = os.environ.get("RESPONSE_MODE", "simulate").lower()
IS_WINDOWS = platform.system() == "Windows"

QUARANTINE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "quarantine")
os.makedirs(QUARANTINE_DIR, exist_ok=True)


class ActionResult:
    def __init__(self, success: bool, mode: str, detail: str):
        self.success = success
        self.mode = mode
        self.detail = detail

    def to_dict(self):
        return {"success": self.success, "mode": self.mode, "detail": self.detail}


# ---------------------------------------------------------------------------
# Kill process
# ---------------------------------------------------------------------------

def kill_process(pid: int) -> ActionResult:
    if RESPONSE_MODE != "live":
        return ActionResult(True, "simulate", f"Would terminate process PID {pid} (simulate mode - no action taken)")

    try:
        proc = psutil.Process(pid)
        name = proc.name()
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except psutil.TimeoutExpired:
            proc.kill()  # escalate to SIGKILL if it didn't die gracefully
        return ActionResult(True, "live", f"Terminated process '{name}' (PID {pid})")
    except psutil.NoSuchProcess:
        return ActionResult(False, "live", f"PID {pid} no longer exists")
    except psutil.AccessDenied:
        return ActionResult(False, "live", f"Access denied terminating PID {pid} - try running as Administrator/root")
    except Exception as e:
        return ActionResult(False, "live", f"Unexpected error: {e}")


# ---------------------------------------------------------------------------
# Block / unblock IP
# ---------------------------------------------------------------------------

def _firewall_rule_name(ip: str) -> str:
    return f"SentinelAI_Block_{ip.replace('.', '_').replace(':', '_')}"


def block_ip(ip: str) -> ActionResult:
    if RESPONSE_MODE != "live":
        return ActionResult(True, "simulate", f"Would block inbound/outbound traffic from {ip} (simulate mode - no action taken)")

    rule_name = _firewall_rule_name(ip)
    try:
        if IS_WINDOWS:
            cmd = [
                "netsh", "advfirewall", "firewall", "add", "rule",
                f"name={rule_name}", "dir=in", "action=block", f"remoteip={ip}",
            ]
        else:
            cmd = ["iptables", "-A", "INPUT", "-s", ip, "-j", "DROP"]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            return ActionResult(True, "live", f"Blocked {ip} via {'Windows Firewall' if IS_WINDOWS else 'iptables'}")
        return ActionResult(False, "live", f"Firewall command failed: {result.stderr.strip()}")
    except FileNotFoundError:
        return ActionResult(False, "live", "Firewall tool not found on this system (netsh/iptables)")
    except PermissionError:
        return ActionResult(False, "live", "Permission denied - firewall changes require Administrator/root")
    except Exception as e:
        return ActionResult(False, "live", f"Unexpected error: {e}")


def unblock_ip(ip: str) -> ActionResult:
    """Rollback for block_ip - removes the specific rule this agent created."""
    if RESPONSE_MODE != "live":
        return ActionResult(True, "simulate", f"Would remove block on {ip} (simulate mode - no action taken)")

    rule_name = _firewall_rule_name(ip)
    try:
        if IS_WINDOWS:
            cmd = ["netsh", "advfirewall", "firewall", "delete", "rule", f"name={rule_name}"]
        else:
            cmd = ["iptables", "-D", "INPUT", "-s", ip, "-j", "DROP"]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            return ActionResult(True, "live", f"Removed block on {ip}")
        return ActionResult(False, "live", f"Failed to remove block: {result.stderr.strip()}")
    except Exception as e:
        return ActionResult(False, "live", f"Unexpected error: {e}")


# ---------------------------------------------------------------------------
# Quarantine / restore file
# ---------------------------------------------------------------------------

def quarantine_file(filepath: str) -> ActionResult:
    """
    Moves the file into a quarantine folder and strips execute/write
    permissions - contained but recoverable, never deleted outright.
    """
    if RESPONSE_MODE != "live":
        return ActionResult(True, "simulate", f"Would quarantine {filepath} (simulate mode - no action taken)")

    if not os.path.exists(filepath):
        return ActionResult(False, "live", f"File not found: {filepath}")

    try:
        fname = os.path.basename(filepath)
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        dest = os.path.join(QUARANTINE_DIR, f"{timestamp}__{fname}.quarantined")

        # Save original path so restore knows where to put it back
        manifest_path = dest + ".origin"
        with open(manifest_path, "w") as f:
            f.write(filepath)

        shutil.move(filepath, dest)
        os.chmod(dest, stat.S_IREAD)  # read-only, no execute

        return ActionResult(True, "live", f"Quarantined to {dest}")
    except PermissionError:
        return ActionResult(False, "live", f"Permission denied quarantining {filepath}")
    except Exception as e:
        return ActionResult(False, "live", f"Unexpected error: {e}")


def restore_file(quarantined_path: str) -> ActionResult:
    """Rollback for quarantine_file - moves the file back to its original location."""
    if RESPONSE_MODE != "live":
        return ActionResult(True, "simulate", f"Would restore {quarantined_path} (simulate mode - no action taken)")

    manifest_path = quarantined_path + ".origin"
    if not os.path.exists(quarantined_path) or not os.path.exists(manifest_path):
        return ActionResult(False, "live", "Quarantined file or origin manifest not found")

    try:
        with open(manifest_path) as f:
            original_path = f.read().strip()
        os.chmod(quarantined_path, stat.S_IREAD | stat.S_IWRITE)
        shutil.move(quarantined_path, original_path)
        os.remove(manifest_path)
        return ActionResult(True, "live", f"Restored to {original_path}")
    except Exception as e:
        return ActionResult(False, "live", f"Unexpected error: {e}")


# ---------------------------------------------------------------------------
# Account actions (stubs - wire these to your Node/Express user model)
# ---------------------------------------------------------------------------

def disable_account(account_id: str, backend_callback=None) -> ActionResult:
    """
    Account state lives in your MongoDB/Express backend, not here. This
    action is a controlled hook: in live mode it calls back into your
    backend API to flip the account's `disabled` flag. Pass a callable
    or wire the HTTP call yourself in response_service.py.
    """
    if RESPONSE_MODE != "live":
        return ActionResult(True, "simulate", f"Would disable account {account_id} (simulate mode - no action taken)")

    if backend_callback is None:
        return ActionResult(False, "live", "No backend_callback configured - wire this to your Express /api/users/:id/disable endpoint")

    try:
        backend_callback(account_id)
        return ActionResult(True, "live", f"Disabled account {account_id} via backend callback")
    except Exception as e:
        return ActionResult(False, "live", f"Backend callback failed: {e}")
