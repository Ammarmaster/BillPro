import os

# 1. Update pos-billing-software.html
pos_html_path = r"frontend\public\pos-billing-software.html"
with open(pos_html_path, "r", encoding="utf-8") as f:
    pos_content = f.read()

pos_content = pos_content.replace("917778880874", "918152075375")
pos_content = pos_content.replace("+91-7778880874", "+91-81520-75375")
pos_content = pos_content.replace("+91 77788 80874", "+91 81520 75375")

old_playstore = "https://play.google.com/store/apps/details?id=com.ezybills.definesoftware&hl=en_IN"
pos_content = pos_content.replace(old_playstore, "/ezbill-pos.apk")

footer_old = 'WhatsApp: +91 81520 75375</a>'
footer_new = 'WhatsApp: +91 81520 75375</a>\n        <a href="mailto:contactprodevopz@gmail.com">Email: contactprodevopz@gmail.com</a>'
if footer_old in pos_content and "contactprodevopz@gmail.com" not in pos_content:
    pos_content = pos_content.replace(footer_old, footer_new)

with open(pos_html_path, "w", encoding="utf-8") as f:
    f.write(pos_content)

dist_pos_path = r"frontend\dist\pos-billing-software.html"
with open(dist_pos_path, "w", encoding="utf-8") as f:
    f.write(pos_content)

print("Updated pos-billing-software.html in public and dist!")

# 2. Update +html.tsx
html_tsx_path = r"frontend\app\+html.tsx"
with open(html_tsx_path, "r", encoding="utf-8") as f:
    html_content = f.read()

html_content = html_content.replace("+91-7778880874", "+91-81520-75375")
html_content = html_content.replace("917778880874", "918152075375")
if '"email": "contactprodevopz@gmail.com"' not in html_content:
    html_content = html_content.replace(
        '"telephone": "+91-81520-75375",',
        '"telephone": "+91-81520-75375",\n                    "email": "contactprodevopz@gmail.com",'
    )

with open(html_tsx_path, "w", encoding="utf-8") as f:
    f.write(html_content)

print("Updated +html.tsx!")

# 3. Update index.tsx
index_path = r"frontend\app\index.tsx"
with open(index_path, "r", encoding="utf-8") as f:
    idx_content = f.read()

idx_content = idx_content.replace("917778880874", "918152075375")
idx_content = idx_content.replace("+91 77788 80874", "+91 81520 75375")
idx_content = idx_content.replace(old_playstore, "/ezbill-pos.apk")

# Add APK_DOWNLOAD_URL constant if not present
if "APK_DOWNLOAD_URL" not in idx_content:
    idx_content = idx_content.replace(
        'const WHATSAPP_BASE_URL = `https://api.whatsapp.com/send/?phone=${WHATSAPP_NUMBER}&text=`;',
        'const WHATSAPP_BASE_URL = `https://api.whatsapp.com/send/?phone=${WHATSAPP_NUMBER}&text=`;\nconst APK_DOWNLOAD_URL = "/ezbill-pos.apk";'
    )

# Add email link in footer
footer_wa = '<Text style={styles.footerLink}>WhatsApp: +91 81520 75375</Text>'
footer_email = '''<Text style={styles.footerLink}>WhatsApp: +91 81520 75375</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Linking.openURL("mailto:contactprodevopz@gmail.com")}>
                <Text style={styles.footerLink}>Email: contactprodevopz@gmail.com</Text>'''

if footer_wa in idx_content and "contactprodevopz@gmail.com" not in idx_content:
    idx_content = idx_content.replace(
        '<Text style={styles.footerLink}>WhatsApp: +91 81520 75375</Text>\n              </TouchableOpacity>',
        footer_email
    )

with open(index_path, "w", encoding="utf-8") as f:
    f.write(idx_content)

print("Updated index.tsx!")
