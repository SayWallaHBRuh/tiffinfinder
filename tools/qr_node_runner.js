/* Test-only helper for tools/test_qr.py. Loads site/qr.js under Node and
   emits, for each requested input, the module matrix produced (a) with
   automatic mask selection and (b) with every mask 0-7 forced, so the
   Python harness can diff them against a reference encoder. Never
   shipped to the site; qr.js itself has no dependency on this file. */
'use strict';

var path = require('path');
var QR = require(path.join(__dirname, '..', 'qr.js'));

function matrixToRows(qr) {
  var rows = [];
  for (var r = 0; r < qr.size; r++) {
    var row = '';
    for (var c = 0; c < qr.size; c++) row += qr.isDark(r, c) ? '1' : '0';
    rows.push(row);
  }
  return rows;
}

// Rebuilds the encode() pipeline but stops short of auto-picking a mask,
// so a specific mask can be forced (mirrors QR.encode's internals via
// the _internal export; qr.js's public API only offers automatic mask
// selection, which is what actually ships).
function encodeWithForcedMask(bytes, maskIndex) {
  var I = QR._internal;
  var version = I.chooseVersion(bytes.length);
  if (version === -1) throw new Error('too long');
  var dataCodewords = I.buildDataCodewords(bytes, version);
  var allCodewords = I.interleaveCodewords(dataCodewords, version);
  var codewordBits = [];
  for (var i = 0; i < allCodewords.length; i++) {
    for (var b = 7; b >= 0; b--) codewordBits.push((allCodewords[i] >>> b) & 1);
  }
  var REMAINDER_BITS = [0, 7, 7, 7, 7, 7, 0, 0, 0, 0];
  var remainder = REMAINDER_BITS[version - 1];
  for (var rbi = 0; rbi < remainder; rbi++) codewordBits.push(0);

  var m = new I.Matrix(version);
  m.drawFinderPattern(0, 0);
  m.drawFinderPattern(m.size - 7, 0);
  m.drawFinderPattern(0, m.size - 7);
  m.drawTimingPatterns();
  m.drawAlignmentPatterns();
  m.reserveFormatInfo();
  m.reserveVersionInfo();
  m.placeData(codewordBits);
  m.applyMask(maskIndex);
  m.writeFormatInfo(maskIndex);
  m.writeVersionInfo();
  return { size: m.size, version: version, isDark: function (r, c) { return m.modules[r][c]; } };
}

function main() {
  var input = '';
  process.stdin.on('data', function (chunk) { input += chunk; });
  process.stdin.on('end', function () {
    var requests = JSON.parse(input); // [{id, bytes: [int,...]}]
    var results = [];
    for (var i = 0; i < requests.length; i++) {
      var req = requests[i];
      var bytes = new Uint8Array(req.bytes);
      var entry = { id: req.id };
      try {
        var auto = QR.encode(bytes);
        entry.auto = { version: auto.version, mask: auto.mask, size: auto.size, rows: matrixToRows(auto) };
      } catch (e) {
        entry.autoError = String(e && e.message || e);
      }
      entry.forced = {};
      for (var mk = 0; mk < 8; mk++) {
        try {
          var forced = encodeWithForcedMask(bytes, mk);
          entry.forced[mk] = { version: forced.version, size: forced.size, rows: matrixToRows(forced) };
        } catch (e2) {
          entry.forced[mk] = { error: String(e2 && e2.message || e2) };
        }
      }
      results.push(entry);
    }
    process.stdout.write(JSON.stringify(results));
  });
}

main();
