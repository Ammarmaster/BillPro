const fs = require('fs');
const path = require('path');

const dirs = [
  "@react-native-async-storage/async-storage/android/build/generated/source/codegen/jni",
  "react-native-webview/android/build/generated/source/codegen/jni",
  "react-native-worklets/android/build/generated/source/codegen/jni"
];

const nodeModulesDir = path.resolve(__dirname, '../node_modules');

dirs.forEach(d => {
  const fullPath = path.join(nodeModulesDir, d);
  try {
    fs.mkdirSync(fullPath, { recursive: true });
    const cmakeFile = path.join(fullPath, "CMakeLists.txt");
    if (!fs.existsSync(cmakeFile)) {
      fs.writeFileSync(cmakeFile, "# Dummy CMakeLists.txt\n");
      console.log(`Created dummy JNI directory: ${d}`);
    }
  } catch (err) {
    console.error(`Error creating dummy JNI directory for ${d}:`, err.message);
  }
});
