import os
from PIL import Image, ImageFilter, ImageEnhance

# Directories
target_dirs = [
    r"frontend\public\assets\screenshots",
    r"frontend\public\assets\images\screenshots",
    r"frontend\assets\images\screenshots",
]

# Source directory containing the original uploads
source_dir = r"C:\Users\Ammar\.gemini\antigravity-ide\brain\77d30a2e-8c35-4baa-9b34-095eb85568ee\.user_uploaded"

# Mapping from source file to final filename and scale factor
files_map = {
    # Web Screenshots (2x upscale to 2048px width)
    "media_1791954164406.png": ("web-printers.png", 2.0),
    "media_1791954198022.png": ("web-tables.png", 2.0),
    "media_1791954198088.png": ("web-kds.png", 2.0),
    "media_1791954198148.png": ("web-dashboard.png", 2.0),
    "media_1791954198176.png": ("web-pos.png", 2.0),
    
    # Mobile Screenshots (3x upscale to ~1110x2440px Retina HD)
    "media_1791954262369.png": ("mobile-dashboard.png", 3.0),
    "media_1791954279152.png": ("mobile-tables.png", 3.0),
    "media_1791954294738.png": ("mobile-pos.png", 3.0),
    "media_1791954306986.png": ("mobile-kds.png", 3.0),
    "media_1791954332089.png": ("mobile-analytics.png", 3.0),
}

for src_name, (dest_name, scale) in files_map.items():
    src_path = os.path.join(source_dir, src_name)
    if not os.path.exists(src_path):
        print(f"File not found: {src_path}")
        continue
    
    img = Image.open(src_path).convert("RGBA")
    orig_w, orig_h = img.size
    new_w = int(orig_w * scale)
    new_h = int(orig_h * scale)
    
    # High-quality Lanczos Resampling
    hd_img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # Text and line sharpening via Unsharp Mask
    hd_img = hd_img.filter(ImageFilter.UnsharpMask(radius=1.8, percent=140, threshold=2))
    
    # Subtle contrast and color fidelity enhancement
    rgb = hd_img.convert("RGB")
    enhancer_con = ImageEnhance.Contrast(rgb)
    rgb = enhancer_con.enhance(1.04)
    enhancer_col = ImageEnhance.Color(rgb)
    rgb = enhancer_col.enhance(1.02)
    
    # Put alpha back if needed
    if "A" in hd_img.getbands():
        r, g, b = rgb.split()
        a = hd_img.split()[3]
        final_img = Image.merge("RGBA", (r, g, b, a))
    else:
        final_img = rgb
    
    for tdir in target_dirs:
        os.makedirs(tdir, exist_ok=True)
        dest_path = os.path.join(tdir, dest_name)
        final_img.save(dest_path, "PNG", optimize=True)
        
    print(f"Processed HD {dest_name}: {orig_w}x{orig_h} -> {new_w}x{new_h} (Scale: {scale}x)")

print("All screenshots successfully upgraded to HD quality!")
