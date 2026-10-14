import os
import shutil
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

# Directories
orig_dir = r"scratch\orig_images"
hd_screenshots_dir = r"frontend\public\assets\screenshots"
mobile_pos_path = os.path.join(hd_screenshots_dir, "mobile-pos.png")
mobile_dash_path = os.path.join(hd_screenshots_dir, "mobile-dashboard.png")
web_pos_path = os.path.join(hd_screenshots_dir, "web-pos.png")
web_dash_path = os.path.join(hd_screenshots_dir, "web-dashboard.png")

brain_dir = r"C:\Users\Ammar\.gemini\antigravity-ide\brain\5c5fe192-a9d9-4005-a8dc-d2350c5f1e49"
pos_regular = os.path.join(brain_dir, "pos_regular_machine_1791978582539.jpg")
pos_handheld = os.path.join(brain_dir, "pos_handheld_pos_1791978619595.jpg")
pos_counter = os.path.join(brain_dir, "pos_counter_terminal_1791978643042.jpg")

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

def make_round_badge(radius=150, text="EzBill", sub="POS & BILLING"):
    size = radius * 2
    badge = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(badge)
    
    # Outer chrome ring
    draw.ellipse([2, 2, size - 2, size - 2], fill=(240, 243, 248), outline=(203, 213, 225), width=int(radius * 0.05))
    # Inner white circle
    pad = int(radius * 0.08)
    draw.ellipse([pad, pad, size - pad, size - pad], fill=(255, 255, 255), outline=(226, 232, 240), width=int(radius * 0.02))
    
    # Text
    f_main_size = int(radius * 0.44)
    f_sub_size = int(radius * 0.17)
    try:
        font_main = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", f_main_size)
        font_sub = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", f_sub_size)
    except:
        font_main = ImageFont.load_default()
        font_sub = ImageFont.load_default()
        
    # Draw "EzBill"
    w_ez = draw.textlength("Ez", font=font_main)
    w_bill = draw.textlength("Bill", font=font_main)
    total_w = w_ez + w_bill
    x_start = (size - total_w) / 2
    y_main = size * 0.28
    draw.text((x_start, y_main), "Ez", fill=(255, 94, 43), font=font_main)
    draw.text((x_start + w_ez, y_main), "Bill", fill=(15, 23, 42), font=font_main)
    
    # Sub text
    w_sub = draw.textlength(sub, font=font_sub)
    draw.text(((size - w_sub) / 2, size * 0.60), sub, fill=(100, 116, 139), font=font_sub)
    
    return badge

def make_pill_badge(width=280, height=120, text="EzBill", sub="POS"):
    badge = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(badge)
    r = height // 2
    draw.rounded_rectangle([2, 2, width - 2, height - 2], radius=r, fill=(255, 255, 255), outline=(203, 213, 225), width=3)
    
    f_size = int(height * 0.45)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", f_size)
    except:
        font = ImageFont.load_default()
        
    w_ez = draw.textlength("Ez", font=font)
    w_bill = draw.textlength("Bill", font=font)
    total_w = w_ez + w_bill
    x_start = (width - total_w) / 2
    y = int(height * 0.22)
    draw.text((x_start, y), "Ez", fill=(255, 94, 43), font=font)
    draw.text((x_start + w_ez, y), "Bill", fill=(15, 23, 42), font=font)
    return badge

def add_header_banner(im, title, subtitle="by ProDevOpz · Genuine Certified POS"):
    w, h = im.size
    draw = ImageDraw.Draw(im)
    
    # Top brand bar
    bar_h = int(h * 0.12)
    draw.rectangle([0, 0, w, bar_h], fill=(255, 255, 255))
    
    # Bottom guarantee bar - clean up from 85% to 100% to erase any competitor slogan
    bot_y = int(h * 0.85)
    draw.rectangle([0, bot_y, w, h], fill=(255, 255, 255))
    
    try:
        font_logo = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", int(h * 0.040))
        font_title = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", int(h * 0.030))
        font_sub = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", int(h * 0.019))
        font_bot = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", int(h * 0.021))
    except:
        font_logo = font_title = font_sub = font_bot = ImageFont.load_default()
        
    # Top Left Brand Tag: Ez (Orange) Bill (Slate)
    margin_x = int(w * 0.04)
    y_top = int(h * 0.025)
    draw.text((margin_x, y_top), "Ez", fill=(255, 94, 43), font=font_logo)
    w_ez = draw.textlength("Ez", font=font_logo)
    draw.text((margin_x + w_ez, y_top), "Bill", fill=(15, 23, 42), font=font_logo)
    w_bill = draw.textlength("Bill", font=font_logo)
    
    # Subtitle under EzBill
    draw.text((margin_x, y_top + int(h * 0.045)), "by ProDevOpz", fill=(100, 116, 139), font=font_sub)
    
    # Product Title in Top Center/Right
    w_title = draw.textlength(title, font=font_title)
    draw.text((w - w_title - margin_x, y_top + int(h * 0.008)), title, fill=(15, 23, 42), font=font_title)
    
    # Verified hardware badge next to title
    badge_txt = "GENUINE HARDWARE · 1-YEAR ON-SITE WARRANTY"
    w_btag = draw.textlength(badge_txt, font=font_sub)
    draw.text((w - w_btag - margin_x, y_top + int(h * 0.045)), badge_txt, fill=(16, 185, 129), font=font_sub)
    
    # Subtle separator line
    draw.line([margin_x, bar_h - 2, w - margin_x, bar_h - 2], fill=(226, 232, 240), width=2)
    
    # Bottom guarantee line
    guarantee_txt = "Official EzBill POS Hardware by ProDevOpz  |  Pan-India Express Delivery & Setup Support"
    w_g = draw.textlength(guarantee_txt, font=font_bot)
    draw.text(((w - w_g) // 2, h - int((h - bot_y) * 0.55)), guarantee_txt, fill=(100, 116, 139), font=font_bot)
    draw.line([margin_x, bot_y + 4, w - margin_x, bot_y + 4], fill=(226, 232, 240), width=2)

print("Starting generation of all 18 EzBill product images...")

# ================= 1. Product 1 & 2: Regular & Bada Billing Machine =================
im_reg = Image.open(pos_regular).convert("RGB")
add_header_banner(im_reg, "Regular 2-Inch Billing Machine")
save_to_all_targets(im_reg, "1.jpeg")

im_bada = Image.open(pos_regular).convert("RGB")
add_header_banner(im_bada, "Bada Heavy-Duty Billing Machine")
save_to_all_targets(im_bada, "2.jpeg")

# ================= 2. Product 6: Handheld Touch POS Terminal (Z91) =================
im_hand = Image.open(pos_handheld).convert("RGB")
add_header_banner(im_hand, "Z91 Smart Touch Mobile POS")
save_to_all_targets(im_hand, "6.jpeg")

# ================= 3. Product 7, 8, 9: Countertop POS Terminals =================
im_c7 = Image.open(pos_counter).convert("RGB")
add_header_banner(im_c7, "PS80 8-Inch Android Counter POS")
save_to_all_targets(im_c7, "7.jpeg")

im_c8 = Image.open(pos_counter).convert("RGB")
add_header_banner(im_c8, "PS11 Dual-Display POS Terminal")
save_to_all_targets(im_c8, "8.jpeg")

im_c9 = Image.open(pos_counter).convert("RGB")
add_header_banner(im_c9, "95A 15.6-Inch Flagship Counter POS")
save_to_all_targets(im_c9, "9.jpeg")

# Hero banners
save_to_all_targets(im_c9, "baner_photo_.jpeg")
save_to_all_targets(im_c9, "banner-img.jpg")

# ================= 4. Product 18: Android POS App Mockup =================
def make_mobile_software_mockup():
    canvas = Image.new("RGB", (1600, 1600), (248, 250, 252))
    draw = ImageDraw.Draw(canvas)
    
    # Phone body
    phone_w, phone_h = 750, 1420
    phone_x = (1600 - phone_w) // 2
    phone_y = 120
    
    # Drop shadow
    shadow = Image.new("RGBA", (1600, 1600), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_draw.rounded_rectangle(
        [phone_x + 10, phone_y + 20, phone_x + phone_w + 10, phone_y + phone_h + 20],
        radius=50,
        fill=(15, 23, 42, 60)
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
    scr_pad = 18
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
    
    # EzBill App Floating Header Badge
    badge_w, badge_h = 580, 72
    bx = (1600 - badge_w) // 2
    by = 30
    draw.rounded_rectangle([bx, by, bx + badge_w, by + badge_h], radius=36, fill=(255, 94, 43))
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 32)
    except:
        font = ImageFont.load_default()
    draw.text((bx + 40, by + 16), "EzBill Android POS App", fill=(255, 255, 255), font=font)
    
    try:
        font_sub = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 22)
    except:
        font_sub = ImageFont.load_default()
    draw.text((bx + 380, by + 23), "by ProDevOpz", fill=(255, 237, 213), font=font_sub)
    
    save_to_all_targets(canvas, "18.jpeg")

make_mobile_software_mockup()

# ================= 5. Product 5: Desktop & Cloud ERP Suite =================
def make_desktop_software_mockup():
    canvas = Image.new("RGB", (1600, 1600), (248, 250, 252))
    draw = ImageDraw.Draw(canvas)
    
    # Monitor frame
    mon_w, mon_h = 1380, 880
    mon_x = (1600 - mon_w) // 2
    mon_y = 180
    
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
    
    # URL bar with ProDevOpz EzBill address
    url_x = mon_x + 120
    url_w = mon_w - 240
    draw.rounded_rectangle([url_x, mon_y + 14, url_x + url_w, mon_y + 46], radius=8, fill=(15, 23, 42))
    try:
        font_sm = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 20)
    except:
        font_sm = ImageFont.load_default()
    draw.text((url_x + 20, mon_y + 18), "ezbill.prodevopz.com / pos-billing-suite", fill=(148, 163, 184), font=font_sm)
    
    # Paste web-pos screenshot inside display
    scr_x = mon_x + 8
    scr_y = mon_y + 8 + bar_h
    scr_w = mon_w - 16
    scr_h = mon_h - 16 - bar_h
    
    web_img = Image.open(web_pos_path).convert("RGBA")
    web_resized = web_img.resize((scr_w, scr_h), Image.Resampling.LANCZOS)
    canvas.paste(web_resized, (scr_x, scr_y))
    
    # Top Branding Header
    try:
        font_lg = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 40)
        font_sub = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 24)
    except:
        font_lg = font_sub = ImageFont.load_default()
        
    draw.text((110, 60), "EzBill Desktop & Cloud ERP Suite", fill=(15, 23, 42), font=font_lg)
    draw.text((112, 115), "by ProDevOpz  |  Complete Restaurant & Retail Management", fill=(100, 116, 139), font=font_sub)
    
    save_to_all_targets(canvas, "5.jpeg")

make_desktop_software_mockup()

# ================= 6. Product 3: 3-Inch Setup =================
# Original 3.jpeg has ezyBills circle sticker on printer (center ~ 315, 825) and phone in center
im3 = Image.open(os.path.join(orig_dir, "3.jpeg")).convert("RGBA")
w3, h3 = im3.size

# Overwrite printer sticker with EzBill Badge
b3 = make_round_badge(radius=145, text="EzBill", sub="POS & BILLING")
im3.paste(b3, (170, 680), b3)

# Replace phone screen with our actual mobile-pos screenshot
mob3 = Image.open(mobile_pos_path).convert("RGBA")
# Target phone screen in 3.jpeg: x: 675 to 1125, y: 395 to 1320 (width 450, height 925)
mob3_resized = mob3.resize((450, 925), Image.Resampling.LANCZOS)
im3.paste(mob3_resized, (675, 395))

# Add clean EzBill & ProDevOpz header and footer
im3_rgb = im3.convert("RGB")
add_header_banner(im3_rgb, "EzBill 3-Inch Wide Billing Setup")
save_to_all_targets(im3_rgb, "3.jpeg")

# ================= 7. Product 4: 2in1 Label & Barcode Printer =================
im4 = Image.open(os.path.join(orig_dir, "4.jpeg")).convert("RGB")
add_header_banner(im4, "EzBill 2in1 Label & Barcode Printer")
save_to_all_targets(im4, "4.jpeg")

# ================= 8. Product 10: Regular 2-Inch Bluetooth Printer =================
im10 = Image.open(os.path.join(orig_dir, "10.jpeg")).convert("RGBA")
# Center of sticker in 10.jpeg: (800, 600), radius ~145
b10 = make_round_badge(radius=150, text="EzBill", sub="MOBILE POS")
im10.paste(b10, (650, 450), b10)
im10_rgb = im10.convert("RGB")
add_header_banner(im10_rgb, "EzBill Regular 2-Inch Bluetooth Printer")
save_to_all_targets(im10_rgb, "10.jpeg")

# ================= 9. Product 11: Bada 2-Inch Counter Printer =================
im11 = Image.open(os.path.join(orig_dir, "11.jpeg")).convert("RGBA")
# Center of sticker in 11.jpeg: (750, 750), radius ~140
b11 = make_round_badge(radius=145, text="EzBill", sub="2-INCH POS")
im11.paste(b11, (605, 605), b11)
im11_rgb = im11.convert("RGB")
add_header_banner(im11_rgb, "EzBill Heavy-Duty 2-Inch Counter Printer")
save_to_all_targets(im11_rgb, "11.jpeg")

# ================= 10. Product 12: Bada 3-Inch Thermal Printer =================
im12 = Image.open(os.path.join(orig_dir, "12.jpeg")).convert("RGBA")
# Center of sticker in 12.jpeg: (730, 620), radius ~140
b12 = make_round_badge(radius=145, text="EzBill", sub="80MM POS")
im12.paste(b12, (585, 475), b12)
im12_rgb = im12.convert("RGB")
add_header_banner(im12_rgb, "EzBill 3-Inch Wide (80mm) Receipt Printer")
save_to_all_targets(im12_rgb, "12.jpeg")

# ================= 11. Product 13: SRS710 Auto-Cut Printer =================
im13 = Image.open(os.path.join(orig_dir, "13.jpeg")).convert("RGBA")
# Pill sticker center in 13.jpeg: (480, 420), width ~240, height ~100
p13 = make_pill_badge(width=250, height=105, text="EzBill", sub="SRS710")
im13.paste(p13, (355, 368), p13)
im13_rgb = im13.convert("RGB")
add_header_banner(im13_rgb, "EzBill SRS710 High-Speed Auto-Cut Printer")
save_to_all_targets(im13_rgb, "13.jpeg")

# ================= 12. Product 14: 57mm Thermal Paper Rolls =================
im14 = Image.open(os.path.join(orig_dir, "14.jpeg")).convert("RGB")
add_header_banner(im14, "EzBill 57mm Thermal Paper Rolls (Pack)")
save_to_all_targets(im14, "14.jpeg")

# ================= 13. Product 15: 80mm Heavy-Duty Paper Rolls =================
im15 = Image.open(os.path.join(orig_dir, "15.jpeg")).convert("RGB")
add_header_banner(im15, "EzBill 80mm Heavy-Duty Paper Rolls (Pack)")
save_to_all_targets(im15, "15.jpeg")

# ================= 14. Product 16: Barcode Stickers 50x25 mm =================
im16 = Image.open(os.path.join(orig_dir, "16.jpeg")).convert("RGB")
add_header_banner(im16, "EzBill Direct Thermal Barcode Stickers (50×25)")
save_to_all_targets(im16, "16.jpeg")

# ================= 15. Product 17: Barcode Stickers 50x50 mm =================
im17 = Image.open(os.path.join(orig_dir, "17.jpeg")).convert("RGB")
add_header_banner(im17, "EzBill Square Product Stickers (50×50)")
save_to_all_targets(im17, "17.jpeg")

print("SUCCESS: All 18 EzBill products generated with exact ProDevOpz branding!")
