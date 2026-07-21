"""
Auto-submit for Claude Code voice dictation.
Silence for DELAY seconds → submits automatically.
Self-restarts on any crash.
"""

import ctypes
import time
import threading
import sys

DELAY = 4.0


class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_ulong)]


def get_idle_seconds():
    lii = LASTINPUTINFO()
    lii.cbSize = ctypes.sizeof(lii)
    ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii))
    return (ctypes.windll.kernel32.GetTickCount() - lii.dwTime) / 1000.0


def get_foreground():
    try:
        import win32gui
        hwnd = win32gui.GetForegroundWindow()
        title = win32gui.GetWindowText(hwnd).lower()
        return title, hwnd
    except Exception:
        return "", None


def is_target(title):
    return any(k in title for k in (
        "claude", "windows terminal", "powershell", "visual studio code"
    ))


def submit_to(hwnd):
    try:
        import win32gui
        win32gui.SetForegroundWindow(hwnd)
        time.sleep(0.2)
    except Exception:
        pass
    try:
        from pynput.keyboard import Key, Controller
        kb = Controller()
        kb.press(Key.enter)
        time.sleep(0.05)
        kb.release(Key.enter)
    except Exception:
        pass


def run():
    was_busy = False
    target_hwnd = None
    last_busy_time = 0.0

    while True:
        try:
            time.sleep(0.1)
            idle = get_idle_seconds()
            title, hwnd = get_foreground()
            in_target = is_target(title)

            if idle < 0.3 and in_target:
                was_busy = True
                target_hwnd = hwnd
                last_busy_time = time.monotonic()
            elif was_busy:
                if time.monotonic() - last_busy_time >= DELAY:
                    submit_to(target_hwnd)
                    was_busy = False
                    target_hwnd = None
                    time.sleep(3.0)
        except Exception:
            time.sleep(1.0)


# Top-level crash recovery
while True:
    try:
        run()
    except Exception:
        time.sleep(2.0)
