import os
import subprocess
import time
from PIL import Image

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE_URL = "http://localhost:4173"
OUT_DIR = os.path.abspath("screenshots")
REPORT_OUT_DIR = os.path.abspath("TeddyRanks_Report/screenshots")

os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(REPORT_OUT_DIR, exist_ok=True)

def take_shot(url, filename, window_size="1440,900", virtual_time=4000):
    filepath = os.path.join(OUT_DIR, filename)
    cmd = [
        CHROME_PATH,
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        f"--window-size={window_size}",
        f"--virtual-time-budget={virtual_time}",
        f"--screenshot={filepath}",
        url
    ]
    print(f"Capturing {filename} from {url} (size={window_size})...")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if os.path.exists(filepath):
        print(f"  -> Success: {filename} ({os.path.getsize(filepath)} bytes)")
        # Copy to TeddyRanks_Report/screenshots too
        rep_filepath = os.path.join(REPORT_OUT_DIR, filename)
        with open(filepath, "rb") as fsrc, open(rep_filepath, "wb") as fdst:
            fdst.write(fsrc.read())
        return filepath
    else:
        print(f"  -> FAILED: {filename}. Stderr: {res.stderr}")
        return None

# 1. 01_landing_hero.png - Home Dashboard Hero
take_shot(f"{BASE_URL}/", "01_landing_hero.png", window_size="1440,900")

# 2. 02_dashboard_kpis.png - Dashboard KPI Cards
# In a taller view (1440, 1100), crop the KPI area
f2 = take_shot(f"{BASE_URL}/", "temp_kpis.png", window_size="1440,1100")
if f2 and os.path.exists(f2):
    img = Image.open(f2)
    # Crop around the KPI cards area: x: 80 to 1360, y: 150 to 450
    w, h = img.size
    crop_box = (80, 130, w - 80, min(h, 440))
    cropped = img.crop(crop_box)
    cropped.save(os.path.join(OUT_DIR, "02_dashboard_kpis.png"))
    cropped.save(os.path.join(REPORT_OUT_DIR, "02_dashboard_kpis.png"))
    print("  -> Cropped 02_dashboard_kpis.png successfully")

# 3. 03_batch_distribution.png - Batch Distribution and URL hygiene
f3 = take_shot(f"{BASE_URL}/", "temp_batch.png", window_size="1440,1600")
if f3 and os.path.exists(f3):
    img = Image.open(f3)
    w, h = img.size
    # Crop the batch distribution cards and URL breakdown section
    crop_box = (80, 420, w - 80, min(h, 850))
    cropped = img.crop(crop_box)
    cropped.save(os.path.join(OUT_DIR, "03_batch_distribution.png"))
    cropped.save(os.path.join(REPORT_OUT_DIR, "03_batch_distribution.png"))
    print("  -> Cropped 03_batch_distribution.png successfully")

# 4. 04_top_standings.png - Top 10 Overall and Standings
f4 = take_shot(f"{BASE_URL}/", "temp_standings.png", window_size="1440,2200")
if f4 and os.path.exists(f4):
    img = Image.open(f4)
    w, h = img.size
    # Crop the top standings table
    crop_box = (80, 830, w - 80, min(h, 1750))
    cropped = img.crop(crop_box)
    cropped.save(os.path.join(OUT_DIR, "04_top_standings.png"))
    cropped.save(os.path.join(REPORT_OUT_DIR, "04_top_standings.png"))
    print("  -> Cropped 04_top_standings.png successfully")

# 5. 05_leaderboard_all.png - Complete Student Leaderboard
take_shot(f"{BASE_URL}/leaderboards", "05_leaderboard_all.png", window_size="1440,1050")

# 6. 06_leaderboard_filter.png - Filtered Leaderboard (e.g. batch filter or search)
take_shot(f"{BASE_URL}/leaderboards?batch=II+Year&minScore=70", "06_leaderboard_filter.png", window_size="1440,1050")

# 7. 07_student_profile.png - Student Profile
# Let's check Top student 25B11CS043 or Padala 25B11CS692
take_shot(f"{BASE_URL}/student/25B11CS043", "07_student_profile.png", window_size="1440,1100")

# 8. 08_methodology_page.png - Scoring Methodology Page
take_shot(f"{BASE_URL}/methodology", "08_methodology_page.png", window_size="1440,1050")

# 9. 09_admin_panel.png - Admin Control Center
take_shot(f"{BASE_URL}/admin", "09_admin_panel.png", window_size="1440,1100")

# Clean up temp files
for temp in ["temp_kpis.png", "temp_batch.png", "temp_standings.png"]:
    tp = os.path.join(OUT_DIR, temp)
    if os.path.exists(tp):
        os.remove(tp)

print("All screenshots generated successfully!")
