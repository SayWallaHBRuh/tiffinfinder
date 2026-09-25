# Testing qr.js against a reference QR encoder

`qr.js` (in the site root) is a from-scratch QR Code encoder used by
`poster.html` to draw each kitchen's QR code. `tools/test_qr.py` proves it
correct by comparing it, module for module, against Project Nayuki's
well-known QR Code generator (MIT licence):
<https://github.com/nayuki/QR-Code-generator>.

That reference implementation is **never** downloaded into this repo or
shipped with the site — it's a test-only dependency you fetch yourself,
into a folder outside this repo, and point the test at.

## Re-running the check

1. Download `python/qrcodegen.py` from the link above into any folder
   outside this repo, for example:

   ```
   curl -o C:\some\temp\folder\qrcodegen.py ^
     https://raw.githubusercontent.com/nayuki/QR-Code-generator/master/python/qrcodegen.py
   ```

2. Run the test, pointing `--reference` at that file (or its folder):

   ```
   python tools/test_qr.py --reference "C:\some\temp\folder\qrcodegen.py"
   ```

   It needs Node.js to run `qr.js` itself (`tools/qr_node_runner.js`
   drives it). By default it looks for `node.exe` at the path noted in
   `TIFFIN-FINDER-HANDOFF.md`; pass `--node "C:\path\to\node.exe"` or set
   the `QR_TEST_NODE` environment variable if yours is somewhere else.

3. It builds a batch of 100+ inputs — every sample kitchen's own
   `?k=<slug>&solo=1` link, byte lengths right at each QR version's
   capacity boundary (levels M, versions 1-10), and a handful of random
   ASCII/UTF-8 strings — and checks two things for every one of them:
   - **Automatic mode**: `qr.js`'s own version + mask choice matches the
     reference's, and the module matrices are bit-identical.
   - **Forced mode**: with each of the 8 mask patterns forced on both
     sides, the module matrices are bit-identical.

   It exits 0 and prints `PASS` only if every one of those comparisons
   matched exactly; otherwise it exits 1 and lists exactly what
   differed.

Delete the downloaded `qrcodegen.py` (or its folder) when you're done —
it isn't needed again until you want to re-run this check, e.g. after
changing `qr.js`.
