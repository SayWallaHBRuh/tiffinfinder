/* Tiffin Finder — qr.js
   A small, dependency-free QR Code encoder, written from scratch for the
   kitchen poster page (poster.html?k=<slug>). No libraries, no CDN, no
   network access — everything here is plain JavaScript implementing the
   public ISO/IEC 18004 QR Code algorithm.

   Scope, on purpose: byte mode only, error-correction level M, symbol
   versions 1-10 (up to 174 bytes). That easily covers every possible
   "https://tiffinfinder.ca/?k=<slug>&solo=1" link this site can produce,
   and keeps this file small. Version is chosen automatically (the
   smallest of 1-10 that fits); all 8 mask patterns are tried and scored
   with the standard penalty rules, and the best one is kept.

   Correctness: this file is checked codeword-for-codeword and module-for-
   module against Project Nayuki's reference QR Code generator by
   tools/test_qr.py (a test-only script; the reference implementation is
   never shipped — see tools/README-qr-test.md for how to re-run it).

   Exports on the global QR object:
     QR.encode(text)         -> { size, isDark(row, col) }
     QR.toSvg(text, options) -> an <svg> Element (built with
                                  createElementNS, no innerHTML)

   MIT-style: original code, do what you like with it, no warranty.
*/
'use strict';

var QR = (function () {

  /* ------------------------------------------------------------------
   * 1. Tables for error-correction level M, versions 1-10 only.
   *    These are plain facts from the QR Code standard (ISO/IEC 18004),
   *    not code copied from any implementation.
   * ------------------------------------------------------------------ */

  // Total data codewords available at level M, indexed by (version - 1).
  var DATA_CODEWORDS_M = [16, 28, 44, 64, 86, 108, 124, 154, 182, 216];

  // Error-correction codewords per RS block at level M.
  var ECC_PER_BLOCK_M = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];

  // Block layout at level M: [blocksInGroup1, dataLenGroup1,
  // blocksInGroup2, dataLenGroup2]. Group 2 is absent (zeros) when a
  // version's data codewords split into equal-sized blocks.
  var BLOCKS_M = [
    [1, 16, 0, 0],
    [1, 28, 0, 0],
    [1, 44, 0, 0],
    [2, 32, 0, 0],
    [2, 43, 0, 0],
    [4, 27, 0, 0],
    [4, 31, 0, 0],
    [2, 38, 2, 39],
    [3, 36, 2, 37],
    [4, 43, 1, 44]
  ];

  // Alignment-pattern centre-line coordinates, by version. Combined
  // pairwise (row x col) to give every alignment pattern's centre,
  // skipping the three combinations that would land on a finder pattern.
  var ALIGN_COORDS = [
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50]
  ];

  // Unused "remainder" bits appended after the last codeword, by version.
  var REMAINDER_BITS = [0, 7, 7, 7, 7, 7, 0, 0, 0, 0];

  // Format-info 2-bit error-correction-level indicator, per the spec's
  // (non-obvious) mapping. Level M is the only one this file ever uses.
  var ECC_LEVEL_M_BITS = 0x0; // "00"

  /* ------------------------------------------------------------------
   * 2. GF(256) arithmetic and Reed-Solomon error-correction coding.
   *    Primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D), the one
   *    QR Codes use, with generator element 2.
   * ------------------------------------------------------------------ */

  var GF_EXP = new Uint8Array(512); // exp[i] = 2^i in GF(256), doubled for easy wraparound
  var GF_LOG = new Uint8Array(256);

  (function buildGfTables() {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x = x << 1;
      if (x & 0x100) x ^= 0x11D;
    }
    for (var j = 255; j < 512; j++) GF_EXP[j] = GF_EXP[j - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  // Builds the Reed-Solomon generator polynomial of the given degree
  // (= number of ECC codewords): g(x) = (x - a^0)(x - a^1)...(x - a^(degree-1)),
  // as its `degree` non-leading coefficients (the leading x^degree
  // coefficient is always 1 and is left implicit), ordered from the
  // x^(degree-1) term down to the constant term — i.e. gen[i] is the
  // coefficient that lines up with remainder position i in rsEncode.
  function rsGeneratorPoly(degree) {
    var coeffs = [1]; // starts as the constant polynomial "1"
    for (var i = 0; i < degree; i++) {
      coeffs.push(0);
      // Multiply the running polynomial by (x - a^i); in GF(2^8),
      // subtraction is XOR, so this is (x + a^i). Coefficients here run
      // constant-term-first while building; reversed (minus the
      // implicit leading 1) below to get the order rsEncode wants.
      for (var j = coeffs.length - 1; j > 0; j--) {
        coeffs[j] = coeffs[j - 1] ^ gfMul(coeffs[j], GF_EXP[i]);
      }
      coeffs[0] = gfMul(coeffs[0], GF_EXP[i]);
    }
    coeffs.pop(); // drop the trailing implicit leading-term coefficient (always 1)
    coeffs.reverse();
    return coeffs; // length == degree
  }

  // Computes the Reed-Solomon ECC codewords for one block of data
  // codewords, via the standard systematic-encoder polynomial division
  // (an LFSR over GF(256)).
  function rsEncode(dataCodewords, eccLen) {
    var gen = rsGeneratorPoly(eccLen);
    var res = new Uint8Array(eccLen);
    for (var i = 0; i < dataCodewords.length; i++) {
      var factor = dataCodewords[i] ^ res[0];
      for (var j = 0; j < eccLen - 1; j++) res[j] = res[j + 1];
      res[eccLen - 1] = 0;
      if (factor !== 0) {
        for (var k = 0; k < eccLen; k++) {
          res[k] ^= gfMul(gen[k], factor);
        }
      }
    }
    return res;
  }

  /* ------------------------------------------------------------------
   * 3. BCH error-correction codes for the format-info and version-info
   *    bits (small fixed codes defined by the spec; computed here
   *    rather than hard-coding their lookup tables). Both are plain
   *    GF(2) polynomial long division: shift the data bits up by the
   *    generator's degree, then repeatedly XOR the generator (aligned to
   *    the current top bit) until only the remainder is left.
   * ------------------------------------------------------------------ */

  // Format info: 5 data bits (2 ECC-level bits + 3 mask-pattern bits),
  // BCH(15,5) with generator 0x537 (x^10+x^8+x^5+x^4+x^2+x+1), then
  // XORed with the fixed mask 0x5412 required by the spec.
  function formatInfoBits(eccLevelBits, maskIndex) {
    var data = (eccLevelBits << 3) | maskIndex; // 5 bits
    var shifted = data << 10;
    var rem = shifted;
    for (var i = 14; i >= 10; i--) {
      if (rem & (1 << i)) rem ^= 0x537 << (i - 10);
    }
    var full = shifted | rem; // 15 bits
    return full ^ 0x5412;
  }

  // Version info (versions 7-10 need it): 6 data bits (the version
  // number), BCH(18,6) with generator 0x1F25
  // (x^12+x^11+x^10+x^9+x^8+x^5+x^2+1), no extra mask.
  function versionInfoBits(version) {
    var shifted = version << 12;
    var rem = shifted;
    for (var i = 17; i >= 12; i--) {
      if (rem & (1 << i)) rem ^= 0x1F25 << (i - 12);
    }
    return shifted | rem; // 18 bits
  }

  /* ------------------------------------------------------------------
   * 4. Bit buffer and byte-mode data-segment encoding.
   * ------------------------------------------------------------------ */

  function BitBuffer() {
    this.bits = []; // array of 0/1, MSB-first append order
  }
  BitBuffer.prototype.appendBits = function (value, length) {
    for (var i = length - 1; i >= 0; i--) {
      this.bits.push((value >>> i) & 1);
    }
  };
  BitBuffer.prototype.appendBytes = function (bytes) {
    for (var i = 0; i < bytes.length; i++) this.appendBits(bytes[i], 8);
  };

  function charCountBits(version) {
    return version <= 9 ? 8 : 16; // byte mode; this file only reaches v10
  }

  // Picks the smallest version (1-10) whose level-M data capacity fits
  // a byte-mode segment of `byteLength` bytes (mode indicator +
  // character-count indicator + the data itself).
  function chooseVersion(byteLength) {
    for (var v = 1; v <= 10; v++) {
      var capacityBits = DATA_CODEWORDS_M[v - 1] * 8;
      var neededBits = 4 + charCountBits(v) + byteLength * 8;
      if (neededBits <= capacityBits) return v;
    }
    return -1; // caller reports "too long"
  }

  // Builds the final, padded data-codeword array (before RS coding) for
  // one byte-mode segment holding `bytes` at the given version.
  function buildDataCodewords(bytes, version) {
    var capacityBits = DATA_CODEWORDS_M[version - 1] * 8;
    var buf = new BitBuffer();
    buf.appendBits(0x4, 4); // byte-mode indicator
    buf.appendBits(bytes.length, charCountBits(version));
    buf.appendBytes(bytes);

    // Terminator: up to 4 zero bits, only as many as fit.
    var termLen = Math.min(4, capacityBits - buf.bits.length);
    if (termLen > 0) buf.appendBits(0, termLen);

    // Pad to a byte boundary.
    while (buf.bits.length % 8 !== 0) buf.bits.push(0);

    // Pad codewords, alternating 0xEC/0x11, until the version's data
    // capacity is filled.
    var padBytes = [0xEC, 0x11];
    var p = 0;
    while (buf.bits.length < capacityBits) {
      buf.appendBits(padBytes[p % 2], 8);
      p++;
    }

    var out = new Uint8Array(buf.bits.length / 8);
    for (var i = 0; i < out.length; i++) {
      var byte = 0;
      for (var b = 0; b < 8; b++) byte = (byte << 1) | buf.bits[i * 8 + b];
      out[i] = byte;
    }
    return out;
  }

  // Splits data codewords into RS blocks per BLOCKS_M, computes each
  // block's ECC codewords, and interleaves data then ECC as the spec
  // requires (Annex).
  function interleaveCodewords(dataCodewords, version) {
    var layout = BLOCKS_M[version - 1];
    var nb1 = layout[0], len1 = layout[1], nb2 = layout[2], len2 = layout[3];
    var eccLen = ECC_PER_BLOCK_M[version - 1];

    var blocks = [];
    var offset = 0;
    for (var i = 0; i < nb1; i++) {
      blocks.push(dataCodewords.subarray(offset, offset + len1));
      offset += len1;
    }
    for (var j = 0; j < nb2; j++) {
      blocks.push(dataCodewords.subarray(offset, offset + len2));
      offset += len2;
    }

    var eccBlocks = blocks.map(function (block) {
      return rsEncode(block, eccLen);
    });

    var out = [];
    var maxDataLen = Math.max(len1, len2 || len1);
    for (var d = 0; d < maxDataLen; d++) {
      for (var bi = 0; bi < blocks.length; bi++) {
        if (d < blocks[bi].length) out.push(blocks[bi][d]);
      }
    }
    for (var e = 0; e < eccLen; e++) {
      for (var bj = 0; bj < eccBlocks.length; bj++) {
        out.push(eccBlocks[bj][e]);
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------
   * 5. Module matrix: function patterns, data placement, masking.
   * ------------------------------------------------------------------ */

  function Matrix(version) {
    this.version = version;
    this.size = 17 + 4 * version;
    var n = this.size;
    this.modules = [];
    this.isFunction = [];
    for (var r = 0; r < n; r++) {
      this.modules.push(new Array(n).fill(false));
      this.isFunction.push(new Array(n).fill(false));
    }
  }
  Matrix.prototype.set = function (row, col, dark, isFn) {
    if (row < 0 || row >= this.size || col < 0 || col >= this.size) return;
    this.modules[row][col] = dark;
    if (isFn) this.isFunction[row][col] = true;
  };
  Matrix.prototype.get = function (row, col) {
    return this.modules[row][col];
  };

  Matrix.prototype.drawFinderPattern = function (top, left) {
    for (var dy = -1; dy <= 7; dy++) {
      for (var dx = -1; dx <= 7; dx++) {
        var row = top + dy, col = left + dx;
        if (row < 0 || row >= this.size || col < 0 || col >= this.size) continue;
        var dark;
        if (dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6) {
          var onRing = dx === 0 || dx === 6 || dy === 0 || dy === 6;
          var inCore = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
          dark = onRing || inCore;
        } else {
          dark = false; // one-module light separator around the pattern
        }
        this.set(row, col, dark, true);
      }
    }
  };

  Matrix.prototype.drawAlignmentPattern = function (centerRow, centerCol) {
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        var onRing = dx === -2 || dx === 2 || dy === -2 || dy === 2;
        var dark = onRing || (dx === 0 && dy === 0);
        this.set(centerRow + dy, centerCol + dx, dark, true);
      }
    }
  };

  Matrix.prototype.drawTimingPatterns = function () {
    for (var i = 8; i < this.size - 8; i++) {
      var dark = i % 2 === 0;
      if (!this.isFunction[6][i]) this.set(6, i, dark, true);
      if (!this.isFunction[i][6]) this.set(i, 6, dark, true);
    }
  };

  Matrix.prototype.drawAlignmentPatterns = function () {
    var coords = ALIGN_COORDS[this.version - 1];
    if (coords.length === 0) return;
    var min = coords[0], max = coords[coords.length - 1];
    for (var i = 0; i < coords.length; i++) {
      for (var j = 0; j < coords.length; j++) {
        var r = coords[i], c = coords[j];
        var isTopLeft = r === min && c === min;
        var isTopRight = r === min && c === max;
        var isBottomLeft = r === max && c === min;
        if (isTopLeft || isTopRight || isBottomLeft) continue;
        this.drawAlignmentPattern(r, c);
      }
    }
  };

  // Reserves (marks as function modules, value irrelevant for now) the
  // two format-info strips and the always-dark module. Actual bits are
  // written later, once the winning mask is known.
  Matrix.prototype.reserveFormatInfo = function () {
    var n = this.size;
    for (var i = 0; i <= 8; i++) {
      if (!this.isFunction[8][i]) this.set(8, i, false, true); // top row, left strip
      if (!this.isFunction[i][8]) this.set(i, 8, false, true); // left col, top strip
    }
    for (var k = 0; k < 8; k++) {
      this.set(8, n - 1 - k, false, true); // top row, right strip
      this.set(n - 1 - k, 8, false, true); // right col, bottom strip
    }
    this.set(n - 8, 8, true, true); // the permanently dark module
  };

  // Places both copies of the 15-bit format info. `bitAt(k)` follows the
  // spec's own indexing (k=0 is the LSB of the 15-bit value); each of
  // the two copies is built from plain row/column formulas rather than
  // lookup tables, to keep the placement easy to check by hand against
  // ISO/IEC 18004 Figure 19.
  Matrix.prototype.writeFormatInfo = function (maskIndex) {
    var bits = formatInfoBits(ECC_LEVEL_M_BITS, maskIndex);
    var n = this.size;
    function bitAt(k) { return ((bits >>> k) & 1) === 1; }

    // First copy: around the top-left finder pattern.
    for (var k = 0; k <= 5; k++) this.set(k, 8, bitAt(k), true);      // col 8, rows 0-5
    this.set(7, 8, bitAt(6), true);
    this.set(8, 8, bitAt(7), true);
    this.set(8, 7, bitAt(8), true);
    for (var k2 = 9; k2 <= 14; k2++) this.set(8, 14 - k2, bitAt(k2), true); // row 8, cols 5-0

    // Second copy: split across the top-right and bottom-left corners.
    for (var k3 = 0; k3 <= 7; k3++) this.set(8, n - 1 - k3, bitAt(k3), true); // row 8
    for (var k4 = 8; k4 <= 14; k4++) this.set(n - 15 + k4, 8, bitAt(k4), true); // col 8

    this.set(n - 8, 8, true, true); // the permanently dark module
  };

  Matrix.prototype.reserveVersionInfo = function () {
    if (this.version < 7) return;
    var n = this.size;
    for (var r = 0; r < 6; r++) {
      for (var c = 0; c < 3; c++) {
        this.set(r, n - 11 + c, false, true);
        this.set(n - 11 + c, r, false, true);
      }
    }
  };

  Matrix.prototype.writeVersionInfo = function () {
    if (this.version < 7) return;
    var bits = versionInfoBits(this.version);
    var n = this.size;
    for (var i = 0; i < 18; i++) {
      var dark = ((bits >>> i) & 1) === 1; // bit 0 = LSB goes first, per spec layout
      var row = Math.floor(i / 3);
      var col = i % 3;
      this.set(row, n - 11 + col, dark, true);
      this.set(n - 11 + col, row, dark, true);
    }
  };

  // Places the interleaved codeword bits into every module that isn't a
  // function module, in the standard up/down zigzag of 2-column strips,
  // skipping the vertical timing column.
  Matrix.prototype.placeData = function (codewordBits) {
    var n = this.size;
    var bitIndex = 0;
    var upward = true;
    for (var colPair = n - 1; colPair >= 1; colPair -= 2) {
      if (colPair === 6) colPair--; // skip the timing column entirely
      for (var step = 0; step < n; step++) {
        var row = upward ? (n - 1 - step) : step;
        for (var k = 0; k < 2; k++) {
          var col = colPair - k;
          if (this.isFunction[row][col]) continue;
          var bit = bitIndex < codewordBits.length ? codewordBits[bitIndex] : 0;
          bitIndex++;
          this.set(row, col, bit === 1, false);
        }
      }
      upward = !upward;
    }
  };

  var MASK_FUNCS = [
    function (r, c) { return (r + c) % 2 === 0; },
    function (r, c) { return r % 2 === 0; },
    function (r, c) { return c % 3 === 0; },
    function (r, c) { return (r + c) % 3 === 0; },
    function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
    function (r, c) { return ((r * c) % 2) + ((r * c) % 3) === 0; },
    function (r, c) { return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; },
    function (r, c) { return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; }
  ];

  Matrix.prototype.applyMask = function (maskIndex) {
    var fn = MASK_FUNCS[maskIndex];
    for (var r = 0; r < this.size; r++) {
      for (var c = 0; c < this.size; c++) {
        if (this.isFunction[r][c]) continue;
        if (fn(r, c)) this.modules[r][c] = !this.modules[r][c];
      }
    }
  };

  Matrix.prototype.clone = function () {
    var copy = new Matrix(this.version);
    for (var r = 0; r < this.size; r++) {
      copy.modules[r] = this.modules[r].slice();
      copy.isFunction[r] = this.isFunction[r].slice();
    }
    return copy;
  };

  /* ------------------------------------------------------------------
   * 6. Penalty scoring (ISO/IEC 18004 Annex, the four mask-evaluation
   *    rules), used to pick the best of the 8 masks.
   * ------------------------------------------------------------------ */

  // Rule 1: runs of 5+ same-colour modules in a row/column.
  function runPenalty(n, getModule) {
    var penalty = 0;
    for (var i = 0; i < n; i++) {
      var runColor = null, runLen = 0;
      for (var j = 0; j < n; j++) {
        var v = getModule(i, j);
        if (v === runColor) {
          runLen++;
        } else {
          if (runLen >= 5) penalty += 3 + (runLen - 5);
          runColor = v;
          runLen = 1;
        }
      }
      if (runLen >= 5) penalty += 3 + (runLen - 5);
    }
    return penalty;
  }

  // Rule 2: 2x2 blocks of one colour.
  function blockPenalty(n, matrix) {
    var penalty = 0;
    for (var r = 0; r < n - 1; r++) {
      for (var c = 0; c < n - 1; c++) {
        var v = matrix.modules[r][c];
        if (v === matrix.modules[r][c + 1] &&
            v === matrix.modules[r + 1][c] &&
            v === matrix.modules[r + 1][c + 1]) {
          penalty += 3;
        }
      }
    }
    return penalty;
  }

  // Rule 3: a dark:light:dark:dark:dark:light:dark run (ratio 1:1:3:1:1,
  // any unit width) with a light run at least 4 units wide immediately
  // on one side of it — the edge of the symbol counts as light, wide
  // enough to always satisfy that side. Read as run lengths (not a raw
  // bit search) so a pattern touching the border is handled the same
  // way the spec's own worked examples treat it.
  function findPatternPenalty(n, getModule) {
    var penalty = 0;
    for (var i = 0; i < n; i++) {
      var runs = [];
      var color = getModule(i, 0);
      var len = 1;
      for (var j = 1; j < n; j++) {
        var v = getModule(i, j);
        if (v === color) {
          len++;
        } else {
          runs.push({ color: color, len: len });
          color = v;
          len = 1;
        }
      }
      runs.push({ color: color, len: len });

      // Each edge of the symbol effectively continues into an n-wide
      // light margin beyond it (the spec treats "off the symbol" as
      // light, wide enough to always satisfy the 4-unit flank check
      // below). If the run touching that edge is already light, it
      // simply grows by n; if it's dark, the n-wide light margin is a
      // new, separate run just outside it.
      if (runs[0].color) {
        runs.unshift({ color: false, len: n });
      } else {
        runs[0].len += n;
      }
      var lastRun = runs[runs.length - 1];
      if (lastRun.color) {
        runs.push({ color: false, len: n });
      } else {
        lastRun.len += n;
      }

      for (var s = 0; s + 4 < runs.length; s++) {
        if (!runs[s].color) continue; // the 5-run window must start on a dark run
        var a = runs[s].len, b = runs[s + 1].len, c = runs[s + 2].len,
            d = runs[s + 3].len, e = runs[s + 4].len;
        if (a === b && a === d && a === e && c === 3 * a) {
          var unit = a;
          // No run at all on one side (the window sits right at an
          // edge margin already folded in above) counts as zero, not
          // as wide-open light.
          var beforeLen = (s === 0) ? 0 : runs[s - 1].len;
          var afterLen = (s + 5 >= runs.length) ? 0 : runs[s + 5].len;
          // Each side is checked independently, and BOTH can count: a
          // symmetric pattern with >=4-unit light on both sides scores
          // 80, not 40 — matching the spec's own worked example.
          var matches = 0;
          if (beforeLen >= unit * 4 && afterLen >= unit) matches++;
          if (afterLen >= unit * 4 && beforeLen >= unit) matches++;
          penalty += matches * 40;
        }
      }
    }
    return penalty;
  }

  // Rule 4: how far dark-module proportion sits from 50%, in 5% steps.
  function darkRatioPenalty(n, matrix) {
    var darkCount = 0;
    for (var rr = 0; rr < n; rr++) {
      for (var cc = 0; cc < n; cc++) {
        if (matrix.modules[rr][cc]) darkCount++;
      }
    }
    var percent = (darkCount * 100) / (n * n);
    var deviation = Math.abs(percent - 50);
    return Math.floor(deviation / 5) * 10;
  }

  function penaltyBreakdown(matrix) {
    var n = matrix.size;
    var byRow = function (r, c) { return matrix.modules[r][c]; };
    var byCol = function (r, c) { return matrix.modules[c][r]; };
    var r1 = runPenalty(n, byRow) + runPenalty(n, byCol);
    var r2 = blockPenalty(n, matrix);
    var r3 = findPatternPenalty(n, byRow) + findPatternPenalty(n, byCol);
    var r4 = darkRatioPenalty(n, matrix);
    return { r1: r1, r2: r2, r3: r3, r4: r4, total: r1 + r2 + r3 + r4 };
  }

  function penaltyScore(matrix) {
    return penaltyBreakdown(matrix).total;
  }

  /* ------------------------------------------------------------------
   * 7. Top-level encode().
   * ------------------------------------------------------------------ */

  function bytesFromString(text) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(text);
    }
    // Fallback (not expected to run in any browser this site supports).
    var out = [];
    for (var i = 0; i < text.length; i++) out.push(text.charCodeAt(i) & 0xFF);
    return new Uint8Array(out);
  }

  // Encodes `input` (a string, or a Uint8Array/byte array for exact
  // byte-mode parity with a reference encoder) into a QR symbol.
  // Returns { size, isDark(row, col) }, or throws if it can't fit in
  // versions 1-10 at error-correction level M.
  function encode(input) {
    var bytes = (typeof input === 'string') ? bytesFromString(input) : input;
    var version = chooseVersion(bytes.length);
    if (version === -1) {
      throw new Error('QR: input too long for versions 1-10 at level M (' + bytes.length + ' bytes)');
    }

    var dataCodewords = buildDataCodewords(bytes, version);
    var allCodewords = interleaveCodewords(dataCodewords, version);

    var codewordBits = [];
    for (var i = 0; i < allCodewords.length; i++) {
      for (var b = 7; b >= 0; b--) codewordBits.push((allCodewords[i] >>> b) & 1);
    }
    var remainder = REMAINDER_BITS[version - 1];
    for (var rbi = 0; rbi < remainder; rbi++) codewordBits.push(0);

    var base = new Matrix(version);
    base.drawFinderPattern(0, 0);
    base.drawFinderPattern(base.size - 7, 0);
    base.drawFinderPattern(0, base.size - 7);
    base.drawTimingPatterns();
    base.drawAlignmentPatterns();
    base.reserveFormatInfo();
    base.reserveVersionInfo();
    base.placeData(codewordBits);

    var best = null, bestScore = Infinity, bestMask = 0;
    for (var m = 0; m < 8; m++) {
      var trial = base.clone();
      trial.applyMask(m);
      trial.writeFormatInfo(m);
      trial.writeVersionInfo();
      var score = penaltyScore(trial);
      if (score < bestScore) {
        bestScore = score;
        best = trial;
        bestMask = m;
      }
    }

    return {
      size: best.size,
      version: version,
      mask: bestMask,
      isDark: function (row, col) { return best.modules[row][col]; }
    };
  }

  /* ------------------------------------------------------------------
   * 8. SVG rendering. CSP-safe: built entirely with createElementNS, no
   *    innerHTML/template strings inserted as markup.
   * ------------------------------------------------------------------ */

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // Renders a QR result (from encode()) as a standalone <svg> element.
  // `options.quietZone` (default 4 modules) is the light border required
  // around the symbol so scanners can find it.
  function toSvg(qr, options) {
    var opts = options || {};
    var quiet = typeof opts.quietZone === 'number' ? opts.quietZone : 4;
    var dark = opts.darkColor || '#000000';
    var light = opts.lightColor || '#ffffff';
    var dim = qr.size + quiet * 2;

    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + dim + ' ' + dim);
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('role', 'img');
    if (opts.title) {
      var titleEl = document.createElementNS(SVG_NS, 'title');
      titleEl.textContent = opts.title;
      svg.appendChild(titleEl);
    } else {
      svg.setAttribute('aria-hidden', 'true');
    }

    var bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', String(dim));
    bg.setAttribute('height', String(dim));
    bg.setAttribute('fill', light);
    svg.appendChild(bg);

    // One <path> holding every dark module as a 1x1 rect, so the SVG
    // stays small and crisp regardless of print size.
    var d = '';
    for (var r = 0; r < qr.size; r++) {
      for (var c = 0; c < qr.size; c++) {
        if (qr.isDark(r, c)) {
          var x = c + quiet, y = r + quiet;
          d += 'M' + x + ' ' + y + 'h1v1h-1z';
        }
      }
    }
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', dark);
    path.setAttribute('shape-rendering', 'crispEdges');
    svg.appendChild(path);

    return svg;
  }

  return {
    encode: encode,
    toSvg: toSvg,
    // Exposed for the test runner (tools/test_qr.py drives Node, which
    // loads this file and calls these directly to compare against the
    // reference implementation).
    _internal: {
      bytesFromString: bytesFromString,
      chooseVersion: chooseVersion,
      buildDataCodewords: buildDataCodewords,
      interleaveCodewords: interleaveCodewords,
      Matrix: Matrix,
      MASK_FUNCS: MASK_FUNCS,
      penaltyScore: penaltyScore,
      formatInfoBits: formatInfoBits,
      versionInfoBits: versionInfoBits,
      rsGeneratorPoly: rsGeneratorPoly,
      rsEncode: rsEncode,
      gfMul: gfMul,
      penaltyBreakdown: penaltyBreakdown
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = QR; // for the Node-based test runner only
}
