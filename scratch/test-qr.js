const QRCode = require('qrcode');

try {
  QRCode.toString('upi://pay?pa=8152075375-2@ybl&pn=Spice%20Garden&am=760', { type: 'svg' }, function (err, string) {
    if (err) throw err;
    console.log("Success! SVG length:", string.length);
    console.log("SVG preview:", string.substring(0, 150));
  });
} catch (e) {
  console.error("Error:", e);
}
