import os
import shutil
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

brain_dir = r"C:\Users\Ammar\.gemini\antigravity-ide\brain\5c5fe192-a9d9-4005-a8dc-d2350c5f1e49"
pos_regular = os.path.join(brain_dir, "pos_regular_machine_1791978582539.jpg")
pos_handheld = os.path.join(brain_dir, "pos_handheld_pos_1791978619595.jpg")
pos_counter = os.path.join(brain_dir, "pos_counter_terminal_1791978643042.jpg")

hd_screenshots_dir = r"frontend\public\assets\screenshots"
mobile_pos_path = os.path.join(hd_screenshots_dir, "mobile-pos.png")
mobile_dash_path = os.path.join(hd_screenshots_dir, "mobile-dashboard.png")
web_pos_path = os.path.join(hd_screenshots_dir, "web-pos.png")
web_dash_path = os.path.join(hd_screenshots_dir, "web-dashboard.png")

target_dirs = [
    r"frontend\public\assets\images",
    r"frontend\assets\images",
    r"frontend\dist\assets\images",
]

def save_to_all_targets(img, filename):
    for tdir in target_dirs:
        os.makedirs(tdir, exist_ok=True)
        dest = os.path.join(tdir, filename)
        if filename.lower().endswith(".jpg") or filename.lower().endswith(".jpeg"):
            img.convert("RGB").save(dest, "JPEG", quality=95, optimize=True)
        else:
            img.save(dest, "PNG", optimize=True)
    print(f"Saved: {filename} ({img.size})")

# 1. Product 1 & 2: Regular & Bada Billing Machine
im_reg = Image.open(pos_regular).convert("RGB")
save_to_all_targets(im_reg, "1.jpeg")
save_to_all_targets(im_reg, "2.jpeg")

# 2. Product 6: Handheld Touch POS (Z91)
im_hand = Image.open(pos_handheld).convert("RGB")
save_to_all_targets(im_hand, "6.jpeg")

# 3. Product 7, 8, 9: Counter POS Terminals
im_counter = Image.open(pos_counter).convert("RGB")
save_to_all_targets(im_counter, "7.jpeg")
save_to_all_targets(im_counter, "8.jpeg")
save_to_all_targets(im_counter, "9.jpeg")

# 4. Hero Banner Photos
save_to_all_targets(im_counter, "baner_photo_.jpeg")
save_to_all_targets(im_counter, "banner-img.jpg")

# 5. Product 18: Android POS App Mockup using our actual mobile HD screenshot
def make_mobile_software_mockup():
    canvas = Image.new("RGB", (1600, 1600), (248, 250, 252))
    draw = ImageDraw.Draw(canvas)
    
    # Phone body
    phone_w, phone_h = 750, 1450
    phone_x = (1600 - phone_w) // 2
    phone_y = (1600 - phone_h) // 2
    
    # Drop shadow
    shadow = Image.new("RGBA", (1600, 1600), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_draw.rounded_rectangle(
        [phone_x + 10, phone_y + 20, phone_x + phone_w + 10, phone_y + phone_h + 20],
        radius=50,
        fill=(15, 23, 42, 70)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(30))
    canvas.paste(shadow, (0, 0), shadow)
    
    # Phone outer frame
    draw.rounded_rectangle(
        [phone_x, phone_y, phone_x + phone_w, phone_y + phone_h],
        radius=50,
        fill=(15, 23, 42),
        outline=(51, 65, 85),
        width=6
    )
    
    # Screen inner area
    scr_pad = 20
    scr_x = phone_x + scr_pad
    scr_y = phone_y + scr_pad
    scr_w = phone_w - (scr_pad * 2)
    scr_h = phone_h - (scr_pad * 2)
    
    # Paste actual mobile-pos screenshot
    mob_img = Image.open(mobile_pos_path).convert("RGBA")
    mob_resized = mob_img.resize((scr_w, scr_h), Image.Resampling.LANCZOS)
    canvas.paste(mob_resized, (scr_x, scr_y))
    
    # Dynamic Island / Camera punch-hole
    cam_w, cam_h = 160, 36
    cam_x = scr_x + (scr_w - cam_w) // 2
    cam_y = scr_y + 12
    draw.rounded_rectangle([cam_x, cam_y, cam_x + cam_w, cam_y + cam_h], radius=18, fill=(0, 0, 0))
    
    # Add subtle EzBill App floating badge
    badge_w, badge_h = 420, 70
    bx = (1600 - badge_w) // 2
    by = 70
    draw.rounded_rectangle([bx, by, bx + badge_w, by + badge_h], radius=35, fill=(255, 94, 43))
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 30)
    except:
        font = ImageFont.load_default()
    draw.text((bx + 35, by + 18), "EzBill Android POS App", fill=(255, 255, 255), font=font)
    
    save_to_all_targets(canvas, "18.jpeg")

make_mobile_software_mockup()

# 6. Product 5: Desktop & Cloud ERP Suite Mockup using our actual web HD screenshot
def make_desktop_software_mockup():
    canvas = Image.new("RGB", (1600, 1600), (248, 250, 252))
    draw = ImageDraw.Draw(canvas)
    
    # Monitor frame
    mon_w, mon_h = 1380, 880
    mon_x = (1600 - mon_w) // 2
    mon_y = 200
    
    # Drop shadow
    shadow = Image.new("RGBA", (1600, 1600), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_draw.rounded_rectangle(
        [mon_x + 10, mon_y + 20, mon_x + mon_w + 10, mon_y + mon_h + 20],
        radius=24,
        fill=(15, 23, 42, 60)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(30))
    canvas.paste(shadow, (0, 0), shadow)
    
    # Monitor stand
    stand_base_w = 420
    stand_base_h = 30
    sb_x = (1600 - stand_base_w) // 2
    sb_y = mon_y + mon_h + 160
    draw.rounded_rectangle([sb_x, sb_y, sb_x + stand_base_w, sb_y + stand_base_h], radius=15, fill=(148, 163, 184))
    
    neck_w = 120
    neck_h = 170
    nx = (1600 - neck_w) // 2
    ny = mon_y + mon_h
    draw.rectangle([nx, ny, nx + neck_w, ny + neck_h], fill=(203, 213, 225))
    
    # Monitor bezel
    draw.rounded_rectangle(
        [mon_x, mon_y, mon_x + mon_w, mon_y + mon_h],
        radius=20,
        fill=(15, 23, 42),
        outline=(51, 65, 85),
        width=5
    )
    
    # Browser window title bar
    bar_h = 44
    draw.rounded_rectangle(
        [mon_x + 8, mon_y + 8, mon_x + mon_w - 8, mon_y + 8 + bar_h],
        radius=10,
        fill=(30, 41, 59)
    )
    # Window dots
    draw.ellipse([mon_x + 25, mon_y + 22, mon_x + 41, mon_y + 38], fill=(239, 68, 68))
    draw.ellipse([mon_x + 49, mon_y + 22, mon_x + 65, mon_y + 38], fill=(245, 158, 11))
    draw.ellipse([mon_x + 73, mon_y + 22, mon_x + 89, mon_y + 38], fill=(16, 185, 129))
    
    # URL bar
    url_x = mon_x + 120
    url_w = mon_w - 240
    draw.rounded_rectangle([url_x, mon_y + 14, url_x + url_w, mon_y + 46], radius=8, fill=(15, 23, 42))
    try:
        font_sm = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 20)
    except:
        font_sm = ImageFont.load_default()
    draw.text((url_x + 20, mon_y + 18), "ezbill.jobsio.in / cloud-erp-dashboard", fill=(148, 163, 184), font=font_sm)
    
    # Paste web-pos screenshot inside display
    scr_x = mon_x + 8
    scr_y = mon_y + 8 + bar_h
    scr_w = mon_w - 16
    scr_h = mon_h - 16 - bar_h
    
    web_img = Image.open(web_pos_path).convert("RGBA")
    web_resized = web_img.resize((scr_w, scr_h), Image.Resampling.LANCZOS)
    canvas.paste(web_resized, (scr_x, scr_y))
    
    # Clean Title Tag
    try:
        font_lg = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 32)
    except:
        font_lg = ImageFont.load_default()
    draw.text((100, 80), "EzBill Desktop & Cloud ERP Suite", fill=(15, 23, 42), font=font_lg)
    
    save_to_all_targets(canvas, "5.jpeg")

make_desktop_software_mockup()

# 7. Hardware Printers & Paper Rolls: Clean out competitor header and footer
hardware_items = [
    ("3.jpeg", 300, 1280),
    ("4.jpeg", 250, 750),
    ("10.jpeg", 300, 1280),
    ("11.jpeg", 300, 1280),
    ("12.jpeg", 300, 1280),
    ("13.jpeg", 260, 760),
    ("14.jpeg", 300, 1260),
    ("15.jpeg", 250, 750),
    ("16.jpeg", 250, 750),
    ("17.jpeg", 250, 750),
]

orig_src_dir = r"frontend\public\assets\images"

for fn, top_clean, bot_clean in hardware_items:
    orig_path = os.path.join(orig_src_dir, fn)
    if not os.path.exists(orig_path):
        continue
    
    im = Image.open(orig_path).convert("RGB")
    w, h = im.size
    
    # Fill the top area containing the competitor banner with pure white (255, 255, 255)
    clean_top_h = int(h * (top_clean / (1600 if h > 1200 else 1080)))
    clean_bot_y = int(h * (bot_clean / (1600 if h > 1200 else 1080)))
    
    draw = ImageDraw.Draw(im)
    draw.rectangle([0, 0, w, clean_top_h], fill=(255, 255, 255))
    draw.rectangle([0, clean_bot_y, w, h], fill=(255, 255, 255))
    
    # Add clean, professional "EZBILL HARDWARE" badge in top corner
    badge_w, badge_h = int(w * 0.28), int(h * 0.045)
    draw.rounded_rectangle([30, 30, 30 + badge_w, 30 + badge_h], radius=10, fill=(248, 250, 252), outline=(226, 232, 240), width=2)
    try:
        font_b = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", int(h * 0.022))
    except:
        font_b = ImageFont.load_default()
    draw.text((45, 38), "EzBill Genuine POS", fill=(255, 94, 43), font=font_b)
    
    save_to_all_targets(im, fn)

print("All 18 product images successfully processed and cleaned!")
