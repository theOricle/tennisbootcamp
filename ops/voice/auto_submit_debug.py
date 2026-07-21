"""Debug version — logs every keystroke it sees to a file."""
import time
import keyboard

log = open("C:/Users/farib/AppData/Local/Temp/auto-submit-debug.txt", "w")
log.write("started\n")
log.flush()

def on_key(event):
    if event.event_type == keyboard.KEY_DOWN:
        log.write(f"{time.time():.2f} key={event.name}\n")
        log.flush()

keyboard.hook(on_key)
log.write("hook installed\n")
log.flush()

while True:
    time.sleep(1)
