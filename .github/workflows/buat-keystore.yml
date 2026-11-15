name: Buat Keystore Debug (sekali saja)
on: workflow_dispatch
jobs:
  key:
    runs-on: ubuntu-latest
    steps:
      - name: Buat keystore dan tampilkan SHA-1
        run: |
          keytool -genkey -v -keystore netcheck-debug.keystore -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=Android Debug,O=Android,C=US"
          echo "=== SHA-1 (salin ini ke Firebase) ==="
          keytool -list -v -keystore netcheck-debug.keystore -storepass android | grep "SHA1:"
      - uses: actions/upload-artifact@v4
        with:
          name: netcheck-debug-keystore
          path: netcheck-debug.keystore
