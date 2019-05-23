(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.elliptic = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
(function (module, exports) {
  'use strict';

  // Utils
  function assert (val, msg) {
    if (!val) throw new Error(msg || 'Assertion failed');
  }

  // Could use `inherits` module, but don't want to move from single file
  // architecture yet.
  function inherits (ctor, superCtor) {
    ctor.super_ = superCtor;
    var TempCtor = function () {};
    TempCtor.prototype = superCtor.prototype;
    ctor.prototype = new TempCtor();
    ctor.prototype.constructor = ctor;
  }

  // BN

  function BN (number, base, endian) {
    if (BN.isBN(number)) {
      return number;
    }

    this.negative = 0;
    this.words = null;
    this.length = 0;

    // Reduction context
    this.red = null;

    if (number !== null) {
      if (base === 'le' || base === 'be') {
        endian = base;
        base = 10;
      }

      this._init(number || 0, base || 10, endian || 'be');
    }
  }
  if (typeof module === 'object') {
    module.exports = BN;
  } else {
    exports.BN = BN;
  }

  BN.BN = BN;
  BN.wordSize = 26;

  var Buffer;
  try {
    Buffer = require('buffer').Buffer;
  } catch (e) {
  }

  BN.isBN = function isBN (num) {
    if (num instanceof BN) {
      return true;
    }

    return num !== null && typeof num === 'object' &&
      num.constructor.wordSize === BN.wordSize && Array.isArray(num.words);
  };

  BN.max = function max (left, right) {
    if (left.cmp(right) > 0) return left;
    return right;
  };

  BN.min = function min (left, right) {
    if (left.cmp(right) < 0) return left;
    return right;
  };

  BN.prototype._init = function init (number, base, endian) {
    if (typeof number === 'number') {
      return this._initNumber(number, base, endian);
    }

    if (typeof number === 'object') {
      return this._initArray(number, base, endian);
    }

    if (base === 'hex') {
      base = 16;
    }
    assert(base === (base | 0) && base >= 2 && base <= 36);

    number = number.toString().replace(/\s+/g, '');
    var start = 0;
    if (number[0] === '-') {
      start++;
    }

    if (base === 16) {
      this._parseHex(number, start);
    } else {
      this._parseBase(number, base, start);
    }

    if (number[0] === '-') {
      this.negative = 1;
    }

    this.strip();

    if (endian !== 'le') return;

    this._initArray(this.toArray(), base, endian);
  };

  BN.prototype._initNumber = function _initNumber (number, base, endian) {
    if (number < 0) {
      this.negative = 1;
      number = -number;
    }
    if (number < 0x4000000) {
      this.words = [ number & 0x3ffffff ];
      this.length = 1;
    } else if (number < 0x10000000000000) {
      this.words = [
        number & 0x3ffffff,
        (number / 0x4000000) & 0x3ffffff
      ];
      this.length = 2;
    } else {
      assert(number < 0x20000000000000); // 2 ^ 53 (unsafe)
      this.words = [
        number & 0x3ffffff,
        (number / 0x4000000) & 0x3ffffff,
        1
      ];
      this.length = 3;
    }

    if (endian !== 'le') return;

    // Reverse the bytes
    this._initArray(this.toArray(), base, endian);
  };

  BN.prototype._initArray = function _initArray (number, base, endian) {
    // Perhaps a Uint8Array
    assert(typeof number.length === 'number');
    if (number.length <= 0) {
      this.words = [ 0 ];
      this.length = 1;
      return this;
    }

    this.length = Math.ceil(number.length / 3);
    this.words = new Array(this.length);
    for (var i = 0; i < this.length; i++) {
      this.words[i] = 0;
    }

    var j, w;
    var off = 0;
    if (endian === 'be') {
      for (i = number.length - 1, j = 0; i >= 0; i -= 3) {
        w = number[i] | (number[i - 1] << 8) | (number[i - 2] << 16);
        this.words[j] |= (w << off) & 0x3ffffff;
        this.words[j + 1] = (w >>> (26 - off)) & 0x3ffffff;
        off += 24;
        if (off >= 26) {
          off -= 26;
          j++;
        }
      }
    } else if (endian === 'le') {
      for (i = 0, j = 0; i < number.length; i += 3) {
        w = number[i] | (number[i + 1] << 8) | (number[i + 2] << 16);
        this.words[j] |= (w << off) & 0x3ffffff;
        this.words[j + 1] = (w >>> (26 - off)) & 0x3ffffff;
        off += 24;
        if (off >= 26) {
          off -= 26;
          j++;
        }
      }
    }
    return this.strip();
  };

  function parseHex (str, start, end) {
    var r = 0;
    var len = Math.min(str.length, end);
    for (var i = start; i < len; i++) {
      var c = str.charCodeAt(i) - 48;

      r <<= 4;

      // 'a' - 'f'
      if (c >= 49 && c <= 54) {
        r |= c - 49 + 0xa;

      // 'A' - 'F'
      } else if (c >= 17 && c <= 22) {
        r |= c - 17 + 0xa;

      // '0' - '9'
      } else {
        r |= c & 0xf;
      }
    }
    return r;
  }

  BN.prototype._parseHex = function _parseHex (number, start) {
    // Create possibly bigger array to ensure that it fits the number
    this.length = Math.ceil((number.length - start) / 6);
    this.words = new Array(this.length);
    for (var i = 0; i < this.length; i++) {
      this.words[i] = 0;
    }

    var j, w;
    // Scan 24-bit chunks and add them to the number
    var off = 0;
    for (i = number.length - 6, j = 0; i >= start; i -= 6) {
      w = parseHex(number, i, i + 6);
      this.words[j] |= (w << off) & 0x3ffffff;
      // NOTE: `0x3fffff` is intentional here, 26bits max shift + 24bit hex limb
      this.words[j + 1] |= w >>> (26 - off) & 0x3fffff;
      off += 24;
      if (off >= 26) {
        off -= 26;
        j++;
      }
    }
    if (i + 6 !== start) {
      w = parseHex(number, start, i + 6);
      this.words[j] |= (w << off) & 0x3ffffff;
      this.words[j + 1] |= w >>> (26 - off) & 0x3fffff;
    }
    this.strip();
  };

  function parseBase (str, start, end, mul) {
    var r = 0;
    var len = Math.min(str.length, end);
    for (var i = start; i < len; i++) {
      var c = str.charCodeAt(i) - 48;

      r *= mul;

      // 'a'
      if (c >= 49) {
        r += c - 49 + 0xa;

      // 'A'
      } else if (c >= 17) {
        r += c - 17 + 0xa;

      // '0' - '9'
      } else {
        r += c;
      }
    }
    return r;
  }

  BN.prototype._parseBase = function _parseBase (number, base, start) {
    // Initialize as zero
    this.words = [ 0 ];
    this.length = 1;

    // Find length of limb in base
    for (var limbLen = 0, limbPow = 1; limbPow <= 0x3ffffff; limbPow *= base) {
      limbLen++;
    }
    limbLen--;
    limbPow = (limbPow / base) | 0;

    var total = number.length - start;
    var mod = total % limbLen;
    var end = Math.min(total, total - mod) + start;

    var word = 0;
    for (var i = start; i < end; i += limbLen) {
      word = parseBase(number, i, i + limbLen, base);

      this.imuln(limbPow);
      if (this.words[0] + word < 0x4000000) {
        this.words[0] += word;
      } else {
        this._iaddn(word);
      }
    }

    if (mod !== 0) {
      var pow = 1;
      word = parseBase(number, i, number.length, base);

      for (i = 0; i < mod; i++) {
        pow *= base;
      }

      this.imuln(pow);
      if (this.words[0] + word < 0x4000000) {
        this.words[0] += word;
      } else {
        this._iaddn(word);
      }
    }
  };

  BN.prototype.copy = function copy (dest) {
    dest.words = new Array(this.length);
    for (var i = 0; i < this.length; i++) {
      dest.words[i] = this.words[i];
    }
    dest.length = this.length;
    dest.negative = this.negative;
    dest.red = this.red;
  };

  BN.prototype.clone = function clone () {
    var r = new BN(null);
    this.copy(r);
    return r;
  };

  BN.prototype._expand = function _expand (size) {
    while (this.length < size) {
      this.words[this.length++] = 0;
    }
    return this;
  };

  // Remove leading `0` from `this`
  BN.prototype.strip = function strip () {
    while (this.length > 1 && this.words[this.length - 1] === 0) {
      this.length--;
    }
    return this._normSign();
  };

  BN.prototype._normSign = function _normSign () {
    // -0 = 0
    if (this.length === 1 && this.words[0] === 0) {
      this.negative = 0;
    }
    return this;
  };

  BN.prototype.inspect = function inspect () {
    return (this.red ? '<BN-R: ' : '<BN: ') + this.toString(16) + '>';
  };

  /*

  var zeros = [];
  var groupSizes = [];
  var groupBases = [];

  var s = '';
  var i = -1;
  while (++i < BN.wordSize) {
    zeros[i] = s;
    s += '0';
  }
  groupSizes[0] = 0;
  groupSizes[1] = 0;
  groupBases[0] = 0;
  groupBases[1] = 0;
  var base = 2 - 1;
  while (++base < 36 + 1) {
    var groupSize = 0;
    var groupBase = 1;
    while (groupBase < (1 << BN.wordSize) / base) {
      groupBase *= base;
      groupSize += 1;
    }
    groupSizes[base] = groupSize;
    groupBases[base] = groupBase;
  }

  */

  var zeros = [
    '',
    '0',
    '00',
    '000',
    '0000',
    '00000',
    '000000',
    '0000000',
    '00000000',
    '000000000',
    '0000000000',
    '00000000000',
    '000000000000',
    '0000000000000',
    '00000000000000',
    '000000000000000',
    '0000000000000000',
    '00000000000000000',
    '000000000000000000',
    '0000000000000000000',
    '00000000000000000000',
    '000000000000000000000',
    '0000000000000000000000',
    '00000000000000000000000',
    '000000000000000000000000',
    '0000000000000000000000000'
  ];

  var groupSizes = [
    0, 0,
    25, 16, 12, 11, 10, 9, 8,
    8, 7, 7, 7, 7, 6, 6,
    6, 6, 6, 6, 6, 5, 5,
    5, 5, 5, 5, 5, 5, 5,
    5, 5, 5, 5, 5, 5, 5
  ];

  var groupBases = [
    0, 0,
    33554432, 43046721, 16777216, 48828125, 60466176, 40353607, 16777216,
    43046721, 10000000, 19487171, 35831808, 62748517, 7529536, 11390625,
    16777216, 24137569, 34012224, 47045881, 64000000, 4084101, 5153632,
    6436343, 7962624, 9765625, 11881376, 14348907, 17210368, 20511149,
    24300000, 28629151, 33554432, 39135393, 45435424, 52521875, 60466176
  ];

  BN.prototype.toString = function toString (base, padding) {
    base = base || 10;
    padding = padding | 0 || 1;

    var out;
    if (base === 16 || base === 'hex') {
      out = '';
      var off = 0;
      var carry = 0;
      for (var i = 0; i < this.length; i++) {
        var w = this.words[i];
        var word = (((w << off) | carry) & 0xffffff).toString(16);
        carry = (w >>> (24 - off)) & 0xffffff;
        if (carry !== 0 || i !== this.length - 1) {
          out = zeros[6 - word.length] + word + out;
        } else {
          out = word + out;
        }
        off += 2;
        if (off >= 26) {
          off -= 26;
          i--;
        }
      }
      if (carry !== 0) {
        out = carry.toString(16) + out;
      }
      while (out.length % padding !== 0) {
        out = '0' + out;
      }
      if (this.negative !== 0) {
        out = '-' + out;
      }
      return out;
    }

    if (base === (base | 0) && base >= 2 && base <= 36) {
      // var groupSize = Math.floor(BN.wordSize * Math.LN2 / Math.log(base));
      var groupSize = groupSizes[base];
      // var groupBase = Math.pow(base, groupSize);
      var groupBase = groupBases[base];
      out = '';
      var c = this.clone();
      c.negative = 0;
      while (!c.isZero()) {
        var r = c.modn(groupBase).toString(base);
        c = c.idivn(groupBase);

        if (!c.isZero()) {
          out = zeros[groupSize - r.length] + r + out;
        } else {
          out = r + out;
        }
      }
      if (this.isZero()) {
        out = '0' + out;
      }
      while (out.length % padding !== 0) {
        out = '0' + out;
      }
      if (this.negative !== 0) {
        out = '-' + out;
      }
      return out;
    }

    assert(false, 'Base should be between 2 and 36');
  };

  BN.prototype.toNumber = function toNumber () {
    var ret = this.words[0];
    if (this.length === 2) {
      ret += this.words[1] * 0x4000000;
    } else if (this.length === 3 && this.words[2] === 0x01) {
      // NOTE: at this stage it is known that the top bit is set
      ret += 0x10000000000000 + (this.words[1] * 0x4000000);
    } else if (this.length > 2) {
      assert(false, 'Number can only safely store up to 53 bits');
    }
    return (this.negative !== 0) ? -ret : ret;
  };

  BN.prototype.toJSON = function toJSON () {
    return this.toString(16);
  };

  BN.prototype.toBuffer = function toBuffer (endian, length) {
    assert(typeof Buffer !== 'undefined');
    return this.toArrayLike(Buffer, endian, length);
  };

  BN.prototype.toArray = function toArray (endian, length) {
    return this.toArrayLike(Array, endian, length);
  };

  BN.prototype.toArrayLike = function toArrayLike (ArrayType, endian, length) {
    var byteLength = this.byteLength();
    var reqLength = length || Math.max(1, byteLength);
    assert(byteLength <= reqLength, 'byte array longer than desired length');
    assert(reqLength > 0, 'Requested array length <= 0');

    this.strip();
    var littleEndian = endian === 'le';
    var res = new ArrayType(reqLength);

    var b, i;
    var q = this.clone();
    if (!littleEndian) {
      // Assume big-endian
      for (i = 0; i < reqLength - byteLength; i++) {
        res[i] = 0;
      }

      for (i = 0; !q.isZero(); i++) {
        b = q.andln(0xff);
        q.iushrn(8);

        res[reqLength - i - 1] = b;
      }
    } else {
      for (i = 0; !q.isZero(); i++) {
        b = q.andln(0xff);
        q.iushrn(8);

        res[i] = b;
      }

      for (; i < reqLength; i++) {
        res[i] = 0;
      }
    }

    return res;
  };

  if (Math.clz32) {
    BN.prototype._countBits = function _countBits (w) {
      return 32 - Math.clz32(w);
    };
  } else {
    BN.prototype._countBits = function _countBits (w) {
      var t = w;
      var r = 0;
      if (t >= 0x1000) {
        r += 13;
        t >>>= 13;
      }
      if (t >= 0x40) {
        r += 7;
        t >>>= 7;
      }
      if (t >= 0x8) {
        r += 4;
        t >>>= 4;
      }
      if (t >= 0x02) {
        r += 2;
        t >>>= 2;
      }
      return r + t;
    };
  }

  BN.prototype._zeroBits = function _zeroBits (w) {
    // Short-cut
    if (w === 0) return 26;

    var t = w;
    var r = 0;
    if ((t & 0x1fff) === 0) {
      r += 13;
      t >>>= 13;
    }
    if ((t & 0x7f) === 0) {
      r += 7;
      t >>>= 7;
    }
    if ((t & 0xf) === 0) {
      r += 4;
      t >>>= 4;
    }
    if ((t & 0x3) === 0) {
      r += 2;
      t >>>= 2;
    }
    if ((t & 0x1) === 0) {
      r++;
    }
    return r;
  };

  // Return number of used bits in a BN
  BN.prototype.bitLength = function bitLength () {
    var w = this.words[this.length - 1];
    var hi = this._countBits(w);
    return (this.length - 1) * 26 + hi;
  };

  function toBitArray (num) {
    var w = new Array(num.bitLength());

    for (var bit = 0; bit < w.length; bit++) {
      var off = (bit / 26) | 0;
      var wbit = bit % 26;

      w[bit] = (num.words[off] & (1 << wbit)) >>> wbit;
    }

    return w;
  }

  // Number of trailing zero bits
  BN.prototype.zeroBits = function zeroBits () {
    if (this.isZero()) return 0;

    var r = 0;
    for (var i = 0; i < this.length; i++) {
      var b = this._zeroBits(this.words[i]);
      r += b;
      if (b !== 26) break;
    }
    return r;
  };

  BN.prototype.byteLength = function byteLength () {
    return Math.ceil(this.bitLength() / 8);
  };

  BN.prototype.toTwos = function toTwos (width) {
    if (this.negative !== 0) {
      return this.abs().inotn(width).iaddn(1);
    }
    return this.clone();
  };

  BN.prototype.fromTwos = function fromTwos (width) {
    if (this.testn(width - 1)) {
      return this.notn(width).iaddn(1).ineg();
    }
    return this.clone();
  };

  BN.prototype.isNeg = function isNeg () {
    return this.negative !== 0;
  };

  // Return negative clone of `this`
  BN.prototype.neg = function neg () {
    return this.clone().ineg();
  };

  BN.prototype.ineg = function ineg () {
    if (!this.isZero()) {
      this.negative ^= 1;
    }

    return this;
  };

  // Or `num` with `this` in-place
  BN.prototype.iuor = function iuor (num) {
    while (this.length < num.length) {
      this.words[this.length++] = 0;
    }

    for (var i = 0; i < num.length; i++) {
      this.words[i] = this.words[i] | num.words[i];
    }

    return this.strip();
  };

  BN.prototype.ior = function ior (num) {
    assert((this.negative | num.negative) === 0);
    return this.iuor(num);
  };

  // Or `num` with `this`
  BN.prototype.or = function or (num) {
    if (this.length > num.length) return this.clone().ior(num);
    return num.clone().ior(this);
  };

  BN.prototype.uor = function uor (num) {
    if (this.length > num.length) return this.clone().iuor(num);
    return num.clone().iuor(this);
  };

  // And `num` with `this` in-place
  BN.prototype.iuand = function iuand (num) {
    // b = min-length(num, this)
    var b;
    if (this.length > num.length) {
      b = num;
    } else {
      b = this;
    }

    for (var i = 0; i < b.length; i++) {
      this.words[i] = this.words[i] & num.words[i];
    }

    this.length = b.length;

    return this.strip();
  };

  BN.prototype.iand = function iand (num) {
    assert((this.negative | num.negative) === 0);
    return this.iuand(num);
  };

  // And `num` with `this`
  BN.prototype.and = function and (num) {
    if (this.length > num.length) return this.clone().iand(num);
    return num.clone().iand(this);
  };

  BN.prototype.uand = function uand (num) {
    if (this.length > num.length) return this.clone().iuand(num);
    return num.clone().iuand(this);
  };

  // Xor `num` with `this` in-place
  BN.prototype.iuxor = function iuxor (num) {
    // a.length > b.length
    var a;
    var b;
    if (this.length > num.length) {
      a = this;
      b = num;
    } else {
      a = num;
      b = this;
    }

    for (var i = 0; i < b.length; i++) {
      this.words[i] = a.words[i] ^ b.words[i];
    }

    if (this !== a) {
      for (; i < a.length; i++) {
        this.words[i] = a.words[i];
      }
    }

    this.length = a.length;

    return this.strip();
  };

  BN.prototype.ixor = function ixor (num) {
    assert((this.negative | num.negative) === 0);
    return this.iuxor(num);
  };

  // Xor `num` with `this`
  BN.prototype.xor = function xor (num) {
    if (this.length > num.length) return this.clone().ixor(num);
    return num.clone().ixor(this);
  };

  BN.prototype.uxor = function uxor (num) {
    if (this.length > num.length) return this.clone().iuxor(num);
    return num.clone().iuxor(this);
  };

  // Not ``this`` with ``width`` bitwidth
  BN.prototype.inotn = function inotn (width) {
    assert(typeof width === 'number' && width >= 0);

    var bytesNeeded = Math.ceil(width / 26) | 0;
    var bitsLeft = width % 26;

    // Extend the buffer with leading zeroes
    this._expand(bytesNeeded);

    if (bitsLeft > 0) {
      bytesNeeded--;
    }

    // Handle complete words
    for (var i = 0; i < bytesNeeded; i++) {
      this.words[i] = ~this.words[i] & 0x3ffffff;
    }

    // Handle the residue
    if (bitsLeft > 0) {
      this.words[i] = ~this.words[i] & (0x3ffffff >> (26 - bitsLeft));
    }

    // And remove leading zeroes
    return this.strip();
  };

  BN.prototype.notn = function notn (width) {
    return this.clone().inotn(width);
  };

  // Set `bit` of `this`
  BN.prototype.setn = function setn (bit, val) {
    assert(typeof bit === 'number' && bit >= 0);

    var off = (bit / 26) | 0;
    var wbit = bit % 26;

    this._expand(off + 1);

    if (val) {
      this.words[off] = this.words[off] | (1 << wbit);
    } else {
      this.words[off] = this.words[off] & ~(1 << wbit);
    }

    return this.strip();
  };

  // Add `num` to `this` in-place
  BN.prototype.iadd = function iadd (num) {
    var r;

    // negative + positive
    if (this.negative !== 0 && num.negative === 0) {
      this.negative = 0;
      r = this.isub(num);
      this.negative ^= 1;
      return this._normSign();

    // positive + negative
    } else if (this.negative === 0 && num.negative !== 0) {
      num.negative = 0;
      r = this.isub(num);
      num.negative = 1;
      return r._normSign();
    }

    // a.length > b.length
    var a, b;
    if (this.length > num.length) {
      a = this;
      b = num;
    } else {
      a = num;
      b = this;
    }

    var carry = 0;
    for (var i = 0; i < b.length; i++) {
      r = (a.words[i] | 0) + (b.words[i] | 0) + carry;
      this.words[i] = r & 0x3ffffff;
      carry = r >>> 26;
    }
    for (; carry !== 0 && i < a.length; i++) {
      r = (a.words[i] | 0) + carry;
      this.words[i] = r & 0x3ffffff;
      carry = r >>> 26;
    }

    this.length = a.length;
    if (carry !== 0) {
      this.words[this.length] = carry;
      this.length++;
    // Copy the rest of the words
    } else if (a !== this) {
      for (; i < a.length; i++) {
        this.words[i] = a.words[i];
      }
    }

    return this;
  };

  // Add `num` to `this`
  BN.prototype.add = function add (num) {
    var res;
    if (num.negative !== 0 && this.negative === 0) {
      num.negative = 0;
      res = this.sub(num);
      num.negative ^= 1;
      return res;
    } else if (num.negative === 0 && this.negative !== 0) {
      this.negative = 0;
      res = num.sub(this);
      this.negative = 1;
      return res;
    }

    if (this.length > num.length) return this.clone().iadd(num);

    return num.clone().iadd(this);
  };

  // Subtract `num` from `this` in-place
  BN.prototype.isub = function isub (num) {
    // this - (-num) = this + num
    if (num.negative !== 0) {
      num.negative = 0;
      var r = this.iadd(num);
      num.negative = 1;
      return r._normSign();

    // -this - num = -(this + num)
    } else if (this.negative !== 0) {
      this.negative = 0;
      this.iadd(num);
      this.negative = 1;
      return this._normSign();
    }

    // At this point both numbers are positive
    var cmp = this.cmp(num);

    // Optimization - zeroify
    if (cmp === 0) {
      this.negative = 0;
      this.length = 1;
      this.words[0] = 0;
      return this;
    }

    // a > b
    var a, b;
    if (cmp > 0) {
      a = this;
      b = num;
    } else {
      a = num;
      b = this;
    }

    var carry = 0;
    for (var i = 0; i < b.length; i++) {
      r = (a.words[i] | 0) - (b.words[i] | 0) + carry;
      carry = r >> 26;
      this.words[i] = r & 0x3ffffff;
    }
    for (; carry !== 0 && i < a.length; i++) {
      r = (a.words[i] | 0) + carry;
      carry = r >> 26;
      this.words[i] = r & 0x3ffffff;
    }

    // Copy rest of the words
    if (carry === 0 && i < a.length && a !== this) {
      for (; i < a.length; i++) {
        this.words[i] = a.words[i];
      }
    }

    this.length = Math.max(this.length, i);

    if (a !== this) {
      this.negative = 1;
    }

    return this.strip();
  };

  // Subtract `num` from `this`
  BN.prototype.sub = function sub (num) {
    return this.clone().isub(num);
  };

  function smallMulTo (self, num, out) {
    out.negative = num.negative ^ self.negative;
    var len = (self.length + num.length) | 0;
    out.length = len;
    len = (len - 1) | 0;

    // Peel one iteration (compiler can't do it, because of code complexity)
    var a = self.words[0] | 0;
    var b = num.words[0] | 0;
    var r = a * b;

    var lo = r & 0x3ffffff;
    var carry = (r / 0x4000000) | 0;
    out.words[0] = lo;

    for (var k = 1; k < len; k++) {
      // Sum all words with the same `i + j = k` and accumulate `ncarry`,
      // note that ncarry could be >= 0x3ffffff
      var ncarry = carry >>> 26;
      var rword = carry & 0x3ffffff;
      var maxJ = Math.min(k, num.length - 1);
      for (var j = Math.max(0, k - self.length + 1); j <= maxJ; j++) {
        var i = (k - j) | 0;
        a = self.words[i] | 0;
        b = num.words[j] | 0;
        r = a * b + rword;
        ncarry += (r / 0x4000000) | 0;
        rword = r & 0x3ffffff;
      }
      out.words[k] = rword | 0;
      carry = ncarry | 0;
    }
    if (carry !== 0) {
      out.words[k] = carry | 0;
    } else {
      out.length--;
    }

    return out.strip();
  }

  // TODO(indutny): it may be reasonable to omit it for users who don't need
  // to work with 256-bit numbers, otherwise it gives 20% improvement for 256-bit
  // multiplication (like elliptic secp256k1).
  var comb10MulTo = function comb10MulTo (self, num, out) {
    var a = self.words;
    var b = num.words;
    var o = out.words;
    var c = 0;
    var lo;
    var mid;
    var hi;
    var a0 = a[0] | 0;
    var al0 = a0 & 0x1fff;
    var ah0 = a0 >>> 13;
    var a1 = a[1] | 0;
    var al1 = a1 & 0x1fff;
    var ah1 = a1 >>> 13;
    var a2 = a[2] | 0;
    var al2 = a2 & 0x1fff;
    var ah2 = a2 >>> 13;
    var a3 = a[3] | 0;
    var al3 = a3 & 0x1fff;
    var ah3 = a3 >>> 13;
    var a4 = a[4] | 0;
    var al4 = a4 & 0x1fff;
    var ah4 = a4 >>> 13;
    var a5 = a[5] | 0;
    var al5 = a5 & 0x1fff;
    var ah5 = a5 >>> 13;
    var a6 = a[6] | 0;
    var al6 = a6 & 0x1fff;
    var ah6 = a6 >>> 13;
    var a7 = a[7] | 0;
    var al7 = a7 & 0x1fff;
    var ah7 = a7 >>> 13;
    var a8 = a[8] | 0;
    var al8 = a8 & 0x1fff;
    var ah8 = a8 >>> 13;
    var a9 = a[9] | 0;
    var al9 = a9 & 0x1fff;
    var ah9 = a9 >>> 13;
    var b0 = b[0] | 0;
    var bl0 = b0 & 0x1fff;
    var bh0 = b0 >>> 13;
    var b1 = b[1] | 0;
    var bl1 = b1 & 0x1fff;
    var bh1 = b1 >>> 13;
    var b2 = b[2] | 0;
    var bl2 = b2 & 0x1fff;
    var bh2 = b2 >>> 13;
    var b3 = b[3] | 0;
    var bl3 = b3 & 0x1fff;
    var bh3 = b3 >>> 13;
    var b4 = b[4] | 0;
    var bl4 = b4 & 0x1fff;
    var bh4 = b4 >>> 13;
    var b5 = b[5] | 0;
    var bl5 = b5 & 0x1fff;
    var bh5 = b5 >>> 13;
    var b6 = b[6] | 0;
    var bl6 = b6 & 0x1fff;
    var bh6 = b6 >>> 13;
    var b7 = b[7] | 0;
    var bl7 = b7 & 0x1fff;
    var bh7 = b7 >>> 13;
    var b8 = b[8] | 0;
    var bl8 = b8 & 0x1fff;
    var bh8 = b8 >>> 13;
    var b9 = b[9] | 0;
    var bl9 = b9 & 0x1fff;
    var bh9 = b9 >>> 13;

    out.negative = self.negative ^ num.negative;
    out.length = 19;
    /* k = 0 */
    lo = Math.imul(al0, bl0);
    mid = Math.imul(al0, bh0);
    mid = (mid + Math.imul(ah0, bl0)) | 0;
    hi = Math.imul(ah0, bh0);
    var w0 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w0 >>> 26)) | 0;
    w0 &= 0x3ffffff;
    /* k = 1 */
    lo = Math.imul(al1, bl0);
    mid = Math.imul(al1, bh0);
    mid = (mid + Math.imul(ah1, bl0)) | 0;
    hi = Math.imul(ah1, bh0);
    lo = (lo + Math.imul(al0, bl1)) | 0;
    mid = (mid + Math.imul(al0, bh1)) | 0;
    mid = (mid + Math.imul(ah0, bl1)) | 0;
    hi = (hi + Math.imul(ah0, bh1)) | 0;
    var w1 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w1 >>> 26)) | 0;
    w1 &= 0x3ffffff;
    /* k = 2 */
    lo = Math.imul(al2, bl0);
    mid = Math.imul(al2, bh0);
    mid = (mid + Math.imul(ah2, bl0)) | 0;
    hi = Math.imul(ah2, bh0);
    lo = (lo + Math.imul(al1, bl1)) | 0;
    mid = (mid + Math.imul(al1, bh1)) | 0;
    mid = (mid + Math.imul(ah1, bl1)) | 0;
    hi = (hi + Math.imul(ah1, bh1)) | 0;
    lo = (lo + Math.imul(al0, bl2)) | 0;
    mid = (mid + Math.imul(al0, bh2)) | 0;
    mid = (mid + Math.imul(ah0, bl2)) | 0;
    hi = (hi + Math.imul(ah0, bh2)) | 0;
    var w2 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w2 >>> 26)) | 0;
    w2 &= 0x3ffffff;
    /* k = 3 */
    lo = Math.imul(al3, bl0);
    mid = Math.imul(al3, bh0);
    mid = (mid + Math.imul(ah3, bl0)) | 0;
    hi = Math.imul(ah3, bh0);
    lo = (lo + Math.imul(al2, bl1)) | 0;
    mid = (mid + Math.imul(al2, bh1)) | 0;
    mid = (mid + Math.imul(ah2, bl1)) | 0;
    hi = (hi + Math.imul(ah2, bh1)) | 0;
    lo = (lo + Math.imul(al1, bl2)) | 0;
    mid = (mid + Math.imul(al1, bh2)) | 0;
    mid = (mid + Math.imul(ah1, bl2)) | 0;
    hi = (hi + Math.imul(ah1, bh2)) | 0;
    lo = (lo + Math.imul(al0, bl3)) | 0;
    mid = (mid + Math.imul(al0, bh3)) | 0;
    mid = (mid + Math.imul(ah0, bl3)) | 0;
    hi = (hi + Math.imul(ah0, bh3)) | 0;
    var w3 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w3 >>> 26)) | 0;
    w3 &= 0x3ffffff;
    /* k = 4 */
    lo = Math.imul(al4, bl0);
    mid = Math.imul(al4, bh0);
    mid = (mid + Math.imul(ah4, bl0)) | 0;
    hi = Math.imul(ah4, bh0);
    lo = (lo + Math.imul(al3, bl1)) | 0;
    mid = (mid + Math.imul(al3, bh1)) | 0;
    mid = (mid + Math.imul(ah3, bl1)) | 0;
    hi = (hi + Math.imul(ah3, bh1)) | 0;
    lo = (lo + Math.imul(al2, bl2)) | 0;
    mid = (mid + Math.imul(al2, bh2)) | 0;
    mid = (mid + Math.imul(ah2, bl2)) | 0;
    hi = (hi + Math.imul(ah2, bh2)) | 0;
    lo = (lo + Math.imul(al1, bl3)) | 0;
    mid = (mid + Math.imul(al1, bh3)) | 0;
    mid = (mid + Math.imul(ah1, bl3)) | 0;
    hi = (hi + Math.imul(ah1, bh3)) | 0;
    lo = (lo + Math.imul(al0, bl4)) | 0;
    mid = (mid + Math.imul(al0, bh4)) | 0;
    mid = (mid + Math.imul(ah0, bl4)) | 0;
    hi = (hi + Math.imul(ah0, bh4)) | 0;
    var w4 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w4 >>> 26)) | 0;
    w4 &= 0x3ffffff;
    /* k = 5 */
    lo = Math.imul(al5, bl0);
    mid = Math.imul(al5, bh0);
    mid = (mid + Math.imul(ah5, bl0)) | 0;
    hi = Math.imul(ah5, bh0);
    lo = (lo + Math.imul(al4, bl1)) | 0;
    mid = (mid + Math.imul(al4, bh1)) | 0;
    mid = (mid + Math.imul(ah4, bl1)) | 0;
    hi = (hi + Math.imul(ah4, bh1)) | 0;
    lo = (lo + Math.imul(al3, bl2)) | 0;
    mid = (mid + Math.imul(al3, bh2)) | 0;
    mid = (mid + Math.imul(ah3, bl2)) | 0;
    hi = (hi + Math.imul(ah3, bh2)) | 0;
    lo = (lo + Math.imul(al2, bl3)) | 0;
    mid = (mid + Math.imul(al2, bh3)) | 0;
    mid = (mid + Math.imul(ah2, bl3)) | 0;
    hi = (hi + Math.imul(ah2, bh3)) | 0;
    lo = (lo + Math.imul(al1, bl4)) | 0;
    mid = (mid + Math.imul(al1, bh4)) | 0;
    mid = (mid + Math.imul(ah1, bl4)) | 0;
    hi = (hi + Math.imul(ah1, bh4)) | 0;
    lo = (lo + Math.imul(al0, bl5)) | 0;
    mid = (mid + Math.imul(al0, bh5)) | 0;
    mid = (mid + Math.imul(ah0, bl5)) | 0;
    hi = (hi + Math.imul(ah0, bh5)) | 0;
    var w5 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w5 >>> 26)) | 0;
    w5 &= 0x3ffffff;
    /* k = 6 */
    lo = Math.imul(al6, bl0);
    mid = Math.imul(al6, bh0);
    mid = (mid + Math.imul(ah6, bl0)) | 0;
    hi = Math.imul(ah6, bh0);
    lo = (lo + Math.imul(al5, bl1)) | 0;
    mid = (mid + Math.imul(al5, bh1)) | 0;
    mid = (mid + Math.imul(ah5, bl1)) | 0;
    hi = (hi + Math.imul(ah5, bh1)) | 0;
    lo = (lo + Math.imul(al4, bl2)) | 0;
    mid = (mid + Math.imul(al4, bh2)) | 0;
    mid = (mid + Math.imul(ah4, bl2)) | 0;
    hi = (hi + Math.imul(ah4, bh2)) | 0;
    lo = (lo + Math.imul(al3, bl3)) | 0;
    mid = (mid + Math.imul(al3, bh3)) | 0;
    mid = (mid + Math.imul(ah3, bl3)) | 0;
    hi = (hi + Math.imul(ah3, bh3)) | 0;
    lo = (lo + Math.imul(al2, bl4)) | 0;
    mid = (mid + Math.imul(al2, bh4)) | 0;
    mid = (mid + Math.imul(ah2, bl4)) | 0;
    hi = (hi + Math.imul(ah2, bh4)) | 0;
    lo = (lo + Math.imul(al1, bl5)) | 0;
    mid = (mid + Math.imul(al1, bh5)) | 0;
    mid = (mid + Math.imul(ah1, bl5)) | 0;
    hi = (hi + Math.imul(ah1, bh5)) | 0;
    lo = (lo + Math.imul(al0, bl6)) | 0;
    mid = (mid + Math.imul(al0, bh6)) | 0;
    mid = (mid + Math.imul(ah0, bl6)) | 0;
    hi = (hi + Math.imul(ah0, bh6)) | 0;
    var w6 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w6 >>> 26)) | 0;
    w6 &= 0x3ffffff;
    /* k = 7 */
    lo = Math.imul(al7, bl0);
    mid = Math.imul(al7, bh0);
    mid = (mid + Math.imul(ah7, bl0)) | 0;
    hi = Math.imul(ah7, bh0);
    lo = (lo + Math.imul(al6, bl1)) | 0;
    mid = (mid + Math.imul(al6, bh1)) | 0;
    mid = (mid + Math.imul(ah6, bl1)) | 0;
    hi = (hi + Math.imul(ah6, bh1)) | 0;
    lo = (lo + Math.imul(al5, bl2)) | 0;
    mid = (mid + Math.imul(al5, bh2)) | 0;
    mid = (mid + Math.imul(ah5, bl2)) | 0;
    hi = (hi + Math.imul(ah5, bh2)) | 0;
    lo = (lo + Math.imul(al4, bl3)) | 0;
    mid = (mid + Math.imul(al4, bh3)) | 0;
    mid = (mid + Math.imul(ah4, bl3)) | 0;
    hi = (hi + Math.imul(ah4, bh3)) | 0;
    lo = (lo + Math.imul(al3, bl4)) | 0;
    mid = (mid + Math.imul(al3, bh4)) | 0;
    mid = (mid + Math.imul(ah3, bl4)) | 0;
    hi = (hi + Math.imul(ah3, bh4)) | 0;
    lo = (lo + Math.imul(al2, bl5)) | 0;
    mid = (mid + Math.imul(al2, bh5)) | 0;
    mid = (mid + Math.imul(ah2, bl5)) | 0;
    hi = (hi + Math.imul(ah2, bh5)) | 0;
    lo = (lo + Math.imul(al1, bl6)) | 0;
    mid = (mid + Math.imul(al1, bh6)) | 0;
    mid = (mid + Math.imul(ah1, bl6)) | 0;
    hi = (hi + Math.imul(ah1, bh6)) | 0;
    lo = (lo + Math.imul(al0, bl7)) | 0;
    mid = (mid + Math.imul(al0, bh7)) | 0;
    mid = (mid + Math.imul(ah0, bl7)) | 0;
    hi = (hi + Math.imul(ah0, bh7)) | 0;
    var w7 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w7 >>> 26)) | 0;
    w7 &= 0x3ffffff;
    /* k = 8 */
    lo = Math.imul(al8, bl0);
    mid = Math.imul(al8, bh0);
    mid = (mid + Math.imul(ah8, bl0)) | 0;
    hi = Math.imul(ah8, bh0);
    lo = (lo + Math.imul(al7, bl1)) | 0;
    mid = (mid + Math.imul(al7, bh1)) | 0;
    mid = (mid + Math.imul(ah7, bl1)) | 0;
    hi = (hi + Math.imul(ah7, bh1)) | 0;
    lo = (lo + Math.imul(al6, bl2)) | 0;
    mid = (mid + Math.imul(al6, bh2)) | 0;
    mid = (mid + Math.imul(ah6, bl2)) | 0;
    hi = (hi + Math.imul(ah6, bh2)) | 0;
    lo = (lo + Math.imul(al5, bl3)) | 0;
    mid = (mid + Math.imul(al5, bh3)) | 0;
    mid = (mid + Math.imul(ah5, bl3)) | 0;
    hi = (hi + Math.imul(ah5, bh3)) | 0;
    lo = (lo + Math.imul(al4, bl4)) | 0;
    mid = (mid + Math.imul(al4, bh4)) | 0;
    mid = (mid + Math.imul(ah4, bl4)) | 0;
    hi = (hi + Math.imul(ah4, bh4)) | 0;
    lo = (lo + Math.imul(al3, bl5)) | 0;
    mid = (mid + Math.imul(al3, bh5)) | 0;
    mid = (mid + Math.imul(ah3, bl5)) | 0;
    hi = (hi + Math.imul(ah3, bh5)) | 0;
    lo = (lo + Math.imul(al2, bl6)) | 0;
    mid = (mid + Math.imul(al2, bh6)) | 0;
    mid = (mid + Math.imul(ah2, bl6)) | 0;
    hi = (hi + Math.imul(ah2, bh6)) | 0;
    lo = (lo + Math.imul(al1, bl7)) | 0;
    mid = (mid + Math.imul(al1, bh7)) | 0;
    mid = (mid + Math.imul(ah1, bl7)) | 0;
    hi = (hi + Math.imul(ah1, bh7)) | 0;
    lo = (lo + Math.imul(al0, bl8)) | 0;
    mid = (mid + Math.imul(al0, bh8)) | 0;
    mid = (mid + Math.imul(ah0, bl8)) | 0;
    hi = (hi + Math.imul(ah0, bh8)) | 0;
    var w8 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w8 >>> 26)) | 0;
    w8 &= 0x3ffffff;
    /* k = 9 */
    lo = Math.imul(al9, bl0);
    mid = Math.imul(al9, bh0);
    mid = (mid + Math.imul(ah9, bl0)) | 0;
    hi = Math.imul(ah9, bh0);
    lo = (lo + Math.imul(al8, bl1)) | 0;
    mid = (mid + Math.imul(al8, bh1)) | 0;
    mid = (mid + Math.imul(ah8, bl1)) | 0;
    hi = (hi + Math.imul(ah8, bh1)) | 0;
    lo = (lo + Math.imul(al7, bl2)) | 0;
    mid = (mid + Math.imul(al7, bh2)) | 0;
    mid = (mid + Math.imul(ah7, bl2)) | 0;
    hi = (hi + Math.imul(ah7, bh2)) | 0;
    lo = (lo + Math.imul(al6, bl3)) | 0;
    mid = (mid + Math.imul(al6, bh3)) | 0;
    mid = (mid + Math.imul(ah6, bl3)) | 0;
    hi = (hi + Math.imul(ah6, bh3)) | 0;
    lo = (lo + Math.imul(al5, bl4)) | 0;
    mid = (mid + Math.imul(al5, bh4)) | 0;
    mid = (mid + Math.imul(ah5, bl4)) | 0;
    hi = (hi + Math.imul(ah5, bh4)) | 0;
    lo = (lo + Math.imul(al4, bl5)) | 0;
    mid = (mid + Math.imul(al4, bh5)) | 0;
    mid = (mid + Math.imul(ah4, bl5)) | 0;
    hi = (hi + Math.imul(ah4, bh5)) | 0;
    lo = (lo + Math.imul(al3, bl6)) | 0;
    mid = (mid + Math.imul(al3, bh6)) | 0;
    mid = (mid + Math.imul(ah3, bl6)) | 0;
    hi = (hi + Math.imul(ah3, bh6)) | 0;
    lo = (lo + Math.imul(al2, bl7)) | 0;
    mid = (mid + Math.imul(al2, bh7)) | 0;
    mid = (mid + Math.imul(ah2, bl7)) | 0;
    hi = (hi + Math.imul(ah2, bh7)) | 0;
    lo = (lo + Math.imul(al1, bl8)) | 0;
    mid = (mid + Math.imul(al1, bh8)) | 0;
    mid = (mid + Math.imul(ah1, bl8)) | 0;
    hi = (hi + Math.imul(ah1, bh8)) | 0;
    lo = (lo + Math.imul(al0, bl9)) | 0;
    mid = (mid + Math.imul(al0, bh9)) | 0;
    mid = (mid + Math.imul(ah0, bl9)) | 0;
    hi = (hi + Math.imul(ah0, bh9)) | 0;
    var w9 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w9 >>> 26)) | 0;
    w9 &= 0x3ffffff;
    /* k = 10 */
    lo = Math.imul(al9, bl1);
    mid = Math.imul(al9, bh1);
    mid = (mid + Math.imul(ah9, bl1)) | 0;
    hi = Math.imul(ah9, bh1);
    lo = (lo + Math.imul(al8, bl2)) | 0;
    mid = (mid + Math.imul(al8, bh2)) | 0;
    mid = (mid + Math.imul(ah8, bl2)) | 0;
    hi = (hi + Math.imul(ah8, bh2)) | 0;
    lo = (lo + Math.imul(al7, bl3)) | 0;
    mid = (mid + Math.imul(al7, bh3)) | 0;
    mid = (mid + Math.imul(ah7, bl3)) | 0;
    hi = (hi + Math.imul(ah7, bh3)) | 0;
    lo = (lo + Math.imul(al6, bl4)) | 0;
    mid = (mid + Math.imul(al6, bh4)) | 0;
    mid = (mid + Math.imul(ah6, bl4)) | 0;
    hi = (hi + Math.imul(ah6, bh4)) | 0;
    lo = (lo + Math.imul(al5, bl5)) | 0;
    mid = (mid + Math.imul(al5, bh5)) | 0;
    mid = (mid + Math.imul(ah5, bl5)) | 0;
    hi = (hi + Math.imul(ah5, bh5)) | 0;
    lo = (lo + Math.imul(al4, bl6)) | 0;
    mid = (mid + Math.imul(al4, bh6)) | 0;
    mid = (mid + Math.imul(ah4, bl6)) | 0;
    hi = (hi + Math.imul(ah4, bh6)) | 0;
    lo = (lo + Math.imul(al3, bl7)) | 0;
    mid = (mid + Math.imul(al3, bh7)) | 0;
    mid = (mid + Math.imul(ah3, bl7)) | 0;
    hi = (hi + Math.imul(ah3, bh7)) | 0;
    lo = (lo + Math.imul(al2, bl8)) | 0;
    mid = (mid + Math.imul(al2, bh8)) | 0;
    mid = (mid + Math.imul(ah2, bl8)) | 0;
    hi = (hi + Math.imul(ah2, bh8)) | 0;
    lo = (lo + Math.imul(al1, bl9)) | 0;
    mid = (mid + Math.imul(al1, bh9)) | 0;
    mid = (mid + Math.imul(ah1, bl9)) | 0;
    hi = (hi + Math.imul(ah1, bh9)) | 0;
    var w10 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w10 >>> 26)) | 0;
    w10 &= 0x3ffffff;
    /* k = 11 */
    lo = Math.imul(al9, bl2);
    mid = Math.imul(al9, bh2);
    mid = (mid + Math.imul(ah9, bl2)) | 0;
    hi = Math.imul(ah9, bh2);
    lo = (lo + Math.imul(al8, bl3)) | 0;
    mid = (mid + Math.imul(al8, bh3)) | 0;
    mid = (mid + Math.imul(ah8, bl3)) | 0;
    hi = (hi + Math.imul(ah8, bh3)) | 0;
    lo = (lo + Math.imul(al7, bl4)) | 0;
    mid = (mid + Math.imul(al7, bh4)) | 0;
    mid = (mid + Math.imul(ah7, bl4)) | 0;
    hi = (hi + Math.imul(ah7, bh4)) | 0;
    lo = (lo + Math.imul(al6, bl5)) | 0;
    mid = (mid + Math.imul(al6, bh5)) | 0;
    mid = (mid + Math.imul(ah6, bl5)) | 0;
    hi = (hi + Math.imul(ah6, bh5)) | 0;
    lo = (lo + Math.imul(al5, bl6)) | 0;
    mid = (mid + Math.imul(al5, bh6)) | 0;
    mid = (mid + Math.imul(ah5, bl6)) | 0;
    hi = (hi + Math.imul(ah5, bh6)) | 0;
    lo = (lo + Math.imul(al4, bl7)) | 0;
    mid = (mid + Math.imul(al4, bh7)) | 0;
    mid = (mid + Math.imul(ah4, bl7)) | 0;
    hi = (hi + Math.imul(ah4, bh7)) | 0;
    lo = (lo + Math.imul(al3, bl8)) | 0;
    mid = (mid + Math.imul(al3, bh8)) | 0;
    mid = (mid + Math.imul(ah3, bl8)) | 0;
    hi = (hi + Math.imul(ah3, bh8)) | 0;
    lo = (lo + Math.imul(al2, bl9)) | 0;
    mid = (mid + Math.imul(al2, bh9)) | 0;
    mid = (mid + Math.imul(ah2, bl9)) | 0;
    hi = (hi + Math.imul(ah2, bh9)) | 0;
    var w11 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w11 >>> 26)) | 0;
    w11 &= 0x3ffffff;
    /* k = 12 */
    lo = Math.imul(al9, bl3);
    mid = Math.imul(al9, bh3);
    mid = (mid + Math.imul(ah9, bl3)) | 0;
    hi = Math.imul(ah9, bh3);
    lo = (lo + Math.imul(al8, bl4)) | 0;
    mid = (mid + Math.imul(al8, bh4)) | 0;
    mid = (mid + Math.imul(ah8, bl4)) | 0;
    hi = (hi + Math.imul(ah8, bh4)) | 0;
    lo = (lo + Math.imul(al7, bl5)) | 0;
    mid = (mid + Math.imul(al7, bh5)) | 0;
    mid = (mid + Math.imul(ah7, bl5)) | 0;
    hi = (hi + Math.imul(ah7, bh5)) | 0;
    lo = (lo + Math.imul(al6, bl6)) | 0;
    mid = (mid + Math.imul(al6, bh6)) | 0;
    mid = (mid + Math.imul(ah6, bl6)) | 0;
    hi = (hi + Math.imul(ah6, bh6)) | 0;
    lo = (lo + Math.imul(al5, bl7)) | 0;
    mid = (mid + Math.imul(al5, bh7)) | 0;
    mid = (mid + Math.imul(ah5, bl7)) | 0;
    hi = (hi + Math.imul(ah5, bh7)) | 0;
    lo = (lo + Math.imul(al4, bl8)) | 0;
    mid = (mid + Math.imul(al4, bh8)) | 0;
    mid = (mid + Math.imul(ah4, bl8)) | 0;
    hi = (hi + Math.imul(ah4, bh8)) | 0;
    lo = (lo + Math.imul(al3, bl9)) | 0;
    mid = (mid + Math.imul(al3, bh9)) | 0;
    mid = (mid + Math.imul(ah3, bl9)) | 0;
    hi = (hi + Math.imul(ah3, bh9)) | 0;
    var w12 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w12 >>> 26)) | 0;
    w12 &= 0x3ffffff;
    /* k = 13 */
    lo = Math.imul(al9, bl4);
    mid = Math.imul(al9, bh4);
    mid = (mid + Math.imul(ah9, bl4)) | 0;
    hi = Math.imul(ah9, bh4);
    lo = (lo + Math.imul(al8, bl5)) | 0;
    mid = (mid + Math.imul(al8, bh5)) | 0;
    mid = (mid + Math.imul(ah8, bl5)) | 0;
    hi = (hi + Math.imul(ah8, bh5)) | 0;
    lo = (lo + Math.imul(al7, bl6)) | 0;
    mid = (mid + Math.imul(al7, bh6)) | 0;
    mid = (mid + Math.imul(ah7, bl6)) | 0;
    hi = (hi + Math.imul(ah7, bh6)) | 0;
    lo = (lo + Math.imul(al6, bl7)) | 0;
    mid = (mid + Math.imul(al6, bh7)) | 0;
    mid = (mid + Math.imul(ah6, bl7)) | 0;
    hi = (hi + Math.imul(ah6, bh7)) | 0;
    lo = (lo + Math.imul(al5, bl8)) | 0;
    mid = (mid + Math.imul(al5, bh8)) | 0;
    mid = (mid + Math.imul(ah5, bl8)) | 0;
    hi = (hi + Math.imul(ah5, bh8)) | 0;
    lo = (lo + Math.imul(al4, bl9)) | 0;
    mid = (mid + Math.imul(al4, bh9)) | 0;
    mid = (mid + Math.imul(ah4, bl9)) | 0;
    hi = (hi + Math.imul(ah4, bh9)) | 0;
    var w13 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w13 >>> 26)) | 0;
    w13 &= 0x3ffffff;
    /* k = 14 */
    lo = Math.imul(al9, bl5);
    mid = Math.imul(al9, bh5);
    mid = (mid + Math.imul(ah9, bl5)) | 0;
    hi = Math.imul(ah9, bh5);
    lo = (lo + Math.imul(al8, bl6)) | 0;
    mid = (mid + Math.imul(al8, bh6)) | 0;
    mid = (mid + Math.imul(ah8, bl6)) | 0;
    hi = (hi + Math.imul(ah8, bh6)) | 0;
    lo = (lo + Math.imul(al7, bl7)) | 0;
    mid = (mid + Math.imul(al7, bh7)) | 0;
    mid = (mid + Math.imul(ah7, bl7)) | 0;
    hi = (hi + Math.imul(ah7, bh7)) | 0;
    lo = (lo + Math.imul(al6, bl8)) | 0;
    mid = (mid + Math.imul(al6, bh8)) | 0;
    mid = (mid + Math.imul(ah6, bl8)) | 0;
    hi = (hi + Math.imul(ah6, bh8)) | 0;
    lo = (lo + Math.imul(al5, bl9)) | 0;
    mid = (mid + Math.imul(al5, bh9)) | 0;
    mid = (mid + Math.imul(ah5, bl9)) | 0;
    hi = (hi + Math.imul(ah5, bh9)) | 0;
    var w14 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w14 >>> 26)) | 0;
    w14 &= 0x3ffffff;
    /* k = 15 */
    lo = Math.imul(al9, bl6);
    mid = Math.imul(al9, bh6);
    mid = (mid + Math.imul(ah9, bl6)) | 0;
    hi = Math.imul(ah9, bh6);
    lo = (lo + Math.imul(al8, bl7)) | 0;
    mid = (mid + Math.imul(al8, bh7)) | 0;
    mid = (mid + Math.imul(ah8, bl7)) | 0;
    hi = (hi + Math.imul(ah8, bh7)) | 0;
    lo = (lo + Math.imul(al7, bl8)) | 0;
    mid = (mid + Math.imul(al7, bh8)) | 0;
    mid = (mid + Math.imul(ah7, bl8)) | 0;
    hi = (hi + Math.imul(ah7, bh8)) | 0;
    lo = (lo + Math.imul(al6, bl9)) | 0;
    mid = (mid + Math.imul(al6, bh9)) | 0;
    mid = (mid + Math.imul(ah6, bl9)) | 0;
    hi = (hi + Math.imul(ah6, bh9)) | 0;
    var w15 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w15 >>> 26)) | 0;
    w15 &= 0x3ffffff;
    /* k = 16 */
    lo = Math.imul(al9, bl7);
    mid = Math.imul(al9, bh7);
    mid = (mid + Math.imul(ah9, bl7)) | 0;
    hi = Math.imul(ah9, bh7);
    lo = (lo + Math.imul(al8, bl8)) | 0;
    mid = (mid + Math.imul(al8, bh8)) | 0;
    mid = (mid + Math.imul(ah8, bl8)) | 0;
    hi = (hi + Math.imul(ah8, bh8)) | 0;
    lo = (lo + Math.imul(al7, bl9)) | 0;
    mid = (mid + Math.imul(al7, bh9)) | 0;
    mid = (mid + Math.imul(ah7, bl9)) | 0;
    hi = (hi + Math.imul(ah7, bh9)) | 0;
    var w16 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w16 >>> 26)) | 0;
    w16 &= 0x3ffffff;
    /* k = 17 */
    lo = Math.imul(al9, bl8);
    mid = Math.imul(al9, bh8);
    mid = (mid + Math.imul(ah9, bl8)) | 0;
    hi = Math.imul(ah9, bh8);
    lo = (lo + Math.imul(al8, bl9)) | 0;
    mid = (mid + Math.imul(al8, bh9)) | 0;
    mid = (mid + Math.imul(ah8, bl9)) | 0;
    hi = (hi + Math.imul(ah8, bh9)) | 0;
    var w17 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w17 >>> 26)) | 0;
    w17 &= 0x3ffffff;
    /* k = 18 */
    lo = Math.imul(al9, bl9);
    mid = Math.imul(al9, bh9);
    mid = (mid + Math.imul(ah9, bl9)) | 0;
    hi = Math.imul(ah9, bh9);
    var w18 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w18 >>> 26)) | 0;
    w18 &= 0x3ffffff;
    o[0] = w0;
    o[1] = w1;
    o[2] = w2;
    o[3] = w3;
    o[4] = w4;
    o[5] = w5;
    o[6] = w6;
    o[7] = w7;
    o[8] = w8;
    o[9] = w9;
    o[10] = w10;
    o[11] = w11;
    o[12] = w12;
    o[13] = w13;
    o[14] = w14;
    o[15] = w15;
    o[16] = w16;
    o[17] = w17;
    o[18] = w18;
    if (c !== 0) {
      o[19] = c;
      out.length++;
    }
    return out;
  };

  // Polyfill comb
  if (!Math.imul) {
    comb10MulTo = smallMulTo;
  }

  function bigMulTo (self, num, out) {
    out.negative = num.negative ^ self.negative;
    out.length = self.length + num.length;

    var carry = 0;
    var hncarry = 0;
    for (var k = 0; k < out.length - 1; k++) {
      // Sum all words with the same `i + j = k` and accumulate `ncarry`,
      // note that ncarry could be >= 0x3ffffff
      var ncarry = hncarry;
      hncarry = 0;
      var rword = carry & 0x3ffffff;
      var maxJ = Math.min(k, num.length - 1);
      for (var j = Math.max(0, k - self.length + 1); j <= maxJ; j++) {
        var i = k - j;
        var a = self.words[i] | 0;
        var b = num.words[j] | 0;
        var r = a * b;

        var lo = r & 0x3ffffff;
        ncarry = (ncarry + ((r / 0x4000000) | 0)) | 0;
        lo = (lo + rword) | 0;
        rword = lo & 0x3ffffff;
        ncarry = (ncarry + (lo >>> 26)) | 0;

        hncarry += ncarry >>> 26;
        ncarry &= 0x3ffffff;
      }
      out.words[k] = rword;
      carry = ncarry;
      ncarry = hncarry;
    }
    if (carry !== 0) {
      out.words[k] = carry;
    } else {
      out.length--;
    }

    return out.strip();
  }

  function jumboMulTo (self, num, out) {
    var fftm = new FFTM();
    return fftm.mulp(self, num, out);
  }

  BN.prototype.mulTo = function mulTo (num, out) {
    var res;
    var len = this.length + num.length;
    if (this.length === 10 && num.length === 10) {
      res = comb10MulTo(this, num, out);
    } else if (len < 63) {
      res = smallMulTo(this, num, out);
    } else if (len < 1024) {
      res = bigMulTo(this, num, out);
    } else {
      res = jumboMulTo(this, num, out);
    }

    return res;
  };

  // Cooley-Tukey algorithm for FFT
  // slightly revisited to rely on looping instead of recursion

  function FFTM (x, y) {
    this.x = x;
    this.y = y;
  }

  FFTM.prototype.makeRBT = function makeRBT (N) {
    var t = new Array(N);
    var l = BN.prototype._countBits(N) - 1;
    for (var i = 0; i < N; i++) {
      t[i] = this.revBin(i, l, N);
    }

    return t;
  };

  // Returns binary-reversed representation of `x`
  FFTM.prototype.revBin = function revBin (x, l, N) {
    if (x === 0 || x === N - 1) return x;

    var rb = 0;
    for (var i = 0; i < l; i++) {
      rb |= (x & 1) << (l - i - 1);
      x >>= 1;
    }

    return rb;
  };

  // Performs "tweedling" phase, therefore 'emulating'
  // behaviour of the recursive algorithm
  FFTM.prototype.permute = function permute (rbt, rws, iws, rtws, itws, N) {
    for (var i = 0; i < N; i++) {
      rtws[i] = rws[rbt[i]];
      itws[i] = iws[rbt[i]];
    }
  };

  FFTM.prototype.transform = function transform (rws, iws, rtws, itws, N, rbt) {
    this.permute(rbt, rws, iws, rtws, itws, N);

    for (var s = 1; s < N; s <<= 1) {
      var l = s << 1;

      var rtwdf = Math.cos(2 * Math.PI / l);
      var itwdf = Math.sin(2 * Math.PI / l);

      for (var p = 0; p < N; p += l) {
        var rtwdf_ = rtwdf;
        var itwdf_ = itwdf;

        for (var j = 0; j < s; j++) {
          var re = rtws[p + j];
          var ie = itws[p + j];

          var ro = rtws[p + j + s];
          var io = itws[p + j + s];

          var rx = rtwdf_ * ro - itwdf_ * io;

          io = rtwdf_ * io + itwdf_ * ro;
          ro = rx;

          rtws[p + j] = re + ro;
          itws[p + j] = ie + io;

          rtws[p + j + s] = re - ro;
          itws[p + j + s] = ie - io;

          /* jshint maxdepth : false */
          if (j !== l) {
            rx = rtwdf * rtwdf_ - itwdf * itwdf_;

            itwdf_ = rtwdf * itwdf_ + itwdf * rtwdf_;
            rtwdf_ = rx;
          }
        }
      }
    }
  };

  FFTM.prototype.guessLen13b = function guessLen13b (n, m) {
    var N = Math.max(m, n) | 1;
    var odd = N & 1;
    var i = 0;
    for (N = N / 2 | 0; N; N = N >>> 1) {
      i++;
    }

    return 1 << i + 1 + odd;
  };

  FFTM.prototype.conjugate = function conjugate (rws, iws, N) {
    if (N <= 1) return;

    for (var i = 0; i < N / 2; i++) {
      var t = rws[i];

      rws[i] = rws[N - i - 1];
      rws[N - i - 1] = t;

      t = iws[i];

      iws[i] = -iws[N - i - 1];
      iws[N - i - 1] = -t;
    }
  };

  FFTM.prototype.normalize13b = function normalize13b (ws, N) {
    var carry = 0;
    for (var i = 0; i < N / 2; i++) {
      var w = Math.round(ws[2 * i + 1] / N) * 0x2000 +
        Math.round(ws[2 * i] / N) +
        carry;

      ws[i] = w & 0x3ffffff;

      if (w < 0x4000000) {
        carry = 0;
      } else {
        carry = w / 0x4000000 | 0;
      }
    }

    return ws;
  };

  FFTM.prototype.convert13b = function convert13b (ws, len, rws, N) {
    var carry = 0;
    for (var i = 0; i < len; i++) {
      carry = carry + (ws[i] | 0);

      rws[2 * i] = carry & 0x1fff; carry = carry >>> 13;
      rws[2 * i + 1] = carry & 0x1fff; carry = carry >>> 13;
    }

    // Pad with zeroes
    for (i = 2 * len; i < N; ++i) {
      rws[i] = 0;
    }

    assert(carry === 0);
    assert((carry & ~0x1fff) === 0);
  };

  FFTM.prototype.stub = function stub (N) {
    var ph = new Array(N);
    for (var i = 0; i < N; i++) {
      ph[i] = 0;
    }

    return ph;
  };

  FFTM.prototype.mulp = function mulp (x, y, out) {
    var N = 2 * this.guessLen13b(x.length, y.length);

    var rbt = this.makeRBT(N);

    var _ = this.stub(N);

    var rws = new Array(N);
    var rwst = new Array(N);
    var iwst = new Array(N);

    var nrws = new Array(N);
    var nrwst = new Array(N);
    var niwst = new Array(N);

    var rmws = out.words;
    rmws.length = N;

    this.convert13b(x.words, x.length, rws, N);
    this.convert13b(y.words, y.length, nrws, N);

    this.transform(rws, _, rwst, iwst, N, rbt);
    this.transform(nrws, _, nrwst, niwst, N, rbt);

    for (var i = 0; i < N; i++) {
      var rx = rwst[i] * nrwst[i] - iwst[i] * niwst[i];
      iwst[i] = rwst[i] * niwst[i] + iwst[i] * nrwst[i];
      rwst[i] = rx;
    }

    this.conjugate(rwst, iwst, N);
    this.transform(rwst, iwst, rmws, _, N, rbt);
    this.conjugate(rmws, _, N);
    this.normalize13b(rmws, N);

    out.negative = x.negative ^ y.negative;
    out.length = x.length + y.length;
    return out.strip();
  };

  // Multiply `this` by `num`
  BN.prototype.mul = function mul (num) {
    var out = new BN(null);
    out.words = new Array(this.length + num.length);
    return this.mulTo(num, out);
  };

  // Multiply employing FFT
  BN.prototype.mulf = function mulf (num) {
    var out = new BN(null);
    out.words = new Array(this.length + num.length);
    return jumboMulTo(this, num, out);
  };

  // In-place Multiplication
  BN.prototype.imul = function imul (num) {
    return this.clone().mulTo(num, this);
  };

  BN.prototype.imuln = function imuln (num) {
    assert(typeof num === 'number');
    assert(num < 0x4000000);

    // Carry
    var carry = 0;
    for (var i = 0; i < this.length; i++) {
      var w = (this.words[i] | 0) * num;
      var lo = (w & 0x3ffffff) + (carry & 0x3ffffff);
      carry >>= 26;
      carry += (w / 0x4000000) | 0;
      // NOTE: lo is 27bit maximum
      carry += lo >>> 26;
      this.words[i] = lo & 0x3ffffff;
    }

    if (carry !== 0) {
      this.words[i] = carry;
      this.length++;
    }

    return this;
  };

  BN.prototype.muln = function muln (num) {
    return this.clone().imuln(num);
  };

  // `this` * `this`
  BN.prototype.sqr = function sqr () {
    return this.mul(this);
  };

  // `this` * `this` in-place
  BN.prototype.isqr = function isqr () {
    return this.imul(this.clone());
  };

  // Math.pow(`this`, `num`)
  BN.prototype.pow = function pow (num) {
    var w = toBitArray(num);
    if (w.length === 0) return new BN(1);

    // Skip leading zeroes
    var res = this;
    for (var i = 0; i < w.length; i++, res = res.sqr()) {
      if (w[i] !== 0) break;
    }

    if (++i < w.length) {
      for (var q = res.sqr(); i < w.length; i++, q = q.sqr()) {
        if (w[i] === 0) continue;

        res = res.mul(q);
      }
    }

    return res;
  };

  // Shift-left in-place
  BN.prototype.iushln = function iushln (bits) {
    assert(typeof bits === 'number' && bits >= 0);
    var r = bits % 26;
    var s = (bits - r) / 26;
    var carryMask = (0x3ffffff >>> (26 - r)) << (26 - r);
    var i;

    if (r !== 0) {
      var carry = 0;

      for (i = 0; i < this.length; i++) {
        var newCarry = this.words[i] & carryMask;
        var c = ((this.words[i] | 0) - newCarry) << r;
        this.words[i] = c | carry;
        carry = newCarry >>> (26 - r);
      }

      if (carry) {
        this.words[i] = carry;
        this.length++;
      }
    }

    if (s !== 0) {
      for (i = this.length - 1; i >= 0; i--) {
        this.words[i + s] = this.words[i];
      }

      for (i = 0; i < s; i++) {
        this.words[i] = 0;
      }

      this.length += s;
    }

    return this.strip();
  };

  BN.prototype.ishln = function ishln (bits) {
    // TODO(indutny): implement me
    assert(this.negative === 0);
    return this.iushln(bits);
  };

  // Shift-right in-place
  // NOTE: `hint` is a lowest bit before trailing zeroes
  // NOTE: if `extended` is present - it will be filled with destroyed bits
  BN.prototype.iushrn = function iushrn (bits, hint, extended) {
    assert(typeof bits === 'number' && bits >= 0);
    var h;
    if (hint) {
      h = (hint - (hint % 26)) / 26;
    } else {
      h = 0;
    }

    var r = bits % 26;
    var s = Math.min((bits - r) / 26, this.length);
    var mask = 0x3ffffff ^ ((0x3ffffff >>> r) << r);
    var maskedWords = extended;

    h -= s;
    h = Math.max(0, h);

    // Extended mode, copy masked part
    if (maskedWords) {
      for (var i = 0; i < s; i++) {
        maskedWords.words[i] = this.words[i];
      }
      maskedWords.length = s;
    }

    if (s === 0) {
      // No-op, we should not move anything at all
    } else if (this.length > s) {
      this.length -= s;
      for (i = 0; i < this.length; i++) {
        this.words[i] = this.words[i + s];
      }
    } else {
      this.words[0] = 0;
      this.length = 1;
    }

    var carry = 0;
    for (i = this.length - 1; i >= 0 && (carry !== 0 || i >= h); i--) {
      var word = this.words[i] | 0;
      this.words[i] = (carry << (26 - r)) | (word >>> r);
      carry = word & mask;
    }

    // Push carried bits as a mask
    if (maskedWords && carry !== 0) {
      maskedWords.words[maskedWords.length++] = carry;
    }

    if (this.length === 0) {
      this.words[0] = 0;
      this.length = 1;
    }

    return this.strip();
  };

  BN.prototype.ishrn = function ishrn (bits, hint, extended) {
    // TODO(indutny): implement me
    assert(this.negative === 0);
    return this.iushrn(bits, hint, extended);
  };

  // Shift-left
  BN.prototype.shln = function shln (bits) {
    return this.clone().ishln(bits);
  };

  BN.prototype.ushln = function ushln (bits) {
    return this.clone().iushln(bits);
  };

  // Shift-right
  BN.prototype.shrn = function shrn (bits) {
    return this.clone().ishrn(bits);
  };

  BN.prototype.ushrn = function ushrn (bits) {
    return this.clone().iushrn(bits);
  };

  // Test if n bit is set
  BN.prototype.testn = function testn (bit) {
    assert(typeof bit === 'number' && bit >= 0);
    var r = bit % 26;
    var s = (bit - r) / 26;
    var q = 1 << r;

    // Fast case: bit is much higher than all existing words
    if (this.length <= s) return false;

    // Check bit and return
    var w = this.words[s];

    return !!(w & q);
  };

  // Return only lowers bits of number (in-place)
  BN.prototype.imaskn = function imaskn (bits) {
    assert(typeof bits === 'number' && bits >= 0);
    var r = bits % 26;
    var s = (bits - r) / 26;

    assert(this.negative === 0, 'imaskn works only with positive numbers');

    if (this.length <= s) {
      return this;
    }

    if (r !== 0) {
      s++;
    }
    this.length = Math.min(s, this.length);

    if (r !== 0) {
      var mask = 0x3ffffff ^ ((0x3ffffff >>> r) << r);
      this.words[this.length - 1] &= mask;
    }

    return this.strip();
  };

  // Return only lowers bits of number
  BN.prototype.maskn = function maskn (bits) {
    return this.clone().imaskn(bits);
  };

  // Add plain number `num` to `this`
  BN.prototype.iaddn = function iaddn (num) {
    assert(typeof num === 'number');
    assert(num < 0x4000000);
    if (num < 0) return this.isubn(-num);

    // Possible sign change
    if (this.negative !== 0) {
      if (this.length === 1 && (this.words[0] | 0) < num) {
        this.words[0] = num - (this.words[0] | 0);
        this.negative = 0;
        return this;
      }

      this.negative = 0;
      this.isubn(num);
      this.negative = 1;
      return this;
    }

    // Add without checks
    return this._iaddn(num);
  };

  BN.prototype._iaddn = function _iaddn (num) {
    this.words[0] += num;

    // Carry
    for (var i = 0; i < this.length && this.words[i] >= 0x4000000; i++) {
      this.words[i] -= 0x4000000;
      if (i === this.length - 1) {
        this.words[i + 1] = 1;
      } else {
        this.words[i + 1]++;
      }
    }
    this.length = Math.max(this.length, i + 1);

    return this;
  };

  // Subtract plain number `num` from `this`
  BN.prototype.isubn = function isubn (num) {
    assert(typeof num === 'number');
    assert(num < 0x4000000);
    if (num < 0) return this.iaddn(-num);

    if (this.negative !== 0) {
      this.negative = 0;
      this.iaddn(num);
      this.negative = 1;
      return this;
    }

    this.words[0] -= num;

    if (this.length === 1 && this.words[0] < 0) {
      this.words[0] = -this.words[0];
      this.negative = 1;
    } else {
      // Carry
      for (var i = 0; i < this.length && this.words[i] < 0; i++) {
        this.words[i] += 0x4000000;
        this.words[i + 1] -= 1;
      }
    }

    return this.strip();
  };

  BN.prototype.addn = function addn (num) {
    return this.clone().iaddn(num);
  };

  BN.prototype.subn = function subn (num) {
    return this.clone().isubn(num);
  };

  BN.prototype.iabs = function iabs () {
    this.negative = 0;

    return this;
  };

  BN.prototype.abs = function abs () {
    return this.clone().iabs();
  };

  BN.prototype._ishlnsubmul = function _ishlnsubmul (num, mul, shift) {
    var len = num.length + shift;
    var i;

    this._expand(len);

    var w;
    var carry = 0;
    for (i = 0; i < num.length; i++) {
      w = (this.words[i + shift] | 0) + carry;
      var right = (num.words[i] | 0) * mul;
      w -= right & 0x3ffffff;
      carry = (w >> 26) - ((right / 0x4000000) | 0);
      this.words[i + shift] = w & 0x3ffffff;
    }
    for (; i < this.length - shift; i++) {
      w = (this.words[i + shift] | 0) + carry;
      carry = w >> 26;
      this.words[i + shift] = w & 0x3ffffff;
    }

    if (carry === 0) return this.strip();

    // Subtraction overflow
    assert(carry === -1);
    carry = 0;
    for (i = 0; i < this.length; i++) {
      w = -(this.words[i] | 0) + carry;
      carry = w >> 26;
      this.words[i] = w & 0x3ffffff;
    }
    this.negative = 1;

    return this.strip();
  };

  BN.prototype._wordDiv = function _wordDiv (num, mode) {
    var shift = this.length - num.length;

    var a = this.clone();
    var b = num;

    // Normalize
    var bhi = b.words[b.length - 1] | 0;
    var bhiBits = this._countBits(bhi);
    shift = 26 - bhiBits;
    if (shift !== 0) {
      b = b.ushln(shift);
      a.iushln(shift);
      bhi = b.words[b.length - 1] | 0;
    }

    // Initialize quotient
    var m = a.length - b.length;
    var q;

    if (mode !== 'mod') {
      q = new BN(null);
      q.length = m + 1;
      q.words = new Array(q.length);
      for (var i = 0; i < q.length; i++) {
        q.words[i] = 0;
      }
    }

    var diff = a.clone()._ishlnsubmul(b, 1, m);
    if (diff.negative === 0) {
      a = diff;
      if (q) {
        q.words[m] = 1;
      }
    }

    for (var j = m - 1; j >= 0; j--) {
      var qj = (a.words[b.length + j] | 0) * 0x4000000 +
        (a.words[b.length + j - 1] | 0);

      // NOTE: (qj / bhi) is (0x3ffffff * 0x4000000 + 0x3ffffff) / 0x2000000 max
      // (0x7ffffff)
      qj = Math.min((qj / bhi) | 0, 0x3ffffff);

      a._ishlnsubmul(b, qj, j);
      while (a.negative !== 0) {
        qj--;
        a.negative = 0;
        a._ishlnsubmul(b, 1, j);
        if (!a.isZero()) {
          a.negative ^= 1;
        }
      }
      if (q) {
        q.words[j] = qj;
      }
    }
    if (q) {
      q.strip();
    }
    a.strip();

    // Denormalize
    if (mode !== 'div' && shift !== 0) {
      a.iushrn(shift);
    }

    return {
      div: q || null,
      mod: a
    };
  };

  // NOTE: 1) `mode` can be set to `mod` to request mod only,
  //       to `div` to request div only, or be absent to
  //       request both div & mod
  //       2) `positive` is true if unsigned mod is requested
  BN.prototype.divmod = function divmod (num, mode, positive) {
    assert(!num.isZero());

    if (this.isZero()) {
      return {
        div: new BN(0),
        mod: new BN(0)
      };
    }

    var div, mod, res;
    if (this.negative !== 0 && num.negative === 0) {
      res = this.neg().divmod(num, mode);

      if (mode !== 'mod') {
        div = res.div.neg();
      }

      if (mode !== 'div') {
        mod = res.mod.neg();
        if (positive && mod.negative !== 0) {
          mod.iadd(num);
        }
      }

      return {
        div: div,
        mod: mod
      };
    }

    if (this.negative === 0 && num.negative !== 0) {
      res = this.divmod(num.neg(), mode);

      if (mode !== 'mod') {
        div = res.div.neg();
      }

      return {
        div: div,
        mod: res.mod
      };
    }

    if ((this.negative & num.negative) !== 0) {
      res = this.neg().divmod(num.neg(), mode);

      if (mode !== 'div') {
        mod = res.mod.neg();
        if (positive && mod.negative !== 0) {
          mod.isub(num);
        }
      }

      return {
        div: res.div,
        mod: mod
      };
    }

    // Both numbers are positive at this point

    // Strip both numbers to approximate shift value
    if (num.length > this.length || this.cmp(num) < 0) {
      return {
        div: new BN(0),
        mod: this
      };
    }

    // Very short reduction
    if (num.length === 1) {
      if (mode === 'div') {
        return {
          div: this.divn(num.words[0]),
          mod: null
        };
      }

      if (mode === 'mod') {
        return {
          div: null,
          mod: new BN(this.modn(num.words[0]))
        };
      }

      return {
        div: this.divn(num.words[0]),
        mod: new BN(this.modn(num.words[0]))
      };
    }

    return this._wordDiv(num, mode);
  };

  // Find `this` / `num`
  BN.prototype.div = function div (num) {
    return this.divmod(num, 'div', false).div;
  };

  // Find `this` % `num`
  BN.prototype.mod = function mod (num) {
    return this.divmod(num, 'mod', false).mod;
  };

  BN.prototype.umod = function umod (num) {
    return this.divmod(num, 'mod', true).mod;
  };

  // Find Round(`this` / `num`)
  BN.prototype.divRound = function divRound (num) {
    var dm = this.divmod(num);

    // Fast case - exact division
    if (dm.mod.isZero()) return dm.div;

    var mod = dm.div.negative !== 0 ? dm.mod.isub(num) : dm.mod;

    var half = num.ushrn(1);
    var r2 = num.andln(1);
    var cmp = mod.cmp(half);

    // Round down
    if (cmp < 0 || r2 === 1 && cmp === 0) return dm.div;

    // Round up
    return dm.div.negative !== 0 ? dm.div.isubn(1) : dm.div.iaddn(1);
  };

  BN.prototype.modn = function modn (num) {
    assert(num <= 0x3ffffff);
    var p = (1 << 26) % num;

    var acc = 0;
    for (var i = this.length - 1; i >= 0; i--) {
      acc = (p * acc + (this.words[i] | 0)) % num;
    }

    return acc;
  };

  // In-place division by number
  BN.prototype.idivn = function idivn (num) {
    assert(num <= 0x3ffffff);

    var carry = 0;
    for (var i = this.length - 1; i >= 0; i--) {
      var w = (this.words[i] | 0) + carry * 0x4000000;
      this.words[i] = (w / num) | 0;
      carry = w % num;
    }

    return this.strip();
  };

  BN.prototype.divn = function divn (num) {
    return this.clone().idivn(num);
  };

  BN.prototype.egcd = function egcd (p) {
    assert(p.negative === 0);
    assert(!p.isZero());

    var x = this;
    var y = p.clone();

    if (x.negative !== 0) {
      x = x.umod(p);
    } else {
      x = x.clone();
    }

    // A * x + B * y = x
    var A = new BN(1);
    var B = new BN(0);

    // C * x + D * y = y
    var C = new BN(0);
    var D = new BN(1);

    var g = 0;

    while (x.isEven() && y.isEven()) {
      x.iushrn(1);
      y.iushrn(1);
      ++g;
    }

    var yp = y.clone();
    var xp = x.clone();

    while (!x.isZero()) {
      for (var i = 0, im = 1; (x.words[0] & im) === 0 && i < 26; ++i, im <<= 1);
      if (i > 0) {
        x.iushrn(i);
        while (i-- > 0) {
          if (A.isOdd() || B.isOdd()) {
            A.iadd(yp);
            B.isub(xp);
          }

          A.iushrn(1);
          B.iushrn(1);
        }
      }

      for (var j = 0, jm = 1; (y.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1);
      if (j > 0) {
        y.iushrn(j);
        while (j-- > 0) {
          if (C.isOdd() || D.isOdd()) {
            C.iadd(yp);
            D.isub(xp);
          }

          C.iushrn(1);
          D.iushrn(1);
        }
      }

      if (x.cmp(y) >= 0) {
        x.isub(y);
        A.isub(C);
        B.isub(D);
      } else {
        y.isub(x);
        C.isub(A);
        D.isub(B);
      }
    }

    return {
      a: C,
      b: D,
      gcd: y.iushln(g)
    };
  };

  // This is reduced incarnation of the binary EEA
  // above, designated to invert members of the
  // _prime_ fields F(p) at a maximal speed
  BN.prototype._invmp = function _invmp (p) {
    assert(p.negative === 0);
    assert(!p.isZero());

    var a = this;
    var b = p.clone();

    if (a.negative !== 0) {
      a = a.umod(p);
    } else {
      a = a.clone();
    }

    var x1 = new BN(1);
    var x2 = new BN(0);

    var delta = b.clone();

    while (a.cmpn(1) > 0 && b.cmpn(1) > 0) {
      for (var i = 0, im = 1; (a.words[0] & im) === 0 && i < 26; ++i, im <<= 1);
      if (i > 0) {
        a.iushrn(i);
        while (i-- > 0) {
          if (x1.isOdd()) {
            x1.iadd(delta);
          }

          x1.iushrn(1);
        }
      }

      for (var j = 0, jm = 1; (b.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1);
      if (j > 0) {
        b.iushrn(j);
        while (j-- > 0) {
          if (x2.isOdd()) {
            x2.iadd(delta);
          }

          x2.iushrn(1);
        }
      }

      if (a.cmp(b) >= 0) {
        a.isub(b);
        x1.isub(x2);
      } else {
        b.isub(a);
        x2.isub(x1);
      }
    }

    var res;
    if (a.cmpn(1) === 0) {
      res = x1;
    } else {
      res = x2;
    }

    if (res.cmpn(0) < 0) {
      res.iadd(p);
    }

    return res;
  };

  BN.prototype.gcd = function gcd (num) {
    if (this.isZero()) return num.abs();
    if (num.isZero()) return this.abs();

    var a = this.clone();
    var b = num.clone();
    a.negative = 0;
    b.negative = 0;

    // Remove common factor of two
    for (var shift = 0; a.isEven() && b.isEven(); shift++) {
      a.iushrn(1);
      b.iushrn(1);
    }

    do {
      while (a.isEven()) {
        a.iushrn(1);
      }
      while (b.isEven()) {
        b.iushrn(1);
      }

      var r = a.cmp(b);
      if (r < 0) {
        // Swap `a` and `b` to make `a` always bigger than `b`
        var t = a;
        a = b;
        b = t;
      } else if (r === 0 || b.cmpn(1) === 0) {
        break;
      }

      a.isub(b);
    } while (true);

    return b.iushln(shift);
  };

  // Invert number in the field F(num)
  BN.prototype.invm = function invm (num) {
    return this.egcd(num).a.umod(num);
  };

  BN.prototype.isEven = function isEven () {
    return (this.words[0] & 1) === 0;
  };

  BN.prototype.isOdd = function isOdd () {
    return (this.words[0] & 1) === 1;
  };

  // And first word and num
  BN.prototype.andln = function andln (num) {
    return this.words[0] & num;
  };

  // Increment at the bit position in-line
  BN.prototype.bincn = function bincn (bit) {
    assert(typeof bit === 'number');
    var r = bit % 26;
    var s = (bit - r) / 26;
    var q = 1 << r;

    // Fast case: bit is much higher than all existing words
    if (this.length <= s) {
      this._expand(s + 1);
      this.words[s] |= q;
      return this;
    }

    // Add bit and propagate, if needed
    var carry = q;
    for (var i = s; carry !== 0 && i < this.length; i++) {
      var w = this.words[i] | 0;
      w += carry;
      carry = w >>> 26;
      w &= 0x3ffffff;
      this.words[i] = w;
    }
    if (carry !== 0) {
      this.words[i] = carry;
      this.length++;
    }
    return this;
  };

  BN.prototype.isZero = function isZero () {
    return this.length === 1 && this.words[0] === 0;
  };

  BN.prototype.cmpn = function cmpn (num) {
    var negative = num < 0;

    if (this.negative !== 0 && !negative) return -1;
    if (this.negative === 0 && negative) return 1;

    this.strip();

    var res;
    if (this.length > 1) {
      res = 1;
    } else {
      if (negative) {
        num = -num;
      }

      assert(num <= 0x3ffffff, 'Number is too big');

      var w = this.words[0] | 0;
      res = w === num ? 0 : w < num ? -1 : 1;
    }
    if (this.negative !== 0) return -res | 0;
    return res;
  };

  // Compare two numbers and return:
  // 1 - if `this` > `num`
  // 0 - if `this` == `num`
  // -1 - if `this` < `num`
  BN.prototype.cmp = function cmp (num) {
    if (this.negative !== 0 && num.negative === 0) return -1;
    if (this.negative === 0 && num.negative !== 0) return 1;

    var res = this.ucmp(num);
    if (this.negative !== 0) return -res | 0;
    return res;
  };

  // Unsigned comparison
  BN.prototype.ucmp = function ucmp (num) {
    // At this point both numbers have the same sign
    if (this.length > num.length) return 1;
    if (this.length < num.length) return -1;

    var res = 0;
    for (var i = this.length - 1; i >= 0; i--) {
      var a = this.words[i] | 0;
      var b = num.words[i] | 0;

      if (a === b) continue;
      if (a < b) {
        res = -1;
      } else if (a > b) {
        res = 1;
      }
      break;
    }
    return res;
  };

  BN.prototype.gtn = function gtn (num) {
    return this.cmpn(num) === 1;
  };

  BN.prototype.gt = function gt (num) {
    return this.cmp(num) === 1;
  };

  BN.prototype.gten = function gten (num) {
    return this.cmpn(num) >= 0;
  };

  BN.prototype.gte = function gte (num) {
    return this.cmp(num) >= 0;
  };

  BN.prototype.ltn = function ltn (num) {
    return this.cmpn(num) === -1;
  };

  BN.prototype.lt = function lt (num) {
    return this.cmp(num) === -1;
  };

  BN.prototype.lten = function lten (num) {
    return this.cmpn(num) <= 0;
  };

  BN.prototype.lte = function lte (num) {
    return this.cmp(num) <= 0;
  };

  BN.prototype.eqn = function eqn (num) {
    return this.cmpn(num) === 0;
  };

  BN.prototype.eq = function eq (num) {
    return this.cmp(num) === 0;
  };

  //
  // A reduce context, could be using montgomery or something better, depending
  // on the `m` itself.
  //
  BN.red = function red (num) {
    return new Red(num);
  };

  BN.prototype.toRed = function toRed (ctx) {
    assert(!this.red, 'Already a number in reduction context');
    assert(this.negative === 0, 'red works only with positives');
    return ctx.convertTo(this)._forceRed(ctx);
  };

  BN.prototype.fromRed = function fromRed () {
    assert(this.red, 'fromRed works only with numbers in reduction context');
    return this.red.convertFrom(this);
  };

  BN.prototype._forceRed = function _forceRed (ctx) {
    this.red = ctx;
    return this;
  };

  BN.prototype.forceRed = function forceRed (ctx) {
    assert(!this.red, 'Already a number in reduction context');
    return this._forceRed(ctx);
  };

  BN.prototype.redAdd = function redAdd (num) {
    assert(this.red, 'redAdd works only with red numbers');
    return this.red.add(this, num);
  };

  BN.prototype.redIAdd = function redIAdd (num) {
    assert(this.red, 'redIAdd works only with red numbers');
    return this.red.iadd(this, num);
  };

  BN.prototype.redSub = function redSub (num) {
    assert(this.red, 'redSub works only with red numbers');
    return this.red.sub(this, num);
  };

  BN.prototype.redISub = function redISub (num) {
    assert(this.red, 'redISub works only with red numbers');
    return this.red.isub(this, num);
  };

  BN.prototype.redShl = function redShl (num) {
    assert(this.red, 'redShl works only with red numbers');
    return this.red.shl(this, num);
  };

  BN.prototype.redMul = function redMul (num) {
    assert(this.red, 'redMul works only with red numbers');
    this.red._verify2(this, num);
    return this.red.mul(this, num);
  };

  BN.prototype.redIMul = function redIMul (num) {
    assert(this.red, 'redMul works only with red numbers');
    this.red._verify2(this, num);
    return this.red.imul(this, num);
  };

  BN.prototype.redSqr = function redSqr () {
    assert(this.red, 'redSqr works only with red numbers');
    this.red._verify1(this);
    return this.red.sqr(this);
  };

  BN.prototype.redISqr = function redISqr () {
    assert(this.red, 'redISqr works only with red numbers');
    this.red._verify1(this);
    return this.red.isqr(this);
  };

  // Square root over p
  BN.prototype.redSqrt = function redSqrt () {
    assert(this.red, 'redSqrt works only with red numbers');
    this.red._verify1(this);
    return this.red.sqrt(this);
  };

  BN.prototype.redInvm = function redInvm () {
    assert(this.red, 'redInvm works only with red numbers');
    this.red._verify1(this);
    return this.red.invm(this);
  };

  // Return negative clone of `this` % `red modulo`
  BN.prototype.redNeg = function redNeg () {
    assert(this.red, 'redNeg works only with red numbers');
    this.red._verify1(this);
    return this.red.neg(this);
  };

  BN.prototype.redPow = function redPow (num) {
    assert(this.red && !num.red, 'redPow(normalNum)');
    this.red._verify1(this);
    return this.red.pow(this, num);
  };

  // Prime numbers with efficient reduction
  var primes = {
    k256: null,
    p224: null,
    p192: null,
    p25519: null
  };

  // Pseudo-Mersenne prime
  function MPrime (name, p) {
    // P = 2 ^ N - K
    this.name = name;
    this.p = new BN(p, 16);
    this.n = this.p.bitLength();
    this.k = new BN(1).iushln(this.n).isub(this.p);

    this.tmp = this._tmp();
  }

  MPrime.prototype._tmp = function _tmp () {
    var tmp = new BN(null);
    tmp.words = new Array(Math.ceil(this.n / 13));
    return tmp;
  };

  MPrime.prototype.ireduce = function ireduce (num) {
    // Assumes that `num` is less than `P^2`
    // num = HI * (2 ^ N - K) + HI * K + LO = HI * K + LO (mod P)
    var r = num;
    var rlen;

    do {
      this.split(r, this.tmp);
      r = this.imulK(r);
      r = r.iadd(this.tmp);
      rlen = r.bitLength();
    } while (rlen > this.n);

    var cmp = rlen < this.n ? -1 : r.ucmp(this.p);
    if (cmp === 0) {
      r.words[0] = 0;
      r.length = 1;
    } else if (cmp > 0) {
      r.isub(this.p);
    } else {
      r.strip();
    }

    return r;
  };

  MPrime.prototype.split = function split (input, out) {
    input.iushrn(this.n, 0, out);
  };

  MPrime.prototype.imulK = function imulK (num) {
    return num.imul(this.k);
  };

  function K256 () {
    MPrime.call(
      this,
      'k256',
      'ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffe fffffc2f');
  }
  inherits(K256, MPrime);

  K256.prototype.split = function split (input, output) {
    // 256 = 9 * 26 + 22
    var mask = 0x3fffff;

    var outLen = Math.min(input.length, 9);
    for (var i = 0; i < outLen; i++) {
      output.words[i] = input.words[i];
    }
    output.length = outLen;

    if (input.length <= 9) {
      input.words[0] = 0;
      input.length = 1;
      return;
    }

    // Shift by 9 limbs
    var prev = input.words[9];
    output.words[output.length++] = prev & mask;

    for (i = 10; i < input.length; i++) {
      var next = input.words[i] | 0;
      input.words[i - 10] = ((next & mask) << 4) | (prev >>> 22);
      prev = next;
    }
    prev >>>= 22;
    input.words[i - 10] = prev;
    if (prev === 0 && input.length > 10) {
      input.length -= 10;
    } else {
      input.length -= 9;
    }
  };

  K256.prototype.imulK = function imulK (num) {
    // K = 0x1000003d1 = [ 0x40, 0x3d1 ]
    num.words[num.length] = 0;
    num.words[num.length + 1] = 0;
    num.length += 2;

    // bounded at: 0x40 * 0x3ffffff + 0x3d0 = 0x100000390
    var lo = 0;
    for (var i = 0; i < num.length; i++) {
      var w = num.words[i] | 0;
      lo += w * 0x3d1;
      num.words[i] = lo & 0x3ffffff;
      lo = w * 0x40 + ((lo / 0x4000000) | 0);
    }

    // Fast length reduction
    if (num.words[num.length - 1] === 0) {
      num.length--;
      if (num.words[num.length - 1] === 0) {
        num.length--;
      }
    }
    return num;
  };

  function P224 () {
    MPrime.call(
      this,
      'p224',
      'ffffffff ffffffff ffffffff ffffffff 00000000 00000000 00000001');
  }
  inherits(P224, MPrime);

  function P192 () {
    MPrime.call(
      this,
      'p192',
      'ffffffff ffffffff ffffffff fffffffe ffffffff ffffffff');
  }
  inherits(P192, MPrime);

  function P25519 () {
    // 2 ^ 255 - 19
    MPrime.call(
      this,
      '25519',
      '7fffffffffffffff ffffffffffffffff ffffffffffffffff ffffffffffffffed');
  }
  inherits(P25519, MPrime);

  P25519.prototype.imulK = function imulK (num) {
    // K = 0x13
    var carry = 0;
    for (var i = 0; i < num.length; i++) {
      var hi = (num.words[i] | 0) * 0x13 + carry;
      var lo = hi & 0x3ffffff;
      hi >>>= 26;

      num.words[i] = lo;
      carry = hi;
    }
    if (carry !== 0) {
      num.words[num.length++] = carry;
    }
    return num;
  };

  // Exported mostly for testing purposes, use plain name instead
  BN._prime = function prime (name) {
    // Cached version of prime
    if (primes[name]) return primes[name];

    var prime;
    if (name === 'k256') {
      prime = new K256();
    } else if (name === 'p224') {
      prime = new P224();
    } else if (name === 'p192') {
      prime = new P192();
    } else if (name === 'p25519') {
      prime = new P25519();
    } else {
      throw new Error('Unknown prime ' + name);
    }
    primes[name] = prime;

    return prime;
  };

  //
  // Base reduction engine
  //
  function Red (m) {
    if (typeof m === 'string') {
      var prime = BN._prime(m);
      this.m = prime.p;
      this.prime = prime;
    } else {
      assert(m.gtn(1), 'modulus must be greater than 1');
      this.m = m;
      this.prime = null;
    }
  }

  Red.prototype._verify1 = function _verify1 (a) {
    assert(a.negative === 0, 'red works only with positives');
    assert(a.red, 'red works only with red numbers');
  };

  Red.prototype._verify2 = function _verify2 (a, b) {
    assert((a.negative | b.negative) === 0, 'red works only with positives');
    assert(a.red && a.red === b.red,
      'red works only with red numbers');
  };

  Red.prototype.imod = function imod (a) {
    if (this.prime) return this.prime.ireduce(a)._forceRed(this);
    return a.umod(this.m)._forceRed(this);
  };

  Red.prototype.neg = function neg (a) {
    if (a.isZero()) {
      return a.clone();
    }

    return this.m.sub(a)._forceRed(this);
  };

  Red.prototype.add = function add (a, b) {
    this._verify2(a, b);

    var res = a.add(b);
    if (res.cmp(this.m) >= 0) {
      res.isub(this.m);
    }
    return res._forceRed(this);
  };

  Red.prototype.iadd = function iadd (a, b) {
    this._verify2(a, b);

    var res = a.iadd(b);
    if (res.cmp(this.m) >= 0) {
      res.isub(this.m);
    }
    return res;
  };

  Red.prototype.sub = function sub (a, b) {
    this._verify2(a, b);

    var res = a.sub(b);
    if (res.cmpn(0) < 0) {
      res.iadd(this.m);
    }
    return res._forceRed(this);
  };

  Red.prototype.isub = function isub (a, b) {
    this._verify2(a, b);

    var res = a.isub(b);
    if (res.cmpn(0) < 0) {
      res.iadd(this.m);
    }
    return res;
  };

  Red.prototype.shl = function shl (a, num) {
    this._verify1(a);
    return this.imod(a.ushln(num));
  };

  Red.prototype.imul = function imul (a, b) {
    this._verify2(a, b);
    return this.imod(a.imul(b));
  };

  Red.prototype.mul = function mul (a, b) {
    this._verify2(a, b);
    return this.imod(a.mul(b));
  };

  Red.prototype.isqr = function isqr (a) {
    return this.imul(a, a.clone());
  };

  Red.prototype.sqr = function sqr (a) {
    return this.mul(a, a);
  };

  Red.prototype.sqrt = function sqrt (a) {
    if (a.isZero()) return a.clone();

    var mod3 = this.m.andln(3);
    assert(mod3 % 2 === 1);

    // Fast case
    if (mod3 === 3) {
      var pow = this.m.add(new BN(1)).iushrn(2);
      return this.pow(a, pow);
    }

    // Tonelli-Shanks algorithm (Totally unoptimized and slow)
    //
    // Find Q and S, that Q * 2 ^ S = (P - 1)
    var q = this.m.subn(1);
    var s = 0;
    while (!q.isZero() && q.andln(1) === 0) {
      s++;
      q.iushrn(1);
    }
    assert(!q.isZero());

    var one = new BN(1).toRed(this);
    var nOne = one.redNeg();

    // Find quadratic non-residue
    // NOTE: Max is such because of generalized Riemann hypothesis.
    var lpow = this.m.subn(1).iushrn(1);
    var z = this.m.bitLength();
    z = new BN(2 * z * z).toRed(this);

    while (this.pow(z, lpow).cmp(nOne) !== 0) {
      z.redIAdd(nOne);
    }

    var c = this.pow(z, q);
    var r = this.pow(a, q.addn(1).iushrn(1));
    var t = this.pow(a, q);
    var m = s;
    while (t.cmp(one) !== 0) {
      var tmp = t;
      for (var i = 0; tmp.cmp(one) !== 0; i++) {
        tmp = tmp.redSqr();
      }
      assert(i < m);
      var b = this.pow(c, new BN(1).iushln(m - i - 1));

      r = r.redMul(b);
      c = b.redSqr();
      t = t.redMul(c);
      m = i;
    }

    return r;
  };

  Red.prototype.invm = function invm (a) {
    var inv = a._invmp(this.m);
    if (inv.negative !== 0) {
      inv.negative = 0;
      return this.imod(inv).redNeg();
    } else {
      return this.imod(inv);
    }
  };

  Red.prototype.pow = function pow (a, num) {
    if (num.isZero()) return new BN(1).toRed(this);
    if (num.cmpn(1) === 0) return a.clone();

    var windowSize = 4;
    var wnd = new Array(1 << windowSize);
    wnd[0] = new BN(1).toRed(this);
    wnd[1] = a;
    for (var i = 2; i < wnd.length; i++) {
      wnd[i] = this.mul(wnd[i - 1], a);
    }

    var res = wnd[0];
    var current = 0;
    var currentLen = 0;
    var start = num.bitLength() % 26;
    if (start === 0) {
      start = 26;
    }

    for (i = num.length - 1; i >= 0; i--) {
      var word = num.words[i];
      for (var j = start - 1; j >= 0; j--) {
        var bit = (word >> j) & 1;
        if (res !== wnd[0]) {
          res = this.sqr(res);
        }

        if (bit === 0 && current === 0) {
          currentLen = 0;
          continue;
        }

        current <<= 1;
        current |= bit;
        currentLen++;
        if (currentLen !== windowSize && (i !== 0 || j !== 0)) continue;

        res = this.mul(res, wnd[current]);
        currentLen = 0;
        current = 0;
      }
      start = 26;
    }

    return res;
  };

  Red.prototype.convertTo = function convertTo (num) {
    var r = num.umod(this.m);

    return r === num ? r.clone() : r;
  };

  Red.prototype.convertFrom = function convertFrom (num) {
    var res = num.clone();
    res.red = null;
    return res;
  };

  //
  // Montgomery method engine
  //

  BN.mont = function mont (num) {
    return new Mont(num);
  };

  function Mont (m) {
    Red.call(this, m);

    this.shift = this.m.bitLength();
    if (this.shift % 26 !== 0) {
      this.shift += 26 - (this.shift % 26);
    }

    this.r = new BN(1).iushln(this.shift);
    this.r2 = this.imod(this.r.sqr());
    this.rinv = this.r._invmp(this.m);

    this.minv = this.rinv.mul(this.r).isubn(1).div(this.m);
    this.minv = this.minv.umod(this.r);
    this.minv = this.r.sub(this.minv);
  }
  inherits(Mont, Red);

  Mont.prototype.convertTo = function convertTo (num) {
    return this.imod(num.ushln(this.shift));
  };

  Mont.prototype.convertFrom = function convertFrom (num) {
    var r = this.imod(num.mul(this.rinv));
    r.red = null;
    return r;
  };

  Mont.prototype.imul = function imul (a, b) {
    if (a.isZero() || b.isZero()) {
      a.words[0] = 0;
      a.length = 1;
      return a;
    }

    var t = a.imul(b);
    var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
    var u = t.isub(c).iushrn(this.shift);
    var res = u;

    if (u.cmp(this.m) >= 0) {
      res = u.isub(this.m);
    } else if (u.cmpn(0) < 0) {
      res = u.iadd(this.m);
    }

    return res._forceRed(this);
  };

  Mont.prototype.mul = function mul (a, b) {
    if (a.isZero() || b.isZero()) return new BN(0)._forceRed(this);

    var t = a.mul(b);
    var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
    var u = t.isub(c).iushrn(this.shift);
    var res = u;
    if (u.cmp(this.m) >= 0) {
      res = u.isub(this.m);
    } else if (u.cmpn(0) < 0) {
      res = u.iadd(this.m);
    }

    return res._forceRed(this);
  };

  Mont.prototype.invm = function invm (a) {
    // (AR)^-1 * R^2 = (A^-1 * R^-1) * R^2 = A^-1 * R
    var res = this.imod(a._invmp(this.m).mul(this.r2));
    return res._forceRed(this);
  };
})(typeof module === 'undefined' || module, this);

},{"buffer":1}],3:[function(require,module,exports){
var r;

module.exports = function rand(len) {
  if (!r)
    r = new Rand(null);

  return r.generate(len);
};

function Rand(rand) {
  this.rand = rand;
}
module.exports.Rand = Rand;

Rand.prototype.generate = function generate(len) {
  return this._rand(len);
};

// Emulate crypto API using randy
Rand.prototype._rand = function _rand(n) {
  if (this.rand.getBytes)
    return this.rand.getBytes(n);

  var res = new Uint8Array(n);
  for (var i = 0; i < res.length; i++)
    res[i] = this.rand.getByte();
  return res;
};

if (typeof self === 'object') {
  if (self.crypto && self.crypto.getRandomValues) {
    // Modern browsers
    Rand.prototype._rand = function _rand(n) {
      var arr = new Uint8Array(n);
      self.crypto.getRandomValues(arr);
      return arr;
    };
  } else if (self.msCrypto && self.msCrypto.getRandomValues) {
    // IE
    Rand.prototype._rand = function _rand(n) {
      var arr = new Uint8Array(n);
      self.msCrypto.getRandomValues(arr);
      return arr;
    };

  // Safari's WebWorkers do not have `crypto`
  } else if (typeof window === 'object') {
    // Old junk
    Rand.prototype._rand = function() {
      throw new Error('Not implemented yet');
    };
  }
} else {
  // Node.js or Web worker with no crypto support
  try {
    var crypto = require('crypto');
    if (typeof crypto.randomBytes !== 'function')
      throw new Error('Not supported');

    Rand.prototype._rand = function _rand(n) {
      return crypto.randomBytes(n);
    };
  } catch (e) {
  }
}

},{"crypto":1}],4:[function(require,module,exports){
'use strict';

var elliptic = exports;

elliptic.version = require('../package.json').version;
elliptic.utils = require('./elliptic/utils');
elliptic.rand = require('brorand');
elliptic.curve = require('./elliptic/curve');
elliptic.curves = require('./elliptic/curves');

// Protocols
elliptic.ec = require('./elliptic/ec');
elliptic.eddsa = require('./elliptic/eddsa');

},{"../package.json":19,"./elliptic/curve":7,"./elliptic/curves":10,"./elliptic/ec":11,"./elliptic/eddsa":14,"./elliptic/utils":18,"brorand":3}],5:[function(require,module,exports){
'use strict';

var BN = require('bn.js');
var elliptic = require('../../elliptic');
var utils = elliptic.utils;
var getNAF = utils.getNAF;
var getJSF = utils.getJSF;
var assert = utils.assert;

function BaseCurve(type, conf) {
  this.type = type;
  this.p = new BN(conf.p, 16);

  // Use Montgomery, when there is no fast reduction for the prime
  this.red = conf.prime ? BN.red(conf.prime) : BN.mont(this.p);

  // Useful for many curves
  this.zero = new BN(0).toRed(this.red);
  this.one = new BN(1).toRed(this.red);
  this.two = new BN(2).toRed(this.red);

  // Curve configuration, optional
  this.n = conf.n && new BN(conf.n, 16);
  this.g = conf.g && this.pointFromJSON(conf.g, conf.gRed);

  // Temporary arrays
  this._wnafT1 = new Array(4);
  this._wnafT2 = new Array(4);
  this._wnafT3 = new Array(4);
  this._wnafT4 = new Array(4);

  // Generalized Greg Maxwell's trick
  var adjustCount = this.n && this.p.div(this.n);
  if (!adjustCount || adjustCount.cmpn(100) > 0) {
    this.redN = null;
  } else {
    this._maxwellTrick = true;
    this.redN = this.n.toRed(this.red);
  }
}
module.exports = BaseCurve;

BaseCurve.prototype.point = function point() {
  throw new Error('Not implemented');
};

BaseCurve.prototype.validate = function validate() {
  throw new Error('Not implemented');
};

BaseCurve.prototype._fixedNafMul = function _fixedNafMul(p, k) {
  assert(p.precomputed);
  var doubles = p._getDoubles();

  var naf = getNAF(k, 1);
  var I = (1 << (doubles.step + 1)) - (doubles.step % 2 === 0 ? 2 : 1);
  I /= 3;

  // Translate into more windowed form
  var repr = [];
  for (var j = 0; j < naf.length; j += doubles.step) {
    var nafW = 0;
    for (var k = j + doubles.step - 1; k >= j; k--)
      nafW = (nafW << 1) + naf[k];
    repr.push(nafW);
  }

  var a = this.jpoint(null, null, null);
  var b = this.jpoint(null, null, null);
  for (var i = I; i > 0; i--) {
    for (var j = 0; j < repr.length; j++) {
      var nafW = repr[j];
      if (nafW === i)
        b = b.mixedAdd(doubles.points[j]);
      else if (nafW === -i)
        b = b.mixedAdd(doubles.points[j].neg());
    }
    a = a.add(b);
  }
  return a.toP();
};

BaseCurve.prototype._wnafMul = function _wnafMul(p, k) {
  var w = 4;

  // Precompute window
  var nafPoints = p._getNAFPoints(w);
  w = nafPoints.wnd;
  var wnd = nafPoints.points;

  // Get NAF form
  var naf = getNAF(k, w);

  // Add `this`*(N+1) for every w-NAF index
  var acc = this.jpoint(null, null, null);
  for (var i = naf.length - 1; i >= 0; i--) {
    // Count zeroes
    for (var k = 0; i >= 0 && naf[i] === 0; i--)
      k++;
    if (i >= 0)
      k++;
    acc = acc.dblp(k);

    if (i < 0)
      break;
    var z = naf[i];
    assert(z !== 0);
    if (p.type === 'affine') {
      // J +- P
      if (z > 0)
        acc = acc.mixedAdd(wnd[(z - 1) >> 1]);
      else
        acc = acc.mixedAdd(wnd[(-z - 1) >> 1].neg());
    } else {
      // J +- J
      if (z > 0)
        acc = acc.add(wnd[(z - 1) >> 1]);
      else
        acc = acc.add(wnd[(-z - 1) >> 1].neg());
    }
  }
  return p.type === 'affine' ? acc.toP() : acc;
};

BaseCurve.prototype._wnafMulAdd = function _wnafMulAdd(defW,
                                                       points,
                                                       coeffs,
                                                       len,
                                                       jacobianResult) {
  var wndWidth = this._wnafT1;
  var wnd = this._wnafT2;
  var naf = this._wnafT3;

  // Fill all arrays
  var max = 0;
  for (var i = 0; i < len; i++) {
    var p = points[i];
    var nafPoints = p._getNAFPoints(defW);
    wndWidth[i] = nafPoints.wnd;
    wnd[i] = nafPoints.points;
  }

  // Comb small window NAFs
  for (var i = len - 1; i >= 1; i -= 2) {
    var a = i - 1;
    var b = i;
    if (wndWidth[a] !== 1 || wndWidth[b] !== 1) {
      naf[a] = getNAF(coeffs[a], wndWidth[a]);
      naf[b] = getNAF(coeffs[b], wndWidth[b]);
      max = Math.max(naf[a].length, max);
      max = Math.max(naf[b].length, max);
      continue;
    }

    var comb = [
      points[a], /* 1 */
      null, /* 3 */
      null, /* 5 */
      points[b] /* 7 */
    ];

    // Try to avoid Projective points, if possible
    if (points[a].y.cmp(points[b].y) === 0) {
      comb[1] = points[a].add(points[b]);
      comb[2] = points[a].toJ().mixedAdd(points[b].neg());
    } else if (points[a].y.cmp(points[b].y.redNeg()) === 0) {
      comb[1] = points[a].toJ().mixedAdd(points[b]);
      comb[2] = points[a].add(points[b].neg());
    } else {
      comb[1] = points[a].toJ().mixedAdd(points[b]);
      comb[2] = points[a].toJ().mixedAdd(points[b].neg());
    }

    var index = [
      -3, /* -1 -1 */
      -1, /* -1 0 */
      -5, /* -1 1 */
      -7, /* 0 -1 */
      0, /* 0 0 */
      7, /* 0 1 */
      5, /* 1 -1 */
      1, /* 1 0 */
      3  /* 1 1 */
    ];

    var jsf = getJSF(coeffs[a], coeffs[b]);
    max = Math.max(jsf[0].length, max);
    naf[a] = new Array(max);
    naf[b] = new Array(max);
    for (var j = 0; j < max; j++) {
      var ja = jsf[0][j] | 0;
      var jb = jsf[1][j] | 0;

      naf[a][j] = index[(ja + 1) * 3 + (jb + 1)];
      naf[b][j] = 0;
      wnd[a] = comb;
    }
  }

  var acc = this.jpoint(null, null, null);
  var tmp = this._wnafT4;
  for (var i = max; i >= 0; i--) {
    var k = 0;

    while (i >= 0) {
      var zero = true;
      for (var j = 0; j < len; j++) {
        tmp[j] = naf[j][i] | 0;
        if (tmp[j] !== 0)
          zero = false;
      }
      if (!zero)
        break;
      k++;
      i--;
    }
    if (i >= 0)
      k++;
    acc = acc.dblp(k);
    if (i < 0)
      break;

    for (var j = 0; j < len; j++) {
      var z = tmp[j];
      var p;
      if (z === 0)
        continue;
      else if (z > 0)
        p = wnd[j][(z - 1) >> 1];
      else if (z < 0)
        p = wnd[j][(-z - 1) >> 1].neg();

      if (p.type === 'affine')
        acc = acc.mixedAdd(p);
      else
        acc = acc.add(p);
    }
  }
  // Zeroify references
  for (var i = 0; i < len; i++)
    wnd[i] = null;

  if (jacobianResult)
    return acc;
  else
    return acc.toP();
};

function BasePoint(curve, type) {
  this.curve = curve;
  this.type = type;
  this.precomputed = null;
}
BaseCurve.BasePoint = BasePoint;

BasePoint.prototype.eq = function eq(/*other*/) {
  throw new Error('Not implemented');
};

BasePoint.prototype.validate = function validate() {
  return this.curve.validate(this);
};

BaseCurve.prototype.decodePoint = function decodePoint(bytes, enc) {
  bytes = utils.toArray(bytes, enc);

  var len = this.p.byteLength();

  // uncompressed, hybrid-odd, hybrid-even
  if ((bytes[0] === 0x04 || bytes[0] === 0x06 || bytes[0] === 0x07) &&
      bytes.length - 1 === 2 * len) {
    if (bytes[0] === 0x06)
      assert(bytes[bytes.length - 1] % 2 === 0);
    else if (bytes[0] === 0x07)
      assert(bytes[bytes.length - 1] % 2 === 1);

    var res =  this.point(bytes.slice(1, 1 + len),
                          bytes.slice(1 + len, 1 + 2 * len));

    return res;
  } else if ((bytes[0] === 0x02 || bytes[0] === 0x03) &&
              bytes.length - 1 === len) {
    return this.pointFromX(bytes.slice(1, 1 + len), bytes[0] === 0x03);
  }
  throw new Error('Unknown point format');
};

BasePoint.prototype.encodeCompressed = function encodeCompressed(enc) {
  return this.encode(enc, true);
};

BasePoint.prototype._encode = function _encode(compact) {
  var len = this.curve.p.byteLength();
  var x = this.getX().toArray('be', len);

  if (compact)
    return [ this.getY().isEven() ? 0x02 : 0x03 ].concat(x);

  return [ 0x04 ].concat(x, this.getY().toArray('be', len)) ;
};

BasePoint.prototype.encode = function encode(enc, compact) {
  return utils.encode(this._encode(compact), enc);
};

BasePoint.prototype.precompute = function precompute(power) {
  if (this.precomputed)
    return this;

  var precomputed = {
    doubles: null,
    naf: null,
    beta: null
  };
  precomputed.naf = this._getNAFPoints(8);
  precomputed.doubles = this._getDoubles(4, power);
  precomputed.beta = this._getBeta();
  this.precomputed = precomputed;

  return this;
};

BasePoint.prototype._hasDoubles = function _hasDoubles(k) {
  if (!this.precomputed)
    return false;

  var doubles = this.precomputed.doubles;
  if (!doubles)
    return false;

  return doubles.points.length >= Math.ceil((k.bitLength() + 1) / doubles.step);
};

BasePoint.prototype._getDoubles = function _getDoubles(step, power) {
  if (this.precomputed && this.precomputed.doubles)
    return this.precomputed.doubles;

  var doubles = [ this ];
  var acc = this;
  for (var i = 0; i < power; i += step) {
    for (var j = 0; j < step; j++)
      acc = acc.dbl();
    doubles.push(acc);
  }
  return {
    step: step,
    points: doubles
  };
};

BasePoint.prototype._getNAFPoints = function _getNAFPoints(wnd) {
  if (this.precomputed && this.precomputed.naf)
    return this.precomputed.naf;

  var res = [ this ];
  var max = (1 << wnd) - 1;
  var dbl = max === 1 ? null : this.dbl();
  for (var i = 1; i < max; i++)
    res[i] = res[i - 1].add(dbl);
  return {
    wnd: wnd,
    points: res
  };
};

BasePoint.prototype._getBeta = function _getBeta() {
  return null;
};

BasePoint.prototype.dblp = function dblp(k) {
  var r = this;
  for (var i = 0; i < k; i++)
    r = r.dbl();
  return r;
};

},{"../../elliptic":4,"bn.js":2}],6:[function(require,module,exports){
'use strict';

var curve = require('../curve');
var elliptic = require('../../elliptic');
var BN = require('bn.js');
var inherits = require('inherits');
var Base = curve.base;

var assert = elliptic.utils.assert;

function EdwardsCurve(conf) {
  // NOTE: Important as we are creating point in Base.call()
  this.twisted = (conf.a | 0) !== 1;
  this.mOneA = this.twisted && (conf.a | 0) === -1;
  this.extended = this.mOneA;

  Base.call(this, 'edwards', conf);

  this.a = new BN(conf.a, 16).umod(this.red.m);
  this.a = this.a.toRed(this.red);
  this.c = new BN(conf.c, 16).toRed(this.red);
  this.c2 = this.c.redSqr();
  this.d = new BN(conf.d, 16).toRed(this.red);
  this.dd = this.d.redAdd(this.d);

  assert(!this.twisted || this.c.fromRed().cmpn(1) === 0);
  this.oneC = (conf.c | 0) === 1;
}
inherits(EdwardsCurve, Base);
module.exports = EdwardsCurve;

EdwardsCurve.prototype._mulA = function _mulA(num) {
  if (this.mOneA)
    return num.redNeg();
  else
    return this.a.redMul(num);
};

EdwardsCurve.prototype._mulC = function _mulC(num) {
  if (this.oneC)
    return num;
  else
    return this.c.redMul(num);
};

// Just for compatibility with Short curve
EdwardsCurve.prototype.jpoint = function jpoint(x, y, z, t) {
  return this.point(x, y, z, t);
};

EdwardsCurve.prototype.pointFromX = function pointFromX(x, odd) {
  x = new BN(x, 16);
  if (!x.red)
    x = x.toRed(this.red);

  var x2 = x.redSqr();
  var rhs = this.c2.redSub(this.a.redMul(x2));
  var lhs = this.one.redSub(this.c2.redMul(this.d).redMul(x2));

  var y2 = rhs.redMul(lhs.redInvm());
  var y = y2.redSqrt();
  if (y.redSqr().redSub(y2).cmp(this.zero) !== 0)
    throw new Error('invalid point');

  var isOdd = y.fromRed().isOdd();
  if (odd && !isOdd || !odd && isOdd)
    y = y.redNeg();

  return this.point(x, y);
};

EdwardsCurve.prototype.pointFromY = function pointFromY(y, odd) {
  y = new BN(y, 16);
  if (!y.red)
    y = y.toRed(this.red);

  // x^2 = (y^2 - c^2) / (c^2 d y^2 - a)
  var y2 = y.redSqr();
  var lhs = y2.redSub(this.c2);
  var rhs = y2.redMul(this.d).redMul(this.c2).redSub(this.a);
  var x2 = lhs.redMul(rhs.redInvm());

  if (x2.cmp(this.zero) === 0) {
    if (odd)
      throw new Error('invalid point');
    else
      return this.point(this.zero, y);
  }

  var x = x2.redSqrt();
  if (x.redSqr().redSub(x2).cmp(this.zero) !== 0)
    throw new Error('invalid point');

  if (x.fromRed().isOdd() !== odd)
    x = x.redNeg();

  return this.point(x, y);
};

EdwardsCurve.prototype.validate = function validate(point) {
  if (point.isInfinity())
    return true;

  // Curve: A * X^2 + Y^2 = C^2 * (1 + D * X^2 * Y^2)
  point.normalize();

  var x2 = point.x.redSqr();
  var y2 = point.y.redSqr();
  var lhs = x2.redMul(this.a).redAdd(y2);
  var rhs = this.c2.redMul(this.one.redAdd(this.d.redMul(x2).redMul(y2)));

  return lhs.cmp(rhs) === 0;
};

function Point(curve, x, y, z, t) {
  Base.BasePoint.call(this, curve, 'projective');
  if (x === null && y === null && z === null) {
    this.x = this.curve.zero;
    this.y = this.curve.one;
    this.z = this.curve.one;
    this.t = this.curve.zero;
    this.zOne = true;
  } else {
    this.x = new BN(x, 16);
    this.y = new BN(y, 16);
    this.z = z ? new BN(z, 16) : this.curve.one;
    this.t = t && new BN(t, 16);
    if (!this.x.red)
      this.x = this.x.toRed(this.curve.red);
    if (!this.y.red)
      this.y = this.y.toRed(this.curve.red);
    if (!this.z.red)
      this.z = this.z.toRed(this.curve.red);
    if (this.t && !this.t.red)
      this.t = this.t.toRed(this.curve.red);
    this.zOne = this.z === this.curve.one;

    // Use extended coordinates
    if (this.curve.extended && !this.t) {
      this.t = this.x.redMul(this.y);
      if (!this.zOne)
        this.t = this.t.redMul(this.z.redInvm());
    }
  }
}
inherits(Point, Base.BasePoint);

EdwardsCurve.prototype.pointFromJSON = function pointFromJSON(obj) {
  return Point.fromJSON(this, obj);
};

EdwardsCurve.prototype.point = function point(x, y, z, t) {
  return new Point(this, x, y, z, t);
};

Point.fromJSON = function fromJSON(curve, obj) {
  return new Point(curve, obj[0], obj[1], obj[2]);
};

Point.prototype.inspect = function inspect() {
  if (this.isInfinity())
    return '<EC Point Infinity>';
  return '<EC Point x: ' + this.x.fromRed().toString(16, 2) +
      ' y: ' + this.y.fromRed().toString(16, 2) +
      ' z: ' + this.z.fromRed().toString(16, 2) + '>';
};

Point.prototype.isInfinity = function isInfinity() {
  // XXX This code assumes that zero is always zero in red
  return this.x.cmpn(0) === 0 &&
    (this.y.cmp(this.z) === 0 ||
    (this.zOne && this.y.cmp(this.curve.c) === 0));
};

Point.prototype._extDbl = function _extDbl() {
  // hyperelliptic.org/EFD/g1p/auto-twisted-extended-1.html
  //     #doubling-dbl-2008-hwcd
  // 4M + 4S

  // A = X1^2
  var a = this.x.redSqr();
  // B = Y1^2
  var b = this.y.redSqr();
  // C = 2 * Z1^2
  var c = this.z.redSqr();
  c = c.redIAdd(c);
  // D = a * A
  var d = this.curve._mulA(a);
  // E = (X1 + Y1)^2 - A - B
  var e = this.x.redAdd(this.y).redSqr().redISub(a).redISub(b);
  // G = D + B
  var g = d.redAdd(b);
  // F = G - C
  var f = g.redSub(c);
  // H = D - B
  var h = d.redSub(b);
  // X3 = E * F
  var nx = e.redMul(f);
  // Y3 = G * H
  var ny = g.redMul(h);
  // T3 = E * H
  var nt = e.redMul(h);
  // Z3 = F * G
  var nz = f.redMul(g);
  return this.curve.point(nx, ny, nz, nt);
};

Point.prototype._projDbl = function _projDbl() {
  // hyperelliptic.org/EFD/g1p/auto-twisted-projective.html
  //     #doubling-dbl-2008-bbjlp
  //     #doubling-dbl-2007-bl
  // and others
  // Generally 3M + 4S or 2M + 4S

  // B = (X1 + Y1)^2
  var b = this.x.redAdd(this.y).redSqr();
  // C = X1^2
  var c = this.x.redSqr();
  // D = Y1^2
  var d = this.y.redSqr();

  var nx;
  var ny;
  var nz;
  if (this.curve.twisted) {
    // E = a * C
    var e = this.curve._mulA(c);
    // F = E + D
    var f = e.redAdd(d);
    if (this.zOne) {
      // X3 = (B - C - D) * (F - 2)
      nx = b.redSub(c).redSub(d).redMul(f.redSub(this.curve.two));
      // Y3 = F * (E - D)
      ny = f.redMul(e.redSub(d));
      // Z3 = F^2 - 2 * F
      nz = f.redSqr().redSub(f).redSub(f);
    } else {
      // H = Z1^2
      var h = this.z.redSqr();
      // J = F - 2 * H
      var j = f.redSub(h).redISub(h);
      // X3 = (B-C-D)*J
      nx = b.redSub(c).redISub(d).redMul(j);
      // Y3 = F * (E - D)
      ny = f.redMul(e.redSub(d));
      // Z3 = F * J
      nz = f.redMul(j);
    }
  } else {
    // E = C + D
    var e = c.redAdd(d);
    // H = (c * Z1)^2
    var h = this.curve._mulC(this.z).redSqr();
    // J = E - 2 * H
    var j = e.redSub(h).redSub(h);
    // X3 = c * (B - E) * J
    nx = this.curve._mulC(b.redISub(e)).redMul(j);
    // Y3 = c * E * (C - D)
    ny = this.curve._mulC(e).redMul(c.redISub(d));
    // Z3 = E * J
    nz = e.redMul(j);
  }
  return this.curve.point(nx, ny, nz);
};

Point.prototype.dbl = function dbl() {
  if (this.isInfinity())
    return this;

  // Double in extended coordinates
  if (this.curve.extended)
    return this._extDbl();
  else
    return this._projDbl();
};

Point.prototype._extAdd = function _extAdd(p) {
  // hyperelliptic.org/EFD/g1p/auto-twisted-extended-1.html
  //     #addition-add-2008-hwcd-3
  // 8M

  // A = (Y1 - X1) * (Y2 - X2)
  var a = this.y.redSub(this.x).redMul(p.y.redSub(p.x));
  // B = (Y1 + X1) * (Y2 + X2)
  var b = this.y.redAdd(this.x).redMul(p.y.redAdd(p.x));
  // C = T1 * k * T2
  var c = this.t.redMul(this.curve.dd).redMul(p.t);
  // D = Z1 * 2 * Z2
  var d = this.z.redMul(p.z.redAdd(p.z));
  // E = B - A
  var e = b.redSub(a);
  // F = D - C
  var f = d.redSub(c);
  // G = D + C
  var g = d.redAdd(c);
  // H = B + A
  var h = b.redAdd(a);
  // X3 = E * F
  var nx = e.redMul(f);
  // Y3 = G * H
  var ny = g.redMul(h);
  // T3 = E * H
  var nt = e.redMul(h);
  // Z3 = F * G
  var nz = f.redMul(g);
  return this.curve.point(nx, ny, nz, nt);
};

Point.prototype._projAdd = function _projAdd(p) {
  // hyperelliptic.org/EFD/g1p/auto-twisted-projective.html
  //     #addition-add-2008-bbjlp
  //     #addition-add-2007-bl
  // 10M + 1S

  // A = Z1 * Z2
  var a = this.z.redMul(p.z);
  // B = A^2
  var b = a.redSqr();
  // C = X1 * X2
  var c = this.x.redMul(p.x);
  // D = Y1 * Y2
  var d = this.y.redMul(p.y);
  // E = d * C * D
  var e = this.curve.d.redMul(c).redMul(d);
  // F = B - E
  var f = b.redSub(e);
  // G = B + E
  var g = b.redAdd(e);
  // X3 = A * F * ((X1 + Y1) * (X2 + Y2) - C - D)
  var tmp = this.x.redAdd(this.y).redMul(p.x.redAdd(p.y)).redISub(c).redISub(d);
  var nx = a.redMul(f).redMul(tmp);
  var ny;
  var nz;
  if (this.curve.twisted) {
    // Y3 = A * G * (D - a * C)
    ny = a.redMul(g).redMul(d.redSub(this.curve._mulA(c)));
    // Z3 = F * G
    nz = f.redMul(g);
  } else {
    // Y3 = A * G * (D - C)
    ny = a.redMul(g).redMul(d.redSub(c));
    // Z3 = c * F * G
    nz = this.curve._mulC(f).redMul(g);
  }
  return this.curve.point(nx, ny, nz);
};

Point.prototype.add = function add(p) {
  if (this.isInfinity())
    return p;
  if (p.isInfinity())
    return this;

  if (this.curve.extended)
    return this._extAdd(p);
  else
    return this._projAdd(p);
};

Point.prototype.mul = function mul(k) {
  if (this._hasDoubles(k))
    return this.curve._fixedNafMul(this, k);
  else
    return this.curve._wnafMul(this, k);
};

Point.prototype.mulAdd = function mulAdd(k1, p, k2) {
  return this.curve._wnafMulAdd(1, [ this, p ], [ k1, k2 ], 2, false);
};

Point.prototype.jmulAdd = function jmulAdd(k1, p, k2) {
  return this.curve._wnafMulAdd(1, [ this, p ], [ k1, k2 ], 2, true);
};

Point.prototype.normalize = function normalize() {
  if (this.zOne)
    return this;

  // Normalize coordinates
  var zi = this.z.redInvm();
  this.x = this.x.redMul(zi);
  this.y = this.y.redMul(zi);
  if (this.t)
    this.t = this.t.redMul(zi);
  this.z = this.curve.one;
  this.zOne = true;
  return this;
};

Point.prototype.neg = function neg() {
  return this.curve.point(this.x.redNeg(),
                          this.y,
                          this.z,
                          this.t && this.t.redNeg());
};

Point.prototype.getX = function getX() {
  this.normalize();
  return this.x.fromRed();
};

Point.prototype.getY = function getY() {
  this.normalize();
  return this.y.fromRed();
};

Point.prototype.eq = function eq(other) {
  return this === other ||
         this.getX().cmp(other.getX()) === 0 &&
         this.getY().cmp(other.getY()) === 0;
};

Point.prototype.eqXToP = function eqXToP(x) {
  var rx = x.toRed(this.curve.red).redMul(this.z);
  if (this.x.cmp(rx) === 0)
    return true;

  var xc = x.clone();
  var t = this.curve.redN.redMul(this.z);
  for (;;) {
    xc.iadd(this.curve.n);
    if (xc.cmp(this.curve.p) >= 0)
      return false;

    rx.redIAdd(t);
    if (this.x.cmp(rx) === 0)
      return true;
  }
};

// Compatibility with BaseCurve
Point.prototype.toP = Point.prototype.normalize;
Point.prototype.mixedAdd = Point.prototype.add;

},{"../../elliptic":4,"../curve":7,"bn.js":2,"inherits":33}],7:[function(require,module,exports){
'use strict';

var curve = exports;

curve.base = require('./base');
curve.short = require('./short');
curve.mont = require('./mont');
curve.edwards = require('./edwards');

},{"./base":5,"./edwards":6,"./mont":8,"./short":9}],8:[function(require,module,exports){
'use strict';

var curve = require('../curve');
var BN = require('bn.js');
var inherits = require('inherits');
var Base = curve.base;

var elliptic = require('../../elliptic');
var utils = elliptic.utils;

function MontCurve(conf) {
  Base.call(this, 'mont', conf);

  this.a = new BN(conf.a, 16).toRed(this.red);
  this.b = new BN(conf.b, 16).toRed(this.red);
  this.i4 = new BN(4).toRed(this.red).redInvm();
  this.two = new BN(2).toRed(this.red);
  this.a24 = this.i4.redMul(this.a.redAdd(this.two));
}
inherits(MontCurve, Base);
module.exports = MontCurve;

MontCurve.prototype.validate = function validate(point) {
  var x = point.normalize().x;
  var x2 = x.redSqr();
  var rhs = x2.redMul(x).redAdd(x2.redMul(this.a)).redAdd(x);
  var y = rhs.redSqrt();

  return y.redSqr().cmp(rhs) === 0;
};

function Point(curve, x, z) {
  Base.BasePoint.call(this, curve, 'projective');
  if (x === null && z === null) {
    this.x = this.curve.one;
    this.z = this.curve.zero;
  } else {
    this.x = new BN(x, 16);
    this.z = new BN(z, 16);
    if (!this.x.red)
      this.x = this.x.toRed(this.curve.red);
    if (!this.z.red)
      this.z = this.z.toRed(this.curve.red);
  }
}
inherits(Point, Base.BasePoint);

MontCurve.prototype.decodePoint = function decodePoint(bytes, enc) {
  return this.point(utils.toArray(bytes, enc), 1);
};

MontCurve.prototype.point = function point(x, z) {
  return new Point(this, x, z);
};

MontCurve.prototype.pointFromJSON = function pointFromJSON(obj) {
  return Point.fromJSON(this, obj);
};

Point.prototype.precompute = function precompute() {
  // No-op
};

Point.prototype._encode = function _encode() {
  return this.getX().toArray('be', this.curve.p.byteLength());
};

Point.fromJSON = function fromJSON(curve, obj) {
  return new Point(curve, obj[0], obj[1] || curve.one);
};

Point.prototype.inspect = function inspect() {
  if (this.isInfinity())
    return '<EC Point Infinity>';
  return '<EC Point x: ' + this.x.fromRed().toString(16, 2) +
      ' z: ' + this.z.fromRed().toString(16, 2) + '>';
};

Point.prototype.isInfinity = function isInfinity() {
  // XXX This code assumes that zero is always zero in red
  return this.z.cmpn(0) === 0;
};

Point.prototype.dbl = function dbl() {
  // http://hyperelliptic.org/EFD/g1p/auto-montgom-xz.html#doubling-dbl-1987-m-3
  // 2M + 2S + 4A

  // A = X1 + Z1
  var a = this.x.redAdd(this.z);
  // AA = A^2
  var aa = a.redSqr();
  // B = X1 - Z1
  var b = this.x.redSub(this.z);
  // BB = B^2
  var bb = b.redSqr();
  // C = AA - BB
  var c = aa.redSub(bb);
  // X3 = AA * BB
  var nx = aa.redMul(bb);
  // Z3 = C * (BB + A24 * C)
  var nz = c.redMul(bb.redAdd(this.curve.a24.redMul(c)));
  return this.curve.point(nx, nz);
};

Point.prototype.add = function add() {
  throw new Error('Not supported on Montgomery curve');
};

Point.prototype.diffAdd = function diffAdd(p, diff) {
  // http://hyperelliptic.org/EFD/g1p/auto-montgom-xz.html#diffadd-dadd-1987-m-3
  // 4M + 2S + 6A

  // A = X2 + Z2
  var a = this.x.redAdd(this.z);
  // B = X2 - Z2
  var b = this.x.redSub(this.z);
  // C = X3 + Z3
  var c = p.x.redAdd(p.z);
  // D = X3 - Z3
  var d = p.x.redSub(p.z);
  // DA = D * A
  var da = d.redMul(a);
  // CB = C * B
  var cb = c.redMul(b);
  // X5 = Z1 * (DA + CB)^2
  var nx = diff.z.redMul(da.redAdd(cb).redSqr());
  // Z5 = X1 * (DA - CB)^2
  var nz = diff.x.redMul(da.redISub(cb).redSqr());
  return this.curve.point(nx, nz);
};

Point.prototype.mul = function mul(k) {
  var t = k.clone();
  var a = this; // (N / 2) * Q + Q
  var b = this.curve.point(null, null); // (N / 2) * Q
  var c = this; // Q

  for (var bits = []; t.cmpn(0) !== 0; t.iushrn(1))
    bits.push(t.andln(1));

  for (var i = bits.length - 1; i >= 0; i--) {
    if (bits[i] === 0) {
      // N * Q + Q = ((N / 2) * Q + Q)) + (N / 2) * Q
      a = a.diffAdd(b, c);
      // N * Q = 2 * ((N / 2) * Q + Q))
      b = b.dbl();
    } else {
      // N * Q = ((N / 2) * Q + Q) + ((N / 2) * Q)
      b = a.diffAdd(b, c);
      // N * Q + Q = 2 * ((N / 2) * Q + Q)
      a = a.dbl();
    }
  }
  return b;
};

Point.prototype.mulAdd = function mulAdd() {
  throw new Error('Not supported on Montgomery curve');
};

Point.prototype.jumlAdd = function jumlAdd() {
  throw new Error('Not supported on Montgomery curve');
};

Point.prototype.eq = function eq(other) {
  return this.getX().cmp(other.getX()) === 0;
};

Point.prototype.normalize = function normalize() {
  this.x = this.x.redMul(this.z.redInvm());
  this.z = this.curve.one;
  return this;
};

Point.prototype.getX = function getX() {
  // Normalize coordinates
  this.normalize();

  return this.x.fromRed();
};

},{"../../elliptic":4,"../curve":7,"bn.js":2,"inherits":33}],9:[function(require,module,exports){
'use strict';

var curve = require('../curve');
var elliptic = require('../../elliptic');
var BN = require('bn.js');
var inherits = require('inherits');
var Base = curve.base;

var assert = elliptic.utils.assert;

function ShortCurve(conf) {
  Base.call(this, 'short', conf);

  this.a = new BN(conf.a, 16).toRed(this.red);
  this.b = new BN(conf.b, 16).toRed(this.red);
  this.tinv = this.two.redInvm();

  this.zeroA = this.a.fromRed().cmpn(0) === 0;
  this.threeA = this.a.fromRed().sub(this.p).cmpn(-3) === 0;

  // If the curve is endomorphic, precalculate beta and lambda
  this.endo = this._getEndomorphism(conf);
  this._endoWnafT1 = new Array(4);
  this._endoWnafT2 = new Array(4);
}
inherits(ShortCurve, Base);
module.exports = ShortCurve;

ShortCurve.prototype._getEndomorphism = function _getEndomorphism(conf) {
  // No efficient endomorphism
  if (!this.zeroA || !this.g || !this.n || this.p.modn(3) !== 1)
    return;

  // Compute beta and lambda, that lambda * P = (beta * Px; Py)
  var beta;
  var lambda;
  if (conf.beta) {
    beta = new BN(conf.beta, 16).toRed(this.red);
  } else {
    var betas = this._getEndoRoots(this.p);
    // Choose the smallest beta
    beta = betas[0].cmp(betas[1]) < 0 ? betas[0] : betas[1];
    beta = beta.toRed(this.red);
  }
  if (conf.lambda) {
    lambda = new BN(conf.lambda, 16);
  } else {
    // Choose the lambda that is matching selected beta
    var lambdas = this._getEndoRoots(this.n);
    if (this.g.mul(lambdas[0]).x.cmp(this.g.x.redMul(beta)) === 0) {
      lambda = lambdas[0];
    } else {
      lambda = lambdas[1];
      assert(this.g.mul(lambda).x.cmp(this.g.x.redMul(beta)) === 0);
    }
  }

  // Get basis vectors, used for balanced length-two representation
  var basis;
  if (conf.basis) {
    basis = conf.basis.map(function(vec) {
      return {
        a: new BN(vec.a, 16),
        b: new BN(vec.b, 16)
      };
    });
  } else {
    basis = this._getEndoBasis(lambda);
  }

  return {
    beta: beta,
    lambda: lambda,
    basis: basis
  };
};

ShortCurve.prototype._getEndoRoots = function _getEndoRoots(num) {
  // Find roots of for x^2 + x + 1 in F
  // Root = (-1 +- Sqrt(-3)) / 2
  //
  var red = num === this.p ? this.red : BN.mont(num);
  var tinv = new BN(2).toRed(red).redInvm();
  var ntinv = tinv.redNeg();

  var s = new BN(3).toRed(red).redNeg().redSqrt().redMul(tinv);

  var l1 = ntinv.redAdd(s).fromRed();
  var l2 = ntinv.redSub(s).fromRed();
  return [ l1, l2 ];
};

ShortCurve.prototype._getEndoBasis = function _getEndoBasis(lambda) {
  // aprxSqrt >= sqrt(this.n)
  var aprxSqrt = this.n.ushrn(Math.floor(this.n.bitLength() / 2));

  // 3.74
  // Run EGCD, until r(L + 1) < aprxSqrt
  var u = lambda;
  var v = this.n.clone();
  var x1 = new BN(1);
  var y1 = new BN(0);
  var x2 = new BN(0);
  var y2 = new BN(1);

  // NOTE: all vectors are roots of: a + b * lambda = 0 (mod n)
  var a0;
  var b0;
  // First vector
  var a1;
  var b1;
  // Second vector
  var a2;
  var b2;

  var prevR;
  var i = 0;
  var r;
  var x;
  while (u.cmpn(0) !== 0) {
    var q = v.div(u);
    r = v.sub(q.mul(u));
    x = x2.sub(q.mul(x1));
    var y = y2.sub(q.mul(y1));

    if (!a1 && r.cmp(aprxSqrt) < 0) {
      a0 = prevR.neg();
      b0 = x1;
      a1 = r.neg();
      b1 = x;
    } else if (a1 && ++i === 2) {
      break;
    }
    prevR = r;

    v = u;
    u = r;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
  a2 = r.neg();
  b2 = x;

  var len1 = a1.sqr().add(b1.sqr());
  var len2 = a2.sqr().add(b2.sqr());
  if (len2.cmp(len1) >= 0) {
    a2 = a0;
    b2 = b0;
  }

  // Normalize signs
  if (a1.negative) {
    a1 = a1.neg();
    b1 = b1.neg();
  }
  if (a2.negative) {
    a2 = a2.neg();
    b2 = b2.neg();
  }

  return [
    { a: a1, b: b1 },
    { a: a2, b: b2 }
  ];
};

ShortCurve.prototype._endoSplit = function _endoSplit(k) {
  var basis = this.endo.basis;
  var v1 = basis[0];
  var v2 = basis[1];

  var c1 = v2.b.mul(k).divRound(this.n);
  var c2 = v1.b.neg().mul(k).divRound(this.n);

  var p1 = c1.mul(v1.a);
  var p2 = c2.mul(v2.a);
  var q1 = c1.mul(v1.b);
  var q2 = c2.mul(v2.b);

  // Calculate answer
  var k1 = k.sub(p1).sub(p2);
  var k2 = q1.add(q2).neg();
  return { k1: k1, k2: k2 };
};

ShortCurve.prototype.pointFromX = function pointFromX(x, odd) {
  x = new BN(x, 16);
  if (!x.red)
    x = x.toRed(this.red);

  var y2 = x.redSqr().redMul(x).redIAdd(x.redMul(this.a)).redIAdd(this.b);
  var y = y2.redSqrt();
  if (y.redSqr().redSub(y2).cmp(this.zero) !== 0)
    throw new Error('invalid point');

  // XXX Is there any way to tell if the number is odd without converting it
  // to non-red form?
  var isOdd = y.fromRed().isOdd();
  if (odd && !isOdd || !odd && isOdd)
    y = y.redNeg();

  return this.point(x, y);
};

ShortCurve.prototype.validate = function validate(point) {
  if (point.inf)
    return true;

  var x = point.x;
  var y = point.y;

  var ax = this.a.redMul(x);
  var rhs = x.redSqr().redMul(x).redIAdd(ax).redIAdd(this.b);
  return y.redSqr().redISub(rhs).cmpn(0) === 0;
};

ShortCurve.prototype._endoWnafMulAdd =
    function _endoWnafMulAdd(points, coeffs, jacobianResult) {
  var npoints = this._endoWnafT1;
  var ncoeffs = this._endoWnafT2;
  for (var i = 0; i < points.length; i++) {
    var split = this._endoSplit(coeffs[i]);
    var p = points[i];
    var beta = p._getBeta();

    if (split.k1.negative) {
      split.k1.ineg();
      p = p.neg(true);
    }
    if (split.k2.negative) {
      split.k2.ineg();
      beta = beta.neg(true);
    }

    npoints[i * 2] = p;
    npoints[i * 2 + 1] = beta;
    ncoeffs[i * 2] = split.k1;
    ncoeffs[i * 2 + 1] = split.k2;
  }
  var res = this._wnafMulAdd(1, npoints, ncoeffs, i * 2, jacobianResult);

  // Clean-up references to points and coefficients
  for (var j = 0; j < i * 2; j++) {
    npoints[j] = null;
    ncoeffs[j] = null;
  }
  return res;
};

function Point(curve, x, y, isRed) {
  Base.BasePoint.call(this, curve, 'affine');
  if (x === null && y === null) {
    this.x = null;
    this.y = null;
    this.inf = true;
  } else {
    this.x = new BN(x, 16);
    this.y = new BN(y, 16);
    // Force redgomery representation when loading from JSON
    if (isRed) {
      this.x.forceRed(this.curve.red);
      this.y.forceRed(this.curve.red);
    }
    if (!this.x.red)
      this.x = this.x.toRed(this.curve.red);
    if (!this.y.red)
      this.y = this.y.toRed(this.curve.red);
    this.inf = false;
  }
}
inherits(Point, Base.BasePoint);

ShortCurve.prototype.point = function point(x, y, isRed) {
  return new Point(this, x, y, isRed);
};

ShortCurve.prototype.pointFromJSON = function pointFromJSON(obj, red) {
  return Point.fromJSON(this, obj, red);
};

Point.prototype._getBeta = function _getBeta() {
  if (!this.curve.endo)
    return;

  var pre = this.precomputed;
  if (pre && pre.beta)
    return pre.beta;

  var beta = this.curve.point(this.x.redMul(this.curve.endo.beta), this.y);
  if (pre) {
    var curve = this.curve;
    var endoMul = function(p) {
      return curve.point(p.x.redMul(curve.endo.beta), p.y);
    };
    pre.beta = beta;
    beta.precomputed = {
      beta: null,
      naf: pre.naf && {
        wnd: pre.naf.wnd,
        points: pre.naf.points.map(endoMul)
      },
      doubles: pre.doubles && {
        step: pre.doubles.step,
        points: pre.doubles.points.map(endoMul)
      }
    };
  }
  return beta;
};

Point.prototype.toJSON = function toJSON() {
  if (!this.precomputed)
    return [ this.x, this.y ];

  return [ this.x, this.y, this.precomputed && {
    doubles: this.precomputed.doubles && {
      step: this.precomputed.doubles.step,
      points: this.precomputed.doubles.points.slice(1)
    },
    naf: this.precomputed.naf && {
      wnd: this.precomputed.naf.wnd,
      points: this.precomputed.naf.points.slice(1)
    }
  } ];
};

Point.fromJSON = function fromJSON(curve, obj, red) {
  if (typeof obj === 'string')
    obj = JSON.parse(obj);
  var res = curve.point(obj[0], obj[1], red);
  if (!obj[2])
    return res;

  function obj2point(obj) {
    return curve.point(obj[0], obj[1], red);
  }

  var pre = obj[2];
  res.precomputed = {
    beta: null,
    doubles: pre.doubles && {
      step: pre.doubles.step,
      points: [ res ].concat(pre.doubles.points.map(obj2point))
    },
    naf: pre.naf && {
      wnd: pre.naf.wnd,
      points: [ res ].concat(pre.naf.points.map(obj2point))
    }
  };
  return res;
};

Point.prototype.inspect = function inspect() {
  if (this.isInfinity())
    return '<EC Point Infinity>';
  return '<EC Point x: ' + this.x.fromRed().toString(16, 2) +
      ' y: ' + this.y.fromRed().toString(16, 2) + '>';
};

Point.prototype.isInfinity = function isInfinity() {
  return this.inf;
};

Point.prototype.add = function add(p) {
  // O + P = P
  if (this.inf)
    return p;

  // P + O = P
  if (p.inf)
    return this;

  // P + P = 2P
  if (this.eq(p))
    return this.dbl();

  // P + (-P) = O
  if (this.neg().eq(p))
    return this.curve.point(null, null);

  // P + Q = O
  if (this.x.cmp(p.x) === 0)
    return this.curve.point(null, null);

  var c = this.y.redSub(p.y);
  if (c.cmpn(0) !== 0)
    c = c.redMul(this.x.redSub(p.x).redInvm());
  var nx = c.redSqr().redISub(this.x).redISub(p.x);
  var ny = c.redMul(this.x.redSub(nx)).redISub(this.y);
  return this.curve.point(nx, ny);
};

Point.prototype.dbl = function dbl() {
  if (this.inf)
    return this;

  // 2P = O
  var ys1 = this.y.redAdd(this.y);
  if (ys1.cmpn(0) === 0)
    return this.curve.point(null, null);

  var a = this.curve.a;

  var x2 = this.x.redSqr();
  var dyinv = ys1.redInvm();
  var c = x2.redAdd(x2).redIAdd(x2).redIAdd(a).redMul(dyinv);

  var nx = c.redSqr().redISub(this.x.redAdd(this.x));
  var ny = c.redMul(this.x.redSub(nx)).redISub(this.y);
  return this.curve.point(nx, ny);
};

Point.prototype.getX = function getX() {
  return this.x.fromRed();
};

Point.prototype.getY = function getY() {
  return this.y.fromRed();
};

Point.prototype.mul = function mul(k) {
  k = new BN(k, 16);

  if (this._hasDoubles(k))
    return this.curve._fixedNafMul(this, k);
  else if (this.curve.endo)
    return this.curve._endoWnafMulAdd([ this ], [ k ]);
  else
    return this.curve._wnafMul(this, k);
};

Point.prototype.mulAdd = function mulAdd(k1, p2, k2) {
  var points = [ this, p2 ];
  var coeffs = [ k1, k2 ];
  if (this.curve.endo)
    return this.curve._endoWnafMulAdd(points, coeffs);
  else
    return this.curve._wnafMulAdd(1, points, coeffs, 2);
};

Point.prototype.jmulAdd = function jmulAdd(k1, p2, k2) {
  var points = [ this, p2 ];
  var coeffs = [ k1, k2 ];
  if (this.curve.endo)
    return this.curve._endoWnafMulAdd(points, coeffs, true);
  else
    return this.curve._wnafMulAdd(1, points, coeffs, 2, true);
};

Point.prototype.eq = function eq(p) {
  return this === p ||
         this.inf === p.inf &&
             (this.inf || this.x.cmp(p.x) === 0 && this.y.cmp(p.y) === 0);
};

Point.prototype.neg = function neg(_precompute) {
  if (this.inf)
    return this;

  var res = this.curve.point(this.x, this.y.redNeg());
  if (_precompute && this.precomputed) {
    var pre = this.precomputed;
    var negate = function(p) {
      return p.neg();
    };
    res.precomputed = {
      naf: pre.naf && {
        wnd: pre.naf.wnd,
        points: pre.naf.points.map(negate)
      },
      doubles: pre.doubles && {
        step: pre.doubles.step,
        points: pre.doubles.points.map(negate)
      }
    };
  }
  return res;
};

Point.prototype.toJ = function toJ() {
  if (this.inf)
    return this.curve.jpoint(null, null, null);

  var res = this.curve.jpoint(this.x, this.y, this.curve.one);
  return res;
};

function JPoint(curve, x, y, z) {
  Base.BasePoint.call(this, curve, 'jacobian');
  if (x === null && y === null && z === null) {
    this.x = this.curve.one;
    this.y = this.curve.one;
    this.z = new BN(0);
  } else {
    this.x = new BN(x, 16);
    this.y = new BN(y, 16);
    this.z = new BN(z, 16);
  }
  if (!this.x.red)
    this.x = this.x.toRed(this.curve.red);
  if (!this.y.red)
    this.y = this.y.toRed(this.curve.red);
  if (!this.z.red)
    this.z = this.z.toRed(this.curve.red);

  this.zOne = this.z === this.curve.one;
}
inherits(JPoint, Base.BasePoint);

ShortCurve.prototype.jpoint = function jpoint(x, y, z) {
  return new JPoint(this, x, y, z);
};

JPoint.prototype.toP = function toP() {
  if (this.isInfinity())
    return this.curve.point(null, null);

  var zinv = this.z.redInvm();
  var zinv2 = zinv.redSqr();
  var ax = this.x.redMul(zinv2);
  var ay = this.y.redMul(zinv2).redMul(zinv);

  return this.curve.point(ax, ay);
};

JPoint.prototype.neg = function neg() {
  return this.curve.jpoint(this.x, this.y.redNeg(), this.z);
};

JPoint.prototype.add = function add(p) {
  // O + P = P
  if (this.isInfinity())
    return p;

  // P + O = P
  if (p.isInfinity())
    return this;

  // 12M + 4S + 7A
  var pz2 = p.z.redSqr();
  var z2 = this.z.redSqr();
  var u1 = this.x.redMul(pz2);
  var u2 = p.x.redMul(z2);
  var s1 = this.y.redMul(pz2.redMul(p.z));
  var s2 = p.y.redMul(z2.redMul(this.z));

  var h = u1.redSub(u2);
  var r = s1.redSub(s2);
  if (h.cmpn(0) === 0) {
    if (r.cmpn(0) !== 0)
      return this.curve.jpoint(null, null, null);
    else
      return this.dbl();
  }

  var h2 = h.redSqr();
  var h3 = h2.redMul(h);
  var v = u1.redMul(h2);

  var nx = r.redSqr().redIAdd(h3).redISub(v).redISub(v);
  var ny = r.redMul(v.redISub(nx)).redISub(s1.redMul(h3));
  var nz = this.z.redMul(p.z).redMul(h);

  return this.curve.jpoint(nx, ny, nz);
};

JPoint.prototype.mixedAdd = function mixedAdd(p) {
  // O + P = P
  if (this.isInfinity())
    return p.toJ();

  // P + O = P
  if (p.isInfinity())
    return this;

  // 8M + 3S + 7A
  var z2 = this.z.redSqr();
  var u1 = this.x;
  var u2 = p.x.redMul(z2);
  var s1 = this.y;
  var s2 = p.y.redMul(z2).redMul(this.z);

  var h = u1.redSub(u2);
  var r = s1.redSub(s2);
  if (h.cmpn(0) === 0) {
    if (r.cmpn(0) !== 0)
      return this.curve.jpoint(null, null, null);
    else
      return this.dbl();
  }

  var h2 = h.redSqr();
  var h3 = h2.redMul(h);
  var v = u1.redMul(h2);

  var nx = r.redSqr().redIAdd(h3).redISub(v).redISub(v);
  var ny = r.redMul(v.redISub(nx)).redISub(s1.redMul(h3));
  var nz = this.z.redMul(h);

  return this.curve.jpoint(nx, ny, nz);
};

JPoint.prototype.dblp = function dblp(pow) {
  if (pow === 0)
    return this;
  if (this.isInfinity())
    return this;
  if (!pow)
    return this.dbl();

  if (this.curve.zeroA || this.curve.threeA) {
    var r = this;
    for (var i = 0; i < pow; i++)
      r = r.dbl();
    return r;
  }

  // 1M + 2S + 1A + N * (4S + 5M + 8A)
  // N = 1 => 6M + 6S + 9A
  var a = this.curve.a;
  var tinv = this.curve.tinv;

  var jx = this.x;
  var jy = this.y;
  var jz = this.z;
  var jz4 = jz.redSqr().redSqr();

  // Reuse results
  var jyd = jy.redAdd(jy);
  for (var i = 0; i < pow; i++) {
    var jx2 = jx.redSqr();
    var jyd2 = jyd.redSqr();
    var jyd4 = jyd2.redSqr();
    var c = jx2.redAdd(jx2).redIAdd(jx2).redIAdd(a.redMul(jz4));

    var t1 = jx.redMul(jyd2);
    var nx = c.redSqr().redISub(t1.redAdd(t1));
    var t2 = t1.redISub(nx);
    var dny = c.redMul(t2);
    dny = dny.redIAdd(dny).redISub(jyd4);
    var nz = jyd.redMul(jz);
    if (i + 1 < pow)
      jz4 = jz4.redMul(jyd4);

    jx = nx;
    jz = nz;
    jyd = dny;
  }

  return this.curve.jpoint(jx, jyd.redMul(tinv), jz);
};

JPoint.prototype.dbl = function dbl() {
  if (this.isInfinity())
    return this;

  if (this.curve.zeroA)
    return this._zeroDbl();
  else if (this.curve.threeA)
    return this._threeDbl();
  else
    return this._dbl();
};

JPoint.prototype._zeroDbl = function _zeroDbl() {
  var nx;
  var ny;
  var nz;
  // Z = 1
  if (this.zOne) {
    // hyperelliptic.org/EFD/g1p/auto-shortw-jacobian-0.html
    //     #doubling-mdbl-2007-bl
    // 1M + 5S + 14A

    // XX = X1^2
    var xx = this.x.redSqr();
    // YY = Y1^2
    var yy = this.y.redSqr();
    // YYYY = YY^2
    var yyyy = yy.redSqr();
    // S = 2 * ((X1 + YY)^2 - XX - YYYY)
    var s = this.x.redAdd(yy).redSqr().redISub(xx).redISub(yyyy);
    s = s.redIAdd(s);
    // M = 3 * XX + a; a = 0
    var m = xx.redAdd(xx).redIAdd(xx);
    // T = M ^ 2 - 2*S
    var t = m.redSqr().redISub(s).redISub(s);

    // 8 * YYYY
    var yyyy8 = yyyy.redIAdd(yyyy);
    yyyy8 = yyyy8.redIAdd(yyyy8);
    yyyy8 = yyyy8.redIAdd(yyyy8);

    // X3 = T
    nx = t;
    // Y3 = M * (S - T) - 8 * YYYY
    ny = m.redMul(s.redISub(t)).redISub(yyyy8);
    // Z3 = 2*Y1
    nz = this.y.redAdd(this.y);
  } else {
    // hyperelliptic.org/EFD/g1p/auto-shortw-jacobian-0.html
    //     #doubling-dbl-2009-l
    // 2M + 5S + 13A

    // A = X1^2
    var a = this.x.redSqr();
    // B = Y1^2
    var b = this.y.redSqr();
    // C = B^2
    var c = b.redSqr();
    // D = 2 * ((X1 + B)^2 - A - C)
    var d = this.x.redAdd(b).redSqr().redISub(a).redISub(c);
    d = d.redIAdd(d);
    // E = 3 * A
    var e = a.redAdd(a).redIAdd(a);
    // F = E^2
    var f = e.redSqr();

    // 8 * C
    var c8 = c.redIAdd(c);
    c8 = c8.redIAdd(c8);
    c8 = c8.redIAdd(c8);

    // X3 = F - 2 * D
    nx = f.redISub(d).redISub(d);
    // Y3 = E * (D - X3) - 8 * C
    ny = e.redMul(d.redISub(nx)).redISub(c8);
    // Z3 = 2 * Y1 * Z1
    nz = this.y.redMul(this.z);
    nz = nz.redIAdd(nz);
  }

  return this.curve.jpoint(nx, ny, nz);
};

JPoint.prototype._threeDbl = function _threeDbl() {
  var nx;
  var ny;
  var nz;
  // Z = 1
  if (this.zOne) {
    // hyperelliptic.org/EFD/g1p/auto-shortw-jacobian-3.html
    //     #doubling-mdbl-2007-bl
    // 1M + 5S + 15A

    // XX = X1^2
    var xx = this.x.redSqr();
    // YY = Y1^2
    var yy = this.y.redSqr();
    // YYYY = YY^2
    var yyyy = yy.redSqr();
    // S = 2 * ((X1 + YY)^2 - XX - YYYY)
    var s = this.x.redAdd(yy).redSqr().redISub(xx).redISub(yyyy);
    s = s.redIAdd(s);
    // M = 3 * XX + a
    var m = xx.redAdd(xx).redIAdd(xx).redIAdd(this.curve.a);
    // T = M^2 - 2 * S
    var t = m.redSqr().redISub(s).redISub(s);
    // X3 = T
    nx = t;
    // Y3 = M * (S - T) - 8 * YYYY
    var yyyy8 = yyyy.redIAdd(yyyy);
    yyyy8 = yyyy8.redIAdd(yyyy8);
    yyyy8 = yyyy8.redIAdd(yyyy8);
    ny = m.redMul(s.redISub(t)).redISub(yyyy8);
    // Z3 = 2 * Y1
    nz = this.y.redAdd(this.y);
  } else {
    // hyperelliptic.org/EFD/g1p/auto-shortw-jacobian-3.html#doubling-dbl-2001-b
    // 3M + 5S

    // delta = Z1^2
    var delta = this.z.redSqr();
    // gamma = Y1^2
    var gamma = this.y.redSqr();
    // beta = X1 * gamma
    var beta = this.x.redMul(gamma);
    // alpha = 3 * (X1 - delta) * (X1 + delta)
    var alpha = this.x.redSub(delta).redMul(this.x.redAdd(delta));
    alpha = alpha.redAdd(alpha).redIAdd(alpha);
    // X3 = alpha^2 - 8 * beta
    var beta4 = beta.redIAdd(beta);
    beta4 = beta4.redIAdd(beta4);
    var beta8 = beta4.redAdd(beta4);
    nx = alpha.redSqr().redISub(beta8);
    // Z3 = (Y1 + Z1)^2 - gamma - delta
    nz = this.y.redAdd(this.z).redSqr().redISub(gamma).redISub(delta);
    // Y3 = alpha * (4 * beta - X3) - 8 * gamma^2
    var ggamma8 = gamma.redSqr();
    ggamma8 = ggamma8.redIAdd(ggamma8);
    ggamma8 = ggamma8.redIAdd(ggamma8);
    ggamma8 = ggamma8.redIAdd(ggamma8);
    ny = alpha.redMul(beta4.redISub(nx)).redISub(ggamma8);
  }

  return this.curve.jpoint(nx, ny, nz);
};

JPoint.prototype._dbl = function _dbl() {
  var a = this.curve.a;

  // 4M + 6S + 10A
  var jx = this.x;
  var jy = this.y;
  var jz = this.z;
  var jz4 = jz.redSqr().redSqr();

  var jx2 = jx.redSqr();
  var jy2 = jy.redSqr();

  var c = jx2.redAdd(jx2).redIAdd(jx2).redIAdd(a.redMul(jz4));

  var jxd4 = jx.redAdd(jx);
  jxd4 = jxd4.redIAdd(jxd4);
  var t1 = jxd4.redMul(jy2);
  var nx = c.redSqr().redISub(t1.redAdd(t1));
  var t2 = t1.redISub(nx);

  var jyd8 = jy2.redSqr();
  jyd8 = jyd8.redIAdd(jyd8);
  jyd8 = jyd8.redIAdd(jyd8);
  jyd8 = jyd8.redIAdd(jyd8);
  var ny = c.redMul(t2).redISub(jyd8);
  var nz = jy.redAdd(jy).redMul(jz);

  return this.curve.jpoint(nx, ny, nz);
};

JPoint.prototype.trpl = function trpl() {
  if (!this.curve.zeroA)
    return this.dbl().add(this);

  // hyperelliptic.org/EFD/g1p/auto-shortw-jacobian-0.html#tripling-tpl-2007-bl
  // 5M + 10S + ...

  // XX = X1^2
  var xx = this.x.redSqr();
  // YY = Y1^2
  var yy = this.y.redSqr();
  // ZZ = Z1^2
  var zz = this.z.redSqr();
  // YYYY = YY^2
  var yyyy = yy.redSqr();
  // M = 3 * XX + a * ZZ2; a = 0
  var m = xx.redAdd(xx).redIAdd(xx);
  // MM = M^2
  var mm = m.redSqr();
  // E = 6 * ((X1 + YY)^2 - XX - YYYY) - MM
  var e = this.x.redAdd(yy).redSqr().redISub(xx).redISub(yyyy);
  e = e.redIAdd(e);
  e = e.redAdd(e).redIAdd(e);
  e = e.redISub(mm);
  // EE = E^2
  var ee = e.redSqr();
  // T = 16*YYYY
  var t = yyyy.redIAdd(yyyy);
  t = t.redIAdd(t);
  t = t.redIAdd(t);
  t = t.redIAdd(t);
  // U = (M + E)^2 - MM - EE - T
  var u = m.redIAdd(e).redSqr().redISub(mm).redISub(ee).redISub(t);
  // X3 = 4 * (X1 * EE - 4 * YY * U)
  var yyu4 = yy.redMul(u);
  yyu4 = yyu4.redIAdd(yyu4);
  yyu4 = yyu4.redIAdd(yyu4);
  var nx = this.x.redMul(ee).redISub(yyu4);
  nx = nx.redIAdd(nx);
  nx = nx.redIAdd(nx);
  // Y3 = 8 * Y1 * (U * (T - U) - E * EE)
  var ny = this.y.redMul(u.redMul(t.redISub(u)).redISub(e.redMul(ee)));
  ny = ny.redIAdd(ny);
  ny = ny.redIAdd(ny);
  ny = ny.redIAdd(ny);
  // Z3 = (Z1 + E)^2 - ZZ - EE
  var nz = this.z.redAdd(e).redSqr().redISub(zz).redISub(ee);

  return this.curve.jpoint(nx, ny, nz);
};

JPoint.prototype.mul = function mul(k, kbase) {
  k = new BN(k, kbase);

  return this.curve._wnafMul(this, k);
};

JPoint.prototype.eq = function eq(p) {
  if (p.type === 'affine')
    return this.eq(p.toJ());

  if (this === p)
    return true;

  // x1 * z2^2 == x2 * z1^2
  var z2 = this.z.redSqr();
  var pz2 = p.z.redSqr();
  if (this.x.redMul(pz2).redISub(p.x.redMul(z2)).cmpn(0) !== 0)
    return false;

  // y1 * z2^3 == y2 * z1^3
  var z3 = z2.redMul(this.z);
  var pz3 = pz2.redMul(p.z);
  return this.y.redMul(pz3).redISub(p.y.redMul(z3)).cmpn(0) === 0;
};

JPoint.prototype.eqXToP = function eqXToP(x) {
  var zs = this.z.redSqr();
  var rx = x.toRed(this.curve.red).redMul(zs);
  if (this.x.cmp(rx) === 0)
    return true;

  var xc = x.clone();
  var t = this.curve.redN.redMul(zs);
  for (;;) {
    xc.iadd(this.curve.n);
    if (xc.cmp(this.curve.p) >= 0)
      return false;

    rx.redIAdd(t);
    if (this.x.cmp(rx) === 0)
      return true;
  }
};

JPoint.prototype.inspect = function inspect() {
  if (this.isInfinity())
    return '<EC JPoint Infinity>';
  return '<EC JPoint x: ' + this.x.toString(16, 2) +
      ' y: ' + this.y.toString(16, 2) +
      ' z: ' + this.z.toString(16, 2) + '>';
};

JPoint.prototype.isInfinity = function isInfinity() {
  // XXX This code assumes that zero is always zero in red
  return this.z.cmpn(0) === 0;
};

},{"../../elliptic":4,"../curve":7,"bn.js":2,"inherits":33}],10:[function(require,module,exports){
'use strict';

var curves = exports;

var hash = require('hash.js');
var elliptic = require('../elliptic');

var assert = elliptic.utils.assert;

function PresetCurve(options) {
  if (options.type === 'short')
    this.curve = new elliptic.curve.short(options);
  else if (options.type === 'edwards')
    this.curve = new elliptic.curve.edwards(options);
  else
    this.curve = new elliptic.curve.mont(options);
  this.g = this.curve.g;
  this.n = this.curve.n;
  this.hash = options.hash;

  assert(this.g.validate(), 'Invalid curve');
  assert(this.g.mul(this.n).isInfinity(), 'Invalid curve, G*N != O');
}
curves.PresetCurve = PresetCurve;

function defineCurve(name, options) {
  Object.defineProperty(curves, name, {
    configurable: true,
    enumerable: true,
    get: function() {
      var curve = new PresetCurve(options);
      Object.defineProperty(curves, name, {
        configurable: true,
        enumerable: true,
        value: curve
      });
      return curve;
    }
  });
}

defineCurve('p192', {
  type: 'short',
  prime: 'p192',
  p: 'ffffffff ffffffff ffffffff fffffffe ffffffff ffffffff',
  a: 'ffffffff ffffffff ffffffff fffffffe ffffffff fffffffc',
  b: '64210519 e59c80e7 0fa7e9ab 72243049 feb8deec c146b9b1',
  n: 'ffffffff ffffffff ffffffff 99def836 146bc9b1 b4d22831',
  hash: hash.sha256,
  gRed: false,
  g: [
    '188da80e b03090f6 7cbf20eb 43a18800 f4ff0afd 82ff1012',
    '07192b95 ffc8da78 631011ed 6b24cdd5 73f977a1 1e794811'
  ]
});

defineCurve('p224', {
  type: 'short',
  prime: 'p224',
  p: 'ffffffff ffffffff ffffffff ffffffff 00000000 00000000 00000001',
  a: 'ffffffff ffffffff ffffffff fffffffe ffffffff ffffffff fffffffe',
  b: 'b4050a85 0c04b3ab f5413256 5044b0b7 d7bfd8ba 270b3943 2355ffb4',
  n: 'ffffffff ffffffff ffffffff ffff16a2 e0b8f03e 13dd2945 5c5c2a3d',
  hash: hash.sha256,
  gRed: false,
  g: [
    'b70e0cbd 6bb4bf7f 321390b9 4a03c1d3 56c21122 343280d6 115c1d21',
    'bd376388 b5f723fb 4c22dfe6 cd4375a0 5a074764 44d58199 85007e34'
  ]
});

defineCurve('p256', {
  type: 'short',
  prime: null,
  p: 'ffffffff 00000001 00000000 00000000 00000000 ffffffff ffffffff ffffffff',
  a: 'ffffffff 00000001 00000000 00000000 00000000 ffffffff ffffffff fffffffc',
  b: '5ac635d8 aa3a93e7 b3ebbd55 769886bc 651d06b0 cc53b0f6 3bce3c3e 27d2604b',
  n: 'ffffffff 00000000 ffffffff ffffffff bce6faad a7179e84 f3b9cac2 fc632551',
  hash: hash.sha256,
  gRed: false,
  g: [
    '6b17d1f2 e12c4247 f8bce6e5 63a440f2 77037d81 2deb33a0 f4a13945 d898c296',
    '4fe342e2 fe1a7f9b 8ee7eb4a 7c0f9e16 2bce3357 6b315ece cbb64068 37bf51f5'
  ]
});

defineCurve('p384', {
  type: 'short',
  prime: null,
  p: 'ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ' +
     'fffffffe ffffffff 00000000 00000000 ffffffff',
  a: 'ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ' +
     'fffffffe ffffffff 00000000 00000000 fffffffc',
  b: 'b3312fa7 e23ee7e4 988e056b e3f82d19 181d9c6e fe814112 0314088f ' +
     '5013875a c656398d 8a2ed19d 2a85c8ed d3ec2aef',
  n: 'ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff c7634d81 ' +
     'f4372ddf 581a0db2 48b0a77a ecec196a ccc52973',
  hash: hash.sha384,
  gRed: false,
  g: [
    'aa87ca22 be8b0537 8eb1c71e f320ad74 6e1d3b62 8ba79b98 59f741e0 82542a38 ' +
    '5502f25d bf55296c 3a545e38 72760ab7',
    '3617de4a 96262c6f 5d9e98bf 9292dc29 f8f41dbd 289a147c e9da3113 b5f0b8c0 ' +
    '0a60b1ce 1d7e819d 7a431d7c 90ea0e5f'
  ]
});

defineCurve('p521', {
  type: 'short',
  prime: null,
  p: '000001ff ffffffff ffffffff ffffffff ffffffff ffffffff ' +
     'ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ' +
     'ffffffff ffffffff ffffffff ffffffff ffffffff',
  a: '000001ff ffffffff ffffffff ffffffff ffffffff ffffffff ' +
     'ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ' +
     'ffffffff ffffffff ffffffff ffffffff fffffffc',
  b: '00000051 953eb961 8e1c9a1f 929a21a0 b68540ee a2da725b ' +
     '99b315f3 b8b48991 8ef109e1 56193951 ec7e937b 1652c0bd ' +
     '3bb1bf07 3573df88 3d2c34f1 ef451fd4 6b503f00',
  n: '000001ff ffffffff ffffffff ffffffff ffffffff ffffffff ' +
     'ffffffff ffffffff fffffffa 51868783 bf2f966b 7fcc0148 ' +
     'f709a5d0 3bb5c9b8 899c47ae bb6fb71e 91386409',
  hash: hash.sha512,
  gRed: false,
  g: [
    '000000c6 858e06b7 0404e9cd 9e3ecb66 2395b442 9c648139 ' +
    '053fb521 f828af60 6b4d3dba a14b5e77 efe75928 fe1dc127 ' +
    'a2ffa8de 3348b3c1 856a429b f97e7e31 c2e5bd66',
    '00000118 39296a78 9a3bc004 5c8a5fb4 2c7d1bd9 98f54449 ' +
    '579b4468 17afbd17 273e662c 97ee7299 5ef42640 c550b901 ' +
    '3fad0761 353c7086 a272c240 88be9476 9fd16650'
  ]
});

defineCurve('curve25519', {
  type: 'mont',
  prime: 'p25519',
  p: '7fffffffffffffff ffffffffffffffff ffffffffffffffff ffffffffffffffed',
  a: '76d06',
  b: '1',
  n: '1000000000000000 0000000000000000 14def9dea2f79cd6 5812631a5cf5d3ed',
  hash: hash.sha256,
  gRed: false,
  g: [
    '9'
  ]
});

defineCurve('ed25519', {
  type: 'edwards',
  prime: 'p25519',
  p: '7fffffffffffffff ffffffffffffffff ffffffffffffffff ffffffffffffffed',
  a: '-1',
  c: '1',
  // -121665 * (121666^(-1)) (mod P)
  d: '52036cee2b6ffe73 8cc740797779e898 00700a4d4141d8ab 75eb4dca135978a3',
  n: '1000000000000000 0000000000000000 14def9dea2f79cd6 5812631a5cf5d3ed',
  hash: hash.sha256,
  gRed: false,
  g: [
    '216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a',

    // 4/5
    '6666666666666666666666666666666666666666666666666666666666666658'
  ]
});

var pre;
try {
  pre = require('./precomputed/secp256k1');
} catch (e) {
  pre = undefined;
}

defineCurve('secp256k1', {
  type: 'short',
  prime: 'k256',
  p: 'ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffe fffffc2f',
  a: '0',
  b: '7',
  n: 'ffffffff ffffffff ffffffff fffffffe baaedce6 af48a03b bfd25e8c d0364141',
  h: '1',
  hash: hash.sha256,

  // Precomputed endomorphism
  beta: '7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee',
  lambda: '5363ad4cc05c30e0a5261c028812645a122e22ea20816678df02967c1b23bd72',
  basis: [
    {
      a: '3086d221a7d46bcde86c90e49284eb15',
      b: '-e4437ed6010e88286f547fa90abfe4c3'
    },
    {
      a: '114ca50f7a8e2f3f657c1108d9d44cfd8',
      b: '3086d221a7d46bcde86c90e49284eb15'
    }
  ],

  gRed: false,
  g: [
    '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
    '483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8',
    pre
  ]
});

},{"../elliptic":4,"./precomputed/secp256k1":17,"hash.js":20}],11:[function(require,module,exports){
'use strict';

var BN = require('bn.js');
var HmacDRBG = require('hmac-drbg');
var elliptic = require('../../elliptic');
var utils = elliptic.utils;
var assert = utils.assert;

var KeyPair = require('./key');
var Signature = require('./signature');

function EC(options) {
  if (!(this instanceof EC))
    return new EC(options);

  // Shortcut `elliptic.ec(curve-name)`
  if (typeof options === 'string') {
    assert(elliptic.curves.hasOwnProperty(options), 'Unknown curve ' + options);

    options = elliptic.curves[options];
  }

  // Shortcut for `elliptic.ec(elliptic.curves.curveName)`
  if (options instanceof elliptic.curves.PresetCurve)
    options = { curve: options };

  this.curve = options.curve.curve;
  this.n = this.curve.n;
  this.nh = this.n.ushrn(1);
  this.g = this.curve.g;

  // Point on curve
  this.g = options.curve.g;
  this.g.precompute(options.curve.n.bitLength() + 1);

  // Hash for function for DRBG
  this.hash = options.hash || options.curve.hash;
}
module.exports = EC;

EC.prototype.keyPair = function keyPair(options) {
  return new KeyPair(this, options);
};

EC.prototype.keyFromPrivate = function keyFromPrivate(priv, enc) {
  return KeyPair.fromPrivate(this, priv, enc);
};

EC.prototype.keyFromPublic = function keyFromPublic(pub, enc) {
  return KeyPair.fromPublic(this, pub, enc);
};

EC.prototype.genKeyPair = function genKeyPair(options) {
  if (!options)
    options = {};

  // Instantiate Hmac_DRBG
  var drbg = new HmacDRBG({
    hash: this.hash,
    pers: options.pers,
    persEnc: options.persEnc || 'utf8',
    entropy: options.entropy || elliptic.rand(this.hash.hmacStrength),
    entropyEnc: options.entropy && options.entropyEnc || 'utf8',
    nonce: this.n.toArray()
  });

  var bytes = this.n.byteLength();
  var ns2 = this.n.sub(new BN(2));
  do {
    var priv = new BN(drbg.generate(bytes));
    if (priv.cmp(ns2) > 0)
      continue;

    priv.iaddn(1);
    return this.keyFromPrivate(priv);
  } while (true);
};

EC.prototype._truncateToN = function truncateToN(msg, truncOnly) {
  var delta = msg.byteLength() * 8 - this.n.bitLength();
  if (delta > 0)
    msg = msg.ushrn(delta);
  if (!truncOnly && msg.cmp(this.n) >= 0)
    return msg.sub(this.n);
  else
    return msg;
};

EC.prototype.sign = function sign(msg, key, enc, options) {
  if (typeof enc === 'object') {
    options = enc;
    enc = null;
  }
  if (!options)
    options = {};

  key = this.keyFromPrivate(key, enc);
  msg = this._truncateToN(new BN(msg, 16));

  // Zero-extend key to provide enough entropy
  var bytes = this.n.byteLength();
  var bkey = key.getPrivate().toArray('be', bytes);

  // Zero-extend nonce to have the same byte size as N
  var nonce = msg.toArray('be', bytes);

  // Instantiate Hmac_DRBG
  var drbg = new HmacDRBG({
    hash: this.hash,
    entropy: bkey,
    nonce: nonce,
    pers: options.pers,
    persEnc: options.persEnc || 'utf8'
  });

  // Number of bytes to generate
  var ns1 = this.n.sub(new BN(1));

  for (var iter = 0; true; iter++) {
    var k = options.k ?
        options.k(iter) :
        new BN(drbg.generate(this.n.byteLength()));
    k = this._truncateToN(k, true);
    if (k.cmpn(1) <= 0 || k.cmp(ns1) >= 0)
      continue;

    var kp = this.g.mul(k);
    if (kp.isInfinity())
      continue;

    var kpX = kp.getX();
    var r = kpX.umod(this.n);
    if (r.cmpn(0) === 0)
      continue;

    var s = k.invm(this.n).mul(r.mul(key.getPrivate()).iadd(msg));
    s = s.umod(this.n);
    if (s.cmpn(0) === 0)
      continue;

    var recoveryParam = (kp.getY().isOdd() ? 1 : 0) |
                        (kpX.cmp(r) !== 0 ? 2 : 0);

    // Use complement of `s`, if it is > `n / 2`
    if (options.canonical && s.cmp(this.nh) > 0) {
      s = this.n.sub(s);
      recoveryParam ^= 1;
    }

    return new Signature({ r: r, s: s, recoveryParam: recoveryParam });
  }
};

EC.prototype.verify = function verify(msg, signature, key, enc) {
  msg = this._truncateToN(new BN(msg, 16));
  key = this.keyFromPublic(key, enc);
  signature = new Signature(signature, 'hex');

  // Perform primitive values validation
  var r = signature.r;
  var s = signature.s;
  if (r.cmpn(1) < 0 || r.cmp(this.n) >= 0)
    return false;
  if (s.cmpn(1) < 0 || s.cmp(this.n) >= 0)
    return false;

  // Validate signature
  var sinv = s.invm(this.n);
  var u1 = sinv.mul(msg).umod(this.n);
  var u2 = sinv.mul(r).umod(this.n);

  if (!this.curve._maxwellTrick) {
    var p = this.g.mulAdd(u1, key.getPublic(), u2);
    if (p.isInfinity())
      return false;

    return p.getX().umod(this.n).cmp(r) === 0;
  }

  // NOTE: Greg Maxwell's trick, inspired by:
  // https://git.io/vad3K

  var p = this.g.jmulAdd(u1, key.getPublic(), u2);
  if (p.isInfinity())
    return false;

  // Compare `p.x` of Jacobian point with `r`,
  // this will do `p.x == r * p.z^2` instead of multiplying `p.x` by the
  // inverse of `p.z^2`
  return p.eqXToP(r);
};

EC.prototype.recoverPubKey = function(msg, signature, j, enc) {
  assert((3 & j) === j, 'The recovery param is more than two bits');
  signature = new Signature(signature, enc);

  var n = this.n;
  var e = new BN(msg);
  var r = signature.r;
  var s = signature.s;

  // A set LSB signifies that the y-coordinate is odd
  var isYOdd = j & 1;
  var isSecondKey = j >> 1;
  if (r.cmp(this.curve.p.umod(this.curve.n)) >= 0 && isSecondKey)
    throw new Error('Unable to find sencond key candinate');

  // 1.1. Let x = r + jn.
  if (isSecondKey)
    r = this.curve.pointFromX(r.add(this.curve.n), isYOdd);
  else
    r = this.curve.pointFromX(r, isYOdd);

  var rInv = signature.r.invm(n);
  var s1 = n.sub(e).mul(rInv).umod(n);
  var s2 = s.mul(rInv).umod(n);

  // 1.6.1 Compute Q = r^-1 (sR -  eG)
  //               Q = r^-1 (sR + -eG)
  return this.g.mulAdd(s1, r, s2);
};

EC.prototype.getKeyRecoveryParam = function(e, signature, Q, enc) {
  signature = new Signature(signature, enc);
  if (signature.recoveryParam !== null)
    return signature.recoveryParam;

  for (var i = 0; i < 4; i++) {
    var Qprime;
    try {
      Qprime = this.recoverPubKey(e, signature, i);
    } catch (e) {
      continue;
    }

    if (Qprime.eq(Q))
      return i;
  }
  throw new Error('Unable to find valid recovery factor');
};

},{"../../elliptic":4,"./key":12,"./signature":13,"bn.js":2,"hmac-drbg":32}],12:[function(require,module,exports){
'use strict';

var BN = require('bn.js');
var elliptic = require('../../elliptic');
var utils = elliptic.utils;
var assert = utils.assert;

function KeyPair(ec, options) {
  this.ec = ec;
  this.priv = null;
  this.pub = null;

  // KeyPair(ec, { priv: ..., pub: ... })
  if (options.priv)
    this._importPrivate(options.priv, options.privEnc);
  if (options.pub)
    this._importPublic(options.pub, options.pubEnc);
}
module.exports = KeyPair;

KeyPair.fromPublic = function fromPublic(ec, pub, enc) {
  if (pub instanceof KeyPair)
    return pub;

  return new KeyPair(ec, {
    pub: pub,
    pubEnc: enc
  });
};

KeyPair.fromPrivate = function fromPrivate(ec, priv, enc) {
  if (priv instanceof KeyPair)
    return priv;

  return new KeyPair(ec, {
    priv: priv,
    privEnc: enc
  });
};

KeyPair.prototype.validate = function validate() {
  var pub = this.getPublic();

  if (pub.isInfinity())
    return { result: false, reason: 'Invalid public key' };
  if (!pub.validate())
    return { result: false, reason: 'Public key is not a point' };
  if (!pub.mul(this.ec.curve.n).isInfinity())
    return { result: false, reason: 'Public key * N != O' };

  return { result: true, reason: null };
};

KeyPair.prototype.getPublic = function getPublic(compact, enc) {
  // compact is optional argument
  if (typeof compact === 'string') {
    enc = compact;
    compact = null;
  }

  if (!this.pub)
    this.pub = this.ec.g.mul(this.priv);

  if (!enc)
    return this.pub;

  return this.pub.encode(enc, compact);
};

KeyPair.prototype.getPrivate = function getPrivate(enc) {
  if (enc === 'hex')
    return this.priv.toString(16, 2);
  else
    return this.priv;
};

KeyPair.prototype._importPrivate = function _importPrivate(key, enc) {
  this.priv = new BN(key, enc || 16);

  // Ensure that the priv won't be bigger than n, otherwise we may fail
  // in fixed multiplication method
  this.priv = this.priv.umod(this.ec.curve.n);
};

KeyPair.prototype._importPublic = function _importPublic(key, enc) {
  if (key.x || key.y) {
    // Montgomery points only have an `x` coordinate.
    // Weierstrass/Edwards points on the other hand have both `x` and
    // `y` coordinates.
    if (this.ec.curve.type === 'mont') {
      assert(key.x, 'Need x coordinate');
    } else if (this.ec.curve.type === 'short' ||
               this.ec.curve.type === 'edwards') {
      assert(key.x && key.y, 'Need both x and y coordinate');
    }
    this.pub = this.ec.curve.point(key.x, key.y);
    return;
  }
  this.pub = this.ec.curve.decodePoint(key, enc);
};

// ECDH
KeyPair.prototype.derive = function derive(pub) {
  return pub.mul(this.priv).getX();
};

// ECDSA
KeyPair.prototype.sign = function sign(msg, enc, options) {
  return this.ec.sign(msg, this, enc, options);
};

KeyPair.prototype.verify = function verify(msg, signature) {
  return this.ec.verify(msg, signature, this);
};

KeyPair.prototype.inspect = function inspect() {
  return '<Key priv: ' + (this.priv && this.priv.toString(16, 2)) +
         ' pub: ' + (this.pub && this.pub.inspect()) + ' >';
};

},{"../../elliptic":4,"bn.js":2}],13:[function(require,module,exports){
'use strict';

var BN = require('bn.js');

var elliptic = require('../../elliptic');
var utils = elliptic.utils;
var assert = utils.assert;

function Signature(options, enc) {
  if (options instanceof Signature)
    return options;

  if (this._importDER(options, enc))
    return;

  assert(options.r && options.s, 'Signature without r or s');
  this.r = new BN(options.r, 16);
  this.s = new BN(options.s, 16);
  if (options.recoveryParam === undefined)
    this.recoveryParam = null;
  else
    this.recoveryParam = options.recoveryParam;
}
module.exports = Signature;

function Position() {
  this.place = 0;
}

function getLength(buf, p) {
  var initial = buf[p.place++];
  if (!(initial & 0x80)) {
    return initial;
  }
  var octetLen = initial & 0xf;
  var val = 0;
  for (var i = 0, off = p.place; i < octetLen; i++, off++) {
    val <<= 8;
    val |= buf[off];
  }
  p.place = off;
  return val;
}

function rmPadding(buf) {
  var i = 0;
  var len = buf.length - 1;
  while (!buf[i] && !(buf[i + 1] & 0x80) && i < len) {
    i++;
  }
  if (i === 0) {
    return buf;
  }
  return buf.slice(i);
}

Signature.prototype._importDER = function _importDER(data, enc) {
  data = utils.toArray(data, enc);
  var p = new Position();
  if (data[p.place++] !== 0x30) {
    return false;
  }
  var len = getLength(data, p);
  if ((len + p.place) !== data.length) {
    return false;
  }
  if (data[p.place++] !== 0x02) {
    return false;
  }
  var rlen = getLength(data, p);
  var r = data.slice(p.place, rlen + p.place);
  p.place += rlen;
  if (data[p.place++] !== 0x02) {
    return false;
  }
  var slen = getLength(data, p);
  if (data.length !== slen + p.place) {
    return false;
  }
  var s = data.slice(p.place, slen + p.place);
  if (r[0] === 0 && (r[1] & 0x80)) {
    r = r.slice(1);
  }
  if (s[0] === 0 && (s[1] & 0x80)) {
    s = s.slice(1);
  }

  this.r = new BN(r);
  this.s = new BN(s);
  this.recoveryParam = null;

  return true;
};

function constructLength(arr, len) {
  if (len < 0x80) {
    arr.push(len);
    return;
  }
  var octets = 1 + (Math.log(len) / Math.LN2 >>> 3);
  arr.push(octets | 0x80);
  while (--octets) {
    arr.push((len >>> (octets << 3)) & 0xff);
  }
  arr.push(len);
}

Signature.prototype.toDER = function toDER(enc) {
  var r = this.r.toArray();
  var s = this.s.toArray();

  // Pad values
  if (r[0] & 0x80)
    r = [ 0 ].concat(r);
  // Pad values
  if (s[0] & 0x80)
    s = [ 0 ].concat(s);

  r = rmPadding(r);
  s = rmPadding(s);

  while (!s[0] && !(s[1] & 0x80)) {
    s = s.slice(1);
  }
  var arr = [ 0x02 ];
  constructLength(arr, r.length);
  arr = arr.concat(r);
  arr.push(0x02);
  constructLength(arr, s.length);
  var backHalf = arr.concat(s);
  var res = [ 0x30 ];
  constructLength(res, backHalf.length);
  res = res.concat(backHalf);
  return utils.encode(res, enc);
};

},{"../../elliptic":4,"bn.js":2}],14:[function(require,module,exports){
'use strict';

var hash = require('hash.js');
var elliptic = require('../../elliptic');
var utils = elliptic.utils;
var assert = utils.assert;
var parseBytes = utils.parseBytes;
var KeyPair = require('./key');
var Signature = require('./signature');

function EDDSA(curve) {
  assert(curve === 'ed25519', 'only tested with ed25519 so far');

  if (!(this instanceof EDDSA))
    return new EDDSA(curve);

  var curve = elliptic.curves[curve].curve;
  this.curve = curve;
  this.g = curve.g;
  this.g.precompute(curve.n.bitLength() + 1);

  this.pointClass = curve.point().constructor;
  this.encodingLength = Math.ceil(curve.n.bitLength() / 8);
  this.hash = hash.sha512;
}

module.exports = EDDSA;

/**
* @param {Array|String} message - message bytes
* @param {Array|String|KeyPair} secret - secret bytes or a keypair
* @returns {Signature} - signature
*/
EDDSA.prototype.sign = function sign(message, secret) {
  message = parseBytes(message);
  var key = this.keyFromSecret(secret);
  var r = this.hashInt(key.messagePrefix(), message);
  var R = this.g.mul(r);
  var Rencoded = this.encodePoint(R);
  var s_ = this.hashInt(Rencoded, key.pubBytes(), message)
               .mul(key.priv());
  var S = r.add(s_).umod(this.curve.n);
  return this.makeSignature({ R: R, S: S, Rencoded: Rencoded });
};

/**
* @param {Array} message - message bytes
* @param {Array|String|Signature} sig - sig bytes
* @param {Array|String|Point|KeyPair} pub - public key
* @returns {Boolean} - true if public key matches sig of message
*/
EDDSA.prototype.verify = function verify(message, sig, pub) {
  message = parseBytes(message);
  sig = this.makeSignature(sig);
  var key = this.keyFromPublic(pub);
  var h = this.hashInt(sig.Rencoded(), key.pubBytes(), message);
  var SG = this.g.mul(sig.S());
  var RplusAh = sig.R().add(key.pub().mul(h));
  return RplusAh.eq(SG);
};

EDDSA.prototype.hashInt = function hashInt() {
  var hash = this.hash();
  for (var i = 0; i < arguments.length; i++)
    hash.update(arguments[i]);
  return utils.intFromLE(hash.digest()).umod(this.curve.n);
};

EDDSA.prototype.keyFromPublic = function keyFromPublic(pub) {
  return KeyPair.fromPublic(this, pub);
};

EDDSA.prototype.keyFromSecret = function keyFromSecret(secret) {
  return KeyPair.fromSecret(this, secret);
};

EDDSA.prototype.makeSignature = function makeSignature(sig) {
  if (sig instanceof Signature)
    return sig;
  return new Signature(this, sig);
};

/**
* * https://tools.ietf.org/html/draft-josefsson-eddsa-ed25519-03#section-5.2
*
* EDDSA defines methods for encoding and decoding points and integers. These are
* helper convenience methods, that pass along to utility functions implied
* parameters.
*
*/
EDDSA.prototype.encodePoint = function encodePoint(point) {
  var enc = point.getY().toArray('le', this.encodingLength);
  enc[this.encodingLength - 1] |= point.getX().isOdd() ? 0x80 : 0;
  return enc;
};

EDDSA.prototype.decodePoint = function decodePoint(bytes) {
  bytes = utils.parseBytes(bytes);

  var lastIx = bytes.length - 1;
  var normed = bytes.slice(0, lastIx).concat(bytes[lastIx] & ~0x80);
  var xIsOdd = (bytes[lastIx] & 0x80) !== 0;

  var y = utils.intFromLE(normed);
  return this.curve.pointFromY(y, xIsOdd);
};

EDDSA.prototype.encodeInt = function encodeInt(num) {
  return num.toArray('le', this.encodingLength);
};

EDDSA.prototype.decodeInt = function decodeInt(bytes) {
  return utils.intFromLE(bytes);
};

EDDSA.prototype.isPoint = function isPoint(val) {
  return val instanceof this.pointClass;
};

},{"../../elliptic":4,"./key":15,"./signature":16,"hash.js":20}],15:[function(require,module,exports){
'use strict';

var elliptic = require('../../elliptic');
var utils = elliptic.utils;
var assert = utils.assert;
var parseBytes = utils.parseBytes;
var cachedProperty = utils.cachedProperty;

/**
* @param {EDDSA} eddsa - instance
* @param {Object} params - public/private key parameters
*
* @param {Array<Byte>} [params.secret] - secret seed bytes
* @param {Point} [params.pub] - public key point (aka `A` in eddsa terms)
* @param {Array<Byte>} [params.pub] - public key point encoded as bytes
*
*/
function KeyPair(eddsa, params) {
  this.eddsa = eddsa;
  this._secret = parseBytes(params.secret);
  if (eddsa.isPoint(params.pub))
    this._pub = params.pub;
  else
    this._pubBytes = parseBytes(params.pub);
}

KeyPair.fromPublic = function fromPublic(eddsa, pub) {
  if (pub instanceof KeyPair)
    return pub;
  return new KeyPair(eddsa, { pub: pub });
};

KeyPair.fromSecret = function fromSecret(eddsa, secret) {
  if (secret instanceof KeyPair)
    return secret;
  return new KeyPair(eddsa, { secret: secret });
};

KeyPair.prototype.secret = function secret() {
  return this._secret;
};

cachedProperty(KeyPair, 'pubBytes', function pubBytes() {
  return this.eddsa.encodePoint(this.pub());
});

cachedProperty(KeyPair, 'pub', function pub() {
  if (this._pubBytes)
    return this.eddsa.decodePoint(this._pubBytes);
  return this.eddsa.g.mul(this.priv());
});

cachedProperty(KeyPair, 'privBytes', function privBytes() {
  var eddsa = this.eddsa;
  var hash = this.hash();
  var lastIx = eddsa.encodingLength - 1;

  var a = hash.slice(0, eddsa.encodingLength);
  a[0] &= 248;
  a[lastIx] &= 127;
  a[lastIx] |= 64;

  return a;
});

cachedProperty(KeyPair, 'priv', function priv() {
  return this.eddsa.decodeInt(this.privBytes());
});

cachedProperty(KeyPair, 'hash', function hash() {
  return this.eddsa.hash().update(this.secret()).digest();
});

cachedProperty(KeyPair, 'messagePrefix', function messagePrefix() {
  return this.hash().slice(this.eddsa.encodingLength);
});

KeyPair.prototype.sign = function sign(message) {
  assert(this._secret, 'KeyPair can only verify');
  return this.eddsa.sign(message, this);
};

KeyPair.prototype.verify = function verify(message, sig) {
  return this.eddsa.verify(message, sig, this);
};

KeyPair.prototype.getSecret = function getSecret(enc) {
  assert(this._secret, 'KeyPair is public only');
  return utils.encode(this.secret(), enc);
};

KeyPair.prototype.getPublic = function getPublic(enc) {
  return utils.encode(this.pubBytes(), enc);
};

module.exports = KeyPair;

},{"../../elliptic":4}],16:[function(require,module,exports){
'use strict';

var BN = require('bn.js');
var elliptic = require('../../elliptic');
var utils = elliptic.utils;
var assert = utils.assert;
var cachedProperty = utils.cachedProperty;
var parseBytes = utils.parseBytes;

/**
* @param {EDDSA} eddsa - eddsa instance
* @param {Array<Bytes>|Object} sig -
* @param {Array<Bytes>|Point} [sig.R] - R point as Point or bytes
* @param {Array<Bytes>|bn} [sig.S] - S scalar as bn or bytes
* @param {Array<Bytes>} [sig.Rencoded] - R point encoded
* @param {Array<Bytes>} [sig.Sencoded] - S scalar encoded
*/
function Signature(eddsa, sig) {
  this.eddsa = eddsa;

  if (typeof sig !== 'object')
    sig = parseBytes(sig);

  if (Array.isArray(sig)) {
    sig = {
      R: sig.slice(0, eddsa.encodingLength),
      S: sig.slice(eddsa.encodingLength)
    };
  }

  assert(sig.R && sig.S, 'Signature without R or S');

  if (eddsa.isPoint(sig.R))
    this._R = sig.R;
  if (sig.S instanceof BN)
    this._S = sig.S;

  this._Rencoded = Array.isArray(sig.R) ? sig.R : sig.Rencoded;
  this._Sencoded = Array.isArray(sig.S) ? sig.S : sig.Sencoded;
}

cachedProperty(Signature, 'S', function S() {
  return this.eddsa.decodeInt(this.Sencoded());
});

cachedProperty(Signature, 'R', function R() {
  return this.eddsa.decodePoint(this.Rencoded());
});

cachedProperty(Signature, 'Rencoded', function Rencoded() {
  return this.eddsa.encodePoint(this.R());
});

cachedProperty(Signature, 'Sencoded', function Sencoded() {
  return this.eddsa.encodeInt(this.S());
});

Signature.prototype.toBytes = function toBytes() {
  return this.Rencoded().concat(this.Sencoded());
};

Signature.prototype.toHex = function toHex() {
  return utils.encode(this.toBytes(), 'hex').toUpperCase();
};

module.exports = Signature;

},{"../../elliptic":4,"bn.js":2}],17:[function(require,module,exports){
module.exports = {
  doubles: {
    step: 4,
    points: [
      [
        'e60fce93b59e9ec53011aabc21c23e97b2a31369b87a5ae9c44ee89e2a6dec0a',
        'f7e3507399e595929db99f34f57937101296891e44d23f0be1f32cce69616821'
      ],
      [
        '8282263212c609d9ea2a6e3e172de238d8c39cabd5ac1ca10646e23fd5f51508',
        '11f8a8098557dfe45e8256e830b60ace62d613ac2f7b17bed31b6eaff6e26caf'
      ],
      [
        '175e159f728b865a72f99cc6c6fc846de0b93833fd2222ed73fce5b551e5b739',
        'd3506e0d9e3c79eba4ef97a51ff71f5eacb5955add24345c6efa6ffee9fed695'
      ],
      [
        '363d90d447b00c9c99ceac05b6262ee053441c7e55552ffe526bad8f83ff4640',
        '4e273adfc732221953b445397f3363145b9a89008199ecb62003c7f3bee9de9'
      ],
      [
        '8b4b5f165df3c2be8c6244b5b745638843e4a781a15bcd1b69f79a55dffdf80c',
        '4aad0a6f68d308b4b3fbd7813ab0da04f9e336546162ee56b3eff0c65fd4fd36'
      ],
      [
        '723cbaa6e5db996d6bf771c00bd548c7b700dbffa6c0e77bcb6115925232fcda',
        '96e867b5595cc498a921137488824d6e2660a0653779494801dc069d9eb39f5f'
      ],
      [
        'eebfa4d493bebf98ba5feec812c2d3b50947961237a919839a533eca0e7dd7fa',
        '5d9a8ca3970ef0f269ee7edaf178089d9ae4cdc3a711f712ddfd4fdae1de8999'
      ],
      [
        '100f44da696e71672791d0a09b7bde459f1215a29b3c03bfefd7835b39a48db0',
        'cdd9e13192a00b772ec8f3300c090666b7ff4a18ff5195ac0fbd5cd62bc65a09'
      ],
      [
        'e1031be262c7ed1b1dc9227a4a04c017a77f8d4464f3b3852c8acde6e534fd2d',
        '9d7061928940405e6bb6a4176597535af292dd419e1ced79a44f18f29456a00d'
      ],
      [
        'feea6cae46d55b530ac2839f143bd7ec5cf8b266a41d6af52d5e688d9094696d',
        'e57c6b6c97dce1bab06e4e12bf3ecd5c981c8957cc41442d3155debf18090088'
      ],
      [
        'da67a91d91049cdcb367be4be6ffca3cfeed657d808583de33fa978bc1ec6cb1',
        '9bacaa35481642bc41f463f7ec9780e5dec7adc508f740a17e9ea8e27a68be1d'
      ],
      [
        '53904faa0b334cdda6e000935ef22151ec08d0f7bb11069f57545ccc1a37b7c0',
        '5bc087d0bc80106d88c9eccac20d3c1c13999981e14434699dcb096b022771c8'
      ],
      [
        '8e7bcd0bd35983a7719cca7764ca906779b53a043a9b8bcaeff959f43ad86047',
        '10b7770b2a3da4b3940310420ca9514579e88e2e47fd68b3ea10047e8460372a'
      ],
      [
        '385eed34c1cdff21e6d0818689b81bde71a7f4f18397e6690a841e1599c43862',
        '283bebc3e8ea23f56701de19e9ebf4576b304eec2086dc8cc0458fe5542e5453'
      ],
      [
        '6f9d9b803ecf191637c73a4413dfa180fddf84a5947fbc9c606ed86c3fac3a7',
        '7c80c68e603059ba69b8e2a30e45c4d47ea4dd2f5c281002d86890603a842160'
      ],
      [
        '3322d401243c4e2582a2147c104d6ecbf774d163db0f5e5313b7e0e742d0e6bd',
        '56e70797e9664ef5bfb019bc4ddaf9b72805f63ea2873af624f3a2e96c28b2a0'
      ],
      [
        '85672c7d2de0b7da2bd1770d89665868741b3f9af7643397721d74d28134ab83',
        '7c481b9b5b43b2eb6374049bfa62c2e5e77f17fcc5298f44c8e3094f790313a6'
      ],
      [
        '948bf809b1988a46b06c9f1919413b10f9226c60f668832ffd959af60c82a0a',
        '53a562856dcb6646dc6b74c5d1c3418c6d4dff08c97cd2bed4cb7f88d8c8e589'
      ],
      [
        '6260ce7f461801c34f067ce0f02873a8f1b0e44dfc69752accecd819f38fd8e8',
        'bc2da82b6fa5b571a7f09049776a1ef7ecd292238051c198c1a84e95b2b4ae17'
      ],
      [
        'e5037de0afc1d8d43d8348414bbf4103043ec8f575bfdc432953cc8d2037fa2d',
        '4571534baa94d3b5f9f98d09fb990bddbd5f5b03ec481f10e0e5dc841d755bda'
      ],
      [
        'e06372b0f4a207adf5ea905e8f1771b4e7e8dbd1c6a6c5b725866a0ae4fce725',
        '7a908974bce18cfe12a27bb2ad5a488cd7484a7787104870b27034f94eee31dd'
      ],
      [
        '213c7a715cd5d45358d0bbf9dc0ce02204b10bdde2a3f58540ad6908d0559754',
        '4b6dad0b5ae462507013ad06245ba190bb4850f5f36a7eeddff2c27534b458f2'
      ],
      [
        '4e7c272a7af4b34e8dbb9352a5419a87e2838c70adc62cddf0cc3a3b08fbd53c',
        '17749c766c9d0b18e16fd09f6def681b530b9614bff7dd33e0b3941817dcaae6'
      ],
      [
        'fea74e3dbe778b1b10f238ad61686aa5c76e3db2be43057632427e2840fb27b6',
        '6e0568db9b0b13297cf674deccb6af93126b596b973f7b77701d3db7f23cb96f'
      ],
      [
        '76e64113f677cf0e10a2570d599968d31544e179b760432952c02a4417bdde39',
        'c90ddf8dee4e95cf577066d70681f0d35e2a33d2b56d2032b4b1752d1901ac01'
      ],
      [
        'c738c56b03b2abe1e8281baa743f8f9a8f7cc643df26cbee3ab150242bcbb891',
        '893fb578951ad2537f718f2eacbfbbbb82314eef7880cfe917e735d9699a84c3'
      ],
      [
        'd895626548b65b81e264c7637c972877d1d72e5f3a925014372e9f6588f6c14b',
        'febfaa38f2bc7eae728ec60818c340eb03428d632bb067e179363ed75d7d991f'
      ],
      [
        'b8da94032a957518eb0f6433571e8761ceffc73693e84edd49150a564f676e03',
        '2804dfa44805a1e4d7c99cc9762808b092cc584d95ff3b511488e4e74efdf6e7'
      ],
      [
        'e80fea14441fb33a7d8adab9475d7fab2019effb5156a792f1a11778e3c0df5d',
        'eed1de7f638e00771e89768ca3ca94472d155e80af322ea9fcb4291b6ac9ec78'
      ],
      [
        'a301697bdfcd704313ba48e51d567543f2a182031efd6915ddc07bbcc4e16070',
        '7370f91cfb67e4f5081809fa25d40f9b1735dbf7c0a11a130c0d1a041e177ea1'
      ],
      [
        '90ad85b389d6b936463f9d0512678de208cc330b11307fffab7ac63e3fb04ed4',
        'e507a3620a38261affdcbd9427222b839aefabe1582894d991d4d48cb6ef150'
      ],
      [
        '8f68b9d2f63b5f339239c1ad981f162ee88c5678723ea3351b7b444c9ec4c0da',
        '662a9f2dba063986de1d90c2b6be215dbbea2cfe95510bfdf23cbf79501fff82'
      ],
      [
        'e4f3fb0176af85d65ff99ff9198c36091f48e86503681e3e6686fd5053231e11',
        '1e63633ad0ef4f1c1661a6d0ea02b7286cc7e74ec951d1c9822c38576feb73bc'
      ],
      [
        '8c00fa9b18ebf331eb961537a45a4266c7034f2f0d4e1d0716fb6eae20eae29e',
        'efa47267fea521a1a9dc343a3736c974c2fadafa81e36c54e7d2a4c66702414b'
      ],
      [
        'e7a26ce69dd4829f3e10cec0a9e98ed3143d084f308b92c0997fddfc60cb3e41',
        '2a758e300fa7984b471b006a1aafbb18d0a6b2c0420e83e20e8a9421cf2cfd51'
      ],
      [
        'b6459e0ee3662ec8d23540c223bcbdc571cbcb967d79424f3cf29eb3de6b80ef',
        '67c876d06f3e06de1dadf16e5661db3c4b3ae6d48e35b2ff30bf0b61a71ba45'
      ],
      [
        'd68a80c8280bb840793234aa118f06231d6f1fc67e73c5a5deda0f5b496943e8',
        'db8ba9fff4b586d00c4b1f9177b0e28b5b0e7b8f7845295a294c84266b133120'
      ],
      [
        '324aed7df65c804252dc0270907a30b09612aeb973449cea4095980fc28d3d5d',
        '648a365774b61f2ff130c0c35aec1f4f19213b0c7e332843967224af96ab7c84'
      ],
      [
        '4df9c14919cde61f6d51dfdbe5fee5dceec4143ba8d1ca888e8bd373fd054c96',
        '35ec51092d8728050974c23a1d85d4b5d506cdc288490192ebac06cad10d5d'
      ],
      [
        '9c3919a84a474870faed8a9c1cc66021523489054d7f0308cbfc99c8ac1f98cd',
        'ddb84f0f4a4ddd57584f044bf260e641905326f76c64c8e6be7e5e03d4fc599d'
      ],
      [
        '6057170b1dd12fdf8de05f281d8e06bb91e1493a8b91d4cc5a21382120a959e5',
        '9a1af0b26a6a4807add9a2daf71df262465152bc3ee24c65e899be932385a2a8'
      ],
      [
        'a576df8e23a08411421439a4518da31880cef0fba7d4df12b1a6973eecb94266',
        '40a6bf20e76640b2c92b97afe58cd82c432e10a7f514d9f3ee8be11ae1b28ec8'
      ],
      [
        '7778a78c28dec3e30a05fe9629de8c38bb30d1f5cf9a3a208f763889be58ad71',
        '34626d9ab5a5b22ff7098e12f2ff580087b38411ff24ac563b513fc1fd9f43ac'
      ],
      [
        '928955ee637a84463729fd30e7afd2ed5f96274e5ad7e5cb09eda9c06d903ac',
        'c25621003d3f42a827b78a13093a95eeac3d26efa8a8d83fc5180e935bcd091f'
      ],
      [
        '85d0fef3ec6db109399064f3a0e3b2855645b4a907ad354527aae75163d82751',
        '1f03648413a38c0be29d496e582cf5663e8751e96877331582c237a24eb1f962'
      ],
      [
        'ff2b0dce97eece97c1c9b6041798b85dfdfb6d8882da20308f5404824526087e',
        '493d13fef524ba188af4c4dc54d07936c7b7ed6fb90e2ceb2c951e01f0c29907'
      ],
      [
        '827fbbe4b1e880ea9ed2b2e6301b212b57f1ee148cd6dd28780e5e2cf856e241',
        'c60f9c923c727b0b71bef2c67d1d12687ff7a63186903166d605b68baec293ec'
      ],
      [
        'eaa649f21f51bdbae7be4ae34ce6e5217a58fdce7f47f9aa7f3b58fa2120e2b3',
        'be3279ed5bbbb03ac69a80f89879aa5a01a6b965f13f7e59d47a5305ba5ad93d'
      ],
      [
        'e4a42d43c5cf169d9391df6decf42ee541b6d8f0c9a137401e23632dda34d24f',
        '4d9f92e716d1c73526fc99ccfb8ad34ce886eedfa8d8e4f13a7f7131deba9414'
      ],
      [
        '1ec80fef360cbdd954160fadab352b6b92b53576a88fea4947173b9d4300bf19',
        'aeefe93756b5340d2f3a4958a7abbf5e0146e77f6295a07b671cdc1cc107cefd'
      ],
      [
        '146a778c04670c2f91b00af4680dfa8bce3490717d58ba889ddb5928366642be',
        'b318e0ec3354028add669827f9d4b2870aaa971d2f7e5ed1d0b297483d83efd0'
      ],
      [
        'fa50c0f61d22e5f07e3acebb1aa07b128d0012209a28b9776d76a8793180eef9',
        '6b84c6922397eba9b72cd2872281a68a5e683293a57a213b38cd8d7d3f4f2811'
      ],
      [
        'da1d61d0ca721a11b1a5bf6b7d88e8421a288ab5d5bba5220e53d32b5f067ec2',
        '8157f55a7c99306c79c0766161c91e2966a73899d279b48a655fba0f1ad836f1'
      ],
      [
        'a8e282ff0c9706907215ff98e8fd416615311de0446f1e062a73b0610d064e13',
        '7f97355b8db81c09abfb7f3c5b2515888b679a3e50dd6bd6cef7c73111f4cc0c'
      ],
      [
        '174a53b9c9a285872d39e56e6913cab15d59b1fa512508c022f382de8319497c',
        'ccc9dc37abfc9c1657b4155f2c47f9e6646b3a1d8cb9854383da13ac079afa73'
      ],
      [
        '959396981943785c3d3e57edf5018cdbe039e730e4918b3d884fdff09475b7ba',
        '2e7e552888c331dd8ba0386a4b9cd6849c653f64c8709385e9b8abf87524f2fd'
      ],
      [
        'd2a63a50ae401e56d645a1153b109a8fcca0a43d561fba2dbb51340c9d82b151',
        'e82d86fb6443fcb7565aee58b2948220a70f750af484ca52d4142174dcf89405'
      ],
      [
        '64587e2335471eb890ee7896d7cfdc866bacbdbd3839317b3436f9b45617e073',
        'd99fcdd5bf6902e2ae96dd6447c299a185b90a39133aeab358299e5e9faf6589'
      ],
      [
        '8481bde0e4e4d885b3a546d3e549de042f0aa6cea250e7fd358d6c86dd45e458',
        '38ee7b8cba5404dd84a25bf39cecb2ca900a79c42b262e556d64b1b59779057e'
      ],
      [
        '13464a57a78102aa62b6979ae817f4637ffcfed3c4b1ce30bcd6303f6caf666b',
        '69be159004614580ef7e433453ccb0ca48f300a81d0942e13f495a907f6ecc27'
      ],
      [
        'bc4a9df5b713fe2e9aef430bcc1dc97a0cd9ccede2f28588cada3a0d2d83f366',
        'd3a81ca6e785c06383937adf4b798caa6e8a9fbfa547b16d758d666581f33c1'
      ],
      [
        '8c28a97bf8298bc0d23d8c749452a32e694b65e30a9472a3954ab30fe5324caa',
        '40a30463a3305193378fedf31f7cc0eb7ae784f0451cb9459e71dc73cbef9482'
      ],
      [
        '8ea9666139527a8c1dd94ce4f071fd23c8b350c5a4bb33748c4ba111faccae0',
        '620efabbc8ee2782e24e7c0cfb95c5d735b783be9cf0f8e955af34a30e62b945'
      ],
      [
        'dd3625faef5ba06074669716bbd3788d89bdde815959968092f76cc4eb9a9787',
        '7a188fa3520e30d461da2501045731ca941461982883395937f68d00c644a573'
      ],
      [
        'f710d79d9eb962297e4f6232b40e8f7feb2bc63814614d692c12de752408221e',
        'ea98e67232d3b3295d3b535532115ccac8612c721851617526ae47a9c77bfc82'
      ]
    ]
  },
  naf: {
    wnd: 7,
    points: [
      [
        'f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9',
        '388f7b0f632de8140fe337e62a37f3566500a99934c2231b6cb9fd7584b8e672'
      ],
      [
        '2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4',
        'd8ac222636e5e3d6d4dba9dda6c9c426f788271bab0d6840dca87d3aa6ac62d6'
      ],
      [
        '5cbdf0646e5db4eaa398f365f2ea7a0e3d419b7e0330e39ce92bddedcac4f9bc',
        '6aebca40ba255960a3178d6d861a54dba813d0b813fde7b5a5082628087264da'
      ],
      [
        'acd484e2f0c7f65309ad178a9f559abde09796974c57e714c35f110dfc27ccbe',
        'cc338921b0a7d9fd64380971763b61e9add888a4375f8e0f05cc262ac64f9c37'
      ],
      [
        '774ae7f858a9411e5ef4246b70c65aac5649980be5c17891bbec17895da008cb',
        'd984a032eb6b5e190243dd56d7b7b365372db1e2dff9d6a8301d74c9c953c61b'
      ],
      [
        'f28773c2d975288bc7d1d205c3748651b075fbc6610e58cddeeddf8f19405aa8',
        'ab0902e8d880a89758212eb65cdaf473a1a06da521fa91f29b5cb52db03ed81'
      ],
      [
        'd7924d4f7d43ea965a465ae3095ff41131e5946f3c85f79e44adbcf8e27e080e',
        '581e2872a86c72a683842ec228cc6defea40af2bd896d3a5c504dc9ff6a26b58'
      ],
      [
        'defdea4cdb677750a420fee807eacf21eb9898ae79b9768766e4faa04a2d4a34',
        '4211ab0694635168e997b0ead2a93daeced1f4a04a95c0f6cfb199f69e56eb77'
      ],
      [
        '2b4ea0a797a443d293ef5cff444f4979f06acfebd7e86d277475656138385b6c',
        '85e89bc037945d93b343083b5a1c86131a01f60c50269763b570c854e5c09b7a'
      ],
      [
        '352bbf4a4cdd12564f93fa332ce333301d9ad40271f8107181340aef25be59d5',
        '321eb4075348f534d59c18259dda3e1f4a1b3b2e71b1039c67bd3d8bcf81998c'
      ],
      [
        '2fa2104d6b38d11b0230010559879124e42ab8dfeff5ff29dc9cdadd4ecacc3f',
        '2de1068295dd865b64569335bd5dd80181d70ecfc882648423ba76b532b7d67'
      ],
      [
        '9248279b09b4d68dab21a9b066edda83263c3d84e09572e269ca0cd7f5453714',
        '73016f7bf234aade5d1aa71bdea2b1ff3fc0de2a887912ffe54a32ce97cb3402'
      ],
      [
        'daed4f2be3a8bf278e70132fb0beb7522f570e144bf615c07e996d443dee8729',
        'a69dce4a7d6c98e8d4a1aca87ef8d7003f83c230f3afa726ab40e52290be1c55'
      ],
      [
        'c44d12c7065d812e8acf28d7cbb19f9011ecd9e9fdf281b0e6a3b5e87d22e7db',
        '2119a460ce326cdc76c45926c982fdac0e106e861edf61c5a039063f0e0e6482'
      ],
      [
        '6a245bf6dc698504c89a20cfded60853152b695336c28063b61c65cbd269e6b4',
        'e022cf42c2bd4a708b3f5126f16a24ad8b33ba48d0423b6efd5e6348100d8a82'
      ],
      [
        '1697ffa6fd9de627c077e3d2fe541084ce13300b0bec1146f95ae57f0d0bd6a5',
        'b9c398f186806f5d27561506e4557433a2cf15009e498ae7adee9d63d01b2396'
      ],
      [
        '605bdb019981718b986d0f07e834cb0d9deb8360ffb7f61df982345ef27a7479',
        '2972d2de4f8d20681a78d93ec96fe23c26bfae84fb14db43b01e1e9056b8c49'
      ],
      [
        '62d14dab4150bf497402fdc45a215e10dcb01c354959b10cfe31c7e9d87ff33d',
        '80fc06bd8cc5b01098088a1950eed0db01aa132967ab472235f5642483b25eaf'
      ],
      [
        '80c60ad0040f27dade5b4b06c408e56b2c50e9f56b9b8b425e555c2f86308b6f',
        '1c38303f1cc5c30f26e66bad7fe72f70a65eed4cbe7024eb1aa01f56430bd57a'
      ],
      [
        '7a9375ad6167ad54aa74c6348cc54d344cc5dc9487d847049d5eabb0fa03c8fb',
        'd0e3fa9eca8726909559e0d79269046bdc59ea10c70ce2b02d499ec224dc7f7'
      ],
      [
        'd528ecd9b696b54c907a9ed045447a79bb408ec39b68df504bb51f459bc3ffc9',
        'eecf41253136e5f99966f21881fd656ebc4345405c520dbc063465b521409933'
      ],
      [
        '49370a4b5f43412ea25f514e8ecdad05266115e4a7ecb1387231808f8b45963',
        '758f3f41afd6ed428b3081b0512fd62a54c3f3afbb5b6764b653052a12949c9a'
      ],
      [
        '77f230936ee88cbbd73df930d64702ef881d811e0e1498e2f1c13eb1fc345d74',
        '958ef42a7886b6400a08266e9ba1b37896c95330d97077cbbe8eb3c7671c60d6'
      ],
      [
        'f2dac991cc4ce4b9ea44887e5c7c0bce58c80074ab9d4dbaeb28531b7739f530',
        'e0dedc9b3b2f8dad4da1f32dec2531df9eb5fbeb0598e4fd1a117dba703a3c37'
      ],
      [
        '463b3d9f662621fb1b4be8fbbe2520125a216cdfc9dae3debcba4850c690d45b',
        '5ed430d78c296c3543114306dd8622d7c622e27c970a1de31cb377b01af7307e'
      ],
      [
        'f16f804244e46e2a09232d4aff3b59976b98fac14328a2d1a32496b49998f247',
        'cedabd9b82203f7e13d206fcdf4e33d92a6c53c26e5cce26d6579962c4e31df6'
      ],
      [
        'caf754272dc84563b0352b7a14311af55d245315ace27c65369e15f7151d41d1',
        'cb474660ef35f5f2a41b643fa5e460575f4fa9b7962232a5c32f908318a04476'
      ],
      [
        '2600ca4b282cb986f85d0f1709979d8b44a09c07cb86d7c124497bc86f082120',
        '4119b88753c15bd6a693b03fcddbb45d5ac6be74ab5f0ef44b0be9475a7e4b40'
      ],
      [
        '7635ca72d7e8432c338ec53cd12220bc01c48685e24f7dc8c602a7746998e435',
        '91b649609489d613d1d5e590f78e6d74ecfc061d57048bad9e76f302c5b9c61'
      ],
      [
        '754e3239f325570cdbbf4a87deee8a66b7f2b33479d468fbc1a50743bf56cc18',
        '673fb86e5bda30fb3cd0ed304ea49a023ee33d0197a695d0c5d98093c536683'
      ],
      [
        'e3e6bd1071a1e96aff57859c82d570f0330800661d1c952f9fe2694691d9b9e8',
        '59c9e0bba394e76f40c0aa58379a3cb6a5a2283993e90c4167002af4920e37f5'
      ],
      [
        '186b483d056a033826ae73d88f732985c4ccb1f32ba35f4b4cc47fdcf04aa6eb',
        '3b952d32c67cf77e2e17446e204180ab21fb8090895138b4a4a797f86e80888b'
      ],
      [
        'df9d70a6b9876ce544c98561f4be4f725442e6d2b737d9c91a8321724ce0963f',
        '55eb2dafd84d6ccd5f862b785dc39d4ab157222720ef9da217b8c45cf2ba2417'
      ],
      [
        '5edd5cc23c51e87a497ca815d5dce0f8ab52554f849ed8995de64c5f34ce7143',
        'efae9c8dbc14130661e8cec030c89ad0c13c66c0d17a2905cdc706ab7399a868'
      ],
      [
        '290798c2b6476830da12fe02287e9e777aa3fba1c355b17a722d362f84614fba',
        'e38da76dcd440621988d00bcf79af25d5b29c094db2a23146d003afd41943e7a'
      ],
      [
        'af3c423a95d9f5b3054754efa150ac39cd29552fe360257362dfdecef4053b45',
        'f98a3fd831eb2b749a93b0e6f35cfb40c8cd5aa667a15581bc2feded498fd9c6'
      ],
      [
        '766dbb24d134e745cccaa28c99bf274906bb66b26dcf98df8d2fed50d884249a',
        '744b1152eacbe5e38dcc887980da38b897584a65fa06cedd2c924f97cbac5996'
      ],
      [
        '59dbf46f8c94759ba21277c33784f41645f7b44f6c596a58ce92e666191abe3e',
        'c534ad44175fbc300f4ea6ce648309a042ce739a7919798cd85e216c4a307f6e'
      ],
      [
        'f13ada95103c4537305e691e74e9a4a8dd647e711a95e73cb62dc6018cfd87b8',
        'e13817b44ee14de663bf4bc808341f326949e21a6a75c2570778419bdaf5733d'
      ],
      [
        '7754b4fa0e8aced06d4167a2c59cca4cda1869c06ebadfb6488550015a88522c',
        '30e93e864e669d82224b967c3020b8fa8d1e4e350b6cbcc537a48b57841163a2'
      ],
      [
        '948dcadf5990e048aa3874d46abef9d701858f95de8041d2a6828c99e2262519',
        'e491a42537f6e597d5d28a3224b1bc25df9154efbd2ef1d2cbba2cae5347d57e'
      ],
      [
        '7962414450c76c1689c7b48f8202ec37fb224cf5ac0bfa1570328a8a3d7c77ab',
        '100b610ec4ffb4760d5c1fc133ef6f6b12507a051f04ac5760afa5b29db83437'
      ],
      [
        '3514087834964b54b15b160644d915485a16977225b8847bb0dd085137ec47ca',
        'ef0afbb2056205448e1652c48e8127fc6039e77c15c2378b7e7d15a0de293311'
      ],
      [
        'd3cc30ad6b483e4bc79ce2c9dd8bc54993e947eb8df787b442943d3f7b527eaf',
        '8b378a22d827278d89c5e9be8f9508ae3c2ad46290358630afb34db04eede0a4'
      ],
      [
        '1624d84780732860ce1c78fcbfefe08b2b29823db913f6493975ba0ff4847610',
        '68651cf9b6da903e0914448c6cd9d4ca896878f5282be4c8cc06e2a404078575'
      ],
      [
        '733ce80da955a8a26902c95633e62a985192474b5af207da6df7b4fd5fc61cd4',
        'f5435a2bd2badf7d485a4d8b8db9fcce3e1ef8e0201e4578c54673bc1dc5ea1d'
      ],
      [
        '15d9441254945064cf1a1c33bbd3b49f8966c5092171e699ef258dfab81c045c',
        'd56eb30b69463e7234f5137b73b84177434800bacebfc685fc37bbe9efe4070d'
      ],
      [
        'a1d0fcf2ec9de675b612136e5ce70d271c21417c9d2b8aaaac138599d0717940',
        'edd77f50bcb5a3cab2e90737309667f2641462a54070f3d519212d39c197a629'
      ],
      [
        'e22fbe15c0af8ccc5780c0735f84dbe9a790badee8245c06c7ca37331cb36980',
        'a855babad5cd60c88b430a69f53a1a7a38289154964799be43d06d77d31da06'
      ],
      [
        '311091dd9860e8e20ee13473c1155f5f69635e394704eaa74009452246cfa9b3',
        '66db656f87d1f04fffd1f04788c06830871ec5a64feee685bd80f0b1286d8374'
      ],
      [
        '34c1fd04d301be89b31c0442d3e6ac24883928b45a9340781867d4232ec2dbdf',
        '9414685e97b1b5954bd46f730174136d57f1ceeb487443dc5321857ba73abee'
      ],
      [
        'f219ea5d6b54701c1c14de5b557eb42a8d13f3abbcd08affcc2a5e6b049b8d63',
        '4cb95957e83d40b0f73af4544cccf6b1f4b08d3c07b27fb8d8c2962a400766d1'
      ],
      [
        'd7b8740f74a8fbaab1f683db8f45de26543a5490bca627087236912469a0b448',
        'fa77968128d9c92ee1010f337ad4717eff15db5ed3c049b3411e0315eaa4593b'
      ],
      [
        '32d31c222f8f6f0ef86f7c98d3a3335ead5bcd32abdd94289fe4d3091aa824bf',
        '5f3032f5892156e39ccd3d7915b9e1da2e6dac9e6f26e961118d14b8462e1661'
      ],
      [
        '7461f371914ab32671045a155d9831ea8793d77cd59592c4340f86cbc18347b5',
        '8ec0ba238b96bec0cbdddcae0aa442542eee1ff50c986ea6b39847b3cc092ff6'
      ],
      [
        'ee079adb1df1860074356a25aa38206a6d716b2c3e67453d287698bad7b2b2d6',
        '8dc2412aafe3be5c4c5f37e0ecc5f9f6a446989af04c4e25ebaac479ec1c8c1e'
      ],
      [
        '16ec93e447ec83f0467b18302ee620f7e65de331874c9dc72bfd8616ba9da6b5',
        '5e4631150e62fb40d0e8c2a7ca5804a39d58186a50e497139626778e25b0674d'
      ],
      [
        'eaa5f980c245f6f038978290afa70b6bd8855897f98b6aa485b96065d537bd99',
        'f65f5d3e292c2e0819a528391c994624d784869d7e6ea67fb18041024edc07dc'
      ],
      [
        '78c9407544ac132692ee1910a02439958ae04877151342ea96c4b6b35a49f51',
        'f3e0319169eb9b85d5404795539a5e68fa1fbd583c064d2462b675f194a3ddb4'
      ],
      [
        '494f4be219a1a77016dcd838431aea0001cdc8ae7a6fc688726578d9702857a5',
        '42242a969283a5f339ba7f075e36ba2af925ce30d767ed6e55f4b031880d562c'
      ],
      [
        'a598a8030da6d86c6bc7f2f5144ea549d28211ea58faa70ebf4c1e665c1fe9b5',
        '204b5d6f84822c307e4b4a7140737aec23fc63b65b35f86a10026dbd2d864e6b'
      ],
      [
        'c41916365abb2b5d09192f5f2dbeafec208f020f12570a184dbadc3e58595997',
        '4f14351d0087efa49d245b328984989d5caf9450f34bfc0ed16e96b58fa9913'
      ],
      [
        '841d6063a586fa475a724604da03bc5b92a2e0d2e0a36acfe4c73a5514742881',
        '73867f59c0659e81904f9a1c7543698e62562d6744c169ce7a36de01a8d6154'
      ],
      [
        '5e95bb399a6971d376026947f89bde2f282b33810928be4ded112ac4d70e20d5',
        '39f23f366809085beebfc71181313775a99c9aed7d8ba38b161384c746012865'
      ],
      [
        '36e4641a53948fd476c39f8a99fd974e5ec07564b5315d8bf99471bca0ef2f66',
        'd2424b1b1abe4eb8164227b085c9aa9456ea13493fd563e06fd51cf5694c78fc'
      ],
      [
        '336581ea7bfbbb290c191a2f507a41cf5643842170e914faeab27c2c579f726',
        'ead12168595fe1be99252129b6e56b3391f7ab1410cd1e0ef3dcdcabd2fda224'
      ],
      [
        '8ab89816dadfd6b6a1f2634fcf00ec8403781025ed6890c4849742706bd43ede',
        '6fdcef09f2f6d0a044e654aef624136f503d459c3e89845858a47a9129cdd24e'
      ],
      [
        '1e33f1a746c9c5778133344d9299fcaa20b0938e8acff2544bb40284b8c5fb94',
        '60660257dd11b3aa9c8ed618d24edff2306d320f1d03010e33a7d2057f3b3b6'
      ],
      [
        '85b7c1dcb3cec1b7ee7f30ded79dd20a0ed1f4cc18cbcfcfa410361fd8f08f31',
        '3d98a9cdd026dd43f39048f25a8847f4fcafad1895d7a633c6fed3c35e999511'
      ],
      [
        '29df9fbd8d9e46509275f4b125d6d45d7fbe9a3b878a7af872a2800661ac5f51',
        'b4c4fe99c775a606e2d8862179139ffda61dc861c019e55cd2876eb2a27d84b'
      ],
      [
        'a0b1cae06b0a847a3fea6e671aaf8adfdfe58ca2f768105c8082b2e449fce252',
        'ae434102edde0958ec4b19d917a6a28e6b72da1834aff0e650f049503a296cf2'
      ],
      [
        '4e8ceafb9b3e9a136dc7ff67e840295b499dfb3b2133e4ba113f2e4c0e121e5',
        'cf2174118c8b6d7a4b48f6d534ce5c79422c086a63460502b827ce62a326683c'
      ],
      [
        'd24a44e047e19b6f5afb81c7ca2f69080a5076689a010919f42725c2b789a33b',
        '6fb8d5591b466f8fc63db50f1c0f1c69013f996887b8244d2cdec417afea8fa3'
      ],
      [
        'ea01606a7a6c9cdd249fdfcfacb99584001edd28abbab77b5104e98e8e3b35d4',
        '322af4908c7312b0cfbfe369f7a7b3cdb7d4494bc2823700cfd652188a3ea98d'
      ],
      [
        'af8addbf2b661c8a6c6328655eb96651252007d8c5ea31be4ad196de8ce2131f',
        '6749e67c029b85f52a034eafd096836b2520818680e26ac8f3dfbcdb71749700'
      ],
      [
        'e3ae1974566ca06cc516d47e0fb165a674a3dabcfca15e722f0e3450f45889',
        '2aeabe7e4531510116217f07bf4d07300de97e4874f81f533420a72eeb0bd6a4'
      ],
      [
        '591ee355313d99721cf6993ffed1e3e301993ff3ed258802075ea8ced397e246',
        'b0ea558a113c30bea60fc4775460c7901ff0b053d25ca2bdeee98f1a4be5d196'
      ],
      [
        '11396d55fda54c49f19aa97318d8da61fa8584e47b084945077cf03255b52984',
        '998c74a8cd45ac01289d5833a7beb4744ff536b01b257be4c5767bea93ea57a4'
      ],
      [
        '3c5d2a1ba39c5a1790000738c9e0c40b8dcdfd5468754b6405540157e017aa7a',
        'b2284279995a34e2f9d4de7396fc18b80f9b8b9fdd270f6661f79ca4c81bd257'
      ],
      [
        'cc8704b8a60a0defa3a99a7299f2e9c3fbc395afb04ac078425ef8a1793cc030',
        'bdd46039feed17881d1e0862db347f8cf395b74fc4bcdc4e940b74e3ac1f1b13'
      ],
      [
        'c533e4f7ea8555aacd9777ac5cad29b97dd4defccc53ee7ea204119b2889b197',
        '6f0a256bc5efdf429a2fb6242f1a43a2d9b925bb4a4b3a26bb8e0f45eb596096'
      ],
      [
        'c14f8f2ccb27d6f109f6d08d03cc96a69ba8c34eec07bbcf566d48e33da6593',
        'c359d6923bb398f7fd4473e16fe1c28475b740dd098075e6c0e8649113dc3a38'
      ],
      [
        'a6cbc3046bc6a450bac24789fa17115a4c9739ed75f8f21ce441f72e0b90e6ef',
        '21ae7f4680e889bb130619e2c0f95a360ceb573c70603139862afd617fa9b9f'
      ],
      [
        '347d6d9a02c48927ebfb86c1359b1caf130a3c0267d11ce6344b39f99d43cc38',
        '60ea7f61a353524d1c987f6ecec92f086d565ab687870cb12689ff1e31c74448'
      ],
      [
        'da6545d2181db8d983f7dcb375ef5866d47c67b1bf31c8cf855ef7437b72656a',
        '49b96715ab6878a79e78f07ce5680c5d6673051b4935bd897fea824b77dc208a'
      ],
      [
        'c40747cc9d012cb1a13b8148309c6de7ec25d6945d657146b9d5994b8feb1111',
        '5ca560753be2a12fc6de6caf2cb489565db936156b9514e1bb5e83037e0fa2d4'
      ],
      [
        '4e42c8ec82c99798ccf3a610be870e78338c7f713348bd34c8203ef4037f3502',
        '7571d74ee5e0fb92a7a8b33a07783341a5492144cc54bcc40a94473693606437'
      ],
      [
        '3775ab7089bc6af823aba2e1af70b236d251cadb0c86743287522a1b3b0dedea',
        'be52d107bcfa09d8bcb9736a828cfa7fac8db17bf7a76a2c42ad961409018cf7'
      ],
      [
        'cee31cbf7e34ec379d94fb814d3d775ad954595d1314ba8846959e3e82f74e26',
        '8fd64a14c06b589c26b947ae2bcf6bfa0149ef0be14ed4d80f448a01c43b1c6d'
      ],
      [
        'b4f9eaea09b6917619f6ea6a4eb5464efddb58fd45b1ebefcdc1a01d08b47986',
        '39e5c9925b5a54b07433a4f18c61726f8bb131c012ca542eb24a8ac07200682a'
      ],
      [
        'd4263dfc3d2df923a0179a48966d30ce84e2515afc3dccc1b77907792ebcc60e',
        '62dfaf07a0f78feb30e30d6295853ce189e127760ad6cf7fae164e122a208d54'
      ],
      [
        '48457524820fa65a4f8d35eb6930857c0032acc0a4a2de422233eeda897612c4',
        '25a748ab367979d98733c38a1fa1c2e7dc6cc07db2d60a9ae7a76aaa49bd0f77'
      ],
      [
        'dfeeef1881101f2cb11644f3a2afdfc2045e19919152923f367a1767c11cceda',
        'ecfb7056cf1de042f9420bab396793c0c390bde74b4bbdff16a83ae09a9a7517'
      ],
      [
        '6d7ef6b17543f8373c573f44e1f389835d89bcbc6062ced36c82df83b8fae859',
        'cd450ec335438986dfefa10c57fea9bcc521a0959b2d80bbf74b190dca712d10'
      ],
      [
        'e75605d59102a5a2684500d3b991f2e3f3c88b93225547035af25af66e04541f',
        'f5c54754a8f71ee540b9b48728473e314f729ac5308b06938360990e2bfad125'
      ],
      [
        'eb98660f4c4dfaa06a2be453d5020bc99a0c2e60abe388457dd43fefb1ed620c',
        '6cb9a8876d9cb8520609af3add26cd20a0a7cd8a9411131ce85f44100099223e'
      ],
      [
        '13e87b027d8514d35939f2e6892b19922154596941888336dc3563e3b8dba942',
        'fef5a3c68059a6dec5d624114bf1e91aac2b9da568d6abeb2570d55646b8adf1'
      ],
      [
        'ee163026e9fd6fe017c38f06a5be6fc125424b371ce2708e7bf4491691e5764a',
        '1acb250f255dd61c43d94ccc670d0f58f49ae3fa15b96623e5430da0ad6c62b2'
      ],
      [
        'b268f5ef9ad51e4d78de3a750c2dc89b1e626d43505867999932e5db33af3d80',
        '5f310d4b3c99b9ebb19f77d41c1dee018cf0d34fd4191614003e945a1216e423'
      ],
      [
        'ff07f3118a9df035e9fad85eb6c7bfe42b02f01ca99ceea3bf7ffdba93c4750d',
        '438136d603e858a3a5c440c38eccbaddc1d2942114e2eddd4740d098ced1f0d8'
      ],
      [
        '8d8b9855c7c052a34146fd20ffb658bea4b9f69e0d825ebec16e8c3ce2b526a1',
        'cdb559eedc2d79f926baf44fb84ea4d44bcf50fee51d7ceb30e2e7f463036758'
      ],
      [
        '52db0b5384dfbf05bfa9d472d7ae26dfe4b851ceca91b1eba54263180da32b63',
        'c3b997d050ee5d423ebaf66a6db9f57b3180c902875679de924b69d84a7b375'
      ],
      [
        'e62f9490d3d51da6395efd24e80919cc7d0f29c3f3fa48c6fff543becbd43352',
        '6d89ad7ba4876b0b22c2ca280c682862f342c8591f1daf5170e07bfd9ccafa7d'
      ],
      [
        '7f30ea2476b399b4957509c88f77d0191afa2ff5cb7b14fd6d8e7d65aaab1193',
        'ca5ef7d4b231c94c3b15389a5f6311e9daff7bb67b103e9880ef4bff637acaec'
      ],
      [
        '5098ff1e1d9f14fb46a210fada6c903fef0fb7b4a1dd1d9ac60a0361800b7a00',
        '9731141d81fc8f8084d37c6e7542006b3ee1b40d60dfe5362a5b132fd17ddc0'
      ],
      [
        '32b78c7de9ee512a72895be6b9cbefa6e2f3c4ccce445c96b9f2c81e2778ad58',
        'ee1849f513df71e32efc3896ee28260c73bb80547ae2275ba497237794c8753c'
      ],
      [
        'e2cb74fddc8e9fbcd076eef2a7c72b0ce37d50f08269dfc074b581550547a4f7',
        'd3aa2ed71c9dd2247a62df062736eb0baddea9e36122d2be8641abcb005cc4a4'
      ],
      [
        '8438447566d4d7bedadc299496ab357426009a35f235cb141be0d99cd10ae3a8',
        'c4e1020916980a4da5d01ac5e6ad330734ef0d7906631c4f2390426b2edd791f'
      ],
      [
        '4162d488b89402039b584c6fc6c308870587d9c46f660b878ab65c82c711d67e',
        '67163e903236289f776f22c25fb8a3afc1732f2b84b4e95dbda47ae5a0852649'
      ],
      [
        '3fad3fa84caf0f34f0f89bfd2dcf54fc175d767aec3e50684f3ba4a4bf5f683d',
        'cd1bc7cb6cc407bb2f0ca647c718a730cf71872e7d0d2a53fa20efcdfe61826'
      ],
      [
        '674f2600a3007a00568c1a7ce05d0816c1fb84bf1370798f1c69532faeb1a86b',
        '299d21f9413f33b3edf43b257004580b70db57da0b182259e09eecc69e0d38a5'
      ],
      [
        'd32f4da54ade74abb81b815ad1fb3b263d82d6c692714bcff87d29bd5ee9f08f',
        'f9429e738b8e53b968e99016c059707782e14f4535359d582fc416910b3eea87'
      ],
      [
        '30e4e670435385556e593657135845d36fbb6931f72b08cb1ed954f1e3ce3ff6',
        '462f9bce619898638499350113bbc9b10a878d35da70740dc695a559eb88db7b'
      ],
      [
        'be2062003c51cc3004682904330e4dee7f3dcd10b01e580bf1971b04d4cad297',
        '62188bc49d61e5428573d48a74e1c655b1c61090905682a0d5558ed72dccb9bc'
      ],
      [
        '93144423ace3451ed29e0fb9ac2af211cb6e84a601df5993c419859fff5df04a',
        '7c10dfb164c3425f5c71a3f9d7992038f1065224f72bb9d1d902a6d13037b47c'
      ],
      [
        'b015f8044f5fcbdcf21ca26d6c34fb8197829205c7b7d2a7cb66418c157b112c',
        'ab8c1e086d04e813744a655b2df8d5f83b3cdc6faa3088c1d3aea1454e3a1d5f'
      ],
      [
        'd5e9e1da649d97d89e4868117a465a3a4f8a18de57a140d36b3f2af341a21b52',
        '4cb04437f391ed73111a13cc1d4dd0db1693465c2240480d8955e8592f27447a'
      ],
      [
        'd3ae41047dd7ca065dbf8ed77b992439983005cd72e16d6f996a5316d36966bb',
        'bd1aeb21ad22ebb22a10f0303417c6d964f8cdd7df0aca614b10dc14d125ac46'
      ],
      [
        '463e2763d885f958fc66cdd22800f0a487197d0a82e377b49f80af87c897b065',
        'bfefacdb0e5d0fd7df3a311a94de062b26b80c61fbc97508b79992671ef7ca7f'
      ],
      [
        '7985fdfd127c0567c6f53ec1bb63ec3158e597c40bfe747c83cddfc910641917',
        '603c12daf3d9862ef2b25fe1de289aed24ed291e0ec6708703a5bd567f32ed03'
      ],
      [
        '74a1ad6b5f76e39db2dd249410eac7f99e74c59cb83d2d0ed5ff1543da7703e9',
        'cc6157ef18c9c63cd6193d83631bbea0093e0968942e8c33d5737fd790e0db08'
      ],
      [
        '30682a50703375f602d416664ba19b7fc9bab42c72747463a71d0896b22f6da3',
        '553e04f6b018b4fa6c8f39e7f311d3176290d0e0f19ca73f17714d9977a22ff8'
      ],
      [
        '9e2158f0d7c0d5f26c3791efefa79597654e7a2b2464f52b1ee6c1347769ef57',
        '712fcdd1b9053f09003a3481fa7762e9ffd7c8ef35a38509e2fbf2629008373'
      ],
      [
        '176e26989a43c9cfeba4029c202538c28172e566e3c4fce7322857f3be327d66',
        'ed8cc9d04b29eb877d270b4878dc43c19aefd31f4eee09ee7b47834c1fa4b1c3'
      ],
      [
        '75d46efea3771e6e68abb89a13ad747ecf1892393dfc4f1b7004788c50374da8',
        '9852390a99507679fd0b86fd2b39a868d7efc22151346e1a3ca4726586a6bed8'
      ],
      [
        '809a20c67d64900ffb698c4c825f6d5f2310fb0451c869345b7319f645605721',
        '9e994980d9917e22b76b061927fa04143d096ccc54963e6a5ebfa5f3f8e286c1'
      ],
      [
        '1b38903a43f7f114ed4500b4eac7083fdefece1cf29c63528d563446f972c180',
        '4036edc931a60ae889353f77fd53de4a2708b26b6f5da72ad3394119daf408f9'
      ]
    ]
  }
};

},{}],18:[function(require,module,exports){
'use strict';

var utils = exports;
var BN = require('bn.js');
var minAssert = require('minimalistic-assert');
var minUtils = require('minimalistic-crypto-utils');

utils.assert = minAssert;
utils.toArray = minUtils.toArray;
utils.zero2 = minUtils.zero2;
utils.toHex = minUtils.toHex;
utils.encode = minUtils.encode;

// Represent num in a w-NAF form
function getNAF(num, w) {
  var naf = [];
  var ws = 1 << (w + 1);
  var k = num.clone();
  while (k.cmpn(1) >= 0) {
    var z;
    if (k.isOdd()) {
      var mod = k.andln(ws - 1);
      if (mod > (ws >> 1) - 1)
        z = (ws >> 1) - mod;
      else
        z = mod;
      k.isubn(z);
    } else {
      z = 0;
    }
    naf.push(z);

    // Optimization, shift by word if possible
    var shift = (k.cmpn(0) !== 0 && k.andln(ws - 1) === 0) ? (w + 1) : 1;
    for (var i = 1; i < shift; i++)
      naf.push(0);
    k.iushrn(shift);
  }

  return naf;
}
utils.getNAF = getNAF;

// Represent k1, k2 in a Joint Sparse Form
function getJSF(k1, k2) {
  var jsf = [
    [],
    []
  ];

  k1 = k1.clone();
  k2 = k2.clone();
  var d1 = 0;
  var d2 = 0;
  while (k1.cmpn(-d1) > 0 || k2.cmpn(-d2) > 0) {

    // First phase
    var m14 = (k1.andln(3) + d1) & 3;
    var m24 = (k2.andln(3) + d2) & 3;
    if (m14 === 3)
      m14 = -1;
    if (m24 === 3)
      m24 = -1;
    var u1;
    if ((m14 & 1) === 0) {
      u1 = 0;
    } else {
      var m8 = (k1.andln(7) + d1) & 7;
      if ((m8 === 3 || m8 === 5) && m24 === 2)
        u1 = -m14;
      else
        u1 = m14;
    }
    jsf[0].push(u1);

    var u2;
    if ((m24 & 1) === 0) {
      u2 = 0;
    } else {
      var m8 = (k2.andln(7) + d2) & 7;
      if ((m8 === 3 || m8 === 5) && m14 === 2)
        u2 = -m24;
      else
        u2 = m24;
    }
    jsf[1].push(u2);

    // Second phase
    if (2 * d1 === u1 + 1)
      d1 = 1 - d1;
    if (2 * d2 === u2 + 1)
      d2 = 1 - d2;
    k1.iushrn(1);
    k2.iushrn(1);
  }

  return jsf;
}
utils.getJSF = getJSF;

function cachedProperty(obj, name, computer) {
  var key = '_' + name;
  obj.prototype[name] = function cachedProperty() {
    return this[key] !== undefined ? this[key] :
           this[key] = computer.call(this);
  };
}
utils.cachedProperty = cachedProperty;

function parseBytes(bytes) {
  return typeof bytes === 'string' ? utils.toArray(bytes, 'hex') :
                                     bytes;
}
utils.parseBytes = parseBytes;

function intFromLE(bytes) {
  return new BN(bytes, 'hex', 'le');
}
utils.intFromLE = intFromLE;


},{"bn.js":2,"minimalistic-assert":34,"minimalistic-crypto-utils":35}],19:[function(require,module,exports){
module.exports={
  "name": "elliptic",
  "version": "6.4.1",
  "description": "EC cryptography",
  "main": "lib/elliptic.js",
  "files": [
    "lib"
  ],
  "scripts": {
    "jscs": "jscs benchmarks/*.js lib/*.js lib/**/*.js lib/**/**/*.js test/index.js",
    "jshint": "jscs benchmarks/*.js lib/*.js lib/**/*.js lib/**/**/*.js test/index.js",
    "lint": "npm run jscs && npm run jshint",
    "unit": "istanbul test _mocha --reporter=spec test/index.js",
    "test": "npm run lint && npm run unit",
    "version": "grunt dist && git add dist/"
  },
  "repository": {
    "type": "git",
    "url": "git@github.com:indutny/elliptic"
  },
  "keywords": [
    "EC",
    "Elliptic",
    "curve",
    "Cryptography"
  ],
  "author": "Fedor Indutny <fedor@indutny.com>",
  "license": "MIT",
  "bugs": {
    "url": "https://github.com/indutny/elliptic/issues"
  },
  "homepage": "https://github.com/indutny/elliptic",
  "devDependencies": {
    "brfs": "^1.4.3",
    "coveralls": "^2.11.3",
    "grunt": "^0.4.5",
    "grunt-browserify": "^5.0.0",
    "grunt-cli": "^1.2.0",
    "grunt-contrib-connect": "^1.0.0",
    "grunt-contrib-copy": "^1.0.0",
    "grunt-contrib-uglify": "^1.0.1",
    "grunt-mocha-istanbul": "^3.0.1",
    "grunt-saucelabs": "^8.6.2",
    "istanbul": "^0.4.2",
    "jscs": "^2.9.0",
    "jshint": "^2.6.0",
    "mocha": "^2.1.0"
  },
  "dependencies": {
    "bn.js": "^4.4.0",
    "brorand": "^1.0.1",
    "hash.js": "^1.0.0",
    "hmac-drbg": "^1.0.0",
    "inherits": "^2.0.1",
    "minimalistic-assert": "^1.0.0",
    "minimalistic-crypto-utils": "^1.0.0"
  }
}

},{}],20:[function(require,module,exports){
var hash = exports;

hash.utils = require('./hash/utils');
hash.common = require('./hash/common');
hash.sha = require('./hash/sha');
hash.ripemd = require('./hash/ripemd');
hash.hmac = require('./hash/hmac');

// Proxy hash functions to the main object
hash.sha1 = hash.sha.sha1;
hash.sha256 = hash.sha.sha256;
hash.sha224 = hash.sha.sha224;
hash.sha384 = hash.sha.sha384;
hash.sha512 = hash.sha.sha512;
hash.ripemd160 = hash.ripemd.ripemd160;

},{"./hash/common":21,"./hash/hmac":22,"./hash/ripemd":23,"./hash/sha":24,"./hash/utils":31}],21:[function(require,module,exports){
'use strict';

var utils = require('./utils');
var assert = require('minimalistic-assert');

function BlockHash() {
  this.pending = null;
  this.pendingTotal = 0;
  this.blockSize = this.constructor.blockSize;
  this.outSize = this.constructor.outSize;
  this.hmacStrength = this.constructor.hmacStrength;
  this.padLength = this.constructor.padLength / 8;
  this.endian = 'big';

  this._delta8 = this.blockSize / 8;
  this._delta32 = this.blockSize / 32;
}
exports.BlockHash = BlockHash;

BlockHash.prototype.update = function update(msg, enc) {
  // Convert message to array, pad it, and join into 32bit blocks
  msg = utils.toArray(msg, enc);
  if (!this.pending)
    this.pending = msg;
  else
    this.pending = this.pending.concat(msg);
  this.pendingTotal += msg.length;

  // Enough data, try updating
  if (this.pending.length >= this._delta8) {
    msg = this.pending;

    // Process pending data in blocks
    var r = msg.length % this._delta8;
    this.pending = msg.slice(msg.length - r, msg.length);
    if (this.pending.length === 0)
      this.pending = null;

    msg = utils.join32(msg, 0, msg.length - r, this.endian);
    for (var i = 0; i < msg.length; i += this._delta32)
      this._update(msg, i, i + this._delta32);
  }

  return this;
};

BlockHash.prototype.digest = function digest(enc) {
  this.update(this._pad());
  assert(this.pending === null);

  return this._digest(enc);
};

BlockHash.prototype._pad = function pad() {
  var len = this.pendingTotal;
  var bytes = this._delta8;
  var k = bytes - ((len + this.padLength) % bytes);
  var res = new Array(k + this.padLength);
  res[0] = 0x80;
  for (var i = 1; i < k; i++)
    res[i] = 0;

  // Append length
  len <<= 3;
  if (this.endian === 'big') {
    for (var t = 8; t < this.padLength; t++)
      res[i++] = 0;

    res[i++] = 0;
    res[i++] = 0;
    res[i++] = 0;
    res[i++] = 0;
    res[i++] = (len >>> 24) & 0xff;
    res[i++] = (len >>> 16) & 0xff;
    res[i++] = (len >>> 8) & 0xff;
    res[i++] = len & 0xff;
  } else {
    res[i++] = len & 0xff;
    res[i++] = (len >>> 8) & 0xff;
    res[i++] = (len >>> 16) & 0xff;
    res[i++] = (len >>> 24) & 0xff;
    res[i++] = 0;
    res[i++] = 0;
    res[i++] = 0;
    res[i++] = 0;

    for (t = 8; t < this.padLength; t++)
      res[i++] = 0;
  }

  return res;
};

},{"./utils":31,"minimalistic-assert":34}],22:[function(require,module,exports){
'use strict';

var utils = require('./utils');
var assert = require('minimalistic-assert');

function Hmac(hash, key, enc) {
  if (!(this instanceof Hmac))
    return new Hmac(hash, key, enc);
  this.Hash = hash;
  this.blockSize = hash.blockSize / 8;
  this.outSize = hash.outSize / 8;
  this.inner = null;
  this.outer = null;

  this._init(utils.toArray(key, enc));
}
module.exports = Hmac;

Hmac.prototype._init = function init(key) {
  // Shorten key, if needed
  if (key.length > this.blockSize)
    key = new this.Hash().update(key).digest();
  assert(key.length <= this.blockSize);

  // Add padding to key
  for (var i = key.length; i < this.blockSize; i++)
    key.push(0);

  for (i = 0; i < key.length; i++)
    key[i] ^= 0x36;
  this.inner = new this.Hash().update(key);

  // 0x36 ^ 0x5c = 0x6a
  for (i = 0; i < key.length; i++)
    key[i] ^= 0x6a;
  this.outer = new this.Hash().update(key);
};

Hmac.prototype.update = function update(msg, enc) {
  this.inner.update(msg, enc);
  return this;
};

Hmac.prototype.digest = function digest(enc) {
  this.outer.update(this.inner.digest());
  return this.outer.digest(enc);
};

},{"./utils":31,"minimalistic-assert":34}],23:[function(require,module,exports){
'use strict';

var utils = require('./utils');
var common = require('./common');

var rotl32 = utils.rotl32;
var sum32 = utils.sum32;
var sum32_3 = utils.sum32_3;
var sum32_4 = utils.sum32_4;
var BlockHash = common.BlockHash;

function RIPEMD160() {
  if (!(this instanceof RIPEMD160))
    return new RIPEMD160();

  BlockHash.call(this);

  this.h = [ 0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0 ];
  this.endian = 'little';
}
utils.inherits(RIPEMD160, BlockHash);
exports.ripemd160 = RIPEMD160;

RIPEMD160.blockSize = 512;
RIPEMD160.outSize = 160;
RIPEMD160.hmacStrength = 192;
RIPEMD160.padLength = 64;

RIPEMD160.prototype._update = function update(msg, start) {
  var A = this.h[0];
  var B = this.h[1];
  var C = this.h[2];
  var D = this.h[3];
  var E = this.h[4];
  var Ah = A;
  var Bh = B;
  var Ch = C;
  var Dh = D;
  var Eh = E;
  for (var j = 0; j < 80; j++) {
    var T = sum32(
      rotl32(
        sum32_4(A, f(j, B, C, D), msg[r[j] + start], K(j)),
        s[j]),
      E);
    A = E;
    E = D;
    D = rotl32(C, 10);
    C = B;
    B = T;
    T = sum32(
      rotl32(
        sum32_4(Ah, f(79 - j, Bh, Ch, Dh), msg[rh[j] + start], Kh(j)),
        sh[j]),
      Eh);
    Ah = Eh;
    Eh = Dh;
    Dh = rotl32(Ch, 10);
    Ch = Bh;
    Bh = T;
  }
  T = sum32_3(this.h[1], C, Dh);
  this.h[1] = sum32_3(this.h[2], D, Eh);
  this.h[2] = sum32_3(this.h[3], E, Ah);
  this.h[3] = sum32_3(this.h[4], A, Bh);
  this.h[4] = sum32_3(this.h[0], B, Ch);
  this.h[0] = T;
};

RIPEMD160.prototype._digest = function digest(enc) {
  if (enc === 'hex')
    return utils.toHex32(this.h, 'little');
  else
    return utils.split32(this.h, 'little');
};

function f(j, x, y, z) {
  if (j <= 15)
    return x ^ y ^ z;
  else if (j <= 31)
    return (x & y) | ((~x) & z);
  else if (j <= 47)
    return (x | (~y)) ^ z;
  else if (j <= 63)
    return (x & z) | (y & (~z));
  else
    return x ^ (y | (~z));
}

function K(j) {
  if (j <= 15)
    return 0x00000000;
  else if (j <= 31)
    return 0x5a827999;
  else if (j <= 47)
    return 0x6ed9eba1;
  else if (j <= 63)
    return 0x8f1bbcdc;
  else
    return 0xa953fd4e;
}

function Kh(j) {
  if (j <= 15)
    return 0x50a28be6;
  else if (j <= 31)
    return 0x5c4dd124;
  else if (j <= 47)
    return 0x6d703ef3;
  else if (j <= 63)
    return 0x7a6d76e9;
  else
    return 0x00000000;
}

var r = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
  3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
  1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
  4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13
];

var rh = [
  5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
  6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
  15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
  8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
  12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11
];

var s = [
  11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
  7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
  11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
  11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
  9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6
];

var sh = [
  8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
  9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
  9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
  15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
  8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11
];

},{"./common":21,"./utils":31}],24:[function(require,module,exports){
'use strict';

exports.sha1 = require('./sha/1');
exports.sha224 = require('./sha/224');
exports.sha256 = require('./sha/256');
exports.sha384 = require('./sha/384');
exports.sha512 = require('./sha/512');

},{"./sha/1":25,"./sha/224":26,"./sha/256":27,"./sha/384":28,"./sha/512":29}],25:[function(require,module,exports){
'use strict';

var utils = require('../utils');
var common = require('../common');
var shaCommon = require('./common');

var rotl32 = utils.rotl32;
var sum32 = utils.sum32;
var sum32_5 = utils.sum32_5;
var ft_1 = shaCommon.ft_1;
var BlockHash = common.BlockHash;

var sha1_K = [
  0x5A827999, 0x6ED9EBA1,
  0x8F1BBCDC, 0xCA62C1D6
];

function SHA1() {
  if (!(this instanceof SHA1))
    return new SHA1();

  BlockHash.call(this);
  this.h = [
    0x67452301, 0xefcdab89, 0x98badcfe,
    0x10325476, 0xc3d2e1f0 ];
  this.W = new Array(80);
}

utils.inherits(SHA1, BlockHash);
module.exports = SHA1;

SHA1.blockSize = 512;
SHA1.outSize = 160;
SHA1.hmacStrength = 80;
SHA1.padLength = 64;

SHA1.prototype._update = function _update(msg, start) {
  var W = this.W;

  for (var i = 0; i < 16; i++)
    W[i] = msg[start + i];

  for(; i < W.length; i++)
    W[i] = rotl32(W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16], 1);

  var a = this.h[0];
  var b = this.h[1];
  var c = this.h[2];
  var d = this.h[3];
  var e = this.h[4];

  for (i = 0; i < W.length; i++) {
    var s = ~~(i / 20);
    var t = sum32_5(rotl32(a, 5), ft_1(s, b, c, d), e, W[i], sha1_K[s]);
    e = d;
    d = c;
    c = rotl32(b, 30);
    b = a;
    a = t;
  }

  this.h[0] = sum32(this.h[0], a);
  this.h[1] = sum32(this.h[1], b);
  this.h[2] = sum32(this.h[2], c);
  this.h[3] = sum32(this.h[3], d);
  this.h[4] = sum32(this.h[4], e);
};

SHA1.prototype._digest = function digest(enc) {
  if (enc === 'hex')
    return utils.toHex32(this.h, 'big');
  else
    return utils.split32(this.h, 'big');
};

},{"../common":21,"../utils":31,"./common":30}],26:[function(require,module,exports){
'use strict';

var utils = require('../utils');
var SHA256 = require('./256');

function SHA224() {
  if (!(this instanceof SHA224))
    return new SHA224();

  SHA256.call(this);
  this.h = [
    0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939,
    0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4 ];
}
utils.inherits(SHA224, SHA256);
module.exports = SHA224;

SHA224.blockSize = 512;
SHA224.outSize = 224;
SHA224.hmacStrength = 192;
SHA224.padLength = 64;

SHA224.prototype._digest = function digest(enc) {
  // Just truncate output
  if (enc === 'hex')
    return utils.toHex32(this.h.slice(0, 7), 'big');
  else
    return utils.split32(this.h.slice(0, 7), 'big');
};


},{"../utils":31,"./256":27}],27:[function(require,module,exports){
'use strict';

var utils = require('../utils');
var common = require('../common');
var shaCommon = require('./common');
var assert = require('minimalistic-assert');

var sum32 = utils.sum32;
var sum32_4 = utils.sum32_4;
var sum32_5 = utils.sum32_5;
var ch32 = shaCommon.ch32;
var maj32 = shaCommon.maj32;
var s0_256 = shaCommon.s0_256;
var s1_256 = shaCommon.s1_256;
var g0_256 = shaCommon.g0_256;
var g1_256 = shaCommon.g1_256;

var BlockHash = common.BlockHash;

var sha256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function SHA256() {
  if (!(this instanceof SHA256))
    return new SHA256();

  BlockHash.call(this);
  this.h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  this.k = sha256_K;
  this.W = new Array(64);
}
utils.inherits(SHA256, BlockHash);
module.exports = SHA256;

SHA256.blockSize = 512;
SHA256.outSize = 256;
SHA256.hmacStrength = 192;
SHA256.padLength = 64;

SHA256.prototype._update = function _update(msg, start) {
  var W = this.W;

  for (var i = 0; i < 16; i++)
    W[i] = msg[start + i];
  for (; i < W.length; i++)
    W[i] = sum32_4(g1_256(W[i - 2]), W[i - 7], g0_256(W[i - 15]), W[i - 16]);

  var a = this.h[0];
  var b = this.h[1];
  var c = this.h[2];
  var d = this.h[3];
  var e = this.h[4];
  var f = this.h[5];
  var g = this.h[6];
  var h = this.h[7];

  assert(this.k.length === W.length);
  for (i = 0; i < W.length; i++) {
    var T1 = sum32_5(h, s1_256(e), ch32(e, f, g), this.k[i], W[i]);
    var T2 = sum32(s0_256(a), maj32(a, b, c));
    h = g;
    g = f;
    f = e;
    e = sum32(d, T1);
    d = c;
    c = b;
    b = a;
    a = sum32(T1, T2);
  }

  this.h[0] = sum32(this.h[0], a);
  this.h[1] = sum32(this.h[1], b);
  this.h[2] = sum32(this.h[2], c);
  this.h[3] = sum32(this.h[3], d);
  this.h[4] = sum32(this.h[4], e);
  this.h[5] = sum32(this.h[5], f);
  this.h[6] = sum32(this.h[6], g);
  this.h[7] = sum32(this.h[7], h);
};

SHA256.prototype._digest = function digest(enc) {
  if (enc === 'hex')
    return utils.toHex32(this.h, 'big');
  else
    return utils.split32(this.h, 'big');
};

},{"../common":21,"../utils":31,"./common":30,"minimalistic-assert":34}],28:[function(require,module,exports){
'use strict';

var utils = require('../utils');

var SHA512 = require('./512');

function SHA384() {
  if (!(this instanceof SHA384))
    return new SHA384();

  SHA512.call(this);
  this.h = [
    0xcbbb9d5d, 0xc1059ed8,
    0x629a292a, 0x367cd507,
    0x9159015a, 0x3070dd17,
    0x152fecd8, 0xf70e5939,
    0x67332667, 0xffc00b31,
    0x8eb44a87, 0x68581511,
    0xdb0c2e0d, 0x64f98fa7,
    0x47b5481d, 0xbefa4fa4 ];
}
utils.inherits(SHA384, SHA512);
module.exports = SHA384;

SHA384.blockSize = 1024;
SHA384.outSize = 384;
SHA384.hmacStrength = 192;
SHA384.padLength = 128;

SHA384.prototype._digest = function digest(enc) {
  if (enc === 'hex')
    return utils.toHex32(this.h.slice(0, 12), 'big');
  else
    return utils.split32(this.h.slice(0, 12), 'big');
};

},{"../utils":31,"./512":29}],29:[function(require,module,exports){
'use strict';

var utils = require('../utils');
var common = require('../common');
var assert = require('minimalistic-assert');

var rotr64_hi = utils.rotr64_hi;
var rotr64_lo = utils.rotr64_lo;
var shr64_hi = utils.shr64_hi;
var shr64_lo = utils.shr64_lo;
var sum64 = utils.sum64;
var sum64_hi = utils.sum64_hi;
var sum64_lo = utils.sum64_lo;
var sum64_4_hi = utils.sum64_4_hi;
var sum64_4_lo = utils.sum64_4_lo;
var sum64_5_hi = utils.sum64_5_hi;
var sum64_5_lo = utils.sum64_5_lo;

var BlockHash = common.BlockHash;

var sha512_K = [
  0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd,
  0xb5c0fbcf, 0xec4d3b2f, 0xe9b5dba5, 0x8189dbbc,
  0x3956c25b, 0xf348b538, 0x59f111f1, 0xb605d019,
  0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118,
  0xd807aa98, 0xa3030242, 0x12835b01, 0x45706fbe,
  0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2,
  0x72be5d74, 0xf27b896f, 0x80deb1fe, 0x3b1696b1,
  0x9bdc06a7, 0x25c71235, 0xc19bf174, 0xcf692694,
  0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3,
  0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65,
  0x2de92c6f, 0x592b0275, 0x4a7484aa, 0x6ea6e483,
  0x5cb0a9dc, 0xbd41fbd4, 0x76f988da, 0x831153b5,
  0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210,
  0xb00327c8, 0x98fb213f, 0xbf597fc7, 0xbeef0ee4,
  0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725,
  0x06ca6351, 0xe003826f, 0x14292967, 0x0a0e6e70,
  0x27b70a85, 0x46d22ffc, 0x2e1b2138, 0x5c26c926,
  0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df,
  0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8,
  0x81c2c92e, 0x47edaee6, 0x92722c85, 0x1482353b,
  0xa2bfe8a1, 0x4cf10364, 0xa81a664b, 0xbc423001,
  0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30,
  0xd192e819, 0xd6ef5218, 0xd6990624, 0x5565a910,
  0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8,
  0x19a4c116, 0xb8d2d0c8, 0x1e376c08, 0x5141ab53,
  0x2748774c, 0xdf8eeb99, 0x34b0bcb5, 0xe19b48a8,
  0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb,
  0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3,
  0x748f82ee, 0x5defb2fc, 0x78a5636f, 0x43172f60,
  0x84c87814, 0xa1f0ab72, 0x8cc70208, 0x1a6439ec,
  0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9,
  0xbef9a3f7, 0xb2c67915, 0xc67178f2, 0xe372532b,
  0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207,
  0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f, 0xee6ed178,
  0x06f067aa, 0x72176fba, 0x0a637dc5, 0xa2c898a6,
  0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b,
  0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493,
  0x3c9ebe0a, 0x15c9bebc, 0x431d67c4, 0x9c100d4c,
  0x4cc5d4be, 0xcb3e42b6, 0x597f299c, 0xfc657e2a,
  0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817
];

function SHA512() {
  if (!(this instanceof SHA512))
    return new SHA512();

  BlockHash.call(this);
  this.h = [
    0x6a09e667, 0xf3bcc908,
    0xbb67ae85, 0x84caa73b,
    0x3c6ef372, 0xfe94f82b,
    0xa54ff53a, 0x5f1d36f1,
    0x510e527f, 0xade682d1,
    0x9b05688c, 0x2b3e6c1f,
    0x1f83d9ab, 0xfb41bd6b,
    0x5be0cd19, 0x137e2179 ];
  this.k = sha512_K;
  this.W = new Array(160);
}
utils.inherits(SHA512, BlockHash);
module.exports = SHA512;

SHA512.blockSize = 1024;
SHA512.outSize = 512;
SHA512.hmacStrength = 192;
SHA512.padLength = 128;

SHA512.prototype._prepareBlock = function _prepareBlock(msg, start) {
  var W = this.W;

  // 32 x 32bit words
  for (var i = 0; i < 32; i++)
    W[i] = msg[start + i];
  for (; i < W.length; i += 2) {
    var c0_hi = g1_512_hi(W[i - 4], W[i - 3]);  // i - 2
    var c0_lo = g1_512_lo(W[i - 4], W[i - 3]);
    var c1_hi = W[i - 14];  // i - 7
    var c1_lo = W[i - 13];
    var c2_hi = g0_512_hi(W[i - 30], W[i - 29]);  // i - 15
    var c2_lo = g0_512_lo(W[i - 30], W[i - 29]);
    var c3_hi = W[i - 32];  // i - 16
    var c3_lo = W[i - 31];

    W[i] = sum64_4_hi(
      c0_hi, c0_lo,
      c1_hi, c1_lo,
      c2_hi, c2_lo,
      c3_hi, c3_lo);
    W[i + 1] = sum64_4_lo(
      c0_hi, c0_lo,
      c1_hi, c1_lo,
      c2_hi, c2_lo,
      c3_hi, c3_lo);
  }
};

SHA512.prototype._update = function _update(msg, start) {
  this._prepareBlock(msg, start);

  var W = this.W;

  var ah = this.h[0];
  var al = this.h[1];
  var bh = this.h[2];
  var bl = this.h[3];
  var ch = this.h[4];
  var cl = this.h[5];
  var dh = this.h[6];
  var dl = this.h[7];
  var eh = this.h[8];
  var el = this.h[9];
  var fh = this.h[10];
  var fl = this.h[11];
  var gh = this.h[12];
  var gl = this.h[13];
  var hh = this.h[14];
  var hl = this.h[15];

  assert(this.k.length === W.length);
  for (var i = 0; i < W.length; i += 2) {
    var c0_hi = hh;
    var c0_lo = hl;
    var c1_hi = s1_512_hi(eh, el);
    var c1_lo = s1_512_lo(eh, el);
    var c2_hi = ch64_hi(eh, el, fh, fl, gh, gl);
    var c2_lo = ch64_lo(eh, el, fh, fl, gh, gl);
    var c3_hi = this.k[i];
    var c3_lo = this.k[i + 1];
    var c4_hi = W[i];
    var c4_lo = W[i + 1];

    var T1_hi = sum64_5_hi(
      c0_hi, c0_lo,
      c1_hi, c1_lo,
      c2_hi, c2_lo,
      c3_hi, c3_lo,
      c4_hi, c4_lo);
    var T1_lo = sum64_5_lo(
      c0_hi, c0_lo,
      c1_hi, c1_lo,
      c2_hi, c2_lo,
      c3_hi, c3_lo,
      c4_hi, c4_lo);

    c0_hi = s0_512_hi(ah, al);
    c0_lo = s0_512_lo(ah, al);
    c1_hi = maj64_hi(ah, al, bh, bl, ch, cl);
    c1_lo = maj64_lo(ah, al, bh, bl, ch, cl);

    var T2_hi = sum64_hi(c0_hi, c0_lo, c1_hi, c1_lo);
    var T2_lo = sum64_lo(c0_hi, c0_lo, c1_hi, c1_lo);

    hh = gh;
    hl = gl;

    gh = fh;
    gl = fl;

    fh = eh;
    fl = el;

    eh = sum64_hi(dh, dl, T1_hi, T1_lo);
    el = sum64_lo(dl, dl, T1_hi, T1_lo);

    dh = ch;
    dl = cl;

    ch = bh;
    cl = bl;

    bh = ah;
    bl = al;

    ah = sum64_hi(T1_hi, T1_lo, T2_hi, T2_lo);
    al = sum64_lo(T1_hi, T1_lo, T2_hi, T2_lo);
  }

  sum64(this.h, 0, ah, al);
  sum64(this.h, 2, bh, bl);
  sum64(this.h, 4, ch, cl);
  sum64(this.h, 6, dh, dl);
  sum64(this.h, 8, eh, el);
  sum64(this.h, 10, fh, fl);
  sum64(this.h, 12, gh, gl);
  sum64(this.h, 14, hh, hl);
};

SHA512.prototype._digest = function digest(enc) {
  if (enc === 'hex')
    return utils.toHex32(this.h, 'big');
  else
    return utils.split32(this.h, 'big');
};

function ch64_hi(xh, xl, yh, yl, zh) {
  var r = (xh & yh) ^ ((~xh) & zh);
  if (r < 0)
    r += 0x100000000;
  return r;
}

function ch64_lo(xh, xl, yh, yl, zh, zl) {
  var r = (xl & yl) ^ ((~xl) & zl);
  if (r < 0)
    r += 0x100000000;
  return r;
}

function maj64_hi(xh, xl, yh, yl, zh) {
  var r = (xh & yh) ^ (xh & zh) ^ (yh & zh);
  if (r < 0)
    r += 0x100000000;
  return r;
}

function maj64_lo(xh, xl, yh, yl, zh, zl) {
  var r = (xl & yl) ^ (xl & zl) ^ (yl & zl);
  if (r < 0)
    r += 0x100000000;
  return r;
}

function s0_512_hi(xh, xl) {
  var c0_hi = rotr64_hi(xh, xl, 28);
  var c1_hi = rotr64_hi(xl, xh, 2);  // 34
  var c2_hi = rotr64_hi(xl, xh, 7);  // 39

  var r = c0_hi ^ c1_hi ^ c2_hi;
  if (r < 0)
    r += 0x100000000;
  return r;
}

function s0_512_lo(xh, xl) {
  var c0_lo = rotr64_lo(xh, xl, 28);
  var c1_lo = rotr64_lo(xl, xh, 2);  // 34
  var c2_lo = rotr64_lo(xl, xh, 7);  // 39

  var r = c0_lo ^ c1_lo ^ c2_lo;
  if (r < 0)
    r += 0x100000000;
  return r;
}

function s1_512_hi(xh, xl) {
  var c0_hi = rotr64_hi(xh, xl, 14);
  var c1_hi = rotr64_hi(xh, xl, 18);
  var c2_hi = rotr64_hi(xl, xh, 9);  // 41

  var r = c0_hi ^ c1_hi ^ c2_hi;
  if (r < 0)
    r += 0x100000000;
  return r;
}

function s1_512_lo(xh, xl) {
  var c0_lo = rotr64_lo(xh, xl, 14);
  var c1_lo = rotr64_lo(xh, xl, 18);
  var c2_lo = rotr64_lo(xl, xh, 9);  // 41

  var r = c0_lo ^ c1_lo ^ c2_lo;
  if (r < 0)
    r += 0x100000000;
  return r;
}

function g0_512_hi(xh, xl) {
  var c0_hi = rotr64_hi(xh, xl, 1);
  var c1_hi = rotr64_hi(xh, xl, 8);
  var c2_hi = shr64_hi(xh, xl, 7);

  var r = c0_hi ^ c1_hi ^ c2_hi;
  if (r < 0)
    r += 0x100000000;
  return r;
}

function g0_512_lo(xh, xl) {
  var c0_lo = rotr64_lo(xh, xl, 1);
  var c1_lo = rotr64_lo(xh, xl, 8);
  var c2_lo = shr64_lo(xh, xl, 7);

  var r = c0_lo ^ c1_lo ^ c2_lo;
  if (r < 0)
    r += 0x100000000;
  return r;
}

function g1_512_hi(xh, xl) {
  var c0_hi = rotr64_hi(xh, xl, 19);
  var c1_hi = rotr64_hi(xl, xh, 29);  // 61
  var c2_hi = shr64_hi(xh, xl, 6);

  var r = c0_hi ^ c1_hi ^ c2_hi;
  if (r < 0)
    r += 0x100000000;
  return r;
}

function g1_512_lo(xh, xl) {
  var c0_lo = rotr64_lo(xh, xl, 19);
  var c1_lo = rotr64_lo(xl, xh, 29);  // 61
  var c2_lo = shr64_lo(xh, xl, 6);

  var r = c0_lo ^ c1_lo ^ c2_lo;
  if (r < 0)
    r += 0x100000000;
  return r;
}

},{"../common":21,"../utils":31,"minimalistic-assert":34}],30:[function(require,module,exports){
'use strict';

var utils = require('../utils');
var rotr32 = utils.rotr32;

function ft_1(s, x, y, z) {
  if (s === 0)
    return ch32(x, y, z);
  if (s === 1 || s === 3)
    return p32(x, y, z);
  if (s === 2)
    return maj32(x, y, z);
}
exports.ft_1 = ft_1;

function ch32(x, y, z) {
  return (x & y) ^ ((~x) & z);
}
exports.ch32 = ch32;

function maj32(x, y, z) {
  return (x & y) ^ (x & z) ^ (y & z);
}
exports.maj32 = maj32;

function p32(x, y, z) {
  return x ^ y ^ z;
}
exports.p32 = p32;

function s0_256(x) {
  return rotr32(x, 2) ^ rotr32(x, 13) ^ rotr32(x, 22);
}
exports.s0_256 = s0_256;

function s1_256(x) {
  return rotr32(x, 6) ^ rotr32(x, 11) ^ rotr32(x, 25);
}
exports.s1_256 = s1_256;

function g0_256(x) {
  return rotr32(x, 7) ^ rotr32(x, 18) ^ (x >>> 3);
}
exports.g0_256 = g0_256;

function g1_256(x) {
  return rotr32(x, 17) ^ rotr32(x, 19) ^ (x >>> 10);
}
exports.g1_256 = g1_256;

},{"../utils":31}],31:[function(require,module,exports){
'use strict';

var assert = require('minimalistic-assert');
var inherits = require('inherits');

exports.inherits = inherits;

function isSurrogatePair(msg, i) {
  if ((msg.charCodeAt(i) & 0xFC00) !== 0xD800) {
    return false;
  }
  if (i < 0 || i + 1 >= msg.length) {
    return false;
  }
  return (msg.charCodeAt(i + 1) & 0xFC00) === 0xDC00;
}

function toArray(msg, enc) {
  if (Array.isArray(msg))
    return msg.slice();
  if (!msg)
    return [];
  var res = [];
  if (typeof msg === 'string') {
    if (!enc) {
      // Inspired by stringToUtf8ByteArray() in closure-library by Google
      // https://github.com/google/closure-library/blob/8598d87242af59aac233270742c8984e2b2bdbe0/closure/goog/crypt/crypt.js#L117-L143
      // Apache License 2.0
      // https://github.com/google/closure-library/blob/master/LICENSE
      var p = 0;
      for (var i = 0; i < msg.length; i++) {
        var c = msg.charCodeAt(i);
        if (c < 128) {
          res[p++] = c;
        } else if (c < 2048) {
          res[p++] = (c >> 6) | 192;
          res[p++] = (c & 63) | 128;
        } else if (isSurrogatePair(msg, i)) {
          c = 0x10000 + ((c & 0x03FF) << 10) + (msg.charCodeAt(++i) & 0x03FF);
          res[p++] = (c >> 18) | 240;
          res[p++] = ((c >> 12) & 63) | 128;
          res[p++] = ((c >> 6) & 63) | 128;
          res[p++] = (c & 63) | 128;
        } else {
          res[p++] = (c >> 12) | 224;
          res[p++] = ((c >> 6) & 63) | 128;
          res[p++] = (c & 63) | 128;
        }
      }
    } else if (enc === 'hex') {
      msg = msg.replace(/[^a-z0-9]+/ig, '');
      if (msg.length % 2 !== 0)
        msg = '0' + msg;
      for (i = 0; i < msg.length; i += 2)
        res.push(parseInt(msg[i] + msg[i + 1], 16));
    }
  } else {
    for (i = 0; i < msg.length; i++)
      res[i] = msg[i] | 0;
  }
  return res;
}
exports.toArray = toArray;

function toHex(msg) {
  var res = '';
  for (var i = 0; i < msg.length; i++)
    res += zero2(msg[i].toString(16));
  return res;
}
exports.toHex = toHex;

function htonl(w) {
  var res = (w >>> 24) |
            ((w >>> 8) & 0xff00) |
            ((w << 8) & 0xff0000) |
            ((w & 0xff) << 24);
  return res >>> 0;
}
exports.htonl = htonl;

function toHex32(msg, endian) {
  var res = '';
  for (var i = 0; i < msg.length; i++) {
    var w = msg[i];
    if (endian === 'little')
      w = htonl(w);
    res += zero8(w.toString(16));
  }
  return res;
}
exports.toHex32 = toHex32;

function zero2(word) {
  if (word.length === 1)
    return '0' + word;
  else
    return word;
}
exports.zero2 = zero2;

function zero8(word) {
  if (word.length === 7)
    return '0' + word;
  else if (word.length === 6)
    return '00' + word;
  else if (word.length === 5)
    return '000' + word;
  else if (word.length === 4)
    return '0000' + word;
  else if (word.length === 3)
    return '00000' + word;
  else if (word.length === 2)
    return '000000' + word;
  else if (word.length === 1)
    return '0000000' + word;
  else
    return word;
}
exports.zero8 = zero8;

function join32(msg, start, end, endian) {
  var len = end - start;
  assert(len % 4 === 0);
  var res = new Array(len / 4);
  for (var i = 0, k = start; i < res.length; i++, k += 4) {
    var w;
    if (endian === 'big')
      w = (msg[k] << 24) | (msg[k + 1] << 16) | (msg[k + 2] << 8) | msg[k + 3];
    else
      w = (msg[k + 3] << 24) | (msg[k + 2] << 16) | (msg[k + 1] << 8) | msg[k];
    res[i] = w >>> 0;
  }
  return res;
}
exports.join32 = join32;

function split32(msg, endian) {
  var res = new Array(msg.length * 4);
  for (var i = 0, k = 0; i < msg.length; i++, k += 4) {
    var m = msg[i];
    if (endian === 'big') {
      res[k] = m >>> 24;
      res[k + 1] = (m >>> 16) & 0xff;
      res[k + 2] = (m >>> 8) & 0xff;
      res[k + 3] = m & 0xff;
    } else {
      res[k + 3] = m >>> 24;
      res[k + 2] = (m >>> 16) & 0xff;
      res[k + 1] = (m >>> 8) & 0xff;
      res[k] = m & 0xff;
    }
  }
  return res;
}
exports.split32 = split32;

function rotr32(w, b) {
  return (w >>> b) | (w << (32 - b));
}
exports.rotr32 = rotr32;

function rotl32(w, b) {
  return (w << b) | (w >>> (32 - b));
}
exports.rotl32 = rotl32;

function sum32(a, b) {
  return (a + b) >>> 0;
}
exports.sum32 = sum32;

function sum32_3(a, b, c) {
  return (a + b + c) >>> 0;
}
exports.sum32_3 = sum32_3;

function sum32_4(a, b, c, d) {
  return (a + b + c + d) >>> 0;
}
exports.sum32_4 = sum32_4;

function sum32_5(a, b, c, d, e) {
  return (a + b + c + d + e) >>> 0;
}
exports.sum32_5 = sum32_5;

function sum64(buf, pos, ah, al) {
  var bh = buf[pos];
  var bl = buf[pos + 1];

  var lo = (al + bl) >>> 0;
  var hi = (lo < al ? 1 : 0) + ah + bh;
  buf[pos] = hi >>> 0;
  buf[pos + 1] = lo;
}
exports.sum64 = sum64;

function sum64_hi(ah, al, bh, bl) {
  var lo = (al + bl) >>> 0;
  var hi = (lo < al ? 1 : 0) + ah + bh;
  return hi >>> 0;
}
exports.sum64_hi = sum64_hi;

function sum64_lo(ah, al, bh, bl) {
  var lo = al + bl;
  return lo >>> 0;
}
exports.sum64_lo = sum64_lo;

function sum64_4_hi(ah, al, bh, bl, ch, cl, dh, dl) {
  var carry = 0;
  var lo = al;
  lo = (lo + bl) >>> 0;
  carry += lo < al ? 1 : 0;
  lo = (lo + cl) >>> 0;
  carry += lo < cl ? 1 : 0;
  lo = (lo + dl) >>> 0;
  carry += lo < dl ? 1 : 0;

  var hi = ah + bh + ch + dh + carry;
  return hi >>> 0;
}
exports.sum64_4_hi = sum64_4_hi;

function sum64_4_lo(ah, al, bh, bl, ch, cl, dh, dl) {
  var lo = al + bl + cl + dl;
  return lo >>> 0;
}
exports.sum64_4_lo = sum64_4_lo;

function sum64_5_hi(ah, al, bh, bl, ch, cl, dh, dl, eh, el) {
  var carry = 0;
  var lo = al;
  lo = (lo + bl) >>> 0;
  carry += lo < al ? 1 : 0;
  lo = (lo + cl) >>> 0;
  carry += lo < cl ? 1 : 0;
  lo = (lo + dl) >>> 0;
  carry += lo < dl ? 1 : 0;
  lo = (lo + el) >>> 0;
  carry += lo < el ? 1 : 0;

  var hi = ah + bh + ch + dh + eh + carry;
  return hi >>> 0;
}
exports.sum64_5_hi = sum64_5_hi;

function sum64_5_lo(ah, al, bh, bl, ch, cl, dh, dl, eh, el) {
  var lo = al + bl + cl + dl + el;

  return lo >>> 0;
}
exports.sum64_5_lo = sum64_5_lo;

function rotr64_hi(ah, al, num) {
  var r = (al << (32 - num)) | (ah >>> num);
  return r >>> 0;
}
exports.rotr64_hi = rotr64_hi;

function rotr64_lo(ah, al, num) {
  var r = (ah << (32 - num)) | (al >>> num);
  return r >>> 0;
}
exports.rotr64_lo = rotr64_lo;

function shr64_hi(ah, al, num) {
  return ah >>> num;
}
exports.shr64_hi = shr64_hi;

function shr64_lo(ah, al, num) {
  var r = (ah << (32 - num)) | (al >>> num);
  return r >>> 0;
}
exports.shr64_lo = shr64_lo;

},{"inherits":33,"minimalistic-assert":34}],32:[function(require,module,exports){
'use strict';

var hash = require('hash.js');
var utils = require('minimalistic-crypto-utils');
var assert = require('minimalistic-assert');

function HmacDRBG(options) {
  if (!(this instanceof HmacDRBG))
    return new HmacDRBG(options);
  this.hash = options.hash;
  this.predResist = !!options.predResist;

  this.outLen = this.hash.outSize;
  this.minEntropy = options.minEntropy || this.hash.hmacStrength;

  this._reseed = null;
  this.reseedInterval = null;
  this.K = null;
  this.V = null;

  var entropy = utils.toArray(options.entropy, options.entropyEnc || 'hex');
  var nonce = utils.toArray(options.nonce, options.nonceEnc || 'hex');
  var pers = utils.toArray(options.pers, options.persEnc || 'hex');
  assert(entropy.length >= (this.minEntropy / 8),
         'Not enough entropy. Minimum is: ' + this.minEntropy + ' bits');
  this._init(entropy, nonce, pers);
}
module.exports = HmacDRBG;

HmacDRBG.prototype._init = function init(entropy, nonce, pers) {
  var seed = entropy.concat(nonce).concat(pers);

  this.K = new Array(this.outLen / 8);
  this.V = new Array(this.outLen / 8);
  for (var i = 0; i < this.V.length; i++) {
    this.K[i] = 0x00;
    this.V[i] = 0x01;
  }

  this._update(seed);
  this._reseed = 1;
  this.reseedInterval = 0x1000000000000;  // 2^48
};

HmacDRBG.prototype._hmac = function hmac() {
  return new hash.hmac(this.hash, this.K);
};

HmacDRBG.prototype._update = function update(seed) {
  var kmac = this._hmac()
                 .update(this.V)
                 .update([ 0x00 ]);
  if (seed)
    kmac = kmac.update(seed);
  this.K = kmac.digest();
  this.V = this._hmac().update(this.V).digest();
  if (!seed)
    return;

  this.K = this._hmac()
               .update(this.V)
               .update([ 0x01 ])
               .update(seed)
               .digest();
  this.V = this._hmac().update(this.V).digest();
};

HmacDRBG.prototype.reseed = function reseed(entropy, entropyEnc, add, addEnc) {
  // Optional entropy enc
  if (typeof entropyEnc !== 'string') {
    addEnc = add;
    add = entropyEnc;
    entropyEnc = null;
  }

  entropy = utils.toArray(entropy, entropyEnc);
  add = utils.toArray(add, addEnc);

  assert(entropy.length >= (this.minEntropy / 8),
         'Not enough entropy. Minimum is: ' + this.minEntropy + ' bits');

  this._update(entropy.concat(add || []));
  this._reseed = 1;
};

HmacDRBG.prototype.generate = function generate(len, enc, add, addEnc) {
  if (this._reseed > this.reseedInterval)
    throw new Error('Reseed is required');

  // Optional encoding
  if (typeof enc !== 'string') {
    addEnc = add;
    add = enc;
    enc = null;
  }

  // Optional additional data
  if (add) {
    add = utils.toArray(add, addEnc || 'hex');
    this._update(add);
  }

  var temp = [];
  while (temp.length < len) {
    this.V = this._hmac().update(this.V).digest();
    temp = temp.concat(this.V);
  }

  var res = temp.slice(0, len);
  this._update(add);
  this._reseed++;
  return utils.encode(res, enc);
};

},{"hash.js":20,"minimalistic-assert":34,"minimalistic-crypto-utils":35}],33:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],34:[function(require,module,exports){
module.exports = assert;

function assert(val, msg) {
  if (!val)
    throw new Error(msg || 'Assertion failed');
}

assert.equal = function assertEqual(l, r, msg) {
  if (l != r)
    throw new Error(msg || ('Assertion failed: ' + l + ' != ' + r));
};

},{}],35:[function(require,module,exports){
'use strict';

var utils = exports;

function toArray(msg, enc) {
  if (Array.isArray(msg))
    return msg.slice();
  if (!msg)
    return [];
  var res = [];
  if (typeof msg !== 'string') {
    for (var i = 0; i < msg.length; i++)
      res[i] = msg[i] | 0;
    return res;
  }
  if (enc === 'hex') {
    msg = msg.replace(/[^a-z0-9]+/ig, '');
    if (msg.length % 2 !== 0)
      msg = '0' + msg;
    for (var i = 0; i < msg.length; i += 2)
      res.push(parseInt(msg[i] + msg[i + 1], 16));
  } else {
    for (var i = 0; i < msg.length; i++) {
      var c = msg.charCodeAt(i);
      var hi = c >> 8;
      var lo = c & 0xff;
      if (hi)
        res.push(hi, lo);
      else
        res.push(lo);
    }
  }
  return res;
}
utils.toArray = toArray;

function zero2(word) {
  if (word.length === 1)
    return '0' + word;
  else
    return word;
}
utils.zero2 = zero2;

function toHex(msg) {
  var res = '';
  for (var i = 0; i < msg.length; i++)
    res += zero2(msg[i].toString(16));
  return res;
}
utils.toHex = toHex;

utils.encode = function encode(arr, enc) {
  if (enc === 'hex')
    return toHex(arr);
  else
    return arr;
};

},{}]},{},[4])(4)
});

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy5ucG0tcGFja2FnZXMvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIuLi8uLi8uLi8ubnBtLXBhY2thZ2VzL2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1yZXNvbHZlL2VtcHR5LmpzIiwiLi4vbm9kZV9tb2R1bGVzL2JuLmpzL2xpYi9ibi5qcyIsIi4uL25vZGVfbW9kdWxlcy9icm9yYW5kL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL2VsbGlwdGljL2xpYi9lbGxpcHRpYy5qcyIsIi4uL25vZGVfbW9kdWxlcy9lbGxpcHRpYy9saWIvZWxsaXB0aWMvY3VydmUvYmFzZS5qcyIsIi4uL25vZGVfbW9kdWxlcy9lbGxpcHRpYy9saWIvZWxsaXB0aWMvY3VydmUvZWR3YXJkcy5qcyIsIi4uL25vZGVfbW9kdWxlcy9lbGxpcHRpYy9saWIvZWxsaXB0aWMvY3VydmUvaW5kZXguanMiLCIuLi9ub2RlX21vZHVsZXMvZWxsaXB0aWMvbGliL2VsbGlwdGljL2N1cnZlL21vbnQuanMiLCIuLi9ub2RlX21vZHVsZXMvZWxsaXB0aWMvbGliL2VsbGlwdGljL2N1cnZlL3Nob3J0LmpzIiwiLi4vbm9kZV9tb2R1bGVzL2VsbGlwdGljL2xpYi9lbGxpcHRpYy9jdXJ2ZXMuanMiLCIuLi9ub2RlX21vZHVsZXMvZWxsaXB0aWMvbGliL2VsbGlwdGljL2VjL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL2VsbGlwdGljL2xpYi9lbGxpcHRpYy9lYy9rZXkuanMiLCIuLi9ub2RlX21vZHVsZXMvZWxsaXB0aWMvbGliL2VsbGlwdGljL2VjL3NpZ25hdHVyZS5qcyIsIi4uL25vZGVfbW9kdWxlcy9lbGxpcHRpYy9saWIvZWxsaXB0aWMvZWRkc2EvaW5kZXguanMiLCIuLi9ub2RlX21vZHVsZXMvZWxsaXB0aWMvbGliL2VsbGlwdGljL2VkZHNhL2tleS5qcyIsIi4uL25vZGVfbW9kdWxlcy9lbGxpcHRpYy9saWIvZWxsaXB0aWMvZWRkc2Evc2lnbmF0dXJlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2VsbGlwdGljL2xpYi9lbGxpcHRpYy9wcmVjb21wdXRlZC9zZWNwMjU2azEuanMiLCIuLi9ub2RlX21vZHVsZXMvZWxsaXB0aWMvbGliL2VsbGlwdGljL3V0aWxzLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2VsbGlwdGljL3BhY2thZ2UuanNvbiIsIi4uL25vZGVfbW9kdWxlcy9oYXNoLmpzL2xpYi9oYXNoLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2hhc2guanMvbGliL2hhc2gvY29tbW9uLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2hhc2guanMvbGliL2hhc2gvaG1hYy5qcyIsIi4uL25vZGVfbW9kdWxlcy9oYXNoLmpzL2xpYi9oYXNoL3JpcGVtZC5qcyIsIi4uL25vZGVfbW9kdWxlcy9oYXNoLmpzL2xpYi9oYXNoL3NoYS5qcyIsIi4uL25vZGVfbW9kdWxlcy9oYXNoLmpzL2xpYi9oYXNoL3NoYS8xLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2hhc2guanMvbGliL2hhc2gvc2hhLzIyNC5qcyIsIi4uL25vZGVfbW9kdWxlcy9oYXNoLmpzL2xpYi9oYXNoL3NoYS8yNTYuanMiLCIuLi9ub2RlX21vZHVsZXMvaGFzaC5qcy9saWIvaGFzaC9zaGEvMzg0LmpzIiwiLi4vbm9kZV9tb2R1bGVzL2hhc2guanMvbGliL2hhc2gvc2hhLzUxMi5qcyIsIi4uL25vZGVfbW9kdWxlcy9oYXNoLmpzL2xpYi9oYXNoL3NoYS9jb21tb24uanMiLCIuLi9ub2RlX21vZHVsZXMvaGFzaC5qcy9saWIvaGFzaC91dGlscy5qcyIsIi4uL25vZGVfbW9kdWxlcy9obWFjLWRyYmcvbGliL2htYWMtZHJiZy5qcyIsIi4uL25vZGVfbW9kdWxlcy9pbmhlcml0cy9pbmhlcml0c19icm93c2VyLmpzIiwiLi4vbm9kZV9tb2R1bGVzL21pbmltYWxpc3RpYy1hc3NlcnQvaW5kZXguanMiLCIuLi9ub2RlX21vZHVsZXMvbWluaW1hbGlzdGljLWNyeXB0by11dGlscy9saWIvdXRpbHMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ24yR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2piQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDejZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1d0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFVQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdFJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIiIsIihmdW5jdGlvbiAobW9kdWxlLCBleHBvcnRzKSB7XG4gICd1c2Ugc3RyaWN0JztcblxuICAvLyBVdGlsc1xuICBmdW5jdGlvbiBhc3NlcnQgKHZhbCwgbXNnKSB7XG4gICAgaWYgKCF2YWwpIHRocm93IG5ldyBFcnJvcihtc2cgfHwgJ0Fzc2VydGlvbiBmYWlsZWQnKTtcbiAgfVxuXG4gIC8vIENvdWxkIHVzZSBgaW5oZXJpdHNgIG1vZHVsZSwgYnV0IGRvbid0IHdhbnQgdG8gbW92ZSBmcm9tIHNpbmdsZSBmaWxlXG4gIC8vIGFyY2hpdGVjdHVyZSB5ZXQuXG4gIGZ1bmN0aW9uIGluaGVyaXRzIChjdG9yLCBzdXBlckN0b3IpIHtcbiAgICBjdG9yLnN1cGVyXyA9IHN1cGVyQ3RvcjtcbiAgICB2YXIgVGVtcEN0b3IgPSBmdW5jdGlvbiAoKSB7fTtcbiAgICBUZW1wQ3Rvci5wcm90b3R5cGUgPSBzdXBlckN0b3IucHJvdG90eXBlO1xuICAgIGN0b3IucHJvdG90eXBlID0gbmV3IFRlbXBDdG9yKCk7XG4gICAgY3Rvci5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBjdG9yO1xuICB9XG5cbiAgLy8gQk5cblxuICBmdW5jdGlvbiBCTiAobnVtYmVyLCBiYXNlLCBlbmRpYW4pIHtcbiAgICBpZiAoQk4uaXNCTihudW1iZXIpKSB7XG4gICAgICByZXR1cm4gbnVtYmVyO1xuICAgIH1cblxuICAgIHRoaXMubmVnYXRpdmUgPSAwO1xuICAgIHRoaXMud29yZHMgPSBudWxsO1xuICAgIHRoaXMubGVuZ3RoID0gMDtcblxuICAgIC8vIFJlZHVjdGlvbiBjb250ZXh0XG4gICAgdGhpcy5yZWQgPSBudWxsO1xuXG4gICAgaWYgKG51bWJlciAhPT0gbnVsbCkge1xuICAgICAgaWYgKGJhc2UgPT09ICdsZScgfHwgYmFzZSA9PT0gJ2JlJykge1xuICAgICAgICBlbmRpYW4gPSBiYXNlO1xuICAgICAgICBiYXNlID0gMTA7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuX2luaXQobnVtYmVyIHx8IDAsIGJhc2UgfHwgMTAsIGVuZGlhbiB8fCAnYmUnKTtcbiAgICB9XG4gIH1cbiAgaWYgKHR5cGVvZiBtb2R1bGUgPT09ICdvYmplY3QnKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBCTjtcbiAgfSBlbHNlIHtcbiAgICBleHBvcnRzLkJOID0gQk47XG4gIH1cblxuICBCTi5CTiA9IEJOO1xuICBCTi53b3JkU2l6ZSA9IDI2O1xuXG4gIHZhciBCdWZmZXI7XG4gIHRyeSB7XG4gICAgQnVmZmVyID0gcmVxdWlyZSgnYnVmZmVyJykuQnVmZmVyO1xuICB9IGNhdGNoIChlKSB7XG4gIH1cblxuICBCTi5pc0JOID0gZnVuY3Rpb24gaXNCTiAobnVtKSB7XG4gICAgaWYgKG51bSBpbnN0YW5jZW9mIEJOKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gbnVtICE9PSBudWxsICYmIHR5cGVvZiBudW0gPT09ICdvYmplY3QnICYmXG4gICAgICBudW0uY29uc3RydWN0b3Iud29yZFNpemUgPT09IEJOLndvcmRTaXplICYmIEFycmF5LmlzQXJyYXkobnVtLndvcmRzKTtcbiAgfTtcblxuICBCTi5tYXggPSBmdW5jdGlvbiBtYXggKGxlZnQsIHJpZ2h0KSB7XG4gICAgaWYgKGxlZnQuY21wKHJpZ2h0KSA+IDApIHJldHVybiBsZWZ0O1xuICAgIHJldHVybiByaWdodDtcbiAgfTtcblxuICBCTi5taW4gPSBmdW5jdGlvbiBtaW4gKGxlZnQsIHJpZ2h0KSB7XG4gICAgaWYgKGxlZnQuY21wKHJpZ2h0KSA8IDApIHJldHVybiBsZWZ0O1xuICAgIHJldHVybiByaWdodDtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuX2luaXQgPSBmdW5jdGlvbiBpbml0IChudW1iZXIsIGJhc2UsIGVuZGlhbikge1xuICAgIGlmICh0eXBlb2YgbnVtYmVyID09PSAnbnVtYmVyJykge1xuICAgICAgcmV0dXJuIHRoaXMuX2luaXROdW1iZXIobnVtYmVyLCBiYXNlLCBlbmRpYW4pO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgbnVtYmVyID09PSAnb2JqZWN0Jykge1xuICAgICAgcmV0dXJuIHRoaXMuX2luaXRBcnJheShudW1iZXIsIGJhc2UsIGVuZGlhbik7XG4gICAgfVxuXG4gICAgaWYgKGJhc2UgPT09ICdoZXgnKSB7XG4gICAgICBiYXNlID0gMTY7XG4gICAgfVxuICAgIGFzc2VydChiYXNlID09PSAoYmFzZSB8IDApICYmIGJhc2UgPj0gMiAmJiBiYXNlIDw9IDM2KTtcblxuICAgIG51bWJlciA9IG51bWJlci50b1N0cmluZygpLnJlcGxhY2UoL1xccysvZywgJycpO1xuICAgIHZhciBzdGFydCA9IDA7XG4gICAgaWYgKG51bWJlclswXSA9PT0gJy0nKSB7XG4gICAgICBzdGFydCsrO1xuICAgIH1cblxuICAgIGlmIChiYXNlID09PSAxNikge1xuICAgICAgdGhpcy5fcGFyc2VIZXgobnVtYmVyLCBzdGFydCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3BhcnNlQmFzZShudW1iZXIsIGJhc2UsIHN0YXJ0KTtcbiAgICB9XG5cbiAgICBpZiAobnVtYmVyWzBdID09PSAnLScpIHtcbiAgICAgIHRoaXMubmVnYXRpdmUgPSAxO1xuICAgIH1cblxuICAgIHRoaXMuc3RyaXAoKTtcblxuICAgIGlmIChlbmRpYW4gIT09ICdsZScpIHJldHVybjtcblxuICAgIHRoaXMuX2luaXRBcnJheSh0aGlzLnRvQXJyYXkoKSwgYmFzZSwgZW5kaWFuKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuX2luaXROdW1iZXIgPSBmdW5jdGlvbiBfaW5pdE51bWJlciAobnVtYmVyLCBiYXNlLCBlbmRpYW4pIHtcbiAgICBpZiAobnVtYmVyIDwgMCkge1xuICAgICAgdGhpcy5uZWdhdGl2ZSA9IDE7XG4gICAgICBudW1iZXIgPSAtbnVtYmVyO1xuICAgIH1cbiAgICBpZiAobnVtYmVyIDwgMHg0MDAwMDAwKSB7XG4gICAgICB0aGlzLndvcmRzID0gWyBudW1iZXIgJiAweDNmZmZmZmYgXTtcbiAgICAgIHRoaXMubGVuZ3RoID0gMTtcbiAgICB9IGVsc2UgaWYgKG51bWJlciA8IDB4MTAwMDAwMDAwMDAwMDApIHtcbiAgICAgIHRoaXMud29yZHMgPSBbXG4gICAgICAgIG51bWJlciAmIDB4M2ZmZmZmZixcbiAgICAgICAgKG51bWJlciAvIDB4NDAwMDAwMCkgJiAweDNmZmZmZmZcbiAgICAgIF07XG4gICAgICB0aGlzLmxlbmd0aCA9IDI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGFzc2VydChudW1iZXIgPCAweDIwMDAwMDAwMDAwMDAwKTsgLy8gMiBeIDUzICh1bnNhZmUpXG4gICAgICB0aGlzLndvcmRzID0gW1xuICAgICAgICBudW1iZXIgJiAweDNmZmZmZmYsXG4gICAgICAgIChudW1iZXIgLyAweDQwMDAwMDApICYgMHgzZmZmZmZmLFxuICAgICAgICAxXG4gICAgICBdO1xuICAgICAgdGhpcy5sZW5ndGggPSAzO1xuICAgIH1cblxuICAgIGlmIChlbmRpYW4gIT09ICdsZScpIHJldHVybjtcblxuICAgIC8vIFJldmVyc2UgdGhlIGJ5dGVzXG4gICAgdGhpcy5faW5pdEFycmF5KHRoaXMudG9BcnJheSgpLCBiYXNlLCBlbmRpYW4pO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5faW5pdEFycmF5ID0gZnVuY3Rpb24gX2luaXRBcnJheSAobnVtYmVyLCBiYXNlLCBlbmRpYW4pIHtcbiAgICAvLyBQZXJoYXBzIGEgVWludDhBcnJheVxuICAgIGFzc2VydCh0eXBlb2YgbnVtYmVyLmxlbmd0aCA9PT0gJ251bWJlcicpO1xuICAgIGlmIChudW1iZXIubGVuZ3RoIDw9IDApIHtcbiAgICAgIHRoaXMud29yZHMgPSBbIDAgXTtcbiAgICAgIHRoaXMubGVuZ3RoID0gMTtcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHRoaXMubGVuZ3RoID0gTWF0aC5jZWlsKG51bWJlci5sZW5ndGggLyAzKTtcbiAgICB0aGlzLndvcmRzID0gbmV3IEFycmF5KHRoaXMubGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHRoaXMud29yZHNbaV0gPSAwO1xuICAgIH1cblxuICAgIHZhciBqLCB3O1xuICAgIHZhciBvZmYgPSAwO1xuICAgIGlmIChlbmRpYW4gPT09ICdiZScpIHtcbiAgICAgIGZvciAoaSA9IG51bWJlci5sZW5ndGggLSAxLCBqID0gMDsgaSA+PSAwOyBpIC09IDMpIHtcbiAgICAgICAgdyA9IG51bWJlcltpXSB8IChudW1iZXJbaSAtIDFdIDw8IDgpIHwgKG51bWJlcltpIC0gMl0gPDwgMTYpO1xuICAgICAgICB0aGlzLndvcmRzW2pdIHw9ICh3IDw8IG9mZikgJiAweDNmZmZmZmY7XG4gICAgICAgIHRoaXMud29yZHNbaiArIDFdID0gKHcgPj4+ICgyNiAtIG9mZikpICYgMHgzZmZmZmZmO1xuICAgICAgICBvZmYgKz0gMjQ7XG4gICAgICAgIGlmIChvZmYgPj0gMjYpIHtcbiAgICAgICAgICBvZmYgLT0gMjY7XG4gICAgICAgICAgaisrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChlbmRpYW4gPT09ICdsZScpIHtcbiAgICAgIGZvciAoaSA9IDAsIGogPSAwOyBpIDwgbnVtYmVyLmxlbmd0aDsgaSArPSAzKSB7XG4gICAgICAgIHcgPSBudW1iZXJbaV0gfCAobnVtYmVyW2kgKyAxXSA8PCA4KSB8IChudW1iZXJbaSArIDJdIDw8IDE2KTtcbiAgICAgICAgdGhpcy53b3Jkc1tqXSB8PSAodyA8PCBvZmYpICYgMHgzZmZmZmZmO1xuICAgICAgICB0aGlzLndvcmRzW2ogKyAxXSA9ICh3ID4+PiAoMjYgLSBvZmYpKSAmIDB4M2ZmZmZmZjtcbiAgICAgICAgb2ZmICs9IDI0O1xuICAgICAgICBpZiAob2ZmID49IDI2KSB7XG4gICAgICAgICAgb2ZmIC09IDI2O1xuICAgICAgICAgIGorKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zdHJpcCgpO1xuICB9O1xuXG4gIGZ1bmN0aW9uIHBhcnNlSGV4IChzdHIsIHN0YXJ0LCBlbmQpIHtcbiAgICB2YXIgciA9IDA7XG4gICAgdmFyIGxlbiA9IE1hdGgubWluKHN0ci5sZW5ndGgsIGVuZCk7XG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIHZhciBjID0gc3RyLmNoYXJDb2RlQXQoaSkgLSA0ODtcblxuICAgICAgciA8PD0gNDtcblxuICAgICAgLy8gJ2EnIC0gJ2YnXG4gICAgICBpZiAoYyA+PSA0OSAmJiBjIDw9IDU0KSB7XG4gICAgICAgIHIgfD0gYyAtIDQ5ICsgMHhhO1xuXG4gICAgICAvLyAnQScgLSAnRidcbiAgICAgIH0gZWxzZSBpZiAoYyA+PSAxNyAmJiBjIDw9IDIyKSB7XG4gICAgICAgIHIgfD0gYyAtIDE3ICsgMHhhO1xuXG4gICAgICAvLyAnMCcgLSAnOSdcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHIgfD0gYyAmIDB4ZjtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHI7XG4gIH1cblxuICBCTi5wcm90b3R5cGUuX3BhcnNlSGV4ID0gZnVuY3Rpb24gX3BhcnNlSGV4IChudW1iZXIsIHN0YXJ0KSB7XG4gICAgLy8gQ3JlYXRlIHBvc3NpYmx5IGJpZ2dlciBhcnJheSB0byBlbnN1cmUgdGhhdCBpdCBmaXRzIHRoZSBudW1iZXJcbiAgICB0aGlzLmxlbmd0aCA9IE1hdGguY2VpbCgobnVtYmVyLmxlbmd0aCAtIHN0YXJ0KSAvIDYpO1xuICAgIHRoaXMud29yZHMgPSBuZXcgQXJyYXkodGhpcy5sZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5sZW5ndGg7IGkrKykge1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IDA7XG4gICAgfVxuXG4gICAgdmFyIGosIHc7XG4gICAgLy8gU2NhbiAyNC1iaXQgY2h1bmtzIGFuZCBhZGQgdGhlbSB0byB0aGUgbnVtYmVyXG4gICAgdmFyIG9mZiA9IDA7XG4gICAgZm9yIChpID0gbnVtYmVyLmxlbmd0aCAtIDYsIGogPSAwOyBpID49IHN0YXJ0OyBpIC09IDYpIHtcbiAgICAgIHcgPSBwYXJzZUhleChudW1iZXIsIGksIGkgKyA2KTtcbiAgICAgIHRoaXMud29yZHNbal0gfD0gKHcgPDwgb2ZmKSAmIDB4M2ZmZmZmZjtcbiAgICAgIC8vIE5PVEU6IGAweDNmZmZmZmAgaXMgaW50ZW50aW9uYWwgaGVyZSwgMjZiaXRzIG1heCBzaGlmdCArIDI0Yml0IGhleCBsaW1iXG4gICAgICB0aGlzLndvcmRzW2ogKyAxXSB8PSB3ID4+PiAoMjYgLSBvZmYpICYgMHgzZmZmZmY7XG4gICAgICBvZmYgKz0gMjQ7XG4gICAgICBpZiAob2ZmID49IDI2KSB7XG4gICAgICAgIG9mZiAtPSAyNjtcbiAgICAgICAgaisrO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoaSArIDYgIT09IHN0YXJ0KSB7XG4gICAgICB3ID0gcGFyc2VIZXgobnVtYmVyLCBzdGFydCwgaSArIDYpO1xuICAgICAgdGhpcy53b3Jkc1tqXSB8PSAodyA8PCBvZmYpICYgMHgzZmZmZmZmO1xuICAgICAgdGhpcy53b3Jkc1tqICsgMV0gfD0gdyA+Pj4gKDI2IC0gb2ZmKSAmIDB4M2ZmZmZmO1xuICAgIH1cbiAgICB0aGlzLnN0cmlwKCk7XG4gIH07XG5cbiAgZnVuY3Rpb24gcGFyc2VCYXNlIChzdHIsIHN0YXJ0LCBlbmQsIG11bCkge1xuICAgIHZhciByID0gMDtcbiAgICB2YXIgbGVuID0gTWF0aC5taW4oc3RyLmxlbmd0aCwgZW5kKTtcbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBsZW47IGkrKykge1xuICAgICAgdmFyIGMgPSBzdHIuY2hhckNvZGVBdChpKSAtIDQ4O1xuXG4gICAgICByICo9IG11bDtcblxuICAgICAgLy8gJ2EnXG4gICAgICBpZiAoYyA+PSA0OSkge1xuICAgICAgICByICs9IGMgLSA0OSArIDB4YTtcblxuICAgICAgLy8gJ0EnXG4gICAgICB9IGVsc2UgaWYgKGMgPj0gMTcpIHtcbiAgICAgICAgciArPSBjIC0gMTcgKyAweGE7XG5cbiAgICAgIC8vICcwJyAtICc5J1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgciArPSBjO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcjtcbiAgfVxuXG4gIEJOLnByb3RvdHlwZS5fcGFyc2VCYXNlID0gZnVuY3Rpb24gX3BhcnNlQmFzZSAobnVtYmVyLCBiYXNlLCBzdGFydCkge1xuICAgIC8vIEluaXRpYWxpemUgYXMgemVyb1xuICAgIHRoaXMud29yZHMgPSBbIDAgXTtcbiAgICB0aGlzLmxlbmd0aCA9IDE7XG5cbiAgICAvLyBGaW5kIGxlbmd0aCBvZiBsaW1iIGluIGJhc2VcbiAgICBmb3IgKHZhciBsaW1iTGVuID0gMCwgbGltYlBvdyA9IDE7IGxpbWJQb3cgPD0gMHgzZmZmZmZmOyBsaW1iUG93ICo9IGJhc2UpIHtcbiAgICAgIGxpbWJMZW4rKztcbiAgICB9XG4gICAgbGltYkxlbi0tO1xuICAgIGxpbWJQb3cgPSAobGltYlBvdyAvIGJhc2UpIHwgMDtcblxuICAgIHZhciB0b3RhbCA9IG51bWJlci5sZW5ndGggLSBzdGFydDtcbiAgICB2YXIgbW9kID0gdG90YWwgJSBsaW1iTGVuO1xuICAgIHZhciBlbmQgPSBNYXRoLm1pbih0b3RhbCwgdG90YWwgLSBtb2QpICsgc3RhcnQ7XG5cbiAgICB2YXIgd29yZCA9IDA7XG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpICs9IGxpbWJMZW4pIHtcbiAgICAgIHdvcmQgPSBwYXJzZUJhc2UobnVtYmVyLCBpLCBpICsgbGltYkxlbiwgYmFzZSk7XG5cbiAgICAgIHRoaXMuaW11bG4obGltYlBvdyk7XG4gICAgICBpZiAodGhpcy53b3Jkc1swXSArIHdvcmQgPCAweDQwMDAwMDApIHtcbiAgICAgICAgdGhpcy53b3Jkc1swXSArPSB3b3JkO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5faWFkZG4od29yZCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKG1vZCAhPT0gMCkge1xuICAgICAgdmFyIHBvdyA9IDE7XG4gICAgICB3b3JkID0gcGFyc2VCYXNlKG51bWJlciwgaSwgbnVtYmVyLmxlbmd0aCwgYmFzZSk7XG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCBtb2Q7IGkrKykge1xuICAgICAgICBwb3cgKj0gYmFzZTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5pbXVsbihwb3cpO1xuICAgICAgaWYgKHRoaXMud29yZHNbMF0gKyB3b3JkIDwgMHg0MDAwMDAwKSB7XG4gICAgICAgIHRoaXMud29yZHNbMF0gKz0gd29yZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX2lhZGRuKHdvcmQpO1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICBCTi5wcm90b3R5cGUuY29weSA9IGZ1bmN0aW9uIGNvcHkgKGRlc3QpIHtcbiAgICBkZXN0LndvcmRzID0gbmV3IEFycmF5KHRoaXMubGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGRlc3Qud29yZHNbaV0gPSB0aGlzLndvcmRzW2ldO1xuICAgIH1cbiAgICBkZXN0Lmxlbmd0aCA9IHRoaXMubGVuZ3RoO1xuICAgIGRlc3QubmVnYXRpdmUgPSB0aGlzLm5lZ2F0aXZlO1xuICAgIGRlc3QucmVkID0gdGhpcy5yZWQ7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmNsb25lID0gZnVuY3Rpb24gY2xvbmUgKCkge1xuICAgIHZhciByID0gbmV3IEJOKG51bGwpO1xuICAgIHRoaXMuY29weShyKTtcbiAgICByZXR1cm4gcjtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuX2V4cGFuZCA9IGZ1bmN0aW9uIF9leHBhbmQgKHNpemUpIHtcbiAgICB3aGlsZSAodGhpcy5sZW5ndGggPCBzaXplKSB7XG4gICAgICB0aGlzLndvcmRzW3RoaXMubGVuZ3RoKytdID0gMDtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgLy8gUmVtb3ZlIGxlYWRpbmcgYDBgIGZyb20gYHRoaXNgXG4gIEJOLnByb3RvdHlwZS5zdHJpcCA9IGZ1bmN0aW9uIHN0cmlwICgpIHtcbiAgICB3aGlsZSAodGhpcy5sZW5ndGggPiAxICYmIHRoaXMud29yZHNbdGhpcy5sZW5ndGggLSAxXSA9PT0gMCkge1xuICAgICAgdGhpcy5sZW5ndGgtLTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX25vcm1TaWduKCk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLl9ub3JtU2lnbiA9IGZ1bmN0aW9uIF9ub3JtU2lnbiAoKSB7XG4gICAgLy8gLTAgPSAwXG4gICAgaWYgKHRoaXMubGVuZ3RoID09PSAxICYmIHRoaXMud29yZHNbMF0gPT09IDApIHtcbiAgICAgIHRoaXMubmVnYXRpdmUgPSAwO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuaW5zcGVjdCA9IGZ1bmN0aW9uIGluc3BlY3QgKCkge1xuICAgIHJldHVybiAodGhpcy5yZWQgPyAnPEJOLVI6ICcgOiAnPEJOOiAnKSArIHRoaXMudG9TdHJpbmcoMTYpICsgJz4nO1xuICB9O1xuXG4gIC8qXG5cbiAgdmFyIHplcm9zID0gW107XG4gIHZhciBncm91cFNpemVzID0gW107XG4gIHZhciBncm91cEJhc2VzID0gW107XG5cbiAgdmFyIHMgPSAnJztcbiAgdmFyIGkgPSAtMTtcbiAgd2hpbGUgKCsraSA8IEJOLndvcmRTaXplKSB7XG4gICAgemVyb3NbaV0gPSBzO1xuICAgIHMgKz0gJzAnO1xuICB9XG4gIGdyb3VwU2l6ZXNbMF0gPSAwO1xuICBncm91cFNpemVzWzFdID0gMDtcbiAgZ3JvdXBCYXNlc1swXSA9IDA7XG4gIGdyb3VwQmFzZXNbMV0gPSAwO1xuICB2YXIgYmFzZSA9IDIgLSAxO1xuICB3aGlsZSAoKytiYXNlIDwgMzYgKyAxKSB7XG4gICAgdmFyIGdyb3VwU2l6ZSA9IDA7XG4gICAgdmFyIGdyb3VwQmFzZSA9IDE7XG4gICAgd2hpbGUgKGdyb3VwQmFzZSA8ICgxIDw8IEJOLndvcmRTaXplKSAvIGJhc2UpIHtcbiAgICAgIGdyb3VwQmFzZSAqPSBiYXNlO1xuICAgICAgZ3JvdXBTaXplICs9IDE7XG4gICAgfVxuICAgIGdyb3VwU2l6ZXNbYmFzZV0gPSBncm91cFNpemU7XG4gICAgZ3JvdXBCYXNlc1tiYXNlXSA9IGdyb3VwQmFzZTtcbiAgfVxuXG4gICovXG5cbiAgdmFyIHplcm9zID0gW1xuICAgICcnLFxuICAgICcwJyxcbiAgICAnMDAnLFxuICAgICcwMDAnLFxuICAgICcwMDAwJyxcbiAgICAnMDAwMDAnLFxuICAgICcwMDAwMDAnLFxuICAgICcwMDAwMDAwJyxcbiAgICAnMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwJyxcbiAgICAnMDAwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwMDAwJyxcbiAgICAnMDAwMDAwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwMDAwMDAwJyxcbiAgICAnMDAwMDAwMDAwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwMDAwMDAwMDAwJyxcbiAgICAnMDAwMDAwMDAwMDAwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwMDAwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwMDAwMDAwMDAwMDAwJyxcbiAgICAnMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwJ1xuICBdO1xuXG4gIHZhciBncm91cFNpemVzID0gW1xuICAgIDAsIDAsXG4gICAgMjUsIDE2LCAxMiwgMTEsIDEwLCA5LCA4LFxuICAgIDgsIDcsIDcsIDcsIDcsIDYsIDYsXG4gICAgNiwgNiwgNiwgNiwgNiwgNSwgNSxcbiAgICA1LCA1LCA1LCA1LCA1LCA1LCA1LFxuICAgIDUsIDUsIDUsIDUsIDUsIDUsIDVcbiAgXTtcblxuICB2YXIgZ3JvdXBCYXNlcyA9IFtcbiAgICAwLCAwLFxuICAgIDMzNTU0NDMyLCA0MzA0NjcyMSwgMTY3NzcyMTYsIDQ4ODI4MTI1LCA2MDQ2NjE3NiwgNDAzNTM2MDcsIDE2Nzc3MjE2LFxuICAgIDQzMDQ2NzIxLCAxMDAwMDAwMCwgMTk0ODcxNzEsIDM1ODMxODA4LCA2Mjc0ODUxNywgNzUyOTUzNiwgMTEzOTA2MjUsXG4gICAgMTY3NzcyMTYsIDI0MTM3NTY5LCAzNDAxMjIyNCwgNDcwNDU4ODEsIDY0MDAwMDAwLCA0MDg0MTAxLCA1MTUzNjMyLFxuICAgIDY0MzYzNDMsIDc5NjI2MjQsIDk3NjU2MjUsIDExODgxMzc2LCAxNDM0ODkwNywgMTcyMTAzNjgsIDIwNTExMTQ5LFxuICAgIDI0MzAwMDAwLCAyODYyOTE1MSwgMzM1NTQ0MzIsIDM5MTM1MzkzLCA0NTQzNTQyNCwgNTI1MjE4NzUsIDYwNDY2MTc2XG4gIF07XG5cbiAgQk4ucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gdG9TdHJpbmcgKGJhc2UsIHBhZGRpbmcpIHtcbiAgICBiYXNlID0gYmFzZSB8fCAxMDtcbiAgICBwYWRkaW5nID0gcGFkZGluZyB8IDAgfHwgMTtcblxuICAgIHZhciBvdXQ7XG4gICAgaWYgKGJhc2UgPT09IDE2IHx8IGJhc2UgPT09ICdoZXgnKSB7XG4gICAgICBvdXQgPSAnJztcbiAgICAgIHZhciBvZmYgPSAwO1xuICAgICAgdmFyIGNhcnJ5ID0gMDtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgdyA9IHRoaXMud29yZHNbaV07XG4gICAgICAgIHZhciB3b3JkID0gKCgodyA8PCBvZmYpIHwgY2FycnkpICYgMHhmZmZmZmYpLnRvU3RyaW5nKDE2KTtcbiAgICAgICAgY2FycnkgPSAodyA+Pj4gKDI0IC0gb2ZmKSkgJiAweGZmZmZmZjtcbiAgICAgICAgaWYgKGNhcnJ5ICE9PSAwIHx8IGkgIT09IHRoaXMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgIG91dCA9IHplcm9zWzYgLSB3b3JkLmxlbmd0aF0gKyB3b3JkICsgb3V0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG91dCA9IHdvcmQgKyBvdXQ7XG4gICAgICAgIH1cbiAgICAgICAgb2ZmICs9IDI7XG4gICAgICAgIGlmIChvZmYgPj0gMjYpIHtcbiAgICAgICAgICBvZmYgLT0gMjY7XG4gICAgICAgICAgaS0tO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoY2FycnkgIT09IDApIHtcbiAgICAgICAgb3V0ID0gY2FycnkudG9TdHJpbmcoMTYpICsgb3V0O1xuICAgICAgfVxuICAgICAgd2hpbGUgKG91dC5sZW5ndGggJSBwYWRkaW5nICE9PSAwKSB7XG4gICAgICAgIG91dCA9ICcwJyArIG91dDtcbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLm5lZ2F0aXZlICE9PSAwKSB7XG4gICAgICAgIG91dCA9ICctJyArIG91dDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBvdXQ7XG4gICAgfVxuXG4gICAgaWYgKGJhc2UgPT09IChiYXNlIHwgMCkgJiYgYmFzZSA+PSAyICYmIGJhc2UgPD0gMzYpIHtcbiAgICAgIC8vIHZhciBncm91cFNpemUgPSBNYXRoLmZsb29yKEJOLndvcmRTaXplICogTWF0aC5MTjIgLyBNYXRoLmxvZyhiYXNlKSk7XG4gICAgICB2YXIgZ3JvdXBTaXplID0gZ3JvdXBTaXplc1tiYXNlXTtcbiAgICAgIC8vIHZhciBncm91cEJhc2UgPSBNYXRoLnBvdyhiYXNlLCBncm91cFNpemUpO1xuICAgICAgdmFyIGdyb3VwQmFzZSA9IGdyb3VwQmFzZXNbYmFzZV07XG4gICAgICBvdXQgPSAnJztcbiAgICAgIHZhciBjID0gdGhpcy5jbG9uZSgpO1xuICAgICAgYy5uZWdhdGl2ZSA9IDA7XG4gICAgICB3aGlsZSAoIWMuaXNaZXJvKCkpIHtcbiAgICAgICAgdmFyIHIgPSBjLm1vZG4oZ3JvdXBCYXNlKS50b1N0cmluZyhiYXNlKTtcbiAgICAgICAgYyA9IGMuaWRpdm4oZ3JvdXBCYXNlKTtcblxuICAgICAgICBpZiAoIWMuaXNaZXJvKCkpIHtcbiAgICAgICAgICBvdXQgPSB6ZXJvc1tncm91cFNpemUgLSByLmxlbmd0aF0gKyByICsgb3V0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG91dCA9IHIgKyBvdXQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLmlzWmVybygpKSB7XG4gICAgICAgIG91dCA9ICcwJyArIG91dDtcbiAgICAgIH1cbiAgICAgIHdoaWxlIChvdXQubGVuZ3RoICUgcGFkZGluZyAhPT0gMCkge1xuICAgICAgICBvdXQgPSAnMCcgKyBvdXQ7XG4gICAgICB9XG4gICAgICBpZiAodGhpcy5uZWdhdGl2ZSAhPT0gMCkge1xuICAgICAgICBvdXQgPSAnLScgKyBvdXQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gb3V0O1xuICAgIH1cblxuICAgIGFzc2VydChmYWxzZSwgJ0Jhc2Ugc2hvdWxkIGJlIGJldHdlZW4gMiBhbmQgMzYnKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUudG9OdW1iZXIgPSBmdW5jdGlvbiB0b051bWJlciAoKSB7XG4gICAgdmFyIHJldCA9IHRoaXMud29yZHNbMF07XG4gICAgaWYgKHRoaXMubGVuZ3RoID09PSAyKSB7XG4gICAgICByZXQgKz0gdGhpcy53b3Jkc1sxXSAqIDB4NDAwMDAwMDtcbiAgICB9IGVsc2UgaWYgKHRoaXMubGVuZ3RoID09PSAzICYmIHRoaXMud29yZHNbMl0gPT09IDB4MDEpIHtcbiAgICAgIC8vIE5PVEU6IGF0IHRoaXMgc3RhZ2UgaXQgaXMga25vd24gdGhhdCB0aGUgdG9wIGJpdCBpcyBzZXRcbiAgICAgIHJldCArPSAweDEwMDAwMDAwMDAwMDAwICsgKHRoaXMud29yZHNbMV0gKiAweDQwMDAwMDApO1xuICAgIH0gZWxzZSBpZiAodGhpcy5sZW5ndGggPiAyKSB7XG4gICAgICBhc3NlcnQoZmFsc2UsICdOdW1iZXIgY2FuIG9ubHkgc2FmZWx5IHN0b3JlIHVwIHRvIDUzIGJpdHMnKTtcbiAgICB9XG4gICAgcmV0dXJuICh0aGlzLm5lZ2F0aXZlICE9PSAwKSA/IC1yZXQgOiByZXQ7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uIHRvSlNPTiAoKSB7XG4gICAgcmV0dXJuIHRoaXMudG9TdHJpbmcoMTYpO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS50b0J1ZmZlciA9IGZ1bmN0aW9uIHRvQnVmZmVyIChlbmRpYW4sIGxlbmd0aCkge1xuICAgIGFzc2VydCh0eXBlb2YgQnVmZmVyICE9PSAndW5kZWZpbmVkJyk7XG4gICAgcmV0dXJuIHRoaXMudG9BcnJheUxpa2UoQnVmZmVyLCBlbmRpYW4sIGxlbmd0aCk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLnRvQXJyYXkgPSBmdW5jdGlvbiB0b0FycmF5IChlbmRpYW4sIGxlbmd0aCkge1xuICAgIHJldHVybiB0aGlzLnRvQXJyYXlMaWtlKEFycmF5LCBlbmRpYW4sIGxlbmd0aCk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLnRvQXJyYXlMaWtlID0gZnVuY3Rpb24gdG9BcnJheUxpa2UgKEFycmF5VHlwZSwgZW5kaWFuLCBsZW5ndGgpIHtcbiAgICB2YXIgYnl0ZUxlbmd0aCA9IHRoaXMuYnl0ZUxlbmd0aCgpO1xuICAgIHZhciByZXFMZW5ndGggPSBsZW5ndGggfHwgTWF0aC5tYXgoMSwgYnl0ZUxlbmd0aCk7XG4gICAgYXNzZXJ0KGJ5dGVMZW5ndGggPD0gcmVxTGVuZ3RoLCAnYnl0ZSBhcnJheSBsb25nZXIgdGhhbiBkZXNpcmVkIGxlbmd0aCcpO1xuICAgIGFzc2VydChyZXFMZW5ndGggPiAwLCAnUmVxdWVzdGVkIGFycmF5IGxlbmd0aCA8PSAwJyk7XG5cbiAgICB0aGlzLnN0cmlwKCk7XG4gICAgdmFyIGxpdHRsZUVuZGlhbiA9IGVuZGlhbiA9PT0gJ2xlJztcbiAgICB2YXIgcmVzID0gbmV3IEFycmF5VHlwZShyZXFMZW5ndGgpO1xuXG4gICAgdmFyIGIsIGk7XG4gICAgdmFyIHEgPSB0aGlzLmNsb25lKCk7XG4gICAgaWYgKCFsaXR0bGVFbmRpYW4pIHtcbiAgICAgIC8vIEFzc3VtZSBiaWctZW5kaWFuXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgcmVxTGVuZ3RoIC0gYnl0ZUxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHJlc1tpXSA9IDA7XG4gICAgICB9XG5cbiAgICAgIGZvciAoaSA9IDA7ICFxLmlzWmVybygpOyBpKyspIHtcbiAgICAgICAgYiA9IHEuYW5kbG4oMHhmZik7XG4gICAgICAgIHEuaXVzaHJuKDgpO1xuXG4gICAgICAgIHJlc1tyZXFMZW5ndGggLSBpIC0gMV0gPSBiO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBmb3IgKGkgPSAwOyAhcS5pc1plcm8oKTsgaSsrKSB7XG4gICAgICAgIGIgPSBxLmFuZGxuKDB4ZmYpO1xuICAgICAgICBxLml1c2hybig4KTtcblxuICAgICAgICByZXNbaV0gPSBiO1xuICAgICAgfVxuXG4gICAgICBmb3IgKDsgaSA8IHJlcUxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHJlc1tpXSA9IDA7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlcztcbiAgfTtcblxuICBpZiAoTWF0aC5jbHozMikge1xuICAgIEJOLnByb3RvdHlwZS5fY291bnRCaXRzID0gZnVuY3Rpb24gX2NvdW50Qml0cyAodykge1xuICAgICAgcmV0dXJuIDMyIC0gTWF0aC5jbHozMih3KTtcbiAgICB9O1xuICB9IGVsc2Uge1xuICAgIEJOLnByb3RvdHlwZS5fY291bnRCaXRzID0gZnVuY3Rpb24gX2NvdW50Qml0cyAodykge1xuICAgICAgdmFyIHQgPSB3O1xuICAgICAgdmFyIHIgPSAwO1xuICAgICAgaWYgKHQgPj0gMHgxMDAwKSB7XG4gICAgICAgIHIgKz0gMTM7XG4gICAgICAgIHQgPj4+PSAxMztcbiAgICAgIH1cbiAgICAgIGlmICh0ID49IDB4NDApIHtcbiAgICAgICAgciArPSA3O1xuICAgICAgICB0ID4+Pj0gNztcbiAgICAgIH1cbiAgICAgIGlmICh0ID49IDB4OCkge1xuICAgICAgICByICs9IDQ7XG4gICAgICAgIHQgPj4+PSA0O1xuICAgICAgfVxuICAgICAgaWYgKHQgPj0gMHgwMikge1xuICAgICAgICByICs9IDI7XG4gICAgICAgIHQgPj4+PSAyO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHIgKyB0O1xuICAgIH07XG4gIH1cblxuICBCTi5wcm90b3R5cGUuX3plcm9CaXRzID0gZnVuY3Rpb24gX3plcm9CaXRzICh3KSB7XG4gICAgLy8gU2hvcnQtY3V0XG4gICAgaWYgKHcgPT09IDApIHJldHVybiAyNjtcblxuICAgIHZhciB0ID0gdztcbiAgICB2YXIgciA9IDA7XG4gICAgaWYgKCh0ICYgMHgxZmZmKSA9PT0gMCkge1xuICAgICAgciArPSAxMztcbiAgICAgIHQgPj4+PSAxMztcbiAgICB9XG4gICAgaWYgKCh0ICYgMHg3ZikgPT09IDApIHtcbiAgICAgIHIgKz0gNztcbiAgICAgIHQgPj4+PSA3O1xuICAgIH1cbiAgICBpZiAoKHQgJiAweGYpID09PSAwKSB7XG4gICAgICByICs9IDQ7XG4gICAgICB0ID4+Pj0gNDtcbiAgICB9XG4gICAgaWYgKCh0ICYgMHgzKSA9PT0gMCkge1xuICAgICAgciArPSAyO1xuICAgICAgdCA+Pj49IDI7XG4gICAgfVxuICAgIGlmICgodCAmIDB4MSkgPT09IDApIHtcbiAgICAgIHIrKztcbiAgICB9XG4gICAgcmV0dXJuIHI7XG4gIH07XG5cbiAgLy8gUmV0dXJuIG51bWJlciBvZiB1c2VkIGJpdHMgaW4gYSBCTlxuICBCTi5wcm90b3R5cGUuYml0TGVuZ3RoID0gZnVuY3Rpb24gYml0TGVuZ3RoICgpIHtcbiAgICB2YXIgdyA9IHRoaXMud29yZHNbdGhpcy5sZW5ndGggLSAxXTtcbiAgICB2YXIgaGkgPSB0aGlzLl9jb3VudEJpdHModyk7XG4gICAgcmV0dXJuICh0aGlzLmxlbmd0aCAtIDEpICogMjYgKyBoaTtcbiAgfTtcblxuICBmdW5jdGlvbiB0b0JpdEFycmF5IChudW0pIHtcbiAgICB2YXIgdyA9IG5ldyBBcnJheShudW0uYml0TGVuZ3RoKCkpO1xuXG4gICAgZm9yICh2YXIgYml0ID0gMDsgYml0IDwgdy5sZW5ndGg7IGJpdCsrKSB7XG4gICAgICB2YXIgb2ZmID0gKGJpdCAvIDI2KSB8IDA7XG4gICAgICB2YXIgd2JpdCA9IGJpdCAlIDI2O1xuXG4gICAgICB3W2JpdF0gPSAobnVtLndvcmRzW29mZl0gJiAoMSA8PCB3Yml0KSkgPj4+IHdiaXQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIHc7XG4gIH1cblxuICAvLyBOdW1iZXIgb2YgdHJhaWxpbmcgemVybyBiaXRzXG4gIEJOLnByb3RvdHlwZS56ZXJvQml0cyA9IGZ1bmN0aW9uIHplcm9CaXRzICgpIHtcbiAgICBpZiAodGhpcy5pc1plcm8oKSkgcmV0dXJuIDA7XG5cbiAgICB2YXIgciA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgYiA9IHRoaXMuX3plcm9CaXRzKHRoaXMud29yZHNbaV0pO1xuICAgICAgciArPSBiO1xuICAgICAgaWYgKGIgIT09IDI2KSBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIHI7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmJ5dGVMZW5ndGggPSBmdW5jdGlvbiBieXRlTGVuZ3RoICgpIHtcbiAgICByZXR1cm4gTWF0aC5jZWlsKHRoaXMuYml0TGVuZ3RoKCkgLyA4KTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUudG9Ud29zID0gZnVuY3Rpb24gdG9Ud29zICh3aWR0aCkge1xuICAgIGlmICh0aGlzLm5lZ2F0aXZlICE9PSAwKSB7XG4gICAgICByZXR1cm4gdGhpcy5hYnMoKS5pbm90bih3aWR0aCkuaWFkZG4oMSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmNsb25lKCk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmZyb21Ud29zID0gZnVuY3Rpb24gZnJvbVR3b3MgKHdpZHRoKSB7XG4gICAgaWYgKHRoaXMudGVzdG4od2lkdGggLSAxKSkge1xuICAgICAgcmV0dXJuIHRoaXMubm90bih3aWR0aCkuaWFkZG4oMSkuaW5lZygpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5jbG9uZSgpO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5pc05lZyA9IGZ1bmN0aW9uIGlzTmVnICgpIHtcbiAgICByZXR1cm4gdGhpcy5uZWdhdGl2ZSAhPT0gMDtcbiAgfTtcblxuICAvLyBSZXR1cm4gbmVnYXRpdmUgY2xvbmUgb2YgYHRoaXNgXG4gIEJOLnByb3RvdHlwZS5uZWcgPSBmdW5jdGlvbiBuZWcgKCkge1xuICAgIHJldHVybiB0aGlzLmNsb25lKCkuaW5lZygpO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5pbmVnID0gZnVuY3Rpb24gaW5lZyAoKSB7XG4gICAgaWYgKCF0aGlzLmlzWmVybygpKSB7XG4gICAgICB0aGlzLm5lZ2F0aXZlIF49IDE7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgLy8gT3IgYG51bWAgd2l0aCBgdGhpc2AgaW4tcGxhY2VcbiAgQk4ucHJvdG90eXBlLml1b3IgPSBmdW5jdGlvbiBpdW9yIChudW0pIHtcbiAgICB3aGlsZSAodGhpcy5sZW5ndGggPCBudW0ubGVuZ3RoKSB7XG4gICAgICB0aGlzLndvcmRzW3RoaXMubGVuZ3RoKytdID0gMDtcbiAgICB9XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bS5sZW5ndGg7IGkrKykge1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IHRoaXMud29yZHNbaV0gfCBudW0ud29yZHNbaV07XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuc3RyaXAoKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuaW9yID0gZnVuY3Rpb24gaW9yIChudW0pIHtcbiAgICBhc3NlcnQoKHRoaXMubmVnYXRpdmUgfCBudW0ubmVnYXRpdmUpID09PSAwKTtcbiAgICByZXR1cm4gdGhpcy5pdW9yKG51bSk7XG4gIH07XG5cbiAgLy8gT3IgYG51bWAgd2l0aCBgdGhpc2BcbiAgQk4ucHJvdG90eXBlLm9yID0gZnVuY3Rpb24gb3IgKG51bSkge1xuICAgIGlmICh0aGlzLmxlbmd0aCA+IG51bS5sZW5ndGgpIHJldHVybiB0aGlzLmNsb25lKCkuaW9yKG51bSk7XG4gICAgcmV0dXJuIG51bS5jbG9uZSgpLmlvcih0aGlzKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUudW9yID0gZnVuY3Rpb24gdW9yIChudW0pIHtcbiAgICBpZiAodGhpcy5sZW5ndGggPiBudW0ubGVuZ3RoKSByZXR1cm4gdGhpcy5jbG9uZSgpLml1b3IobnVtKTtcbiAgICByZXR1cm4gbnVtLmNsb25lKCkuaXVvcih0aGlzKTtcbiAgfTtcblxuICAvLyBBbmQgYG51bWAgd2l0aCBgdGhpc2AgaW4tcGxhY2VcbiAgQk4ucHJvdG90eXBlLml1YW5kID0gZnVuY3Rpb24gaXVhbmQgKG51bSkge1xuICAgIC8vIGIgPSBtaW4tbGVuZ3RoKG51bSwgdGhpcylcbiAgICB2YXIgYjtcbiAgICBpZiAodGhpcy5sZW5ndGggPiBudW0ubGVuZ3RoKSB7XG4gICAgICBiID0gbnVtO1xuICAgIH0gZWxzZSB7XG4gICAgICBiID0gdGhpcztcbiAgICB9XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGIubGVuZ3RoOyBpKyspIHtcbiAgICAgIHRoaXMud29yZHNbaV0gPSB0aGlzLndvcmRzW2ldICYgbnVtLndvcmRzW2ldO1xuICAgIH1cblxuICAgIHRoaXMubGVuZ3RoID0gYi5sZW5ndGg7XG5cbiAgICByZXR1cm4gdGhpcy5zdHJpcCgpO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5pYW5kID0gZnVuY3Rpb24gaWFuZCAobnVtKSB7XG4gICAgYXNzZXJ0KCh0aGlzLm5lZ2F0aXZlIHwgbnVtLm5lZ2F0aXZlKSA9PT0gMCk7XG4gICAgcmV0dXJuIHRoaXMuaXVhbmQobnVtKTtcbiAgfTtcblxuICAvLyBBbmQgYG51bWAgd2l0aCBgdGhpc2BcbiAgQk4ucHJvdG90eXBlLmFuZCA9IGZ1bmN0aW9uIGFuZCAobnVtKSB7XG4gICAgaWYgKHRoaXMubGVuZ3RoID4gbnVtLmxlbmd0aCkgcmV0dXJuIHRoaXMuY2xvbmUoKS5pYW5kKG51bSk7XG4gICAgcmV0dXJuIG51bS5jbG9uZSgpLmlhbmQodGhpcyk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLnVhbmQgPSBmdW5jdGlvbiB1YW5kIChudW0pIHtcbiAgICBpZiAodGhpcy5sZW5ndGggPiBudW0ubGVuZ3RoKSByZXR1cm4gdGhpcy5jbG9uZSgpLml1YW5kKG51bSk7XG4gICAgcmV0dXJuIG51bS5jbG9uZSgpLml1YW5kKHRoaXMpO1xuICB9O1xuXG4gIC8vIFhvciBgbnVtYCB3aXRoIGB0aGlzYCBpbi1wbGFjZVxuICBCTi5wcm90b3R5cGUuaXV4b3IgPSBmdW5jdGlvbiBpdXhvciAobnVtKSB7XG4gICAgLy8gYS5sZW5ndGggPiBiLmxlbmd0aFxuICAgIHZhciBhO1xuICAgIHZhciBiO1xuICAgIGlmICh0aGlzLmxlbmd0aCA+IG51bS5sZW5ndGgpIHtcbiAgICAgIGEgPSB0aGlzO1xuICAgICAgYiA9IG51bTtcbiAgICB9IGVsc2Uge1xuICAgICAgYSA9IG51bTtcbiAgICAgIGIgPSB0aGlzO1xuICAgIH1cblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYi5sZW5ndGg7IGkrKykge1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IGEud29yZHNbaV0gXiBiLndvcmRzW2ldO1xuICAgIH1cblxuICAgIGlmICh0aGlzICE9PSBhKSB7XG4gICAgICBmb3IgKDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdGhpcy53b3Jkc1tpXSA9IGEud29yZHNbaV07XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5sZW5ndGggPSBhLmxlbmd0aDtcblxuICAgIHJldHVybiB0aGlzLnN0cmlwKCk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLml4b3IgPSBmdW5jdGlvbiBpeG9yIChudW0pIHtcbiAgICBhc3NlcnQoKHRoaXMubmVnYXRpdmUgfCBudW0ubmVnYXRpdmUpID09PSAwKTtcbiAgICByZXR1cm4gdGhpcy5pdXhvcihudW0pO1xuICB9O1xuXG4gIC8vIFhvciBgbnVtYCB3aXRoIGB0aGlzYFxuICBCTi5wcm90b3R5cGUueG9yID0gZnVuY3Rpb24geG9yIChudW0pIHtcbiAgICBpZiAodGhpcy5sZW5ndGggPiBudW0ubGVuZ3RoKSByZXR1cm4gdGhpcy5jbG9uZSgpLml4b3IobnVtKTtcbiAgICByZXR1cm4gbnVtLmNsb25lKCkuaXhvcih0aGlzKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUudXhvciA9IGZ1bmN0aW9uIHV4b3IgKG51bSkge1xuICAgIGlmICh0aGlzLmxlbmd0aCA+IG51bS5sZW5ndGgpIHJldHVybiB0aGlzLmNsb25lKCkuaXV4b3IobnVtKTtcbiAgICByZXR1cm4gbnVtLmNsb25lKCkuaXV4b3IodGhpcyk7XG4gIH07XG5cbiAgLy8gTm90IGBgdGhpc2BgIHdpdGggYGB3aWR0aGBgIGJpdHdpZHRoXG4gIEJOLnByb3RvdHlwZS5pbm90biA9IGZ1bmN0aW9uIGlub3RuICh3aWR0aCkge1xuICAgIGFzc2VydCh0eXBlb2Ygd2lkdGggPT09ICdudW1iZXInICYmIHdpZHRoID49IDApO1xuXG4gICAgdmFyIGJ5dGVzTmVlZGVkID0gTWF0aC5jZWlsKHdpZHRoIC8gMjYpIHwgMDtcbiAgICB2YXIgYml0c0xlZnQgPSB3aWR0aCAlIDI2O1xuXG4gICAgLy8gRXh0ZW5kIHRoZSBidWZmZXIgd2l0aCBsZWFkaW5nIHplcm9lc1xuICAgIHRoaXMuX2V4cGFuZChieXRlc05lZWRlZCk7XG5cbiAgICBpZiAoYml0c0xlZnQgPiAwKSB7XG4gICAgICBieXRlc05lZWRlZC0tO1xuICAgIH1cblxuICAgIC8vIEhhbmRsZSBjb21wbGV0ZSB3b3Jkc1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYnl0ZXNOZWVkZWQ7IGkrKykge1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IH50aGlzLndvcmRzW2ldICYgMHgzZmZmZmZmO1xuICAgIH1cblxuICAgIC8vIEhhbmRsZSB0aGUgcmVzaWR1ZVxuICAgIGlmIChiaXRzTGVmdCA+IDApIHtcbiAgICAgIHRoaXMud29yZHNbaV0gPSB+dGhpcy53b3Jkc1tpXSAmICgweDNmZmZmZmYgPj4gKDI2IC0gYml0c0xlZnQpKTtcbiAgICB9XG5cbiAgICAvLyBBbmQgcmVtb3ZlIGxlYWRpbmcgemVyb2VzXG4gICAgcmV0dXJuIHRoaXMuc3RyaXAoKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUubm90biA9IGZ1bmN0aW9uIG5vdG4gKHdpZHRoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUoKS5pbm90bih3aWR0aCk7XG4gIH07XG5cbiAgLy8gU2V0IGBiaXRgIG9mIGB0aGlzYFxuICBCTi5wcm90b3R5cGUuc2V0biA9IGZ1bmN0aW9uIHNldG4gKGJpdCwgdmFsKSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBiaXQgPT09ICdudW1iZXInICYmIGJpdCA+PSAwKTtcblxuICAgIHZhciBvZmYgPSAoYml0IC8gMjYpIHwgMDtcbiAgICB2YXIgd2JpdCA9IGJpdCAlIDI2O1xuXG4gICAgdGhpcy5fZXhwYW5kKG9mZiArIDEpO1xuXG4gICAgaWYgKHZhbCkge1xuICAgICAgdGhpcy53b3Jkc1tvZmZdID0gdGhpcy53b3Jkc1tvZmZdIHwgKDEgPDwgd2JpdCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMud29yZHNbb2ZmXSA9IHRoaXMud29yZHNbb2ZmXSAmIH4oMSA8PCB3Yml0KTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5zdHJpcCgpO1xuICB9O1xuXG4gIC8vIEFkZCBgbnVtYCB0byBgdGhpc2AgaW4tcGxhY2VcbiAgQk4ucHJvdG90eXBlLmlhZGQgPSBmdW5jdGlvbiBpYWRkIChudW0pIHtcbiAgICB2YXIgcjtcblxuICAgIC8vIG5lZ2F0aXZlICsgcG9zaXRpdmVcbiAgICBpZiAodGhpcy5uZWdhdGl2ZSAhPT0gMCAmJiBudW0ubmVnYXRpdmUgPT09IDApIHtcbiAgICAgIHRoaXMubmVnYXRpdmUgPSAwO1xuICAgICAgciA9IHRoaXMuaXN1YihudW0pO1xuICAgICAgdGhpcy5uZWdhdGl2ZSBePSAxO1xuICAgICAgcmV0dXJuIHRoaXMuX25vcm1TaWduKCk7XG5cbiAgICAvLyBwb3NpdGl2ZSArIG5lZ2F0aXZlXG4gICAgfSBlbHNlIGlmICh0aGlzLm5lZ2F0aXZlID09PSAwICYmIG51bS5uZWdhdGl2ZSAhPT0gMCkge1xuICAgICAgbnVtLm5lZ2F0aXZlID0gMDtcbiAgICAgIHIgPSB0aGlzLmlzdWIobnVtKTtcbiAgICAgIG51bS5uZWdhdGl2ZSA9IDE7XG4gICAgICByZXR1cm4gci5fbm9ybVNpZ24oKTtcbiAgICB9XG5cbiAgICAvLyBhLmxlbmd0aCA+IGIubGVuZ3RoXG4gICAgdmFyIGEsIGI7XG4gICAgaWYgKHRoaXMubGVuZ3RoID4gbnVtLmxlbmd0aCkge1xuICAgICAgYSA9IHRoaXM7XG4gICAgICBiID0gbnVtO1xuICAgIH0gZWxzZSB7XG4gICAgICBhID0gbnVtO1xuICAgICAgYiA9IHRoaXM7XG4gICAgfVxuXG4gICAgdmFyIGNhcnJ5ID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGIubGVuZ3RoOyBpKyspIHtcbiAgICAgIHIgPSAoYS53b3Jkc1tpXSB8IDApICsgKGIud29yZHNbaV0gfCAwKSArIGNhcnJ5O1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IHIgJiAweDNmZmZmZmY7XG4gICAgICBjYXJyeSA9IHIgPj4+IDI2O1xuICAgIH1cbiAgICBmb3IgKDsgY2FycnkgIT09IDAgJiYgaSA8IGEubGVuZ3RoOyBpKyspIHtcbiAgICAgIHIgPSAoYS53b3Jkc1tpXSB8IDApICsgY2Fycnk7XG4gICAgICB0aGlzLndvcmRzW2ldID0gciAmIDB4M2ZmZmZmZjtcbiAgICAgIGNhcnJ5ID0gciA+Pj4gMjY7XG4gICAgfVxuXG4gICAgdGhpcy5sZW5ndGggPSBhLmxlbmd0aDtcbiAgICBpZiAoY2FycnkgIT09IDApIHtcbiAgICAgIHRoaXMud29yZHNbdGhpcy5sZW5ndGhdID0gY2Fycnk7XG4gICAgICB0aGlzLmxlbmd0aCsrO1xuICAgIC8vIENvcHkgdGhlIHJlc3Qgb2YgdGhlIHdvcmRzXG4gICAgfSBlbHNlIGlmIChhICE9PSB0aGlzKSB7XG4gICAgICBmb3IgKDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdGhpcy53b3Jkc1tpXSA9IGEud29yZHNbaV07XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgLy8gQWRkIGBudW1gIHRvIGB0aGlzYFxuICBCTi5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gYWRkIChudW0pIHtcbiAgICB2YXIgcmVzO1xuICAgIGlmIChudW0ubmVnYXRpdmUgIT09IDAgJiYgdGhpcy5uZWdhdGl2ZSA9PT0gMCkge1xuICAgICAgbnVtLm5lZ2F0aXZlID0gMDtcbiAgICAgIHJlcyA9IHRoaXMuc3ViKG51bSk7XG4gICAgICBudW0ubmVnYXRpdmUgXj0gMTtcbiAgICAgIHJldHVybiByZXM7XG4gICAgfSBlbHNlIGlmIChudW0ubmVnYXRpdmUgPT09IDAgJiYgdGhpcy5uZWdhdGl2ZSAhPT0gMCkge1xuICAgICAgdGhpcy5uZWdhdGl2ZSA9IDA7XG4gICAgICByZXMgPSBudW0uc3ViKHRoaXMpO1xuICAgICAgdGhpcy5uZWdhdGl2ZSA9IDE7XG4gICAgICByZXR1cm4gcmVzO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmxlbmd0aCA+IG51bS5sZW5ndGgpIHJldHVybiB0aGlzLmNsb25lKCkuaWFkZChudW0pO1xuXG4gICAgcmV0dXJuIG51bS5jbG9uZSgpLmlhZGQodGhpcyk7XG4gIH07XG5cbiAgLy8gU3VidHJhY3QgYG51bWAgZnJvbSBgdGhpc2AgaW4tcGxhY2VcbiAgQk4ucHJvdG90eXBlLmlzdWIgPSBmdW5jdGlvbiBpc3ViIChudW0pIHtcbiAgICAvLyB0aGlzIC0gKC1udW0pID0gdGhpcyArIG51bVxuICAgIGlmIChudW0ubmVnYXRpdmUgIT09IDApIHtcbiAgICAgIG51bS5uZWdhdGl2ZSA9IDA7XG4gICAgICB2YXIgciA9IHRoaXMuaWFkZChudW0pO1xuICAgICAgbnVtLm5lZ2F0aXZlID0gMTtcbiAgICAgIHJldHVybiByLl9ub3JtU2lnbigpO1xuXG4gICAgLy8gLXRoaXMgLSBudW0gPSAtKHRoaXMgKyBudW0pXG4gICAgfSBlbHNlIGlmICh0aGlzLm5lZ2F0aXZlICE9PSAwKSB7XG4gICAgICB0aGlzLm5lZ2F0aXZlID0gMDtcbiAgICAgIHRoaXMuaWFkZChudW0pO1xuICAgICAgdGhpcy5uZWdhdGl2ZSA9IDE7XG4gICAgICByZXR1cm4gdGhpcy5fbm9ybVNpZ24oKTtcbiAgICB9XG5cbiAgICAvLyBBdCB0aGlzIHBvaW50IGJvdGggbnVtYmVycyBhcmUgcG9zaXRpdmVcbiAgICB2YXIgY21wID0gdGhpcy5jbXAobnVtKTtcblxuICAgIC8vIE9wdGltaXphdGlvbiAtIHplcm9pZnlcbiAgICBpZiAoY21wID09PSAwKSB7XG4gICAgICB0aGlzLm5lZ2F0aXZlID0gMDtcbiAgICAgIHRoaXMubGVuZ3RoID0gMTtcbiAgICAgIHRoaXMud29yZHNbMF0gPSAwO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLy8gYSA+IGJcbiAgICB2YXIgYSwgYjtcbiAgICBpZiAoY21wID4gMCkge1xuICAgICAgYSA9IHRoaXM7XG4gICAgICBiID0gbnVtO1xuICAgIH0gZWxzZSB7XG4gICAgICBhID0gbnVtO1xuICAgICAgYiA9IHRoaXM7XG4gICAgfVxuXG4gICAgdmFyIGNhcnJ5ID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGIubGVuZ3RoOyBpKyspIHtcbiAgICAgIHIgPSAoYS53b3Jkc1tpXSB8IDApIC0gKGIud29yZHNbaV0gfCAwKSArIGNhcnJ5O1xuICAgICAgY2FycnkgPSByID4+IDI2O1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IHIgJiAweDNmZmZmZmY7XG4gICAgfVxuICAgIGZvciAoOyBjYXJyeSAhPT0gMCAmJiBpIDwgYS5sZW5ndGg7IGkrKykge1xuICAgICAgciA9IChhLndvcmRzW2ldIHwgMCkgKyBjYXJyeTtcbiAgICAgIGNhcnJ5ID0gciA+PiAyNjtcbiAgICAgIHRoaXMud29yZHNbaV0gPSByICYgMHgzZmZmZmZmO1xuICAgIH1cblxuICAgIC8vIENvcHkgcmVzdCBvZiB0aGUgd29yZHNcbiAgICBpZiAoY2FycnkgPT09IDAgJiYgaSA8IGEubGVuZ3RoICYmIGEgIT09IHRoaXMpIHtcbiAgICAgIGZvciAoOyBpIDwgYS5sZW5ndGg7IGkrKykge1xuICAgICAgICB0aGlzLndvcmRzW2ldID0gYS53b3Jkc1tpXTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLmxlbmd0aCA9IE1hdGgubWF4KHRoaXMubGVuZ3RoLCBpKTtcblxuICAgIGlmIChhICE9PSB0aGlzKSB7XG4gICAgICB0aGlzLm5lZ2F0aXZlID0gMTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5zdHJpcCgpO1xuICB9O1xuXG4gIC8vIFN1YnRyYWN0IGBudW1gIGZyb20gYHRoaXNgXG4gIEJOLnByb3RvdHlwZS5zdWIgPSBmdW5jdGlvbiBzdWIgKG51bSkge1xuICAgIHJldHVybiB0aGlzLmNsb25lKCkuaXN1YihudW0pO1xuICB9O1xuXG4gIGZ1bmN0aW9uIHNtYWxsTXVsVG8gKHNlbGYsIG51bSwgb3V0KSB7XG4gICAgb3V0Lm5lZ2F0aXZlID0gbnVtLm5lZ2F0aXZlIF4gc2VsZi5uZWdhdGl2ZTtcbiAgICB2YXIgbGVuID0gKHNlbGYubGVuZ3RoICsgbnVtLmxlbmd0aCkgfCAwO1xuICAgIG91dC5sZW5ndGggPSBsZW47XG4gICAgbGVuID0gKGxlbiAtIDEpIHwgMDtcblxuICAgIC8vIFBlZWwgb25lIGl0ZXJhdGlvbiAoY29tcGlsZXIgY2FuJ3QgZG8gaXQsIGJlY2F1c2Ugb2YgY29kZSBjb21wbGV4aXR5KVxuICAgIHZhciBhID0gc2VsZi53b3Jkc1swXSB8IDA7XG4gICAgdmFyIGIgPSBudW0ud29yZHNbMF0gfCAwO1xuICAgIHZhciByID0gYSAqIGI7XG5cbiAgICB2YXIgbG8gPSByICYgMHgzZmZmZmZmO1xuICAgIHZhciBjYXJyeSA9IChyIC8gMHg0MDAwMDAwKSB8IDA7XG4gICAgb3V0LndvcmRzWzBdID0gbG87XG5cbiAgICBmb3IgKHZhciBrID0gMTsgayA8IGxlbjsgaysrKSB7XG4gICAgICAvLyBTdW0gYWxsIHdvcmRzIHdpdGggdGhlIHNhbWUgYGkgKyBqID0ga2AgYW5kIGFjY3VtdWxhdGUgYG5jYXJyeWAsXG4gICAgICAvLyBub3RlIHRoYXQgbmNhcnJ5IGNvdWxkIGJlID49IDB4M2ZmZmZmZlxuICAgICAgdmFyIG5jYXJyeSA9IGNhcnJ5ID4+PiAyNjtcbiAgICAgIHZhciByd29yZCA9IGNhcnJ5ICYgMHgzZmZmZmZmO1xuICAgICAgdmFyIG1heEogPSBNYXRoLm1pbihrLCBudW0ubGVuZ3RoIC0gMSk7XG4gICAgICBmb3IgKHZhciBqID0gTWF0aC5tYXgoMCwgayAtIHNlbGYubGVuZ3RoICsgMSk7IGogPD0gbWF4SjsgaisrKSB7XG4gICAgICAgIHZhciBpID0gKGsgLSBqKSB8IDA7XG4gICAgICAgIGEgPSBzZWxmLndvcmRzW2ldIHwgMDtcbiAgICAgICAgYiA9IG51bS53b3Jkc1tqXSB8IDA7XG4gICAgICAgIHIgPSBhICogYiArIHJ3b3JkO1xuICAgICAgICBuY2FycnkgKz0gKHIgLyAweDQwMDAwMDApIHwgMDtcbiAgICAgICAgcndvcmQgPSByICYgMHgzZmZmZmZmO1xuICAgICAgfVxuICAgICAgb3V0LndvcmRzW2tdID0gcndvcmQgfCAwO1xuICAgICAgY2FycnkgPSBuY2FycnkgfCAwO1xuICAgIH1cbiAgICBpZiAoY2FycnkgIT09IDApIHtcbiAgICAgIG91dC53b3Jkc1trXSA9IGNhcnJ5IHwgMDtcbiAgICB9IGVsc2Uge1xuICAgICAgb3V0Lmxlbmd0aC0tO1xuICAgIH1cblxuICAgIHJldHVybiBvdXQuc3RyaXAoKTtcbiAgfVxuXG4gIC8vIFRPRE8oaW5kdXRueSk6IGl0IG1heSBiZSByZWFzb25hYmxlIHRvIG9taXQgaXQgZm9yIHVzZXJzIHdobyBkb24ndCBuZWVkXG4gIC8vIHRvIHdvcmsgd2l0aCAyNTYtYml0IG51bWJlcnMsIG90aGVyd2lzZSBpdCBnaXZlcyAyMCUgaW1wcm92ZW1lbnQgZm9yIDI1Ni1iaXRcbiAgLy8gbXVsdGlwbGljYXRpb24gKGxpa2UgZWxsaXB0aWMgc2VjcDI1NmsxKS5cbiAgdmFyIGNvbWIxME11bFRvID0gZnVuY3Rpb24gY29tYjEwTXVsVG8gKHNlbGYsIG51bSwgb3V0KSB7XG4gICAgdmFyIGEgPSBzZWxmLndvcmRzO1xuICAgIHZhciBiID0gbnVtLndvcmRzO1xuICAgIHZhciBvID0gb3V0LndvcmRzO1xuICAgIHZhciBjID0gMDtcbiAgICB2YXIgbG87XG4gICAgdmFyIG1pZDtcbiAgICB2YXIgaGk7XG4gICAgdmFyIGEwID0gYVswXSB8IDA7XG4gICAgdmFyIGFsMCA9IGEwICYgMHgxZmZmO1xuICAgIHZhciBhaDAgPSBhMCA+Pj4gMTM7XG4gICAgdmFyIGExID0gYVsxXSB8IDA7XG4gICAgdmFyIGFsMSA9IGExICYgMHgxZmZmO1xuICAgIHZhciBhaDEgPSBhMSA+Pj4gMTM7XG4gICAgdmFyIGEyID0gYVsyXSB8IDA7XG4gICAgdmFyIGFsMiA9IGEyICYgMHgxZmZmO1xuICAgIHZhciBhaDIgPSBhMiA+Pj4gMTM7XG4gICAgdmFyIGEzID0gYVszXSB8IDA7XG4gICAgdmFyIGFsMyA9IGEzICYgMHgxZmZmO1xuICAgIHZhciBhaDMgPSBhMyA+Pj4gMTM7XG4gICAgdmFyIGE0ID0gYVs0XSB8IDA7XG4gICAgdmFyIGFsNCA9IGE0ICYgMHgxZmZmO1xuICAgIHZhciBhaDQgPSBhNCA+Pj4gMTM7XG4gICAgdmFyIGE1ID0gYVs1XSB8IDA7XG4gICAgdmFyIGFsNSA9IGE1ICYgMHgxZmZmO1xuICAgIHZhciBhaDUgPSBhNSA+Pj4gMTM7XG4gICAgdmFyIGE2ID0gYVs2XSB8IDA7XG4gICAgdmFyIGFsNiA9IGE2ICYgMHgxZmZmO1xuICAgIHZhciBhaDYgPSBhNiA+Pj4gMTM7XG4gICAgdmFyIGE3ID0gYVs3XSB8IDA7XG4gICAgdmFyIGFsNyA9IGE3ICYgMHgxZmZmO1xuICAgIHZhciBhaDcgPSBhNyA+Pj4gMTM7XG4gICAgdmFyIGE4ID0gYVs4XSB8IDA7XG4gICAgdmFyIGFsOCA9IGE4ICYgMHgxZmZmO1xuICAgIHZhciBhaDggPSBhOCA+Pj4gMTM7XG4gICAgdmFyIGE5ID0gYVs5XSB8IDA7XG4gICAgdmFyIGFsOSA9IGE5ICYgMHgxZmZmO1xuICAgIHZhciBhaDkgPSBhOSA+Pj4gMTM7XG4gICAgdmFyIGIwID0gYlswXSB8IDA7XG4gICAgdmFyIGJsMCA9IGIwICYgMHgxZmZmO1xuICAgIHZhciBiaDAgPSBiMCA+Pj4gMTM7XG4gICAgdmFyIGIxID0gYlsxXSB8IDA7XG4gICAgdmFyIGJsMSA9IGIxICYgMHgxZmZmO1xuICAgIHZhciBiaDEgPSBiMSA+Pj4gMTM7XG4gICAgdmFyIGIyID0gYlsyXSB8IDA7XG4gICAgdmFyIGJsMiA9IGIyICYgMHgxZmZmO1xuICAgIHZhciBiaDIgPSBiMiA+Pj4gMTM7XG4gICAgdmFyIGIzID0gYlszXSB8IDA7XG4gICAgdmFyIGJsMyA9IGIzICYgMHgxZmZmO1xuICAgIHZhciBiaDMgPSBiMyA+Pj4gMTM7XG4gICAgdmFyIGI0ID0gYls0XSB8IDA7XG4gICAgdmFyIGJsNCA9IGI0ICYgMHgxZmZmO1xuICAgIHZhciBiaDQgPSBiNCA+Pj4gMTM7XG4gICAgdmFyIGI1ID0gYls1XSB8IDA7XG4gICAgdmFyIGJsNSA9IGI1ICYgMHgxZmZmO1xuICAgIHZhciBiaDUgPSBiNSA+Pj4gMTM7XG4gICAgdmFyIGI2ID0gYls2XSB8IDA7XG4gICAgdmFyIGJsNiA9IGI2ICYgMHgxZmZmO1xuICAgIHZhciBiaDYgPSBiNiA+Pj4gMTM7XG4gICAgdmFyIGI3ID0gYls3XSB8IDA7XG4gICAgdmFyIGJsNyA9IGI3ICYgMHgxZmZmO1xuICAgIHZhciBiaDcgPSBiNyA+Pj4gMTM7XG4gICAgdmFyIGI4ID0gYls4XSB8IDA7XG4gICAgdmFyIGJsOCA9IGI4ICYgMHgxZmZmO1xuICAgIHZhciBiaDggPSBiOCA+Pj4gMTM7XG4gICAgdmFyIGI5ID0gYls5XSB8IDA7XG4gICAgdmFyIGJsOSA9IGI5ICYgMHgxZmZmO1xuICAgIHZhciBiaDkgPSBiOSA+Pj4gMTM7XG5cbiAgICBvdXQubmVnYXRpdmUgPSBzZWxmLm5lZ2F0aXZlIF4gbnVtLm5lZ2F0aXZlO1xuICAgIG91dC5sZW5ndGggPSAxOTtcbiAgICAvKiBrID0gMCAqL1xuICAgIGxvID0gTWF0aC5pbXVsKGFsMCwgYmwwKTtcbiAgICBtaWQgPSBNYXRoLmltdWwoYWwwLCBiaDApO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgwLCBibDApKSB8IDA7XG4gICAgaGkgPSBNYXRoLmltdWwoYWgwLCBiaDApO1xuICAgIHZhciB3MCA9ICgoKGMgKyBsbykgfCAwKSArICgobWlkICYgMHgxZmZmKSA8PCAxMykpIHwgMDtcbiAgICBjID0gKCgoaGkgKyAobWlkID4+PiAxMykpIHwgMCkgKyAodzAgPj4+IDI2KSkgfCAwO1xuICAgIHcwICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gMSAqL1xuICAgIGxvID0gTWF0aC5pbXVsKGFsMSwgYmwwKTtcbiAgICBtaWQgPSBNYXRoLmltdWwoYWwxLCBiaDApO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgxLCBibDApKSB8IDA7XG4gICAgaGkgPSBNYXRoLmltdWwoYWgxLCBiaDApO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMCwgYmwxKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwwLCBiaDEpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDAsIGJsMSkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDAsIGJoMSkpIHwgMDtcbiAgICB2YXIgdzEgPSAoKChjICsgbG8pIHwgMCkgKyAoKG1pZCAmIDB4MWZmZikgPDwgMTMpKSB8IDA7XG4gICAgYyA9ICgoKGhpICsgKG1pZCA+Pj4gMTMpKSB8IDApICsgKHcxID4+PiAyNikpIHwgMDtcbiAgICB3MSAmPSAweDNmZmZmZmY7XG4gICAgLyogayA9IDIgKi9cbiAgICBsbyA9IE1hdGguaW11bChhbDIsIGJsMCk7XG4gICAgbWlkID0gTWF0aC5pbXVsKGFsMiwgYmgwKTtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMiwgYmwwKSkgfCAwO1xuICAgIGhpID0gTWF0aC5pbXVsKGFoMiwgYmgwKTtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDEsIGJsMSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsMSwgYmgxKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgxLCBibDEpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWgxLCBiaDEpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwwLCBibDIpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDAsIGJoMikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMCwgYmwyKSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMCwgYmgyKSkgfCAwO1xuICAgIHZhciB3MiA9ICgoKGMgKyBsbykgfCAwKSArICgobWlkICYgMHgxZmZmKSA8PCAxMykpIHwgMDtcbiAgICBjID0gKCgoaGkgKyAobWlkID4+PiAxMykpIHwgMCkgKyAodzIgPj4+IDI2KSkgfCAwO1xuICAgIHcyICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gMyAqL1xuICAgIGxvID0gTWF0aC5pbXVsKGFsMywgYmwwKTtcbiAgICBtaWQgPSBNYXRoLmltdWwoYWwzLCBiaDApO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgzLCBibDApKSB8IDA7XG4gICAgaGkgPSBNYXRoLmltdWwoYWgzLCBiaDApO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMiwgYmwxKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwyLCBiaDEpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDIsIGJsMSkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDIsIGJoMSkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDEsIGJsMikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsMSwgYmgyKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgxLCBibDIpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWgxLCBiaDIpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwwLCBibDMpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDAsIGJoMykpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMCwgYmwzKSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMCwgYmgzKSkgfCAwO1xuICAgIHZhciB3MyA9ICgoKGMgKyBsbykgfCAwKSArICgobWlkICYgMHgxZmZmKSA8PCAxMykpIHwgMDtcbiAgICBjID0gKCgoaGkgKyAobWlkID4+PiAxMykpIHwgMCkgKyAodzMgPj4+IDI2KSkgfCAwO1xuICAgIHczICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gNCAqL1xuICAgIGxvID0gTWF0aC5pbXVsKGFsNCwgYmwwKTtcbiAgICBtaWQgPSBNYXRoLmltdWwoYWw0LCBiaDApO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg0LCBibDApKSB8IDA7XG4gICAgaGkgPSBNYXRoLmltdWwoYWg0LCBiaDApO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMywgYmwxKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwzLCBiaDEpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDMsIGJsMSkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDMsIGJoMSkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDIsIGJsMikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsMiwgYmgyKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgyLCBibDIpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWgyLCBiaDIpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwxLCBibDMpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDEsIGJoMykpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMSwgYmwzKSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMSwgYmgzKSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMCwgYmw0KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwwLCBiaDQpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDAsIGJsNCkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDAsIGJoNCkpIHwgMDtcbiAgICB2YXIgdzQgPSAoKChjICsgbG8pIHwgMCkgKyAoKG1pZCAmIDB4MWZmZikgPDwgMTMpKSB8IDA7XG4gICAgYyA9ICgoKGhpICsgKG1pZCA+Pj4gMTMpKSB8IDApICsgKHc0ID4+PiAyNikpIHwgMDtcbiAgICB3NCAmPSAweDNmZmZmZmY7XG4gICAgLyogayA9IDUgKi9cbiAgICBsbyA9IE1hdGguaW11bChhbDUsIGJsMCk7XG4gICAgbWlkID0gTWF0aC5pbXVsKGFsNSwgYmgwKTtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNSwgYmwwKSkgfCAwO1xuICAgIGhpID0gTWF0aC5pbXVsKGFoNSwgYmgwKTtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDQsIGJsMSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNCwgYmgxKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg0LCBibDEpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg0LCBiaDEpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwzLCBibDIpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDMsIGJoMikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMywgYmwyKSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMywgYmgyKSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMiwgYmwzKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwyLCBiaDMpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDIsIGJsMykpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDIsIGJoMykpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDEsIGJsNCkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsMSwgYmg0KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgxLCBibDQpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWgxLCBiaDQpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwwLCBibDUpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDAsIGJoNSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMCwgYmw1KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMCwgYmg1KSkgfCAwO1xuICAgIHZhciB3NSA9ICgoKGMgKyBsbykgfCAwKSArICgobWlkICYgMHgxZmZmKSA8PCAxMykpIHwgMDtcbiAgICBjID0gKCgoaGkgKyAobWlkID4+PiAxMykpIHwgMCkgKyAodzUgPj4+IDI2KSkgfCAwO1xuICAgIHc1ICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gNiAqL1xuICAgIGxvID0gTWF0aC5pbXVsKGFsNiwgYmwwKTtcbiAgICBtaWQgPSBNYXRoLmltdWwoYWw2LCBiaDApO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg2LCBibDApKSB8IDA7XG4gICAgaGkgPSBNYXRoLmltdWwoYWg2LCBiaDApO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsNSwgYmwxKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw1LCBiaDEpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDUsIGJsMSkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDUsIGJoMSkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDQsIGJsMikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNCwgYmgyKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg0LCBibDIpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg0LCBiaDIpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwzLCBibDMpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDMsIGJoMykpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMywgYmwzKSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMywgYmgzKSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMiwgYmw0KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwyLCBiaDQpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDIsIGJsNCkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDIsIGJoNCkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDEsIGJsNSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsMSwgYmg1KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgxLCBibDUpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWgxLCBiaDUpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwwLCBibDYpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDAsIGJoNikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMCwgYmw2KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMCwgYmg2KSkgfCAwO1xuICAgIHZhciB3NiA9ICgoKGMgKyBsbykgfCAwKSArICgobWlkICYgMHgxZmZmKSA8PCAxMykpIHwgMDtcbiAgICBjID0gKCgoaGkgKyAobWlkID4+PiAxMykpIHwgMCkgKyAodzYgPj4+IDI2KSkgfCAwO1xuICAgIHc2ICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gNyAqL1xuICAgIGxvID0gTWF0aC5pbXVsKGFsNywgYmwwKTtcbiAgICBtaWQgPSBNYXRoLmltdWwoYWw3LCBiaDApO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg3LCBibDApKSB8IDA7XG4gICAgaGkgPSBNYXRoLmltdWwoYWg3LCBiaDApO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsNiwgYmwxKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw2LCBiaDEpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDYsIGJsMSkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDYsIGJoMSkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDUsIGJsMikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNSwgYmgyKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg1LCBibDIpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg1LCBiaDIpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw0LCBibDMpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDQsIGJoMykpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNCwgYmwzKSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNCwgYmgzKSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMywgYmw0KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwzLCBiaDQpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDMsIGJsNCkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDMsIGJoNCkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDIsIGJsNSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsMiwgYmg1KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgyLCBibDUpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWgyLCBiaDUpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwxLCBibDYpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDEsIGJoNikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMSwgYmw2KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMSwgYmg2KSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMCwgYmw3KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwwLCBiaDcpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDAsIGJsNykpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDAsIGJoNykpIHwgMDtcbiAgICB2YXIgdzcgPSAoKChjICsgbG8pIHwgMCkgKyAoKG1pZCAmIDB4MWZmZikgPDwgMTMpKSB8IDA7XG4gICAgYyA9ICgoKGhpICsgKG1pZCA+Pj4gMTMpKSB8IDApICsgKHc3ID4+PiAyNikpIHwgMDtcbiAgICB3NyAmPSAweDNmZmZmZmY7XG4gICAgLyogayA9IDggKi9cbiAgICBsbyA9IE1hdGguaW11bChhbDgsIGJsMCk7XG4gICAgbWlkID0gTWF0aC5pbXVsKGFsOCwgYmgwKTtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoOCwgYmwwKSkgfCAwO1xuICAgIGhpID0gTWF0aC5pbXVsKGFoOCwgYmgwKTtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDcsIGJsMSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNywgYmgxKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg3LCBibDEpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg3LCBiaDEpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw2LCBibDIpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDYsIGJoMikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNiwgYmwyKSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNiwgYmgyKSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsNSwgYmwzKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw1LCBiaDMpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDUsIGJsMykpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDUsIGJoMykpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDQsIGJsNCkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNCwgYmg0KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg0LCBibDQpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg0LCBiaDQpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwzLCBibDUpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDMsIGJoNSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMywgYmw1KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMywgYmg1KSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMiwgYmw2KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwyLCBiaDYpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDIsIGJsNikpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDIsIGJoNikpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDEsIGJsNykpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsMSwgYmg3KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgxLCBibDcpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWgxLCBiaDcpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwwLCBibDgpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDAsIGJoOCkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMCwgYmw4KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMCwgYmg4KSkgfCAwO1xuICAgIHZhciB3OCA9ICgoKGMgKyBsbykgfCAwKSArICgobWlkICYgMHgxZmZmKSA8PCAxMykpIHwgMDtcbiAgICBjID0gKCgoaGkgKyAobWlkID4+PiAxMykpIHwgMCkgKyAodzggPj4+IDI2KSkgfCAwO1xuICAgIHc4ICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gOSAqL1xuICAgIGxvID0gTWF0aC5pbXVsKGFsOSwgYmwwKTtcbiAgICBtaWQgPSBNYXRoLmltdWwoYWw5LCBiaDApO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg5LCBibDApKSB8IDA7XG4gICAgaGkgPSBNYXRoLmltdWwoYWg5LCBiaDApO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsOCwgYmwxKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw4LCBiaDEpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDgsIGJsMSkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDgsIGJoMSkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDcsIGJsMikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNywgYmgyKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg3LCBibDIpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg3LCBiaDIpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw2LCBibDMpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDYsIGJoMykpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNiwgYmwzKSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNiwgYmgzKSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsNSwgYmw0KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw1LCBiaDQpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDUsIGJsNCkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDUsIGJoNCkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDQsIGJsNSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNCwgYmg1KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg0LCBibDUpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg0LCBiaDUpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwzLCBibDYpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDMsIGJoNikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMywgYmw2KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMywgYmg2KSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMiwgYmw3KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwyLCBiaDcpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDIsIGJsNykpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDIsIGJoNykpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDEsIGJsOCkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsMSwgYmg4KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgxLCBibDgpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWgxLCBiaDgpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwwLCBibDkpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDAsIGJoOSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMCwgYmw5KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMCwgYmg5KSkgfCAwO1xuICAgIHZhciB3OSA9ICgoKGMgKyBsbykgfCAwKSArICgobWlkICYgMHgxZmZmKSA8PCAxMykpIHwgMDtcbiAgICBjID0gKCgoaGkgKyAobWlkID4+PiAxMykpIHwgMCkgKyAodzkgPj4+IDI2KSkgfCAwO1xuICAgIHc5ICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gMTAgKi9cbiAgICBsbyA9IE1hdGguaW11bChhbDksIGJsMSk7XG4gICAgbWlkID0gTWF0aC5pbXVsKGFsOSwgYmgxKTtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoOSwgYmwxKSkgfCAwO1xuICAgIGhpID0gTWF0aC5pbXVsKGFoOSwgYmgxKTtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDgsIGJsMikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsOCwgYmgyKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg4LCBibDIpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg4LCBiaDIpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw3LCBibDMpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDcsIGJoMykpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNywgYmwzKSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNywgYmgzKSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsNiwgYmw0KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw2LCBiaDQpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDYsIGJsNCkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDYsIGJoNCkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDUsIGJsNSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNSwgYmg1KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg1LCBibDUpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg1LCBiaDUpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw0LCBibDYpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDQsIGJoNikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNCwgYmw2KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNCwgYmg2KSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMywgYmw3KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwzLCBiaDcpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDMsIGJsNykpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDMsIGJoNykpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDIsIGJsOCkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsMiwgYmg4KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgyLCBibDgpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWgyLCBiaDgpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwxLCBibDkpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDEsIGJoOSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMSwgYmw5KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMSwgYmg5KSkgfCAwO1xuICAgIHZhciB3MTAgPSAoKChjICsgbG8pIHwgMCkgKyAoKG1pZCAmIDB4MWZmZikgPDwgMTMpKSB8IDA7XG4gICAgYyA9ICgoKGhpICsgKG1pZCA+Pj4gMTMpKSB8IDApICsgKHcxMCA+Pj4gMjYpKSB8IDA7XG4gICAgdzEwICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gMTEgKi9cbiAgICBsbyA9IE1hdGguaW11bChhbDksIGJsMik7XG4gICAgbWlkID0gTWF0aC5pbXVsKGFsOSwgYmgyKTtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoOSwgYmwyKSkgfCAwO1xuICAgIGhpID0gTWF0aC5pbXVsKGFoOSwgYmgyKTtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDgsIGJsMykpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsOCwgYmgzKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg4LCBibDMpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg4LCBiaDMpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw3LCBibDQpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDcsIGJoNCkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNywgYmw0KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNywgYmg0KSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsNiwgYmw1KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw2LCBiaDUpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDYsIGJsNSkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDYsIGJoNSkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDUsIGJsNikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNSwgYmg2KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg1LCBibDYpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg1LCBiaDYpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw0LCBibDcpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDQsIGJoNykpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNCwgYmw3KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNCwgYmg3KSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMywgYmw4KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwzLCBiaDgpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDMsIGJsOCkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDMsIGJoOCkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDIsIGJsOSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsMiwgYmg5KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgyLCBibDkpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWgyLCBiaDkpKSB8IDA7XG4gICAgdmFyIHcxMSA9ICgoKGMgKyBsbykgfCAwKSArICgobWlkICYgMHgxZmZmKSA8PCAxMykpIHwgMDtcbiAgICBjID0gKCgoaGkgKyAobWlkID4+PiAxMykpIHwgMCkgKyAodzExID4+PiAyNikpIHwgMDtcbiAgICB3MTEgJj0gMHgzZmZmZmZmO1xuICAgIC8qIGsgPSAxMiAqL1xuICAgIGxvID0gTWF0aC5pbXVsKGFsOSwgYmwzKTtcbiAgICBtaWQgPSBNYXRoLmltdWwoYWw5LCBiaDMpO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg5LCBibDMpKSB8IDA7XG4gICAgaGkgPSBNYXRoLmltdWwoYWg5LCBiaDMpO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsOCwgYmw0KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw4LCBiaDQpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDgsIGJsNCkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDgsIGJoNCkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDcsIGJsNSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNywgYmg1KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg3LCBibDUpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg3LCBiaDUpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw2LCBibDYpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDYsIGJoNikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNiwgYmw2KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNiwgYmg2KSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsNSwgYmw3KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw1LCBiaDcpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDUsIGJsNykpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDUsIGJoNykpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDQsIGJsOCkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNCwgYmg4KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg0LCBibDgpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg0LCBiaDgpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwzLCBibDkpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDMsIGJoOSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMywgYmw5KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMywgYmg5KSkgfCAwO1xuICAgIHZhciB3MTIgPSAoKChjICsgbG8pIHwgMCkgKyAoKG1pZCAmIDB4MWZmZikgPDwgMTMpKSB8IDA7XG4gICAgYyA9ICgoKGhpICsgKG1pZCA+Pj4gMTMpKSB8IDApICsgKHcxMiA+Pj4gMjYpKSB8IDA7XG4gICAgdzEyICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gMTMgKi9cbiAgICBsbyA9IE1hdGguaW11bChhbDksIGJsNCk7XG4gICAgbWlkID0gTWF0aC5pbXVsKGFsOSwgYmg0KTtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoOSwgYmw0KSkgfCAwO1xuICAgIGhpID0gTWF0aC5pbXVsKGFoOSwgYmg0KTtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDgsIGJsNSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsOCwgYmg1KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg4LCBibDUpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg4LCBiaDUpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw3LCBibDYpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDcsIGJoNikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNywgYmw2KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNywgYmg2KSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsNiwgYmw3KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw2LCBiaDcpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDYsIGJsNykpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDYsIGJoNykpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDUsIGJsOCkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNSwgYmg4KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg1LCBibDgpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg1LCBiaDgpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw0LCBibDkpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDQsIGJoOSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNCwgYmw5KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNCwgYmg5KSkgfCAwO1xuICAgIHZhciB3MTMgPSAoKChjICsgbG8pIHwgMCkgKyAoKG1pZCAmIDB4MWZmZikgPDwgMTMpKSB8IDA7XG4gICAgYyA9ICgoKGhpICsgKG1pZCA+Pj4gMTMpKSB8IDApICsgKHcxMyA+Pj4gMjYpKSB8IDA7XG4gICAgdzEzICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gMTQgKi9cbiAgICBsbyA9IE1hdGguaW11bChhbDksIGJsNSk7XG4gICAgbWlkID0gTWF0aC5pbXVsKGFsOSwgYmg1KTtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoOSwgYmw1KSkgfCAwO1xuICAgIGhpID0gTWF0aC5pbXVsKGFoOSwgYmg1KTtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDgsIGJsNikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsOCwgYmg2KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg4LCBibDYpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg4LCBiaDYpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw3LCBibDcpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDcsIGJoNykpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNywgYmw3KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNywgYmg3KSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsNiwgYmw4KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw2LCBiaDgpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDYsIGJsOCkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDYsIGJoOCkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDUsIGJsOSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNSwgYmg5KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg1LCBibDkpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg1LCBiaDkpKSB8IDA7XG4gICAgdmFyIHcxNCA9ICgoKGMgKyBsbykgfCAwKSArICgobWlkICYgMHgxZmZmKSA8PCAxMykpIHwgMDtcbiAgICBjID0gKCgoaGkgKyAobWlkID4+PiAxMykpIHwgMCkgKyAodzE0ID4+PiAyNikpIHwgMDtcbiAgICB3MTQgJj0gMHgzZmZmZmZmO1xuICAgIC8qIGsgPSAxNSAqL1xuICAgIGxvID0gTWF0aC5pbXVsKGFsOSwgYmw2KTtcbiAgICBtaWQgPSBNYXRoLmltdWwoYWw5LCBiaDYpO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg5LCBibDYpKSB8IDA7XG4gICAgaGkgPSBNYXRoLmltdWwoYWg5LCBiaDYpO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsOCwgYmw3KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw4LCBiaDcpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDgsIGJsNykpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDgsIGJoNykpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDcsIGJsOCkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNywgYmg4KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg3LCBibDgpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg3LCBiaDgpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw2LCBibDkpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDYsIGJoOSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNiwgYmw5KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNiwgYmg5KSkgfCAwO1xuICAgIHZhciB3MTUgPSAoKChjICsgbG8pIHwgMCkgKyAoKG1pZCAmIDB4MWZmZikgPDwgMTMpKSB8IDA7XG4gICAgYyA9ICgoKGhpICsgKG1pZCA+Pj4gMTMpKSB8IDApICsgKHcxNSA+Pj4gMjYpKSB8IDA7XG4gICAgdzE1ICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gMTYgKi9cbiAgICBsbyA9IE1hdGguaW11bChhbDksIGJsNyk7XG4gICAgbWlkID0gTWF0aC5pbXVsKGFsOSwgYmg3KTtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoOSwgYmw3KSkgfCAwO1xuICAgIGhpID0gTWF0aC5pbXVsKGFoOSwgYmg3KTtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDgsIGJsOCkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsOCwgYmg4KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg4LCBibDgpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg4LCBiaDgpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw3LCBibDkpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDcsIGJoOSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNywgYmw5KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNywgYmg5KSkgfCAwO1xuICAgIHZhciB3MTYgPSAoKChjICsgbG8pIHwgMCkgKyAoKG1pZCAmIDB4MWZmZikgPDwgMTMpKSB8IDA7XG4gICAgYyA9ICgoKGhpICsgKG1pZCA+Pj4gMTMpKSB8IDApICsgKHcxNiA+Pj4gMjYpKSB8IDA7XG4gICAgdzE2ICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gMTcgKi9cbiAgICBsbyA9IE1hdGguaW11bChhbDksIGJsOCk7XG4gICAgbWlkID0gTWF0aC5pbXVsKGFsOSwgYmg4KTtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoOSwgYmw4KSkgfCAwO1xuICAgIGhpID0gTWF0aC5pbXVsKGFoOSwgYmg4KTtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDgsIGJsOSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsOCwgYmg5KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg4LCBibDkpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg4LCBiaDkpKSB8IDA7XG4gICAgdmFyIHcxNyA9ICgoKGMgKyBsbykgfCAwKSArICgobWlkICYgMHgxZmZmKSA8PCAxMykpIHwgMDtcbiAgICBjID0gKCgoaGkgKyAobWlkID4+PiAxMykpIHwgMCkgKyAodzE3ID4+PiAyNikpIHwgMDtcbiAgICB3MTcgJj0gMHgzZmZmZmZmO1xuICAgIC8qIGsgPSAxOCAqL1xuICAgIGxvID0gTWF0aC5pbXVsKGFsOSwgYmw5KTtcbiAgICBtaWQgPSBNYXRoLmltdWwoYWw5LCBiaDkpO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg5LCBibDkpKSB8IDA7XG4gICAgaGkgPSBNYXRoLmltdWwoYWg5LCBiaDkpO1xuICAgIHZhciB3MTggPSAoKChjICsgbG8pIHwgMCkgKyAoKG1pZCAmIDB4MWZmZikgPDwgMTMpKSB8IDA7XG4gICAgYyA9ICgoKGhpICsgKG1pZCA+Pj4gMTMpKSB8IDApICsgKHcxOCA+Pj4gMjYpKSB8IDA7XG4gICAgdzE4ICY9IDB4M2ZmZmZmZjtcbiAgICBvWzBdID0gdzA7XG4gICAgb1sxXSA9IHcxO1xuICAgIG9bMl0gPSB3MjtcbiAgICBvWzNdID0gdzM7XG4gICAgb1s0XSA9IHc0O1xuICAgIG9bNV0gPSB3NTtcbiAgICBvWzZdID0gdzY7XG4gICAgb1s3XSA9IHc3O1xuICAgIG9bOF0gPSB3ODtcbiAgICBvWzldID0gdzk7XG4gICAgb1sxMF0gPSB3MTA7XG4gICAgb1sxMV0gPSB3MTE7XG4gICAgb1sxMl0gPSB3MTI7XG4gICAgb1sxM10gPSB3MTM7XG4gICAgb1sxNF0gPSB3MTQ7XG4gICAgb1sxNV0gPSB3MTU7XG4gICAgb1sxNl0gPSB3MTY7XG4gICAgb1sxN10gPSB3MTc7XG4gICAgb1sxOF0gPSB3MTg7XG4gICAgaWYgKGMgIT09IDApIHtcbiAgICAgIG9bMTldID0gYztcbiAgICAgIG91dC5sZW5ndGgrKztcbiAgICB9XG4gICAgcmV0dXJuIG91dDtcbiAgfTtcblxuICAvLyBQb2x5ZmlsbCBjb21iXG4gIGlmICghTWF0aC5pbXVsKSB7XG4gICAgY29tYjEwTXVsVG8gPSBzbWFsbE11bFRvO1xuICB9XG5cbiAgZnVuY3Rpb24gYmlnTXVsVG8gKHNlbGYsIG51bSwgb3V0KSB7XG4gICAgb3V0Lm5lZ2F0aXZlID0gbnVtLm5lZ2F0aXZlIF4gc2VsZi5uZWdhdGl2ZTtcbiAgICBvdXQubGVuZ3RoID0gc2VsZi5sZW5ndGggKyBudW0ubGVuZ3RoO1xuXG4gICAgdmFyIGNhcnJ5ID0gMDtcbiAgICB2YXIgaG5jYXJyeSA9IDA7XG4gICAgZm9yICh2YXIgayA9IDA7IGsgPCBvdXQubGVuZ3RoIC0gMTsgaysrKSB7XG4gICAgICAvLyBTdW0gYWxsIHdvcmRzIHdpdGggdGhlIHNhbWUgYGkgKyBqID0ga2AgYW5kIGFjY3VtdWxhdGUgYG5jYXJyeWAsXG4gICAgICAvLyBub3RlIHRoYXQgbmNhcnJ5IGNvdWxkIGJlID49IDB4M2ZmZmZmZlxuICAgICAgdmFyIG5jYXJyeSA9IGhuY2Fycnk7XG4gICAgICBobmNhcnJ5ID0gMDtcbiAgICAgIHZhciByd29yZCA9IGNhcnJ5ICYgMHgzZmZmZmZmO1xuICAgICAgdmFyIG1heEogPSBNYXRoLm1pbihrLCBudW0ubGVuZ3RoIC0gMSk7XG4gICAgICBmb3IgKHZhciBqID0gTWF0aC5tYXgoMCwgayAtIHNlbGYubGVuZ3RoICsgMSk7IGogPD0gbWF4SjsgaisrKSB7XG4gICAgICAgIHZhciBpID0gayAtIGo7XG4gICAgICAgIHZhciBhID0gc2VsZi53b3Jkc1tpXSB8IDA7XG4gICAgICAgIHZhciBiID0gbnVtLndvcmRzW2pdIHwgMDtcbiAgICAgICAgdmFyIHIgPSBhICogYjtcblxuICAgICAgICB2YXIgbG8gPSByICYgMHgzZmZmZmZmO1xuICAgICAgICBuY2FycnkgPSAobmNhcnJ5ICsgKChyIC8gMHg0MDAwMDAwKSB8IDApKSB8IDA7XG4gICAgICAgIGxvID0gKGxvICsgcndvcmQpIHwgMDtcbiAgICAgICAgcndvcmQgPSBsbyAmIDB4M2ZmZmZmZjtcbiAgICAgICAgbmNhcnJ5ID0gKG5jYXJyeSArIChsbyA+Pj4gMjYpKSB8IDA7XG5cbiAgICAgICAgaG5jYXJyeSArPSBuY2FycnkgPj4+IDI2O1xuICAgICAgICBuY2FycnkgJj0gMHgzZmZmZmZmO1xuICAgICAgfVxuICAgICAgb3V0LndvcmRzW2tdID0gcndvcmQ7XG4gICAgICBjYXJyeSA9IG5jYXJyeTtcbiAgICAgIG5jYXJyeSA9IGhuY2Fycnk7XG4gICAgfVxuICAgIGlmIChjYXJyeSAhPT0gMCkge1xuICAgICAgb3V0LndvcmRzW2tdID0gY2Fycnk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dC5sZW5ndGgtLTtcbiAgICB9XG5cbiAgICByZXR1cm4gb3V0LnN0cmlwKCk7XG4gIH1cblxuICBmdW5jdGlvbiBqdW1ib011bFRvIChzZWxmLCBudW0sIG91dCkge1xuICAgIHZhciBmZnRtID0gbmV3IEZGVE0oKTtcbiAgICByZXR1cm4gZmZ0bS5tdWxwKHNlbGYsIG51bSwgb3V0KTtcbiAgfVxuXG4gIEJOLnByb3RvdHlwZS5tdWxUbyA9IGZ1bmN0aW9uIG11bFRvIChudW0sIG91dCkge1xuICAgIHZhciByZXM7XG4gICAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoICsgbnVtLmxlbmd0aDtcbiAgICBpZiAodGhpcy5sZW5ndGggPT09IDEwICYmIG51bS5sZW5ndGggPT09IDEwKSB7XG4gICAgICByZXMgPSBjb21iMTBNdWxUbyh0aGlzLCBudW0sIG91dCk7XG4gICAgfSBlbHNlIGlmIChsZW4gPCA2Mykge1xuICAgICAgcmVzID0gc21hbGxNdWxUbyh0aGlzLCBudW0sIG91dCk7XG4gICAgfSBlbHNlIGlmIChsZW4gPCAxMDI0KSB7XG4gICAgICByZXMgPSBiaWdNdWxUbyh0aGlzLCBudW0sIG91dCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlcyA9IGp1bWJvTXVsVG8odGhpcywgbnVtLCBvdXQpO1xuICAgIH1cblxuICAgIHJldHVybiByZXM7XG4gIH07XG5cbiAgLy8gQ29vbGV5LVR1a2V5IGFsZ29yaXRobSBmb3IgRkZUXG4gIC8vIHNsaWdodGx5IHJldmlzaXRlZCB0byByZWx5IG9uIGxvb3BpbmcgaW5zdGVhZCBvZiByZWN1cnNpb25cblxuICBmdW5jdGlvbiBGRlRNICh4LCB5KSB7XG4gICAgdGhpcy54ID0geDtcbiAgICB0aGlzLnkgPSB5O1xuICB9XG5cbiAgRkZUTS5wcm90b3R5cGUubWFrZVJCVCA9IGZ1bmN0aW9uIG1ha2VSQlQgKE4pIHtcbiAgICB2YXIgdCA9IG5ldyBBcnJheShOKTtcbiAgICB2YXIgbCA9IEJOLnByb3RvdHlwZS5fY291bnRCaXRzKE4pIC0gMTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IE47IGkrKykge1xuICAgICAgdFtpXSA9IHRoaXMucmV2QmluKGksIGwsIE4pO1xuICAgIH1cblxuICAgIHJldHVybiB0O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYmluYXJ5LXJldmVyc2VkIHJlcHJlc2VudGF0aW9uIG9mIGB4YFxuICBGRlRNLnByb3RvdHlwZS5yZXZCaW4gPSBmdW5jdGlvbiByZXZCaW4gKHgsIGwsIE4pIHtcbiAgICBpZiAoeCA9PT0gMCB8fCB4ID09PSBOIC0gMSkgcmV0dXJuIHg7XG5cbiAgICB2YXIgcmIgPSAwO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICByYiB8PSAoeCAmIDEpIDw8IChsIC0gaSAtIDEpO1xuICAgICAgeCA+Pj0gMTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmI7XG4gIH07XG5cbiAgLy8gUGVyZm9ybXMgXCJ0d2VlZGxpbmdcIiBwaGFzZSwgdGhlcmVmb3JlICdlbXVsYXRpbmcnXG4gIC8vIGJlaGF2aW91ciBvZiB0aGUgcmVjdXJzaXZlIGFsZ29yaXRobVxuICBGRlRNLnByb3RvdHlwZS5wZXJtdXRlID0gZnVuY3Rpb24gcGVybXV0ZSAocmJ0LCByd3MsIGl3cywgcnR3cywgaXR3cywgTikge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICBydHdzW2ldID0gcndzW3JidFtpXV07XG4gICAgICBpdHdzW2ldID0gaXdzW3JidFtpXV07XG4gICAgfVxuICB9O1xuXG4gIEZGVE0ucHJvdG90eXBlLnRyYW5zZm9ybSA9IGZ1bmN0aW9uIHRyYW5zZm9ybSAocndzLCBpd3MsIHJ0d3MsIGl0d3MsIE4sIHJidCkge1xuICAgIHRoaXMucGVybXV0ZShyYnQsIHJ3cywgaXdzLCBydHdzLCBpdHdzLCBOKTtcblxuICAgIGZvciAodmFyIHMgPSAxOyBzIDwgTjsgcyA8PD0gMSkge1xuICAgICAgdmFyIGwgPSBzIDw8IDE7XG5cbiAgICAgIHZhciBydHdkZiA9IE1hdGguY29zKDIgKiBNYXRoLlBJIC8gbCk7XG4gICAgICB2YXIgaXR3ZGYgPSBNYXRoLnNpbigyICogTWF0aC5QSSAvIGwpO1xuXG4gICAgICBmb3IgKHZhciBwID0gMDsgcCA8IE47IHAgKz0gbCkge1xuICAgICAgICB2YXIgcnR3ZGZfID0gcnR3ZGY7XG4gICAgICAgIHZhciBpdHdkZl8gPSBpdHdkZjtcblxuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHM7IGorKykge1xuICAgICAgICAgIHZhciByZSA9IHJ0d3NbcCArIGpdO1xuICAgICAgICAgIHZhciBpZSA9IGl0d3NbcCArIGpdO1xuXG4gICAgICAgICAgdmFyIHJvID0gcnR3c1twICsgaiArIHNdO1xuICAgICAgICAgIHZhciBpbyA9IGl0d3NbcCArIGogKyBzXTtcblxuICAgICAgICAgIHZhciByeCA9IHJ0d2RmXyAqIHJvIC0gaXR3ZGZfICogaW87XG5cbiAgICAgICAgICBpbyA9IHJ0d2RmXyAqIGlvICsgaXR3ZGZfICogcm87XG4gICAgICAgICAgcm8gPSByeDtcblxuICAgICAgICAgIHJ0d3NbcCArIGpdID0gcmUgKyBybztcbiAgICAgICAgICBpdHdzW3AgKyBqXSA9IGllICsgaW87XG5cbiAgICAgICAgICBydHdzW3AgKyBqICsgc10gPSByZSAtIHJvO1xuICAgICAgICAgIGl0d3NbcCArIGogKyBzXSA9IGllIC0gaW87XG5cbiAgICAgICAgICAvKiBqc2hpbnQgbWF4ZGVwdGggOiBmYWxzZSAqL1xuICAgICAgICAgIGlmIChqICE9PSBsKSB7XG4gICAgICAgICAgICByeCA9IHJ0d2RmICogcnR3ZGZfIC0gaXR3ZGYgKiBpdHdkZl87XG5cbiAgICAgICAgICAgIGl0d2RmXyA9IHJ0d2RmICogaXR3ZGZfICsgaXR3ZGYgKiBydHdkZl87XG4gICAgICAgICAgICBydHdkZl8gPSByeDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgRkZUTS5wcm90b3R5cGUuZ3Vlc3NMZW4xM2IgPSBmdW5jdGlvbiBndWVzc0xlbjEzYiAobiwgbSkge1xuICAgIHZhciBOID0gTWF0aC5tYXgobSwgbikgfCAxO1xuICAgIHZhciBvZGQgPSBOICYgMTtcbiAgICB2YXIgaSA9IDA7XG4gICAgZm9yIChOID0gTiAvIDIgfCAwOyBOOyBOID0gTiA+Pj4gMSkge1xuICAgICAgaSsrO1xuICAgIH1cblxuICAgIHJldHVybiAxIDw8IGkgKyAxICsgb2RkO1xuICB9O1xuXG4gIEZGVE0ucHJvdG90eXBlLmNvbmp1Z2F0ZSA9IGZ1bmN0aW9uIGNvbmp1Z2F0ZSAocndzLCBpd3MsIE4pIHtcbiAgICBpZiAoTiA8PSAxKSByZXR1cm47XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IE4gLyAyOyBpKyspIHtcbiAgICAgIHZhciB0ID0gcndzW2ldO1xuXG4gICAgICByd3NbaV0gPSByd3NbTiAtIGkgLSAxXTtcbiAgICAgIHJ3c1tOIC0gaSAtIDFdID0gdDtcblxuICAgICAgdCA9IGl3c1tpXTtcblxuICAgICAgaXdzW2ldID0gLWl3c1tOIC0gaSAtIDFdO1xuICAgICAgaXdzW04gLSBpIC0gMV0gPSAtdDtcbiAgICB9XG4gIH07XG5cbiAgRkZUTS5wcm90b3R5cGUubm9ybWFsaXplMTNiID0gZnVuY3Rpb24gbm9ybWFsaXplMTNiICh3cywgTikge1xuICAgIHZhciBjYXJyeSA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBOIC8gMjsgaSsrKSB7XG4gICAgICB2YXIgdyA9IE1hdGgucm91bmQod3NbMiAqIGkgKyAxXSAvIE4pICogMHgyMDAwICtcbiAgICAgICAgTWF0aC5yb3VuZCh3c1syICogaV0gLyBOKSArXG4gICAgICAgIGNhcnJ5O1xuXG4gICAgICB3c1tpXSA9IHcgJiAweDNmZmZmZmY7XG5cbiAgICAgIGlmICh3IDwgMHg0MDAwMDAwKSB7XG4gICAgICAgIGNhcnJ5ID0gMDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNhcnJ5ID0gdyAvIDB4NDAwMDAwMCB8IDA7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHdzO1xuICB9O1xuXG4gIEZGVE0ucHJvdG90eXBlLmNvbnZlcnQxM2IgPSBmdW5jdGlvbiBjb252ZXJ0MTNiICh3cywgbGVuLCByd3MsIE4pIHtcbiAgICB2YXIgY2FycnkgPSAwO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIGNhcnJ5ID0gY2FycnkgKyAod3NbaV0gfCAwKTtcblxuICAgICAgcndzWzIgKiBpXSA9IGNhcnJ5ICYgMHgxZmZmOyBjYXJyeSA9IGNhcnJ5ID4+PiAxMztcbiAgICAgIHJ3c1syICogaSArIDFdID0gY2FycnkgJiAweDFmZmY7IGNhcnJ5ID0gY2FycnkgPj4+IDEzO1xuICAgIH1cblxuICAgIC8vIFBhZCB3aXRoIHplcm9lc1xuICAgIGZvciAoaSA9IDIgKiBsZW47IGkgPCBOOyArK2kpIHtcbiAgICAgIHJ3c1tpXSA9IDA7XG4gICAgfVxuXG4gICAgYXNzZXJ0KGNhcnJ5ID09PSAwKTtcbiAgICBhc3NlcnQoKGNhcnJ5ICYgfjB4MWZmZikgPT09IDApO1xuICB9O1xuXG4gIEZGVE0ucHJvdG90eXBlLnN0dWIgPSBmdW5jdGlvbiBzdHViIChOKSB7XG4gICAgdmFyIHBoID0gbmV3IEFycmF5KE4pO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICBwaFtpXSA9IDA7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBoO1xuICB9O1xuXG4gIEZGVE0ucHJvdG90eXBlLm11bHAgPSBmdW5jdGlvbiBtdWxwICh4LCB5LCBvdXQpIHtcbiAgICB2YXIgTiA9IDIgKiB0aGlzLmd1ZXNzTGVuMTNiKHgubGVuZ3RoLCB5Lmxlbmd0aCk7XG5cbiAgICB2YXIgcmJ0ID0gdGhpcy5tYWtlUkJUKE4pO1xuXG4gICAgdmFyIF8gPSB0aGlzLnN0dWIoTik7XG5cbiAgICB2YXIgcndzID0gbmV3IEFycmF5KE4pO1xuICAgIHZhciByd3N0ID0gbmV3IEFycmF5KE4pO1xuICAgIHZhciBpd3N0ID0gbmV3IEFycmF5KE4pO1xuXG4gICAgdmFyIG5yd3MgPSBuZXcgQXJyYXkoTik7XG4gICAgdmFyIG5yd3N0ID0gbmV3IEFycmF5KE4pO1xuICAgIHZhciBuaXdzdCA9IG5ldyBBcnJheShOKTtcblxuICAgIHZhciBybXdzID0gb3V0LndvcmRzO1xuICAgIHJtd3MubGVuZ3RoID0gTjtcblxuICAgIHRoaXMuY29udmVydDEzYih4LndvcmRzLCB4Lmxlbmd0aCwgcndzLCBOKTtcbiAgICB0aGlzLmNvbnZlcnQxM2IoeS53b3JkcywgeS5sZW5ndGgsIG5yd3MsIE4pO1xuXG4gICAgdGhpcy50cmFuc2Zvcm0ocndzLCBfLCByd3N0LCBpd3N0LCBOLCByYnQpO1xuICAgIHRoaXMudHJhbnNmb3JtKG5yd3MsIF8sIG5yd3N0LCBuaXdzdCwgTiwgcmJ0KTtcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICB2YXIgcnggPSByd3N0W2ldICogbnJ3c3RbaV0gLSBpd3N0W2ldICogbml3c3RbaV07XG4gICAgICBpd3N0W2ldID0gcndzdFtpXSAqIG5pd3N0W2ldICsgaXdzdFtpXSAqIG5yd3N0W2ldO1xuICAgICAgcndzdFtpXSA9IHJ4O1xuICAgIH1cblxuICAgIHRoaXMuY29uanVnYXRlKHJ3c3QsIGl3c3QsIE4pO1xuICAgIHRoaXMudHJhbnNmb3JtKHJ3c3QsIGl3c3QsIHJtd3MsIF8sIE4sIHJidCk7XG4gICAgdGhpcy5jb25qdWdhdGUocm13cywgXywgTik7XG4gICAgdGhpcy5ub3JtYWxpemUxM2Iocm13cywgTik7XG5cbiAgICBvdXQubmVnYXRpdmUgPSB4Lm5lZ2F0aXZlIF4geS5uZWdhdGl2ZTtcbiAgICBvdXQubGVuZ3RoID0geC5sZW5ndGggKyB5Lmxlbmd0aDtcbiAgICByZXR1cm4gb3V0LnN0cmlwKCk7XG4gIH07XG5cbiAgLy8gTXVsdGlwbHkgYHRoaXNgIGJ5IGBudW1gXG4gIEJOLnByb3RvdHlwZS5tdWwgPSBmdW5jdGlvbiBtdWwgKG51bSkge1xuICAgIHZhciBvdXQgPSBuZXcgQk4obnVsbCk7XG4gICAgb3V0LndvcmRzID0gbmV3IEFycmF5KHRoaXMubGVuZ3RoICsgbnVtLmxlbmd0aCk7XG4gICAgcmV0dXJuIHRoaXMubXVsVG8obnVtLCBvdXQpO1xuICB9O1xuXG4gIC8vIE11bHRpcGx5IGVtcGxveWluZyBGRlRcbiAgQk4ucHJvdG90eXBlLm11bGYgPSBmdW5jdGlvbiBtdWxmIChudW0pIHtcbiAgICB2YXIgb3V0ID0gbmV3IEJOKG51bGwpO1xuICAgIG91dC53b3JkcyA9IG5ldyBBcnJheSh0aGlzLmxlbmd0aCArIG51bS5sZW5ndGgpO1xuICAgIHJldHVybiBqdW1ib011bFRvKHRoaXMsIG51bSwgb3V0KTtcbiAgfTtcblxuICAvLyBJbi1wbGFjZSBNdWx0aXBsaWNhdGlvblxuICBCTi5wcm90b3R5cGUuaW11bCA9IGZ1bmN0aW9uIGltdWwgKG51bSkge1xuICAgIHJldHVybiB0aGlzLmNsb25lKCkubXVsVG8obnVtLCB0aGlzKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuaW11bG4gPSBmdW5jdGlvbiBpbXVsbiAobnVtKSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBudW0gPT09ICdudW1iZXInKTtcbiAgICBhc3NlcnQobnVtIDwgMHg0MDAwMDAwKTtcblxuICAgIC8vIENhcnJ5XG4gICAgdmFyIGNhcnJ5ID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciB3ID0gKHRoaXMud29yZHNbaV0gfCAwKSAqIG51bTtcbiAgICAgIHZhciBsbyA9ICh3ICYgMHgzZmZmZmZmKSArIChjYXJyeSAmIDB4M2ZmZmZmZik7XG4gICAgICBjYXJyeSA+Pj0gMjY7XG4gICAgICBjYXJyeSArPSAodyAvIDB4NDAwMDAwMCkgfCAwO1xuICAgICAgLy8gTk9URTogbG8gaXMgMjdiaXQgbWF4aW11bVxuICAgICAgY2FycnkgKz0gbG8gPj4+IDI2O1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IGxvICYgMHgzZmZmZmZmO1xuICAgIH1cblxuICAgIGlmIChjYXJyeSAhPT0gMCkge1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IGNhcnJ5O1xuICAgICAgdGhpcy5sZW5ndGgrKztcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfTtcblxuICBCTi5wcm90b3R5cGUubXVsbiA9IGZ1bmN0aW9uIG11bG4gKG51bSkge1xuICAgIHJldHVybiB0aGlzLmNsb25lKCkuaW11bG4obnVtKTtcbiAgfTtcblxuICAvLyBgdGhpc2AgKiBgdGhpc2BcbiAgQk4ucHJvdG90eXBlLnNxciA9IGZ1bmN0aW9uIHNxciAoKSB7XG4gICAgcmV0dXJuIHRoaXMubXVsKHRoaXMpO1xuICB9O1xuXG4gIC8vIGB0aGlzYCAqIGB0aGlzYCBpbi1wbGFjZVxuICBCTi5wcm90b3R5cGUuaXNxciA9IGZ1bmN0aW9uIGlzcXIgKCkge1xuICAgIHJldHVybiB0aGlzLmltdWwodGhpcy5jbG9uZSgpKTtcbiAgfTtcblxuICAvLyBNYXRoLnBvdyhgdGhpc2AsIGBudW1gKVxuICBCTi5wcm90b3R5cGUucG93ID0gZnVuY3Rpb24gcG93IChudW0pIHtcbiAgICB2YXIgdyA9IHRvQml0QXJyYXkobnVtKTtcbiAgICBpZiAody5sZW5ndGggPT09IDApIHJldHVybiBuZXcgQk4oMSk7XG5cbiAgICAvLyBTa2lwIGxlYWRpbmcgemVyb2VzXG4gICAgdmFyIHJlcyA9IHRoaXM7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB3Lmxlbmd0aDsgaSsrLCByZXMgPSByZXMuc3FyKCkpIHtcbiAgICAgIGlmICh3W2ldICE9PSAwKSBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoKytpIDwgdy5sZW5ndGgpIHtcbiAgICAgIGZvciAodmFyIHEgPSByZXMuc3FyKCk7IGkgPCB3Lmxlbmd0aDsgaSsrLCBxID0gcS5zcXIoKSkge1xuICAgICAgICBpZiAod1tpXSA9PT0gMCkgY29udGludWU7XG5cbiAgICAgICAgcmVzID0gcmVzLm11bChxKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzO1xuICB9O1xuXG4gIC8vIFNoaWZ0LWxlZnQgaW4tcGxhY2VcbiAgQk4ucHJvdG90eXBlLml1c2hsbiA9IGZ1bmN0aW9uIGl1c2hsbiAoYml0cykge1xuICAgIGFzc2VydCh0eXBlb2YgYml0cyA9PT0gJ251bWJlcicgJiYgYml0cyA+PSAwKTtcbiAgICB2YXIgciA9IGJpdHMgJSAyNjtcbiAgICB2YXIgcyA9IChiaXRzIC0gcikgLyAyNjtcbiAgICB2YXIgY2FycnlNYXNrID0gKDB4M2ZmZmZmZiA+Pj4gKDI2IC0gcikpIDw8ICgyNiAtIHIpO1xuICAgIHZhciBpO1xuXG4gICAgaWYgKHIgIT09IDApIHtcbiAgICAgIHZhciBjYXJyeSA9IDA7XG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCB0aGlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBuZXdDYXJyeSA9IHRoaXMud29yZHNbaV0gJiBjYXJyeU1hc2s7XG4gICAgICAgIHZhciBjID0gKCh0aGlzLndvcmRzW2ldIHwgMCkgLSBuZXdDYXJyeSkgPDwgcjtcbiAgICAgICAgdGhpcy53b3Jkc1tpXSA9IGMgfCBjYXJyeTtcbiAgICAgICAgY2FycnkgPSBuZXdDYXJyeSA+Pj4gKDI2IC0gcik7XG4gICAgICB9XG5cbiAgICAgIGlmIChjYXJyeSkge1xuICAgICAgICB0aGlzLndvcmRzW2ldID0gY2Fycnk7XG4gICAgICAgIHRoaXMubGVuZ3RoKys7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHMgIT09IDApIHtcbiAgICAgIGZvciAoaSA9IHRoaXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgdGhpcy53b3Jkc1tpICsgc10gPSB0aGlzLndvcmRzW2ldO1xuICAgICAgfVxuXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgczsgaSsrKSB7XG4gICAgICAgIHRoaXMud29yZHNbaV0gPSAwO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmxlbmd0aCArPSBzO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnN0cmlwKCk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmlzaGxuID0gZnVuY3Rpb24gaXNobG4gKGJpdHMpIHtcbiAgICAvLyBUT0RPKGluZHV0bnkpOiBpbXBsZW1lbnQgbWVcbiAgICBhc3NlcnQodGhpcy5uZWdhdGl2ZSA9PT0gMCk7XG4gICAgcmV0dXJuIHRoaXMuaXVzaGxuKGJpdHMpO1xuICB9O1xuXG4gIC8vIFNoaWZ0LXJpZ2h0IGluLXBsYWNlXG4gIC8vIE5PVEU6IGBoaW50YCBpcyBhIGxvd2VzdCBiaXQgYmVmb3JlIHRyYWlsaW5nIHplcm9lc1xuICAvLyBOT1RFOiBpZiBgZXh0ZW5kZWRgIGlzIHByZXNlbnQgLSBpdCB3aWxsIGJlIGZpbGxlZCB3aXRoIGRlc3Ryb3llZCBiaXRzXG4gIEJOLnByb3RvdHlwZS5pdXNocm4gPSBmdW5jdGlvbiBpdXNocm4gKGJpdHMsIGhpbnQsIGV4dGVuZGVkKSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBiaXRzID09PSAnbnVtYmVyJyAmJiBiaXRzID49IDApO1xuICAgIHZhciBoO1xuICAgIGlmIChoaW50KSB7XG4gICAgICBoID0gKGhpbnQgLSAoaGludCAlIDI2KSkgLyAyNjtcbiAgICB9IGVsc2Uge1xuICAgICAgaCA9IDA7XG4gICAgfVxuXG4gICAgdmFyIHIgPSBiaXRzICUgMjY7XG4gICAgdmFyIHMgPSBNYXRoLm1pbigoYml0cyAtIHIpIC8gMjYsIHRoaXMubGVuZ3RoKTtcbiAgICB2YXIgbWFzayA9IDB4M2ZmZmZmZiBeICgoMHgzZmZmZmZmID4+PiByKSA8PCByKTtcbiAgICB2YXIgbWFza2VkV29yZHMgPSBleHRlbmRlZDtcblxuICAgIGggLT0gcztcbiAgICBoID0gTWF0aC5tYXgoMCwgaCk7XG5cbiAgICAvLyBFeHRlbmRlZCBtb2RlLCBjb3B5IG1hc2tlZCBwYXJ0XG4gICAgaWYgKG1hc2tlZFdvcmRzKSB7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHM7IGkrKykge1xuICAgICAgICBtYXNrZWRXb3Jkcy53b3Jkc1tpXSA9IHRoaXMud29yZHNbaV07XG4gICAgICB9XG4gICAgICBtYXNrZWRXb3Jkcy5sZW5ndGggPSBzO1xuICAgIH1cblxuICAgIGlmIChzID09PSAwKSB7XG4gICAgICAvLyBOby1vcCwgd2Ugc2hvdWxkIG5vdCBtb3ZlIGFueXRoaW5nIGF0IGFsbFxuICAgIH0gZWxzZSBpZiAodGhpcy5sZW5ndGggPiBzKSB7XG4gICAgICB0aGlzLmxlbmd0aCAtPSBzO1xuICAgICAgZm9yIChpID0gMDsgaSA8IHRoaXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdGhpcy53b3Jkc1tpXSA9IHRoaXMud29yZHNbaSArIHNdO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLndvcmRzWzBdID0gMDtcbiAgICAgIHRoaXMubGVuZ3RoID0gMTtcbiAgICB9XG5cbiAgICB2YXIgY2FycnkgPSAwO1xuICAgIGZvciAoaSA9IHRoaXMubGVuZ3RoIC0gMTsgaSA+PSAwICYmIChjYXJyeSAhPT0gMCB8fCBpID49IGgpOyBpLS0pIHtcbiAgICAgIHZhciB3b3JkID0gdGhpcy53b3Jkc1tpXSB8IDA7XG4gICAgICB0aGlzLndvcmRzW2ldID0gKGNhcnJ5IDw8ICgyNiAtIHIpKSB8ICh3b3JkID4+PiByKTtcbiAgICAgIGNhcnJ5ID0gd29yZCAmIG1hc2s7XG4gICAgfVxuXG4gICAgLy8gUHVzaCBjYXJyaWVkIGJpdHMgYXMgYSBtYXNrXG4gICAgaWYgKG1hc2tlZFdvcmRzICYmIGNhcnJ5ICE9PSAwKSB7XG4gICAgICBtYXNrZWRXb3Jkcy53b3Jkc1ttYXNrZWRXb3Jkcy5sZW5ndGgrK10gPSBjYXJyeTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHRoaXMud29yZHNbMF0gPSAwO1xuICAgICAgdGhpcy5sZW5ndGggPSAxO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnN0cmlwKCk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmlzaHJuID0gZnVuY3Rpb24gaXNocm4gKGJpdHMsIGhpbnQsIGV4dGVuZGVkKSB7XG4gICAgLy8gVE9ETyhpbmR1dG55KTogaW1wbGVtZW50IG1lXG4gICAgYXNzZXJ0KHRoaXMubmVnYXRpdmUgPT09IDApO1xuICAgIHJldHVybiB0aGlzLml1c2hybihiaXRzLCBoaW50LCBleHRlbmRlZCk7XG4gIH07XG5cbiAgLy8gU2hpZnQtbGVmdFxuICBCTi5wcm90b3R5cGUuc2hsbiA9IGZ1bmN0aW9uIHNobG4gKGJpdHMpIHtcbiAgICByZXR1cm4gdGhpcy5jbG9uZSgpLmlzaGxuKGJpdHMpO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS51c2hsbiA9IGZ1bmN0aW9uIHVzaGxuIChiaXRzKSB7XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUoKS5pdXNobG4oYml0cyk7XG4gIH07XG5cbiAgLy8gU2hpZnQtcmlnaHRcbiAgQk4ucHJvdG90eXBlLnNocm4gPSBmdW5jdGlvbiBzaHJuIChiaXRzKSB7XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUoKS5pc2hybihiaXRzKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUudXNocm4gPSBmdW5jdGlvbiB1c2hybiAoYml0cykge1xuICAgIHJldHVybiB0aGlzLmNsb25lKCkuaXVzaHJuKGJpdHMpO1xuICB9O1xuXG4gIC8vIFRlc3QgaWYgbiBiaXQgaXMgc2V0XG4gIEJOLnByb3RvdHlwZS50ZXN0biA9IGZ1bmN0aW9uIHRlc3RuIChiaXQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGJpdCA9PT0gJ251bWJlcicgJiYgYml0ID49IDApO1xuICAgIHZhciByID0gYml0ICUgMjY7XG4gICAgdmFyIHMgPSAoYml0IC0gcikgLyAyNjtcbiAgICB2YXIgcSA9IDEgPDwgcjtcblxuICAgIC8vIEZhc3QgY2FzZTogYml0IGlzIG11Y2ggaGlnaGVyIHRoYW4gYWxsIGV4aXN0aW5nIHdvcmRzXG4gICAgaWYgKHRoaXMubGVuZ3RoIDw9IHMpIHJldHVybiBmYWxzZTtcblxuICAgIC8vIENoZWNrIGJpdCBhbmQgcmV0dXJuXG4gICAgdmFyIHcgPSB0aGlzLndvcmRzW3NdO1xuXG4gICAgcmV0dXJuICEhKHcgJiBxKTtcbiAgfTtcblxuICAvLyBSZXR1cm4gb25seSBsb3dlcnMgYml0cyBvZiBudW1iZXIgKGluLXBsYWNlKVxuICBCTi5wcm90b3R5cGUuaW1hc2tuID0gZnVuY3Rpb24gaW1hc2tuIChiaXRzKSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBiaXRzID09PSAnbnVtYmVyJyAmJiBiaXRzID49IDApO1xuICAgIHZhciByID0gYml0cyAlIDI2O1xuICAgIHZhciBzID0gKGJpdHMgLSByKSAvIDI2O1xuXG4gICAgYXNzZXJ0KHRoaXMubmVnYXRpdmUgPT09IDAsICdpbWFza24gd29ya3Mgb25seSB3aXRoIHBvc2l0aXZlIG51bWJlcnMnKTtcblxuICAgIGlmICh0aGlzLmxlbmd0aCA8PSBzKSB7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBpZiAociAhPT0gMCkge1xuICAgICAgcysrO1xuICAgIH1cbiAgICB0aGlzLmxlbmd0aCA9IE1hdGgubWluKHMsIHRoaXMubGVuZ3RoKTtcblxuICAgIGlmIChyICE9PSAwKSB7XG4gICAgICB2YXIgbWFzayA9IDB4M2ZmZmZmZiBeICgoMHgzZmZmZmZmID4+PiByKSA8PCByKTtcbiAgICAgIHRoaXMud29yZHNbdGhpcy5sZW5ndGggLSAxXSAmPSBtYXNrO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnN0cmlwKCk7XG4gIH07XG5cbiAgLy8gUmV0dXJuIG9ubHkgbG93ZXJzIGJpdHMgb2YgbnVtYmVyXG4gIEJOLnByb3RvdHlwZS5tYXNrbiA9IGZ1bmN0aW9uIG1hc2tuIChiaXRzKSB7XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUoKS5pbWFza24oYml0cyk7XG4gIH07XG5cbiAgLy8gQWRkIHBsYWluIG51bWJlciBgbnVtYCB0byBgdGhpc2BcbiAgQk4ucHJvdG90eXBlLmlhZGRuID0gZnVuY3Rpb24gaWFkZG4gKG51bSkge1xuICAgIGFzc2VydCh0eXBlb2YgbnVtID09PSAnbnVtYmVyJyk7XG4gICAgYXNzZXJ0KG51bSA8IDB4NDAwMDAwMCk7XG4gICAgaWYgKG51bSA8IDApIHJldHVybiB0aGlzLmlzdWJuKC1udW0pO1xuXG4gICAgLy8gUG9zc2libGUgc2lnbiBjaGFuZ2VcbiAgICBpZiAodGhpcy5uZWdhdGl2ZSAhPT0gMCkge1xuICAgICAgaWYgKHRoaXMubGVuZ3RoID09PSAxICYmICh0aGlzLndvcmRzWzBdIHwgMCkgPCBudW0pIHtcbiAgICAgICAgdGhpcy53b3Jkc1swXSA9IG51bSAtICh0aGlzLndvcmRzWzBdIHwgMCk7XG4gICAgICAgIHRoaXMubmVnYXRpdmUgPSAwO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cblxuICAgICAgdGhpcy5uZWdhdGl2ZSA9IDA7XG4gICAgICB0aGlzLmlzdWJuKG51bSk7XG4gICAgICB0aGlzLm5lZ2F0aXZlID0gMTtcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8vIEFkZCB3aXRob3V0IGNoZWNrc1xuICAgIHJldHVybiB0aGlzLl9pYWRkbihudW0pO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5faWFkZG4gPSBmdW5jdGlvbiBfaWFkZG4gKG51bSkge1xuICAgIHRoaXMud29yZHNbMF0gKz0gbnVtO1xuXG4gICAgLy8gQ2FycnlcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGVuZ3RoICYmIHRoaXMud29yZHNbaV0gPj0gMHg0MDAwMDAwOyBpKyspIHtcbiAgICAgIHRoaXMud29yZHNbaV0gLT0gMHg0MDAwMDAwO1xuICAgICAgaWYgKGkgPT09IHRoaXMubGVuZ3RoIC0gMSkge1xuICAgICAgICB0aGlzLndvcmRzW2kgKyAxXSA9IDE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLndvcmRzW2kgKyAxXSsrO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLmxlbmd0aCA9IE1hdGgubWF4KHRoaXMubGVuZ3RoLCBpICsgMSk7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfTtcblxuICAvLyBTdWJ0cmFjdCBwbGFpbiBudW1iZXIgYG51bWAgZnJvbSBgdGhpc2BcbiAgQk4ucHJvdG90eXBlLmlzdWJuID0gZnVuY3Rpb24gaXN1Ym4gKG51bSkge1xuICAgIGFzc2VydCh0eXBlb2YgbnVtID09PSAnbnVtYmVyJyk7XG4gICAgYXNzZXJ0KG51bSA8IDB4NDAwMDAwMCk7XG4gICAgaWYgKG51bSA8IDApIHJldHVybiB0aGlzLmlhZGRuKC1udW0pO1xuXG4gICAgaWYgKHRoaXMubmVnYXRpdmUgIT09IDApIHtcbiAgICAgIHRoaXMubmVnYXRpdmUgPSAwO1xuICAgICAgdGhpcy5pYWRkbihudW0pO1xuICAgICAgdGhpcy5uZWdhdGl2ZSA9IDE7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICB0aGlzLndvcmRzWzBdIC09IG51bTtcblxuICAgIGlmICh0aGlzLmxlbmd0aCA9PT0gMSAmJiB0aGlzLndvcmRzWzBdIDwgMCkge1xuICAgICAgdGhpcy53b3Jkc1swXSA9IC10aGlzLndvcmRzWzBdO1xuICAgICAgdGhpcy5uZWdhdGl2ZSA9IDE7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIENhcnJ5XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGVuZ3RoICYmIHRoaXMud29yZHNbaV0gPCAwOyBpKyspIHtcbiAgICAgICAgdGhpcy53b3Jkc1tpXSArPSAweDQwMDAwMDA7XG4gICAgICAgIHRoaXMud29yZHNbaSArIDFdIC09IDE7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuc3RyaXAoKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuYWRkbiA9IGZ1bmN0aW9uIGFkZG4gKG51bSkge1xuICAgIHJldHVybiB0aGlzLmNsb25lKCkuaWFkZG4obnVtKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuc3VibiA9IGZ1bmN0aW9uIHN1Ym4gKG51bSkge1xuICAgIHJldHVybiB0aGlzLmNsb25lKCkuaXN1Ym4obnVtKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuaWFicyA9IGZ1bmN0aW9uIGlhYnMgKCkge1xuICAgIHRoaXMubmVnYXRpdmUgPSAwO1xuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmFicyA9IGZ1bmN0aW9uIGFicyAoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUoKS5pYWJzKCk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLl9pc2hsbnN1Ym11bCA9IGZ1bmN0aW9uIF9pc2hsbnN1Ym11bCAobnVtLCBtdWwsIHNoaWZ0KSB7XG4gICAgdmFyIGxlbiA9IG51bS5sZW5ndGggKyBzaGlmdDtcbiAgICB2YXIgaTtcblxuICAgIHRoaXMuX2V4cGFuZChsZW4pO1xuXG4gICAgdmFyIHc7XG4gICAgdmFyIGNhcnJ5ID0gMDtcbiAgICBmb3IgKGkgPSAwOyBpIDwgbnVtLmxlbmd0aDsgaSsrKSB7XG4gICAgICB3ID0gKHRoaXMud29yZHNbaSArIHNoaWZ0XSB8IDApICsgY2Fycnk7XG4gICAgICB2YXIgcmlnaHQgPSAobnVtLndvcmRzW2ldIHwgMCkgKiBtdWw7XG4gICAgICB3IC09IHJpZ2h0ICYgMHgzZmZmZmZmO1xuICAgICAgY2FycnkgPSAodyA+PiAyNikgLSAoKHJpZ2h0IC8gMHg0MDAwMDAwKSB8IDApO1xuICAgICAgdGhpcy53b3Jkc1tpICsgc2hpZnRdID0gdyAmIDB4M2ZmZmZmZjtcbiAgICB9XG4gICAgZm9yICg7IGkgPCB0aGlzLmxlbmd0aCAtIHNoaWZ0OyBpKyspIHtcbiAgICAgIHcgPSAodGhpcy53b3Jkc1tpICsgc2hpZnRdIHwgMCkgKyBjYXJyeTtcbiAgICAgIGNhcnJ5ID0gdyA+PiAyNjtcbiAgICAgIHRoaXMud29yZHNbaSArIHNoaWZ0XSA9IHcgJiAweDNmZmZmZmY7XG4gICAgfVxuXG4gICAgaWYgKGNhcnJ5ID09PSAwKSByZXR1cm4gdGhpcy5zdHJpcCgpO1xuXG4gICAgLy8gU3VidHJhY3Rpb24gb3ZlcmZsb3dcbiAgICBhc3NlcnQoY2FycnkgPT09IC0xKTtcbiAgICBjYXJyeSA9IDA7XG4gICAgZm9yIChpID0gMDsgaSA8IHRoaXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHcgPSAtKHRoaXMud29yZHNbaV0gfCAwKSArIGNhcnJ5O1xuICAgICAgY2FycnkgPSB3ID4+IDI2O1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IHcgJiAweDNmZmZmZmY7XG4gICAgfVxuICAgIHRoaXMubmVnYXRpdmUgPSAxO1xuXG4gICAgcmV0dXJuIHRoaXMuc3RyaXAoKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuX3dvcmREaXYgPSBmdW5jdGlvbiBfd29yZERpdiAobnVtLCBtb2RlKSB7XG4gICAgdmFyIHNoaWZ0ID0gdGhpcy5sZW5ndGggLSBudW0ubGVuZ3RoO1xuXG4gICAgdmFyIGEgPSB0aGlzLmNsb25lKCk7XG4gICAgdmFyIGIgPSBudW07XG5cbiAgICAvLyBOb3JtYWxpemVcbiAgICB2YXIgYmhpID0gYi53b3Jkc1tiLmxlbmd0aCAtIDFdIHwgMDtcbiAgICB2YXIgYmhpQml0cyA9IHRoaXMuX2NvdW50Qml0cyhiaGkpO1xuICAgIHNoaWZ0ID0gMjYgLSBiaGlCaXRzO1xuICAgIGlmIChzaGlmdCAhPT0gMCkge1xuICAgICAgYiA9IGIudXNobG4oc2hpZnQpO1xuICAgICAgYS5pdXNobG4oc2hpZnQpO1xuICAgICAgYmhpID0gYi53b3Jkc1tiLmxlbmd0aCAtIDFdIHwgMDtcbiAgICB9XG5cbiAgICAvLyBJbml0aWFsaXplIHF1b3RpZW50XG4gICAgdmFyIG0gPSBhLmxlbmd0aCAtIGIubGVuZ3RoO1xuICAgIHZhciBxO1xuXG4gICAgaWYgKG1vZGUgIT09ICdtb2QnKSB7XG4gICAgICBxID0gbmV3IEJOKG51bGwpO1xuICAgICAgcS5sZW5ndGggPSBtICsgMTtcbiAgICAgIHEud29yZHMgPSBuZXcgQXJyYXkocS5sZW5ndGgpO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBxLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHEud29yZHNbaV0gPSAwO1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBkaWZmID0gYS5jbG9uZSgpLl9pc2hsbnN1Ym11bChiLCAxLCBtKTtcbiAgICBpZiAoZGlmZi5uZWdhdGl2ZSA9PT0gMCkge1xuICAgICAgYSA9IGRpZmY7XG4gICAgICBpZiAocSkge1xuICAgICAgICBxLndvcmRzW21dID0gMTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKHZhciBqID0gbSAtIDE7IGogPj0gMDsgai0tKSB7XG4gICAgICB2YXIgcWogPSAoYS53b3Jkc1tiLmxlbmd0aCArIGpdIHwgMCkgKiAweDQwMDAwMDAgK1xuICAgICAgICAoYS53b3Jkc1tiLmxlbmd0aCArIGogLSAxXSB8IDApO1xuXG4gICAgICAvLyBOT1RFOiAocWogLyBiaGkpIGlzICgweDNmZmZmZmYgKiAweDQwMDAwMDAgKyAweDNmZmZmZmYpIC8gMHgyMDAwMDAwIG1heFxuICAgICAgLy8gKDB4N2ZmZmZmZilcbiAgICAgIHFqID0gTWF0aC5taW4oKHFqIC8gYmhpKSB8IDAsIDB4M2ZmZmZmZik7XG5cbiAgICAgIGEuX2lzaGxuc3VibXVsKGIsIHFqLCBqKTtcbiAgICAgIHdoaWxlIChhLm5lZ2F0aXZlICE9PSAwKSB7XG4gICAgICAgIHFqLS07XG4gICAgICAgIGEubmVnYXRpdmUgPSAwO1xuICAgICAgICBhLl9pc2hsbnN1Ym11bChiLCAxLCBqKTtcbiAgICAgICAgaWYgKCFhLmlzWmVybygpKSB7XG4gICAgICAgICAgYS5uZWdhdGl2ZSBePSAxO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAocSkge1xuICAgICAgICBxLndvcmRzW2pdID0gcWo7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChxKSB7XG4gICAgICBxLnN0cmlwKCk7XG4gICAgfVxuICAgIGEuc3RyaXAoKTtcblxuICAgIC8vIERlbm9ybWFsaXplXG4gICAgaWYgKG1vZGUgIT09ICdkaXYnICYmIHNoaWZ0ICE9PSAwKSB7XG4gICAgICBhLml1c2hybihzaGlmdCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGRpdjogcSB8fCBudWxsLFxuICAgICAgbW9kOiBhXG4gICAgfTtcbiAgfTtcblxuICAvLyBOT1RFOiAxKSBgbW9kZWAgY2FuIGJlIHNldCB0byBgbW9kYCB0byByZXF1ZXN0IG1vZCBvbmx5LFxuICAvLyAgICAgICB0byBgZGl2YCB0byByZXF1ZXN0IGRpdiBvbmx5LCBvciBiZSBhYnNlbnQgdG9cbiAgLy8gICAgICAgcmVxdWVzdCBib3RoIGRpdiAmIG1vZFxuICAvLyAgICAgICAyKSBgcG9zaXRpdmVgIGlzIHRydWUgaWYgdW5zaWduZWQgbW9kIGlzIHJlcXVlc3RlZFxuICBCTi5wcm90b3R5cGUuZGl2bW9kID0gZnVuY3Rpb24gZGl2bW9kIChudW0sIG1vZGUsIHBvc2l0aXZlKSB7XG4gICAgYXNzZXJ0KCFudW0uaXNaZXJvKCkpO1xuXG4gICAgaWYgKHRoaXMuaXNaZXJvKCkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGRpdjogbmV3IEJOKDApLFxuICAgICAgICBtb2Q6IG5ldyBCTigwKVxuICAgICAgfTtcbiAgICB9XG5cbiAgICB2YXIgZGl2LCBtb2QsIHJlcztcbiAgICBpZiAodGhpcy5uZWdhdGl2ZSAhPT0gMCAmJiBudW0ubmVnYXRpdmUgPT09IDApIHtcbiAgICAgIHJlcyA9IHRoaXMubmVnKCkuZGl2bW9kKG51bSwgbW9kZSk7XG5cbiAgICAgIGlmIChtb2RlICE9PSAnbW9kJykge1xuICAgICAgICBkaXYgPSByZXMuZGl2Lm5lZygpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9kZSAhPT0gJ2RpdicpIHtcbiAgICAgICAgbW9kID0gcmVzLm1vZC5uZWcoKTtcbiAgICAgICAgaWYgKHBvc2l0aXZlICYmIG1vZC5uZWdhdGl2ZSAhPT0gMCkge1xuICAgICAgICAgIG1vZC5pYWRkKG51bSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZGl2OiBkaXYsXG4gICAgICAgIG1vZDogbW9kXG4gICAgICB9O1xuICAgIH1cblxuICAgIGlmICh0aGlzLm5lZ2F0aXZlID09PSAwICYmIG51bS5uZWdhdGl2ZSAhPT0gMCkge1xuICAgICAgcmVzID0gdGhpcy5kaXZtb2QobnVtLm5lZygpLCBtb2RlKTtcblxuICAgICAgaWYgKG1vZGUgIT09ICdtb2QnKSB7XG4gICAgICAgIGRpdiA9IHJlcy5kaXYubmVnKCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIGRpdjogZGl2LFxuICAgICAgICBtb2Q6IHJlcy5tb2RcbiAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKCh0aGlzLm5lZ2F0aXZlICYgbnVtLm5lZ2F0aXZlKSAhPT0gMCkge1xuICAgICAgcmVzID0gdGhpcy5uZWcoKS5kaXZtb2QobnVtLm5lZygpLCBtb2RlKTtcblxuICAgICAgaWYgKG1vZGUgIT09ICdkaXYnKSB7XG4gICAgICAgIG1vZCA9IHJlcy5tb2QubmVnKCk7XG4gICAgICAgIGlmIChwb3NpdGl2ZSAmJiBtb2QubmVnYXRpdmUgIT09IDApIHtcbiAgICAgICAgICBtb2QuaXN1YihudW0pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIGRpdjogcmVzLmRpdixcbiAgICAgICAgbW9kOiBtb2RcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gQm90aCBudW1iZXJzIGFyZSBwb3NpdGl2ZSBhdCB0aGlzIHBvaW50XG5cbiAgICAvLyBTdHJpcCBib3RoIG51bWJlcnMgdG8gYXBwcm94aW1hdGUgc2hpZnQgdmFsdWVcbiAgICBpZiAobnVtLmxlbmd0aCA+IHRoaXMubGVuZ3RoIHx8IHRoaXMuY21wKG51bSkgPCAwKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBkaXY6IG5ldyBCTigwKSxcbiAgICAgICAgbW9kOiB0aGlzXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFZlcnkgc2hvcnQgcmVkdWN0aW9uXG4gICAgaWYgKG51bS5sZW5ndGggPT09IDEpIHtcbiAgICAgIGlmIChtb2RlID09PSAnZGl2Jykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGRpdjogdGhpcy5kaXZuKG51bS53b3Jkc1swXSksXG4gICAgICAgICAgbW9kOiBudWxsXG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIGlmIChtb2RlID09PSAnbW9kJykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGRpdjogbnVsbCxcbiAgICAgICAgICBtb2Q6IG5ldyBCTih0aGlzLm1vZG4obnVtLndvcmRzWzBdKSlcbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZGl2OiB0aGlzLmRpdm4obnVtLndvcmRzWzBdKSxcbiAgICAgICAgbW9kOiBuZXcgQk4odGhpcy5tb2RuKG51bS53b3Jkc1swXSkpXG4gICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl93b3JkRGl2KG51bSwgbW9kZSk7XG4gIH07XG5cbiAgLy8gRmluZCBgdGhpc2AgLyBgbnVtYFxuICBCTi5wcm90b3R5cGUuZGl2ID0gZnVuY3Rpb24gZGl2IChudW0pIHtcbiAgICByZXR1cm4gdGhpcy5kaXZtb2QobnVtLCAnZGl2JywgZmFsc2UpLmRpdjtcbiAgfTtcblxuICAvLyBGaW5kIGB0aGlzYCAlIGBudW1gXG4gIEJOLnByb3RvdHlwZS5tb2QgPSBmdW5jdGlvbiBtb2QgKG51bSkge1xuICAgIHJldHVybiB0aGlzLmRpdm1vZChudW0sICdtb2QnLCBmYWxzZSkubW9kO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS51bW9kID0gZnVuY3Rpb24gdW1vZCAobnVtKSB7XG4gICAgcmV0dXJuIHRoaXMuZGl2bW9kKG51bSwgJ21vZCcsIHRydWUpLm1vZDtcbiAgfTtcblxuICAvLyBGaW5kIFJvdW5kKGB0aGlzYCAvIGBudW1gKVxuICBCTi5wcm90b3R5cGUuZGl2Um91bmQgPSBmdW5jdGlvbiBkaXZSb3VuZCAobnVtKSB7XG4gICAgdmFyIGRtID0gdGhpcy5kaXZtb2QobnVtKTtcblxuICAgIC8vIEZhc3QgY2FzZSAtIGV4YWN0IGRpdmlzaW9uXG4gICAgaWYgKGRtLm1vZC5pc1plcm8oKSkgcmV0dXJuIGRtLmRpdjtcblxuICAgIHZhciBtb2QgPSBkbS5kaXYubmVnYXRpdmUgIT09IDAgPyBkbS5tb2QuaXN1YihudW0pIDogZG0ubW9kO1xuXG4gICAgdmFyIGhhbGYgPSBudW0udXNocm4oMSk7XG4gICAgdmFyIHIyID0gbnVtLmFuZGxuKDEpO1xuICAgIHZhciBjbXAgPSBtb2QuY21wKGhhbGYpO1xuXG4gICAgLy8gUm91bmQgZG93blxuICAgIGlmIChjbXAgPCAwIHx8IHIyID09PSAxICYmIGNtcCA9PT0gMCkgcmV0dXJuIGRtLmRpdjtcblxuICAgIC8vIFJvdW5kIHVwXG4gICAgcmV0dXJuIGRtLmRpdi5uZWdhdGl2ZSAhPT0gMCA/IGRtLmRpdi5pc3VibigxKSA6IGRtLmRpdi5pYWRkbigxKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUubW9kbiA9IGZ1bmN0aW9uIG1vZG4gKG51bSkge1xuICAgIGFzc2VydChudW0gPD0gMHgzZmZmZmZmKTtcbiAgICB2YXIgcCA9ICgxIDw8IDI2KSAlIG51bTtcblxuICAgIHZhciBhY2MgPSAwO1xuICAgIGZvciAodmFyIGkgPSB0aGlzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICBhY2MgPSAocCAqIGFjYyArICh0aGlzLndvcmRzW2ldIHwgMCkpICUgbnVtO1xuICAgIH1cblxuICAgIHJldHVybiBhY2M7XG4gIH07XG5cbiAgLy8gSW4tcGxhY2UgZGl2aXNpb24gYnkgbnVtYmVyXG4gIEJOLnByb3RvdHlwZS5pZGl2biA9IGZ1bmN0aW9uIGlkaXZuIChudW0pIHtcbiAgICBhc3NlcnQobnVtIDw9IDB4M2ZmZmZmZik7XG5cbiAgICB2YXIgY2FycnkgPSAwO1xuICAgIGZvciAodmFyIGkgPSB0aGlzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICB2YXIgdyA9ICh0aGlzLndvcmRzW2ldIHwgMCkgKyBjYXJyeSAqIDB4NDAwMDAwMDtcbiAgICAgIHRoaXMud29yZHNbaV0gPSAodyAvIG51bSkgfCAwO1xuICAgICAgY2FycnkgPSB3ICUgbnVtO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnN0cmlwKCk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmRpdm4gPSBmdW5jdGlvbiBkaXZuIChudW0pIHtcbiAgICByZXR1cm4gdGhpcy5jbG9uZSgpLmlkaXZuKG51bSk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmVnY2QgPSBmdW5jdGlvbiBlZ2NkIChwKSB7XG4gICAgYXNzZXJ0KHAubmVnYXRpdmUgPT09IDApO1xuICAgIGFzc2VydCghcC5pc1plcm8oKSk7XG5cbiAgICB2YXIgeCA9IHRoaXM7XG4gICAgdmFyIHkgPSBwLmNsb25lKCk7XG5cbiAgICBpZiAoeC5uZWdhdGl2ZSAhPT0gMCkge1xuICAgICAgeCA9IHgudW1vZChwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgeCA9IHguY2xvbmUoKTtcbiAgICB9XG5cbiAgICAvLyBBICogeCArIEIgKiB5ID0geFxuICAgIHZhciBBID0gbmV3IEJOKDEpO1xuICAgIHZhciBCID0gbmV3IEJOKDApO1xuXG4gICAgLy8gQyAqIHggKyBEICogeSA9IHlcbiAgICB2YXIgQyA9IG5ldyBCTigwKTtcbiAgICB2YXIgRCA9IG5ldyBCTigxKTtcblxuICAgIHZhciBnID0gMDtcblxuICAgIHdoaWxlICh4LmlzRXZlbigpICYmIHkuaXNFdmVuKCkpIHtcbiAgICAgIHguaXVzaHJuKDEpO1xuICAgICAgeS5pdXNocm4oMSk7XG4gICAgICArK2c7XG4gICAgfVxuXG4gICAgdmFyIHlwID0geS5jbG9uZSgpO1xuICAgIHZhciB4cCA9IHguY2xvbmUoKTtcblxuICAgIHdoaWxlICgheC5pc1plcm8oKSkge1xuICAgICAgZm9yICh2YXIgaSA9IDAsIGltID0gMTsgKHgud29yZHNbMF0gJiBpbSkgPT09IDAgJiYgaSA8IDI2OyArK2ksIGltIDw8PSAxKTtcbiAgICAgIGlmIChpID4gMCkge1xuICAgICAgICB4Lml1c2hybihpKTtcbiAgICAgICAgd2hpbGUgKGktLSA+IDApIHtcbiAgICAgICAgICBpZiAoQS5pc09kZCgpIHx8IEIuaXNPZGQoKSkge1xuICAgICAgICAgICAgQS5pYWRkKHlwKTtcbiAgICAgICAgICAgIEIuaXN1Yih4cCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgQS5pdXNocm4oMSk7XG4gICAgICAgICAgQi5pdXNocm4oMSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZm9yICh2YXIgaiA9IDAsIGptID0gMTsgKHkud29yZHNbMF0gJiBqbSkgPT09IDAgJiYgaiA8IDI2OyArK2osIGptIDw8PSAxKTtcbiAgICAgIGlmIChqID4gMCkge1xuICAgICAgICB5Lml1c2hybihqKTtcbiAgICAgICAgd2hpbGUgKGotLSA+IDApIHtcbiAgICAgICAgICBpZiAoQy5pc09kZCgpIHx8IEQuaXNPZGQoKSkge1xuICAgICAgICAgICAgQy5pYWRkKHlwKTtcbiAgICAgICAgICAgIEQuaXN1Yih4cCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgQy5pdXNocm4oMSk7XG4gICAgICAgICAgRC5pdXNocm4oMSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHguY21wKHkpID49IDApIHtcbiAgICAgICAgeC5pc3ViKHkpO1xuICAgICAgICBBLmlzdWIoQyk7XG4gICAgICAgIEIuaXN1YihEKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHkuaXN1Yih4KTtcbiAgICAgICAgQy5pc3ViKEEpO1xuICAgICAgICBELmlzdWIoQik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGE6IEMsXG4gICAgICBiOiBELFxuICAgICAgZ2NkOiB5Lml1c2hsbihnKVxuICAgIH07XG4gIH07XG5cbiAgLy8gVGhpcyBpcyByZWR1Y2VkIGluY2FybmF0aW9uIG9mIHRoZSBiaW5hcnkgRUVBXG4gIC8vIGFib3ZlLCBkZXNpZ25hdGVkIHRvIGludmVydCBtZW1iZXJzIG9mIHRoZVxuICAvLyBfcHJpbWVfIGZpZWxkcyBGKHApIGF0IGEgbWF4aW1hbCBzcGVlZFxuICBCTi5wcm90b3R5cGUuX2ludm1wID0gZnVuY3Rpb24gX2ludm1wIChwKSB7XG4gICAgYXNzZXJ0KHAubmVnYXRpdmUgPT09IDApO1xuICAgIGFzc2VydCghcC5pc1plcm8oKSk7XG5cbiAgICB2YXIgYSA9IHRoaXM7XG4gICAgdmFyIGIgPSBwLmNsb25lKCk7XG5cbiAgICBpZiAoYS5uZWdhdGl2ZSAhPT0gMCkge1xuICAgICAgYSA9IGEudW1vZChwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgYSA9IGEuY2xvbmUoKTtcbiAgICB9XG5cbiAgICB2YXIgeDEgPSBuZXcgQk4oMSk7XG4gICAgdmFyIHgyID0gbmV3IEJOKDApO1xuXG4gICAgdmFyIGRlbHRhID0gYi5jbG9uZSgpO1xuXG4gICAgd2hpbGUgKGEuY21wbigxKSA+IDAgJiYgYi5jbXBuKDEpID4gMCkge1xuICAgICAgZm9yICh2YXIgaSA9IDAsIGltID0gMTsgKGEud29yZHNbMF0gJiBpbSkgPT09IDAgJiYgaSA8IDI2OyArK2ksIGltIDw8PSAxKTtcbiAgICAgIGlmIChpID4gMCkge1xuICAgICAgICBhLml1c2hybihpKTtcbiAgICAgICAgd2hpbGUgKGktLSA+IDApIHtcbiAgICAgICAgICBpZiAoeDEuaXNPZGQoKSkge1xuICAgICAgICAgICAgeDEuaWFkZChkZWx0YSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgeDEuaXVzaHJuKDEpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZvciAodmFyIGogPSAwLCBqbSA9IDE7IChiLndvcmRzWzBdICYgam0pID09PSAwICYmIGogPCAyNjsgKytqLCBqbSA8PD0gMSk7XG4gICAgICBpZiAoaiA+IDApIHtcbiAgICAgICAgYi5pdXNocm4oaik7XG4gICAgICAgIHdoaWxlIChqLS0gPiAwKSB7XG4gICAgICAgICAgaWYgKHgyLmlzT2RkKCkpIHtcbiAgICAgICAgICAgIHgyLmlhZGQoZGVsdGEpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHgyLml1c2hybigxKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoYS5jbXAoYikgPj0gMCkge1xuICAgICAgICBhLmlzdWIoYik7XG4gICAgICAgIHgxLmlzdWIoeDIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYi5pc3ViKGEpO1xuICAgICAgICB4Mi5pc3ViKHgxKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgcmVzO1xuICAgIGlmIChhLmNtcG4oMSkgPT09IDApIHtcbiAgICAgIHJlcyA9IHgxO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXMgPSB4MjtcbiAgICB9XG5cbiAgICBpZiAocmVzLmNtcG4oMCkgPCAwKSB7XG4gICAgICByZXMuaWFkZChwKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5nY2QgPSBmdW5jdGlvbiBnY2QgKG51bSkge1xuICAgIGlmICh0aGlzLmlzWmVybygpKSByZXR1cm4gbnVtLmFicygpO1xuICAgIGlmIChudW0uaXNaZXJvKCkpIHJldHVybiB0aGlzLmFicygpO1xuXG4gICAgdmFyIGEgPSB0aGlzLmNsb25lKCk7XG4gICAgdmFyIGIgPSBudW0uY2xvbmUoKTtcbiAgICBhLm5lZ2F0aXZlID0gMDtcbiAgICBiLm5lZ2F0aXZlID0gMDtcblxuICAgIC8vIFJlbW92ZSBjb21tb24gZmFjdG9yIG9mIHR3b1xuICAgIGZvciAodmFyIHNoaWZ0ID0gMDsgYS5pc0V2ZW4oKSAmJiBiLmlzRXZlbigpOyBzaGlmdCsrKSB7XG4gICAgICBhLml1c2hybigxKTtcbiAgICAgIGIuaXVzaHJuKDEpO1xuICAgIH1cblxuICAgIGRvIHtcbiAgICAgIHdoaWxlIChhLmlzRXZlbigpKSB7XG4gICAgICAgIGEuaXVzaHJuKDEpO1xuICAgICAgfVxuICAgICAgd2hpbGUgKGIuaXNFdmVuKCkpIHtcbiAgICAgICAgYi5pdXNocm4oMSk7XG4gICAgICB9XG5cbiAgICAgIHZhciByID0gYS5jbXAoYik7XG4gICAgICBpZiAociA8IDApIHtcbiAgICAgICAgLy8gU3dhcCBgYWAgYW5kIGBiYCB0byBtYWtlIGBhYCBhbHdheXMgYmlnZ2VyIHRoYW4gYGJgXG4gICAgICAgIHZhciB0ID0gYTtcbiAgICAgICAgYSA9IGI7XG4gICAgICAgIGIgPSB0O1xuICAgICAgfSBlbHNlIGlmIChyID09PSAwIHx8IGIuY21wbigxKSA9PT0gMCkge1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgYS5pc3ViKGIpO1xuICAgIH0gd2hpbGUgKHRydWUpO1xuXG4gICAgcmV0dXJuIGIuaXVzaGxuKHNoaWZ0KTtcbiAgfTtcblxuICAvLyBJbnZlcnQgbnVtYmVyIGluIHRoZSBmaWVsZCBGKG51bSlcbiAgQk4ucHJvdG90eXBlLmludm0gPSBmdW5jdGlvbiBpbnZtIChudW0pIHtcbiAgICByZXR1cm4gdGhpcy5lZ2NkKG51bSkuYS51bW9kKG51bSk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmlzRXZlbiA9IGZ1bmN0aW9uIGlzRXZlbiAoKSB7XG4gICAgcmV0dXJuICh0aGlzLndvcmRzWzBdICYgMSkgPT09IDA7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmlzT2RkID0gZnVuY3Rpb24gaXNPZGQgKCkge1xuICAgIHJldHVybiAodGhpcy53b3Jkc1swXSAmIDEpID09PSAxO1xuICB9O1xuXG4gIC8vIEFuZCBmaXJzdCB3b3JkIGFuZCBudW1cbiAgQk4ucHJvdG90eXBlLmFuZGxuID0gZnVuY3Rpb24gYW5kbG4gKG51bSkge1xuICAgIHJldHVybiB0aGlzLndvcmRzWzBdICYgbnVtO1xuICB9O1xuXG4gIC8vIEluY3JlbWVudCBhdCB0aGUgYml0IHBvc2l0aW9uIGluLWxpbmVcbiAgQk4ucHJvdG90eXBlLmJpbmNuID0gZnVuY3Rpb24gYmluY24gKGJpdCkge1xuICAgIGFzc2VydCh0eXBlb2YgYml0ID09PSAnbnVtYmVyJyk7XG4gICAgdmFyIHIgPSBiaXQgJSAyNjtcbiAgICB2YXIgcyA9IChiaXQgLSByKSAvIDI2O1xuICAgIHZhciBxID0gMSA8PCByO1xuXG4gICAgLy8gRmFzdCBjYXNlOiBiaXQgaXMgbXVjaCBoaWdoZXIgdGhhbiBhbGwgZXhpc3Rpbmcgd29yZHNcbiAgICBpZiAodGhpcy5sZW5ndGggPD0gcykge1xuICAgICAgdGhpcy5fZXhwYW5kKHMgKyAxKTtcbiAgICAgIHRoaXMud29yZHNbc10gfD0gcTtcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8vIEFkZCBiaXQgYW5kIHByb3BhZ2F0ZSwgaWYgbmVlZGVkXG4gICAgdmFyIGNhcnJ5ID0gcTtcbiAgICBmb3IgKHZhciBpID0gczsgY2FycnkgIT09IDAgJiYgaSA8IHRoaXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciB3ID0gdGhpcy53b3Jkc1tpXSB8IDA7XG4gICAgICB3ICs9IGNhcnJ5O1xuICAgICAgY2FycnkgPSB3ID4+PiAyNjtcbiAgICAgIHcgJj0gMHgzZmZmZmZmO1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IHc7XG4gICAgfVxuICAgIGlmIChjYXJyeSAhPT0gMCkge1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IGNhcnJ5O1xuICAgICAgdGhpcy5sZW5ndGgrKztcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmlzWmVybyA9IGZ1bmN0aW9uIGlzWmVybyAoKSB7XG4gICAgcmV0dXJuIHRoaXMubGVuZ3RoID09PSAxICYmIHRoaXMud29yZHNbMF0gPT09IDA7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmNtcG4gPSBmdW5jdGlvbiBjbXBuIChudW0pIHtcbiAgICB2YXIgbmVnYXRpdmUgPSBudW0gPCAwO1xuXG4gICAgaWYgKHRoaXMubmVnYXRpdmUgIT09IDAgJiYgIW5lZ2F0aXZlKSByZXR1cm4gLTE7XG4gICAgaWYgKHRoaXMubmVnYXRpdmUgPT09IDAgJiYgbmVnYXRpdmUpIHJldHVybiAxO1xuXG4gICAgdGhpcy5zdHJpcCgpO1xuXG4gICAgdmFyIHJlcztcbiAgICBpZiAodGhpcy5sZW5ndGggPiAxKSB7XG4gICAgICByZXMgPSAxO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAobmVnYXRpdmUpIHtcbiAgICAgICAgbnVtID0gLW51bTtcbiAgICAgIH1cblxuICAgICAgYXNzZXJ0KG51bSA8PSAweDNmZmZmZmYsICdOdW1iZXIgaXMgdG9vIGJpZycpO1xuXG4gICAgICB2YXIgdyA9IHRoaXMud29yZHNbMF0gfCAwO1xuICAgICAgcmVzID0gdyA9PT0gbnVtID8gMCA6IHcgPCBudW0gPyAtMSA6IDE7XG4gICAgfVxuICAgIGlmICh0aGlzLm5lZ2F0aXZlICE9PSAwKSByZXR1cm4gLXJlcyB8IDA7XG4gICAgcmV0dXJuIHJlcztcbiAgfTtcblxuICAvLyBDb21wYXJlIHR3byBudW1iZXJzIGFuZCByZXR1cm46XG4gIC8vIDEgLSBpZiBgdGhpc2AgPiBgbnVtYFxuICAvLyAwIC0gaWYgYHRoaXNgID09IGBudW1gXG4gIC8vIC0xIC0gaWYgYHRoaXNgIDwgYG51bWBcbiAgQk4ucHJvdG90eXBlLmNtcCA9IGZ1bmN0aW9uIGNtcCAobnVtKSB7XG4gICAgaWYgKHRoaXMubmVnYXRpdmUgIT09IDAgJiYgbnVtLm5lZ2F0aXZlID09PSAwKSByZXR1cm4gLTE7XG4gICAgaWYgKHRoaXMubmVnYXRpdmUgPT09IDAgJiYgbnVtLm5lZ2F0aXZlICE9PSAwKSByZXR1cm4gMTtcblxuICAgIHZhciByZXMgPSB0aGlzLnVjbXAobnVtKTtcbiAgICBpZiAodGhpcy5uZWdhdGl2ZSAhPT0gMCkgcmV0dXJuIC1yZXMgfCAwO1xuICAgIHJldHVybiByZXM7XG4gIH07XG5cbiAgLy8gVW5zaWduZWQgY29tcGFyaXNvblxuICBCTi5wcm90b3R5cGUudWNtcCA9IGZ1bmN0aW9uIHVjbXAgKG51bSkge1xuICAgIC8vIEF0IHRoaXMgcG9pbnQgYm90aCBudW1iZXJzIGhhdmUgdGhlIHNhbWUgc2lnblxuICAgIGlmICh0aGlzLmxlbmd0aCA+IG51bS5sZW5ndGgpIHJldHVybiAxO1xuICAgIGlmICh0aGlzLmxlbmd0aCA8IG51bS5sZW5ndGgpIHJldHVybiAtMTtcblxuICAgIHZhciByZXMgPSAwO1xuICAgIGZvciAodmFyIGkgPSB0aGlzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICB2YXIgYSA9IHRoaXMud29yZHNbaV0gfCAwO1xuICAgICAgdmFyIGIgPSBudW0ud29yZHNbaV0gfCAwO1xuXG4gICAgICBpZiAoYSA9PT0gYikgY29udGludWU7XG4gICAgICBpZiAoYSA8IGIpIHtcbiAgICAgICAgcmVzID0gLTE7XG4gICAgICB9IGVsc2UgaWYgKGEgPiBiKSB7XG4gICAgICAgIHJlcyA9IDE7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIHJlcztcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuZ3RuID0gZnVuY3Rpb24gZ3RuIChudW0pIHtcbiAgICByZXR1cm4gdGhpcy5jbXBuKG51bSkgPT09IDE7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmd0ID0gZnVuY3Rpb24gZ3QgKG51bSkge1xuICAgIHJldHVybiB0aGlzLmNtcChudW0pID09PSAxO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5ndGVuID0gZnVuY3Rpb24gZ3RlbiAobnVtKSB7XG4gICAgcmV0dXJuIHRoaXMuY21wbihudW0pID49IDA7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmd0ZSA9IGZ1bmN0aW9uIGd0ZSAobnVtKSB7XG4gICAgcmV0dXJuIHRoaXMuY21wKG51bSkgPj0gMDtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUubHRuID0gZnVuY3Rpb24gbHRuIChudW0pIHtcbiAgICByZXR1cm4gdGhpcy5jbXBuKG51bSkgPT09IC0xO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5sdCA9IGZ1bmN0aW9uIGx0IChudW0pIHtcbiAgICByZXR1cm4gdGhpcy5jbXAobnVtKSA9PT0gLTE7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmx0ZW4gPSBmdW5jdGlvbiBsdGVuIChudW0pIHtcbiAgICByZXR1cm4gdGhpcy5jbXBuKG51bSkgPD0gMDtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUubHRlID0gZnVuY3Rpb24gbHRlIChudW0pIHtcbiAgICByZXR1cm4gdGhpcy5jbXAobnVtKSA8PSAwO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5lcW4gPSBmdW5jdGlvbiBlcW4gKG51bSkge1xuICAgIHJldHVybiB0aGlzLmNtcG4obnVtKSA9PT0gMDtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuZXEgPSBmdW5jdGlvbiBlcSAobnVtKSB7XG4gICAgcmV0dXJuIHRoaXMuY21wKG51bSkgPT09IDA7XG4gIH07XG5cbiAgLy9cbiAgLy8gQSByZWR1Y2UgY29udGV4dCwgY291bGQgYmUgdXNpbmcgbW9udGdvbWVyeSBvciBzb21ldGhpbmcgYmV0dGVyLCBkZXBlbmRpbmdcbiAgLy8gb24gdGhlIGBtYCBpdHNlbGYuXG4gIC8vXG4gIEJOLnJlZCA9IGZ1bmN0aW9uIHJlZCAobnVtKSB7XG4gICAgcmV0dXJuIG5ldyBSZWQobnVtKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUudG9SZWQgPSBmdW5jdGlvbiB0b1JlZCAoY3R4KSB7XG4gICAgYXNzZXJ0KCF0aGlzLnJlZCwgJ0FscmVhZHkgYSBudW1iZXIgaW4gcmVkdWN0aW9uIGNvbnRleHQnKTtcbiAgICBhc3NlcnQodGhpcy5uZWdhdGl2ZSA9PT0gMCwgJ3JlZCB3b3JrcyBvbmx5IHdpdGggcG9zaXRpdmVzJyk7XG4gICAgcmV0dXJuIGN0eC5jb252ZXJ0VG8odGhpcykuX2ZvcmNlUmVkKGN0eCk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmZyb21SZWQgPSBmdW5jdGlvbiBmcm9tUmVkICgpIHtcbiAgICBhc3NlcnQodGhpcy5yZWQsICdmcm9tUmVkIHdvcmtzIG9ubHkgd2l0aCBudW1iZXJzIGluIHJlZHVjdGlvbiBjb250ZXh0Jyk7XG4gICAgcmV0dXJuIHRoaXMucmVkLmNvbnZlcnRGcm9tKHRoaXMpO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5fZm9yY2VSZWQgPSBmdW5jdGlvbiBfZm9yY2VSZWQgKGN0eCkge1xuICAgIHRoaXMucmVkID0gY3R4O1xuICAgIHJldHVybiB0aGlzO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5mb3JjZVJlZCA9IGZ1bmN0aW9uIGZvcmNlUmVkIChjdHgpIHtcbiAgICBhc3NlcnQoIXRoaXMucmVkLCAnQWxyZWFkeSBhIG51bWJlciBpbiByZWR1Y3Rpb24gY29udGV4dCcpO1xuICAgIHJldHVybiB0aGlzLl9mb3JjZVJlZChjdHgpO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5yZWRBZGQgPSBmdW5jdGlvbiByZWRBZGQgKG51bSkge1xuICAgIGFzc2VydCh0aGlzLnJlZCwgJ3JlZEFkZCB3b3JrcyBvbmx5IHdpdGggcmVkIG51bWJlcnMnKTtcbiAgICByZXR1cm4gdGhpcy5yZWQuYWRkKHRoaXMsIG51bSk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLnJlZElBZGQgPSBmdW5jdGlvbiByZWRJQWRkIChudW0pIHtcbiAgICBhc3NlcnQodGhpcy5yZWQsICdyZWRJQWRkIHdvcmtzIG9ubHkgd2l0aCByZWQgbnVtYmVycycpO1xuICAgIHJldHVybiB0aGlzLnJlZC5pYWRkKHRoaXMsIG51bSk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLnJlZFN1YiA9IGZ1bmN0aW9uIHJlZFN1YiAobnVtKSB7XG4gICAgYXNzZXJ0KHRoaXMucmVkLCAncmVkU3ViIHdvcmtzIG9ubHkgd2l0aCByZWQgbnVtYmVycycpO1xuICAgIHJldHVybiB0aGlzLnJlZC5zdWIodGhpcywgbnVtKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUucmVkSVN1YiA9IGZ1bmN0aW9uIHJlZElTdWIgKG51bSkge1xuICAgIGFzc2VydCh0aGlzLnJlZCwgJ3JlZElTdWIgd29ya3Mgb25seSB3aXRoIHJlZCBudW1iZXJzJyk7XG4gICAgcmV0dXJuIHRoaXMucmVkLmlzdWIodGhpcywgbnVtKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUucmVkU2hsID0gZnVuY3Rpb24gcmVkU2hsIChudW0pIHtcbiAgICBhc3NlcnQodGhpcy5yZWQsICdyZWRTaGwgd29ya3Mgb25seSB3aXRoIHJlZCBudW1iZXJzJyk7XG4gICAgcmV0dXJuIHRoaXMucmVkLnNobCh0aGlzLCBudW0pO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5yZWRNdWwgPSBmdW5jdGlvbiByZWRNdWwgKG51bSkge1xuICAgIGFzc2VydCh0aGlzLnJlZCwgJ3JlZE11bCB3b3JrcyBvbmx5IHdpdGggcmVkIG51bWJlcnMnKTtcbiAgICB0aGlzLnJlZC5fdmVyaWZ5Mih0aGlzLCBudW0pO1xuICAgIHJldHVybiB0aGlzLnJlZC5tdWwodGhpcywgbnVtKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUucmVkSU11bCA9IGZ1bmN0aW9uIHJlZElNdWwgKG51bSkge1xuICAgIGFzc2VydCh0aGlzLnJlZCwgJ3JlZE11bCB3b3JrcyBvbmx5IHdpdGggcmVkIG51bWJlcnMnKTtcbiAgICB0aGlzLnJlZC5fdmVyaWZ5Mih0aGlzLCBudW0pO1xuICAgIHJldHVybiB0aGlzLnJlZC5pbXVsKHRoaXMsIG51bSk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLnJlZFNxciA9IGZ1bmN0aW9uIHJlZFNxciAoKSB7XG4gICAgYXNzZXJ0KHRoaXMucmVkLCAncmVkU3FyIHdvcmtzIG9ubHkgd2l0aCByZWQgbnVtYmVycycpO1xuICAgIHRoaXMucmVkLl92ZXJpZnkxKHRoaXMpO1xuICAgIHJldHVybiB0aGlzLnJlZC5zcXIodGhpcyk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLnJlZElTcXIgPSBmdW5jdGlvbiByZWRJU3FyICgpIHtcbiAgICBhc3NlcnQodGhpcy5yZWQsICdyZWRJU3FyIHdvcmtzIG9ubHkgd2l0aCByZWQgbnVtYmVycycpO1xuICAgIHRoaXMucmVkLl92ZXJpZnkxKHRoaXMpO1xuICAgIHJldHVybiB0aGlzLnJlZC5pc3FyKHRoaXMpO1xuICB9O1xuXG4gIC8vIFNxdWFyZSByb290IG92ZXIgcFxuICBCTi5wcm90b3R5cGUucmVkU3FydCA9IGZ1bmN0aW9uIHJlZFNxcnQgKCkge1xuICAgIGFzc2VydCh0aGlzLnJlZCwgJ3JlZFNxcnQgd29ya3Mgb25seSB3aXRoIHJlZCBudW1iZXJzJyk7XG4gICAgdGhpcy5yZWQuX3ZlcmlmeTEodGhpcyk7XG4gICAgcmV0dXJuIHRoaXMucmVkLnNxcnQodGhpcyk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLnJlZEludm0gPSBmdW5jdGlvbiByZWRJbnZtICgpIHtcbiAgICBhc3NlcnQodGhpcy5yZWQsICdyZWRJbnZtIHdvcmtzIG9ubHkgd2l0aCByZWQgbnVtYmVycycpO1xuICAgIHRoaXMucmVkLl92ZXJpZnkxKHRoaXMpO1xuICAgIHJldHVybiB0aGlzLnJlZC5pbnZtKHRoaXMpO1xuICB9O1xuXG4gIC8vIFJldHVybiBuZWdhdGl2ZSBjbG9uZSBvZiBgdGhpc2AgJSBgcmVkIG1vZHVsb2BcbiAgQk4ucHJvdG90eXBlLnJlZE5lZyA9IGZ1bmN0aW9uIHJlZE5lZyAoKSB7XG4gICAgYXNzZXJ0KHRoaXMucmVkLCAncmVkTmVnIHdvcmtzIG9ubHkgd2l0aCByZWQgbnVtYmVycycpO1xuICAgIHRoaXMucmVkLl92ZXJpZnkxKHRoaXMpO1xuICAgIHJldHVybiB0aGlzLnJlZC5uZWcodGhpcyk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLnJlZFBvdyA9IGZ1bmN0aW9uIHJlZFBvdyAobnVtKSB7XG4gICAgYXNzZXJ0KHRoaXMucmVkICYmICFudW0ucmVkLCAncmVkUG93KG5vcm1hbE51bSknKTtcbiAgICB0aGlzLnJlZC5fdmVyaWZ5MSh0aGlzKTtcbiAgICByZXR1cm4gdGhpcy5yZWQucG93KHRoaXMsIG51bSk7XG4gIH07XG5cbiAgLy8gUHJpbWUgbnVtYmVycyB3aXRoIGVmZmljaWVudCByZWR1Y3Rpb25cbiAgdmFyIHByaW1lcyA9IHtcbiAgICBrMjU2OiBudWxsLFxuICAgIHAyMjQ6IG51bGwsXG4gICAgcDE5MjogbnVsbCxcbiAgICBwMjU1MTk6IG51bGxcbiAgfTtcblxuICAvLyBQc2V1ZG8tTWVyc2VubmUgcHJpbWVcbiAgZnVuY3Rpb24gTVByaW1lIChuYW1lLCBwKSB7XG4gICAgLy8gUCA9IDIgXiBOIC0gS1xuICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgdGhpcy5wID0gbmV3IEJOKHAsIDE2KTtcbiAgICB0aGlzLm4gPSB0aGlzLnAuYml0TGVuZ3RoKCk7XG4gICAgdGhpcy5rID0gbmV3IEJOKDEpLml1c2hsbih0aGlzLm4pLmlzdWIodGhpcy5wKTtcblxuICAgIHRoaXMudG1wID0gdGhpcy5fdG1wKCk7XG4gIH1cblxuICBNUHJpbWUucHJvdG90eXBlLl90bXAgPSBmdW5jdGlvbiBfdG1wICgpIHtcbiAgICB2YXIgdG1wID0gbmV3IEJOKG51bGwpO1xuICAgIHRtcC53b3JkcyA9IG5ldyBBcnJheShNYXRoLmNlaWwodGhpcy5uIC8gMTMpKTtcbiAgICByZXR1cm4gdG1wO1xuICB9O1xuXG4gIE1QcmltZS5wcm90b3R5cGUuaXJlZHVjZSA9IGZ1bmN0aW9uIGlyZWR1Y2UgKG51bSkge1xuICAgIC8vIEFzc3VtZXMgdGhhdCBgbnVtYCBpcyBsZXNzIHRoYW4gYFBeMmBcbiAgICAvLyBudW0gPSBISSAqICgyIF4gTiAtIEspICsgSEkgKiBLICsgTE8gPSBISSAqIEsgKyBMTyAobW9kIFApXG4gICAgdmFyIHIgPSBudW07XG4gICAgdmFyIHJsZW47XG5cbiAgICBkbyB7XG4gICAgICB0aGlzLnNwbGl0KHIsIHRoaXMudG1wKTtcbiAgICAgIHIgPSB0aGlzLmltdWxLKHIpO1xuICAgICAgciA9IHIuaWFkZCh0aGlzLnRtcCk7XG4gICAgICBybGVuID0gci5iaXRMZW5ndGgoKTtcbiAgICB9IHdoaWxlIChybGVuID4gdGhpcy5uKTtcblxuICAgIHZhciBjbXAgPSBybGVuIDwgdGhpcy5uID8gLTEgOiByLnVjbXAodGhpcy5wKTtcbiAgICBpZiAoY21wID09PSAwKSB7XG4gICAgICByLndvcmRzWzBdID0gMDtcbiAgICAgIHIubGVuZ3RoID0gMTtcbiAgICB9IGVsc2UgaWYgKGNtcCA+IDApIHtcbiAgICAgIHIuaXN1Yih0aGlzLnApO1xuICAgIH0gZWxzZSB7XG4gICAgICByLnN0cmlwKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHI7XG4gIH07XG5cbiAgTVByaW1lLnByb3RvdHlwZS5zcGxpdCA9IGZ1bmN0aW9uIHNwbGl0IChpbnB1dCwgb3V0KSB7XG4gICAgaW5wdXQuaXVzaHJuKHRoaXMubiwgMCwgb3V0KTtcbiAgfTtcblxuICBNUHJpbWUucHJvdG90eXBlLmltdWxLID0gZnVuY3Rpb24gaW11bEsgKG51bSkge1xuICAgIHJldHVybiBudW0uaW11bCh0aGlzLmspO1xuICB9O1xuXG4gIGZ1bmN0aW9uIEsyNTYgKCkge1xuICAgIE1QcmltZS5jYWxsKFxuICAgICAgdGhpcyxcbiAgICAgICdrMjU2JyxcbiAgICAgICdmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZSBmZmZmZmMyZicpO1xuICB9XG4gIGluaGVyaXRzKEsyNTYsIE1QcmltZSk7XG5cbiAgSzI1Ni5wcm90b3R5cGUuc3BsaXQgPSBmdW5jdGlvbiBzcGxpdCAoaW5wdXQsIG91dHB1dCkge1xuICAgIC8vIDI1NiA9IDkgKiAyNiArIDIyXG4gICAgdmFyIG1hc2sgPSAweDNmZmZmZjtcblxuICAgIHZhciBvdXRMZW4gPSBNYXRoLm1pbihpbnB1dC5sZW5ndGgsIDkpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgb3V0TGVuOyBpKyspIHtcbiAgICAgIG91dHB1dC53b3Jkc1tpXSA9IGlucHV0LndvcmRzW2ldO1xuICAgIH1cbiAgICBvdXRwdXQubGVuZ3RoID0gb3V0TGVuO1xuXG4gICAgaWYgKGlucHV0Lmxlbmd0aCA8PSA5KSB7XG4gICAgICBpbnB1dC53b3Jkc1swXSA9IDA7XG4gICAgICBpbnB1dC5sZW5ndGggPSAxO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFNoaWZ0IGJ5IDkgbGltYnNcbiAgICB2YXIgcHJldiA9IGlucHV0LndvcmRzWzldO1xuICAgIG91dHB1dC53b3Jkc1tvdXRwdXQubGVuZ3RoKytdID0gcHJldiAmIG1hc2s7XG5cbiAgICBmb3IgKGkgPSAxMDsgaSA8IGlucHV0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgbmV4dCA9IGlucHV0LndvcmRzW2ldIHwgMDtcbiAgICAgIGlucHV0LndvcmRzW2kgLSAxMF0gPSAoKG5leHQgJiBtYXNrKSA8PCA0KSB8IChwcmV2ID4+PiAyMik7XG4gICAgICBwcmV2ID0gbmV4dDtcbiAgICB9XG4gICAgcHJldiA+Pj49IDIyO1xuICAgIGlucHV0LndvcmRzW2kgLSAxMF0gPSBwcmV2O1xuICAgIGlmIChwcmV2ID09PSAwICYmIGlucHV0Lmxlbmd0aCA+IDEwKSB7XG4gICAgICBpbnB1dC5sZW5ndGggLT0gMTA7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlucHV0Lmxlbmd0aCAtPSA5O1xuICAgIH1cbiAgfTtcblxuICBLMjU2LnByb3RvdHlwZS5pbXVsSyA9IGZ1bmN0aW9uIGltdWxLIChudW0pIHtcbiAgICAvLyBLID0gMHgxMDAwMDAzZDEgPSBbIDB4NDAsIDB4M2QxIF1cbiAgICBudW0ud29yZHNbbnVtLmxlbmd0aF0gPSAwO1xuICAgIG51bS53b3Jkc1tudW0ubGVuZ3RoICsgMV0gPSAwO1xuICAgIG51bS5sZW5ndGggKz0gMjtcblxuICAgIC8vIGJvdW5kZWQgYXQ6IDB4NDAgKiAweDNmZmZmZmYgKyAweDNkMCA9IDB4MTAwMDAwMzkwXG4gICAgdmFyIGxvID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bS5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHcgPSBudW0ud29yZHNbaV0gfCAwO1xuICAgICAgbG8gKz0gdyAqIDB4M2QxO1xuICAgICAgbnVtLndvcmRzW2ldID0gbG8gJiAweDNmZmZmZmY7XG4gICAgICBsbyA9IHcgKiAweDQwICsgKChsbyAvIDB4NDAwMDAwMCkgfCAwKTtcbiAgICB9XG5cbiAgICAvLyBGYXN0IGxlbmd0aCByZWR1Y3Rpb25cbiAgICBpZiAobnVtLndvcmRzW251bS5sZW5ndGggLSAxXSA9PT0gMCkge1xuICAgICAgbnVtLmxlbmd0aC0tO1xuICAgICAgaWYgKG51bS53b3Jkc1tudW0ubGVuZ3RoIC0gMV0gPT09IDApIHtcbiAgICAgICAgbnVtLmxlbmd0aC0tO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbnVtO1xuICB9O1xuXG4gIGZ1bmN0aW9uIFAyMjQgKCkge1xuICAgIE1QcmltZS5jYWxsKFxuICAgICAgdGhpcyxcbiAgICAgICdwMjI0JyxcbiAgICAgICdmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiAwMDAwMDAwMCAwMDAwMDAwMCAwMDAwMDAwMScpO1xuICB9XG4gIGluaGVyaXRzKFAyMjQsIE1QcmltZSk7XG5cbiAgZnVuY3Rpb24gUDE5MiAoKSB7XG4gICAgTVByaW1lLmNhbGwoXG4gICAgICB0aGlzLFxuICAgICAgJ3AxOTInLFxuICAgICAgJ2ZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZlIGZmZmZmZmZmIGZmZmZmZmZmJyk7XG4gIH1cbiAgaW5oZXJpdHMoUDE5MiwgTVByaW1lKTtcblxuICBmdW5jdGlvbiBQMjU1MTkgKCkge1xuICAgIC8vIDIgXiAyNTUgLSAxOVxuICAgIE1QcmltZS5jYWxsKFxuICAgICAgdGhpcyxcbiAgICAgICcyNTUxOScsXG4gICAgICAnN2ZmZmZmZmZmZmZmZmZmZiBmZmZmZmZmZmZmZmZmZmZmIGZmZmZmZmZmZmZmZmZmZmYgZmZmZmZmZmZmZmZmZmZlZCcpO1xuICB9XG4gIGluaGVyaXRzKFAyNTUxOSwgTVByaW1lKTtcblxuICBQMjU1MTkucHJvdG90eXBlLmltdWxLID0gZnVuY3Rpb24gaW11bEsgKG51bSkge1xuICAgIC8vIEsgPSAweDEzXG4gICAgdmFyIGNhcnJ5ID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bS5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGhpID0gKG51bS53b3Jkc1tpXSB8IDApICogMHgxMyArIGNhcnJ5O1xuICAgICAgdmFyIGxvID0gaGkgJiAweDNmZmZmZmY7XG4gICAgICBoaSA+Pj49IDI2O1xuXG4gICAgICBudW0ud29yZHNbaV0gPSBsbztcbiAgICAgIGNhcnJ5ID0gaGk7XG4gICAgfVxuICAgIGlmIChjYXJyeSAhPT0gMCkge1xuICAgICAgbnVtLndvcmRzW251bS5sZW5ndGgrK10gPSBjYXJyeTtcbiAgICB9XG4gICAgcmV0dXJuIG51bTtcbiAgfTtcblxuICAvLyBFeHBvcnRlZCBtb3N0bHkgZm9yIHRlc3RpbmcgcHVycG9zZXMsIHVzZSBwbGFpbiBuYW1lIGluc3RlYWRcbiAgQk4uX3ByaW1lID0gZnVuY3Rpb24gcHJpbWUgKG5hbWUpIHtcbiAgICAvLyBDYWNoZWQgdmVyc2lvbiBvZiBwcmltZVxuICAgIGlmIChwcmltZXNbbmFtZV0pIHJldHVybiBwcmltZXNbbmFtZV07XG5cbiAgICB2YXIgcHJpbWU7XG4gICAgaWYgKG5hbWUgPT09ICdrMjU2Jykge1xuICAgICAgcHJpbWUgPSBuZXcgSzI1NigpO1xuICAgIH0gZWxzZSBpZiAobmFtZSA9PT0gJ3AyMjQnKSB7XG4gICAgICBwcmltZSA9IG5ldyBQMjI0KCk7XG4gICAgfSBlbHNlIGlmIChuYW1lID09PSAncDE5MicpIHtcbiAgICAgIHByaW1lID0gbmV3IFAxOTIoKTtcbiAgICB9IGVsc2UgaWYgKG5hbWUgPT09ICdwMjU1MTknKSB7XG4gICAgICBwcmltZSA9IG5ldyBQMjU1MTkoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIHByaW1lICcgKyBuYW1lKTtcbiAgICB9XG4gICAgcHJpbWVzW25hbWVdID0gcHJpbWU7XG5cbiAgICByZXR1cm4gcHJpbWU7XG4gIH07XG5cbiAgLy9cbiAgLy8gQmFzZSByZWR1Y3Rpb24gZW5naW5lXG4gIC8vXG4gIGZ1bmN0aW9uIFJlZCAobSkge1xuICAgIGlmICh0eXBlb2YgbSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHZhciBwcmltZSA9IEJOLl9wcmltZShtKTtcbiAgICAgIHRoaXMubSA9IHByaW1lLnA7XG4gICAgICB0aGlzLnByaW1lID0gcHJpbWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIGFzc2VydChtLmd0bigxKSwgJ21vZHVsdXMgbXVzdCBiZSBncmVhdGVyIHRoYW4gMScpO1xuICAgICAgdGhpcy5tID0gbTtcbiAgICAgIHRoaXMucHJpbWUgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIFJlZC5wcm90b3R5cGUuX3ZlcmlmeTEgPSBmdW5jdGlvbiBfdmVyaWZ5MSAoYSkge1xuICAgIGFzc2VydChhLm5lZ2F0aXZlID09PSAwLCAncmVkIHdvcmtzIG9ubHkgd2l0aCBwb3NpdGl2ZXMnKTtcbiAgICBhc3NlcnQoYS5yZWQsICdyZWQgd29ya3Mgb25seSB3aXRoIHJlZCBudW1iZXJzJyk7XG4gIH07XG5cbiAgUmVkLnByb3RvdHlwZS5fdmVyaWZ5MiA9IGZ1bmN0aW9uIF92ZXJpZnkyIChhLCBiKSB7XG4gICAgYXNzZXJ0KChhLm5lZ2F0aXZlIHwgYi5uZWdhdGl2ZSkgPT09IDAsICdyZWQgd29ya3Mgb25seSB3aXRoIHBvc2l0aXZlcycpO1xuICAgIGFzc2VydChhLnJlZCAmJiBhLnJlZCA9PT0gYi5yZWQsXG4gICAgICAncmVkIHdvcmtzIG9ubHkgd2l0aCByZWQgbnVtYmVycycpO1xuICB9O1xuXG4gIFJlZC5wcm90b3R5cGUuaW1vZCA9IGZ1bmN0aW9uIGltb2QgKGEpIHtcbiAgICBpZiAodGhpcy5wcmltZSkgcmV0dXJuIHRoaXMucHJpbWUuaXJlZHVjZShhKS5fZm9yY2VSZWQodGhpcyk7XG4gICAgcmV0dXJuIGEudW1vZCh0aGlzLm0pLl9mb3JjZVJlZCh0aGlzKTtcbiAgfTtcblxuICBSZWQucHJvdG90eXBlLm5lZyA9IGZ1bmN0aW9uIG5lZyAoYSkge1xuICAgIGlmIChhLmlzWmVybygpKSB7XG4gICAgICByZXR1cm4gYS5jbG9uZSgpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLm0uc3ViKGEpLl9mb3JjZVJlZCh0aGlzKTtcbiAgfTtcblxuICBSZWQucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uIGFkZCAoYSwgYikge1xuICAgIHRoaXMuX3ZlcmlmeTIoYSwgYik7XG5cbiAgICB2YXIgcmVzID0gYS5hZGQoYik7XG4gICAgaWYgKHJlcy5jbXAodGhpcy5tKSA+PSAwKSB7XG4gICAgICByZXMuaXN1Yih0aGlzLm0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzLl9mb3JjZVJlZCh0aGlzKTtcbiAgfTtcblxuICBSZWQucHJvdG90eXBlLmlhZGQgPSBmdW5jdGlvbiBpYWRkIChhLCBiKSB7XG4gICAgdGhpcy5fdmVyaWZ5MihhLCBiKTtcblxuICAgIHZhciByZXMgPSBhLmlhZGQoYik7XG4gICAgaWYgKHJlcy5jbXAodGhpcy5tKSA+PSAwKSB7XG4gICAgICByZXMuaXN1Yih0aGlzLm0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzO1xuICB9O1xuXG4gIFJlZC5wcm90b3R5cGUuc3ViID0gZnVuY3Rpb24gc3ViIChhLCBiKSB7XG4gICAgdGhpcy5fdmVyaWZ5MihhLCBiKTtcblxuICAgIHZhciByZXMgPSBhLnN1YihiKTtcbiAgICBpZiAocmVzLmNtcG4oMCkgPCAwKSB7XG4gICAgICByZXMuaWFkZCh0aGlzLm0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzLl9mb3JjZVJlZCh0aGlzKTtcbiAgfTtcblxuICBSZWQucHJvdG90eXBlLmlzdWIgPSBmdW5jdGlvbiBpc3ViIChhLCBiKSB7XG4gICAgdGhpcy5fdmVyaWZ5MihhLCBiKTtcblxuICAgIHZhciByZXMgPSBhLmlzdWIoYik7XG4gICAgaWYgKHJlcy5jbXBuKDApIDwgMCkge1xuICAgICAgcmVzLmlhZGQodGhpcy5tKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcztcbiAgfTtcblxuICBSZWQucHJvdG90eXBlLnNobCA9IGZ1bmN0aW9uIHNobCAoYSwgbnVtKSB7XG4gICAgdGhpcy5fdmVyaWZ5MShhKTtcbiAgICByZXR1cm4gdGhpcy5pbW9kKGEudXNobG4obnVtKSk7XG4gIH07XG5cbiAgUmVkLnByb3RvdHlwZS5pbXVsID0gZnVuY3Rpb24gaW11bCAoYSwgYikge1xuICAgIHRoaXMuX3ZlcmlmeTIoYSwgYik7XG4gICAgcmV0dXJuIHRoaXMuaW1vZChhLmltdWwoYikpO1xuICB9O1xuXG4gIFJlZC5wcm90b3R5cGUubXVsID0gZnVuY3Rpb24gbXVsIChhLCBiKSB7XG4gICAgdGhpcy5fdmVyaWZ5MihhLCBiKTtcbiAgICByZXR1cm4gdGhpcy5pbW9kKGEubXVsKGIpKTtcbiAgfTtcblxuICBSZWQucHJvdG90eXBlLmlzcXIgPSBmdW5jdGlvbiBpc3FyIChhKSB7XG4gICAgcmV0dXJuIHRoaXMuaW11bChhLCBhLmNsb25lKCkpO1xuICB9O1xuXG4gIFJlZC5wcm90b3R5cGUuc3FyID0gZnVuY3Rpb24gc3FyIChhKSB7XG4gICAgcmV0dXJuIHRoaXMubXVsKGEsIGEpO1xuICB9O1xuXG4gIFJlZC5wcm90b3R5cGUuc3FydCA9IGZ1bmN0aW9uIHNxcnQgKGEpIHtcbiAgICBpZiAoYS5pc1plcm8oKSkgcmV0dXJuIGEuY2xvbmUoKTtcblxuICAgIHZhciBtb2QzID0gdGhpcy5tLmFuZGxuKDMpO1xuICAgIGFzc2VydChtb2QzICUgMiA9PT0gMSk7XG5cbiAgICAvLyBGYXN0IGNhc2VcbiAgICBpZiAobW9kMyA9PT0gMykge1xuICAgICAgdmFyIHBvdyA9IHRoaXMubS5hZGQobmV3IEJOKDEpKS5pdXNocm4oMik7XG4gICAgICByZXR1cm4gdGhpcy5wb3coYSwgcG93KTtcbiAgICB9XG5cbiAgICAvLyBUb25lbGxpLVNoYW5rcyBhbGdvcml0aG0gKFRvdGFsbHkgdW5vcHRpbWl6ZWQgYW5kIHNsb3cpXG4gICAgLy9cbiAgICAvLyBGaW5kIFEgYW5kIFMsIHRoYXQgUSAqIDIgXiBTID0gKFAgLSAxKVxuICAgIHZhciBxID0gdGhpcy5tLnN1Ym4oMSk7XG4gICAgdmFyIHMgPSAwO1xuICAgIHdoaWxlICghcS5pc1plcm8oKSAmJiBxLmFuZGxuKDEpID09PSAwKSB7XG4gICAgICBzKys7XG4gICAgICBxLml1c2hybigxKTtcbiAgICB9XG4gICAgYXNzZXJ0KCFxLmlzWmVybygpKTtcblxuICAgIHZhciBvbmUgPSBuZXcgQk4oMSkudG9SZWQodGhpcyk7XG4gICAgdmFyIG5PbmUgPSBvbmUucmVkTmVnKCk7XG5cbiAgICAvLyBGaW5kIHF1YWRyYXRpYyBub24tcmVzaWR1ZVxuICAgIC8vIE5PVEU6IE1heCBpcyBzdWNoIGJlY2F1c2Ugb2YgZ2VuZXJhbGl6ZWQgUmllbWFubiBoeXBvdGhlc2lzLlxuICAgIHZhciBscG93ID0gdGhpcy5tLnN1Ym4oMSkuaXVzaHJuKDEpO1xuICAgIHZhciB6ID0gdGhpcy5tLmJpdExlbmd0aCgpO1xuICAgIHogPSBuZXcgQk4oMiAqIHogKiB6KS50b1JlZCh0aGlzKTtcblxuICAgIHdoaWxlICh0aGlzLnBvdyh6LCBscG93KS5jbXAobk9uZSkgIT09IDApIHtcbiAgICAgIHoucmVkSUFkZChuT25lKTtcbiAgICB9XG5cbiAgICB2YXIgYyA9IHRoaXMucG93KHosIHEpO1xuICAgIHZhciByID0gdGhpcy5wb3coYSwgcS5hZGRuKDEpLml1c2hybigxKSk7XG4gICAgdmFyIHQgPSB0aGlzLnBvdyhhLCBxKTtcbiAgICB2YXIgbSA9IHM7XG4gICAgd2hpbGUgKHQuY21wKG9uZSkgIT09IDApIHtcbiAgICAgIHZhciB0bXAgPSB0O1xuICAgICAgZm9yICh2YXIgaSA9IDA7IHRtcC5jbXAob25lKSAhPT0gMDsgaSsrKSB7XG4gICAgICAgIHRtcCA9IHRtcC5yZWRTcXIoKTtcbiAgICAgIH1cbiAgICAgIGFzc2VydChpIDwgbSk7XG4gICAgICB2YXIgYiA9IHRoaXMucG93KGMsIG5ldyBCTigxKS5pdXNobG4obSAtIGkgLSAxKSk7XG5cbiAgICAgIHIgPSByLnJlZE11bChiKTtcbiAgICAgIGMgPSBiLnJlZFNxcigpO1xuICAgICAgdCA9IHQucmVkTXVsKGMpO1xuICAgICAgbSA9IGk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHI7XG4gIH07XG5cbiAgUmVkLnByb3RvdHlwZS5pbnZtID0gZnVuY3Rpb24gaW52bSAoYSkge1xuICAgIHZhciBpbnYgPSBhLl9pbnZtcCh0aGlzLm0pO1xuICAgIGlmIChpbnYubmVnYXRpdmUgIT09IDApIHtcbiAgICAgIGludi5uZWdhdGl2ZSA9IDA7XG4gICAgICByZXR1cm4gdGhpcy5pbW9kKGludikucmVkTmVnKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB0aGlzLmltb2QoaW52KTtcbiAgICB9XG4gIH07XG5cbiAgUmVkLnByb3RvdHlwZS5wb3cgPSBmdW5jdGlvbiBwb3cgKGEsIG51bSkge1xuICAgIGlmIChudW0uaXNaZXJvKCkpIHJldHVybiBuZXcgQk4oMSkudG9SZWQodGhpcyk7XG4gICAgaWYgKG51bS5jbXBuKDEpID09PSAwKSByZXR1cm4gYS5jbG9uZSgpO1xuXG4gICAgdmFyIHdpbmRvd1NpemUgPSA0O1xuICAgIHZhciB3bmQgPSBuZXcgQXJyYXkoMSA8PCB3aW5kb3dTaXplKTtcbiAgICB3bmRbMF0gPSBuZXcgQk4oMSkudG9SZWQodGhpcyk7XG4gICAgd25kWzFdID0gYTtcbiAgICBmb3IgKHZhciBpID0gMjsgaSA8IHduZC5sZW5ndGg7IGkrKykge1xuICAgICAgd25kW2ldID0gdGhpcy5tdWwod25kW2kgLSAxXSwgYSk7XG4gICAgfVxuXG4gICAgdmFyIHJlcyA9IHduZFswXTtcbiAgICB2YXIgY3VycmVudCA9IDA7XG4gICAgdmFyIGN1cnJlbnRMZW4gPSAwO1xuICAgIHZhciBzdGFydCA9IG51bS5iaXRMZW5ndGgoKSAlIDI2O1xuICAgIGlmIChzdGFydCA9PT0gMCkge1xuICAgICAgc3RhcnQgPSAyNjtcbiAgICB9XG5cbiAgICBmb3IgKGkgPSBudW0ubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgIHZhciB3b3JkID0gbnVtLndvcmRzW2ldO1xuICAgICAgZm9yICh2YXIgaiA9IHN0YXJ0IC0gMTsgaiA+PSAwOyBqLS0pIHtcbiAgICAgICAgdmFyIGJpdCA9ICh3b3JkID4+IGopICYgMTtcbiAgICAgICAgaWYgKHJlcyAhPT0gd25kWzBdKSB7XG4gICAgICAgICAgcmVzID0gdGhpcy5zcXIocmVzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChiaXQgPT09IDAgJiYgY3VycmVudCA9PT0gMCkge1xuICAgICAgICAgIGN1cnJlbnRMZW4gPSAwO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY3VycmVudCA8PD0gMTtcbiAgICAgICAgY3VycmVudCB8PSBiaXQ7XG4gICAgICAgIGN1cnJlbnRMZW4rKztcbiAgICAgICAgaWYgKGN1cnJlbnRMZW4gIT09IHdpbmRvd1NpemUgJiYgKGkgIT09IDAgfHwgaiAhPT0gMCkpIGNvbnRpbnVlO1xuXG4gICAgICAgIHJlcyA9IHRoaXMubXVsKHJlcywgd25kW2N1cnJlbnRdKTtcbiAgICAgICAgY3VycmVudExlbiA9IDA7XG4gICAgICAgIGN1cnJlbnQgPSAwO1xuICAgICAgfVxuICAgICAgc3RhcnQgPSAyNjtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzO1xuICB9O1xuXG4gIFJlZC5wcm90b3R5cGUuY29udmVydFRvID0gZnVuY3Rpb24gY29udmVydFRvIChudW0pIHtcbiAgICB2YXIgciA9IG51bS51bW9kKHRoaXMubSk7XG5cbiAgICByZXR1cm4gciA9PT0gbnVtID8gci5jbG9uZSgpIDogcjtcbiAgfTtcblxuICBSZWQucHJvdG90eXBlLmNvbnZlcnRGcm9tID0gZnVuY3Rpb24gY29udmVydEZyb20gKG51bSkge1xuICAgIHZhciByZXMgPSBudW0uY2xvbmUoKTtcbiAgICByZXMucmVkID0gbnVsbDtcbiAgICByZXR1cm4gcmVzO1xuICB9O1xuXG4gIC8vXG4gIC8vIE1vbnRnb21lcnkgbWV0aG9kIGVuZ2luZVxuICAvL1xuXG4gIEJOLm1vbnQgPSBmdW5jdGlvbiBtb250IChudW0pIHtcbiAgICByZXR1cm4gbmV3IE1vbnQobnVtKTtcbiAgfTtcblxuICBmdW5jdGlvbiBNb250IChtKSB7XG4gICAgUmVkLmNhbGwodGhpcywgbSk7XG5cbiAgICB0aGlzLnNoaWZ0ID0gdGhpcy5tLmJpdExlbmd0aCgpO1xuICAgIGlmICh0aGlzLnNoaWZ0ICUgMjYgIT09IDApIHtcbiAgICAgIHRoaXMuc2hpZnQgKz0gMjYgLSAodGhpcy5zaGlmdCAlIDI2KTtcbiAgICB9XG5cbiAgICB0aGlzLnIgPSBuZXcgQk4oMSkuaXVzaGxuKHRoaXMuc2hpZnQpO1xuICAgIHRoaXMucjIgPSB0aGlzLmltb2QodGhpcy5yLnNxcigpKTtcbiAgICB0aGlzLnJpbnYgPSB0aGlzLnIuX2ludm1wKHRoaXMubSk7XG5cbiAgICB0aGlzLm1pbnYgPSB0aGlzLnJpbnYubXVsKHRoaXMucikuaXN1Ym4oMSkuZGl2KHRoaXMubSk7XG4gICAgdGhpcy5taW52ID0gdGhpcy5taW52LnVtb2QodGhpcy5yKTtcbiAgICB0aGlzLm1pbnYgPSB0aGlzLnIuc3ViKHRoaXMubWludik7XG4gIH1cbiAgaW5oZXJpdHMoTW9udCwgUmVkKTtcblxuICBNb250LnByb3RvdHlwZS5jb252ZXJ0VG8gPSBmdW5jdGlvbiBjb252ZXJ0VG8gKG51bSkge1xuICAgIHJldHVybiB0aGlzLmltb2QobnVtLnVzaGxuKHRoaXMuc2hpZnQpKTtcbiAgfTtcblxuICBNb250LnByb3RvdHlwZS5jb252ZXJ0RnJvbSA9IGZ1bmN0aW9uIGNvbnZlcnRGcm9tIChudW0pIHtcbiAgICB2YXIgciA9IHRoaXMuaW1vZChudW0ubXVsKHRoaXMucmludikpO1xuICAgIHIucmVkID0gbnVsbDtcbiAgICByZXR1cm4gcjtcbiAgfTtcblxuICBNb250LnByb3RvdHlwZS5pbXVsID0gZnVuY3Rpb24gaW11bCAoYSwgYikge1xuICAgIGlmIChhLmlzWmVybygpIHx8IGIuaXNaZXJvKCkpIHtcbiAgICAgIGEud29yZHNbMF0gPSAwO1xuICAgICAgYS5sZW5ndGggPSAxO1xuICAgICAgcmV0dXJuIGE7XG4gICAgfVxuXG4gICAgdmFyIHQgPSBhLmltdWwoYik7XG4gICAgdmFyIGMgPSB0Lm1hc2tuKHRoaXMuc2hpZnQpLm11bCh0aGlzLm1pbnYpLmltYXNrbih0aGlzLnNoaWZ0KS5tdWwodGhpcy5tKTtcbiAgICB2YXIgdSA9IHQuaXN1YihjKS5pdXNocm4odGhpcy5zaGlmdCk7XG4gICAgdmFyIHJlcyA9IHU7XG5cbiAgICBpZiAodS5jbXAodGhpcy5tKSA+PSAwKSB7XG4gICAgICByZXMgPSB1LmlzdWIodGhpcy5tKTtcbiAgICB9IGVsc2UgaWYgKHUuY21wbigwKSA8IDApIHtcbiAgICAgIHJlcyA9IHUuaWFkZCh0aGlzLm0pO1xuICAgIH1cblxuICAgIHJldHVybiByZXMuX2ZvcmNlUmVkKHRoaXMpO1xuICB9O1xuXG4gIE1vbnQucHJvdG90eXBlLm11bCA9IGZ1bmN0aW9uIG11bCAoYSwgYikge1xuICAgIGlmIChhLmlzWmVybygpIHx8IGIuaXNaZXJvKCkpIHJldHVybiBuZXcgQk4oMCkuX2ZvcmNlUmVkKHRoaXMpO1xuXG4gICAgdmFyIHQgPSBhLm11bChiKTtcbiAgICB2YXIgYyA9IHQubWFza24odGhpcy5zaGlmdCkubXVsKHRoaXMubWludikuaW1hc2tuKHRoaXMuc2hpZnQpLm11bCh0aGlzLm0pO1xuICAgIHZhciB1ID0gdC5pc3ViKGMpLml1c2hybih0aGlzLnNoaWZ0KTtcbiAgICB2YXIgcmVzID0gdTtcbiAgICBpZiAodS5jbXAodGhpcy5tKSA+PSAwKSB7XG4gICAgICByZXMgPSB1LmlzdWIodGhpcy5tKTtcbiAgICB9IGVsc2UgaWYgKHUuY21wbigwKSA8IDApIHtcbiAgICAgIHJlcyA9IHUuaWFkZCh0aGlzLm0pO1xuICAgIH1cblxuICAgIHJldHVybiByZXMuX2ZvcmNlUmVkKHRoaXMpO1xuICB9O1xuXG4gIE1vbnQucHJvdG90eXBlLmludm0gPSBmdW5jdGlvbiBpbnZtIChhKSB7XG4gICAgLy8gKEFSKV4tMSAqIFJeMiA9IChBXi0xICogUl4tMSkgKiBSXjIgPSBBXi0xICogUlxuICAgIHZhciByZXMgPSB0aGlzLmltb2QoYS5faW52bXAodGhpcy5tKS5tdWwodGhpcy5yMikpO1xuICAgIHJldHVybiByZXMuX2ZvcmNlUmVkKHRoaXMpO1xuICB9O1xufSkodHlwZW9mIG1vZHVsZSA9PT0gJ3VuZGVmaW5lZCcgfHwgbW9kdWxlLCB0aGlzKTtcbiIsInZhciByO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJhbmQobGVuKSB7XG4gIGlmICghcilcbiAgICByID0gbmV3IFJhbmQobnVsbCk7XG5cbiAgcmV0dXJuIHIuZ2VuZXJhdGUobGVuKTtcbn07XG5cbmZ1bmN0aW9uIFJhbmQocmFuZCkge1xuICB0aGlzLnJhbmQgPSByYW5kO1xufVxubW9kdWxlLmV4cG9ydHMuUmFuZCA9IFJhbmQ7XG5cblJhbmQucHJvdG90eXBlLmdlbmVyYXRlID0gZnVuY3Rpb24gZ2VuZXJhdGUobGVuKSB7XG4gIHJldHVybiB0aGlzLl9yYW5kKGxlbik7XG59O1xuXG4vLyBFbXVsYXRlIGNyeXB0byBBUEkgdXNpbmcgcmFuZHlcblJhbmQucHJvdG90eXBlLl9yYW5kID0gZnVuY3Rpb24gX3JhbmQobikge1xuICBpZiAodGhpcy5yYW5kLmdldEJ5dGVzKVxuICAgIHJldHVybiB0aGlzLnJhbmQuZ2V0Qnl0ZXMobik7XG5cbiAgdmFyIHJlcyA9IG5ldyBVaW50OEFycmF5KG4pO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHJlcy5sZW5ndGg7IGkrKylcbiAgICByZXNbaV0gPSB0aGlzLnJhbmQuZ2V0Qnl0ZSgpO1xuICByZXR1cm4gcmVzO1xufTtcblxuaWYgKHR5cGVvZiBzZWxmID09PSAnb2JqZWN0Jykge1xuICBpZiAoc2VsZi5jcnlwdG8gJiYgc2VsZi5jcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKSB7XG4gICAgLy8gTW9kZXJuIGJyb3dzZXJzXG4gICAgUmFuZC5wcm90b3R5cGUuX3JhbmQgPSBmdW5jdGlvbiBfcmFuZChuKSB7XG4gICAgICB2YXIgYXJyID0gbmV3IFVpbnQ4QXJyYXkobik7XG4gICAgICBzZWxmLmNyeXB0by5nZXRSYW5kb21WYWx1ZXMoYXJyKTtcbiAgICAgIHJldHVybiBhcnI7XG4gICAgfTtcbiAgfSBlbHNlIGlmIChzZWxmLm1zQ3J5cHRvICYmIHNlbGYubXNDcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKSB7XG4gICAgLy8gSUVcbiAgICBSYW5kLnByb3RvdHlwZS5fcmFuZCA9IGZ1bmN0aW9uIF9yYW5kKG4pIHtcbiAgICAgIHZhciBhcnIgPSBuZXcgVWludDhBcnJheShuKTtcbiAgICAgIHNlbGYubXNDcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKGFycik7XG4gICAgICByZXR1cm4gYXJyO1xuICAgIH07XG5cbiAgLy8gU2FmYXJpJ3MgV2ViV29ya2VycyBkbyBub3QgaGF2ZSBgY3J5cHRvYFxuICB9IGVsc2UgaWYgKHR5cGVvZiB3aW5kb3cgPT09ICdvYmplY3QnKSB7XG4gICAgLy8gT2xkIGp1bmtcbiAgICBSYW5kLnByb3RvdHlwZS5fcmFuZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdOb3QgaW1wbGVtZW50ZWQgeWV0Jyk7XG4gICAgfTtcbiAgfVxufSBlbHNlIHtcbiAgLy8gTm9kZS5qcyBvciBXZWIgd29ya2VyIHdpdGggbm8gY3J5cHRvIHN1cHBvcnRcbiAgdHJ5IHtcbiAgICB2YXIgY3J5cHRvID0gcmVxdWlyZSgnY3J5cHRvJyk7XG4gICAgaWYgKHR5cGVvZiBjcnlwdG8ucmFuZG9tQnl0ZXMgIT09ICdmdW5jdGlvbicpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQnKTtcblxuICAgIFJhbmQucHJvdG90eXBlLl9yYW5kID0gZnVuY3Rpb24gX3JhbmQobikge1xuICAgICAgcmV0dXJuIGNyeXB0by5yYW5kb21CeXRlcyhuKTtcbiAgICB9O1xuICB9IGNhdGNoIChlKSB7XG4gIH1cbn1cbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGVsbGlwdGljID0gZXhwb3J0cztcblxuZWxsaXB0aWMudmVyc2lvbiA9IHJlcXVpcmUoJy4uL3BhY2thZ2UuanNvbicpLnZlcnNpb247XG5lbGxpcHRpYy51dGlscyA9IHJlcXVpcmUoJy4vZWxsaXB0aWMvdXRpbHMnKTtcbmVsbGlwdGljLnJhbmQgPSByZXF1aXJlKCdicm9yYW5kJyk7XG5lbGxpcHRpYy5jdXJ2ZSA9IHJlcXVpcmUoJy4vZWxsaXB0aWMvY3VydmUnKTtcbmVsbGlwdGljLmN1cnZlcyA9IHJlcXVpcmUoJy4vZWxsaXB0aWMvY3VydmVzJyk7XG5cbi8vIFByb3RvY29sc1xuZWxsaXB0aWMuZWMgPSByZXF1aXJlKCcuL2VsbGlwdGljL2VjJyk7XG5lbGxpcHRpYy5lZGRzYSA9IHJlcXVpcmUoJy4vZWxsaXB0aWMvZWRkc2EnKTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIEJOID0gcmVxdWlyZSgnYm4uanMnKTtcbnZhciBlbGxpcHRpYyA9IHJlcXVpcmUoJy4uLy4uL2VsbGlwdGljJyk7XG52YXIgdXRpbHMgPSBlbGxpcHRpYy51dGlscztcbnZhciBnZXROQUYgPSB1dGlscy5nZXROQUY7XG52YXIgZ2V0SlNGID0gdXRpbHMuZ2V0SlNGO1xudmFyIGFzc2VydCA9IHV0aWxzLmFzc2VydDtcblxuZnVuY3Rpb24gQmFzZUN1cnZlKHR5cGUsIGNvbmYpIHtcbiAgdGhpcy50eXBlID0gdHlwZTtcbiAgdGhpcy5wID0gbmV3IEJOKGNvbmYucCwgMTYpO1xuXG4gIC8vIFVzZSBNb250Z29tZXJ5LCB3aGVuIHRoZXJlIGlzIG5vIGZhc3QgcmVkdWN0aW9uIGZvciB0aGUgcHJpbWVcbiAgdGhpcy5yZWQgPSBjb25mLnByaW1lID8gQk4ucmVkKGNvbmYucHJpbWUpIDogQk4ubW9udCh0aGlzLnApO1xuXG4gIC8vIFVzZWZ1bCBmb3IgbWFueSBjdXJ2ZXNcbiAgdGhpcy56ZXJvID0gbmV3IEJOKDApLnRvUmVkKHRoaXMucmVkKTtcbiAgdGhpcy5vbmUgPSBuZXcgQk4oMSkudG9SZWQodGhpcy5yZWQpO1xuICB0aGlzLnR3byA9IG5ldyBCTigyKS50b1JlZCh0aGlzLnJlZCk7XG5cbiAgLy8gQ3VydmUgY29uZmlndXJhdGlvbiwgb3B0aW9uYWxcbiAgdGhpcy5uID0gY29uZi5uICYmIG5ldyBCTihjb25mLm4sIDE2KTtcbiAgdGhpcy5nID0gY29uZi5nICYmIHRoaXMucG9pbnRGcm9tSlNPTihjb25mLmcsIGNvbmYuZ1JlZCk7XG5cbiAgLy8gVGVtcG9yYXJ5IGFycmF5c1xuICB0aGlzLl93bmFmVDEgPSBuZXcgQXJyYXkoNCk7XG4gIHRoaXMuX3duYWZUMiA9IG5ldyBBcnJheSg0KTtcbiAgdGhpcy5fd25hZlQzID0gbmV3IEFycmF5KDQpO1xuICB0aGlzLl93bmFmVDQgPSBuZXcgQXJyYXkoNCk7XG5cbiAgLy8gR2VuZXJhbGl6ZWQgR3JlZyBNYXh3ZWxsJ3MgdHJpY2tcbiAgdmFyIGFkanVzdENvdW50ID0gdGhpcy5uICYmIHRoaXMucC5kaXYodGhpcy5uKTtcbiAgaWYgKCFhZGp1c3RDb3VudCB8fCBhZGp1c3RDb3VudC5jbXBuKDEwMCkgPiAwKSB7XG4gICAgdGhpcy5yZWROID0gbnVsbDtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLl9tYXh3ZWxsVHJpY2sgPSB0cnVlO1xuICAgIHRoaXMucmVkTiA9IHRoaXMubi50b1JlZCh0aGlzLnJlZCk7XG4gIH1cbn1cbm1vZHVsZS5leHBvcnRzID0gQmFzZUN1cnZlO1xuXG5CYXNlQ3VydmUucHJvdG90eXBlLnBvaW50ID0gZnVuY3Rpb24gcG9pbnQoKSB7XG4gIHRocm93IG5ldyBFcnJvcignTm90IGltcGxlbWVudGVkJyk7XG59O1xuXG5CYXNlQ3VydmUucHJvdG90eXBlLnZhbGlkYXRlID0gZnVuY3Rpb24gdmFsaWRhdGUoKSB7XG4gIHRocm93IG5ldyBFcnJvcignTm90IGltcGxlbWVudGVkJyk7XG59O1xuXG5CYXNlQ3VydmUucHJvdG90eXBlLl9maXhlZE5hZk11bCA9IGZ1bmN0aW9uIF9maXhlZE5hZk11bChwLCBrKSB7XG4gIGFzc2VydChwLnByZWNvbXB1dGVkKTtcbiAgdmFyIGRvdWJsZXMgPSBwLl9nZXREb3VibGVzKCk7XG5cbiAgdmFyIG5hZiA9IGdldE5BRihrLCAxKTtcbiAgdmFyIEkgPSAoMSA8PCAoZG91Ymxlcy5zdGVwICsgMSkpIC0gKGRvdWJsZXMuc3RlcCAlIDIgPT09IDAgPyAyIDogMSk7XG4gIEkgLz0gMztcblxuICAvLyBUcmFuc2xhdGUgaW50byBtb3JlIHdpbmRvd2VkIGZvcm1cbiAgdmFyIHJlcHIgPSBbXTtcbiAgZm9yICh2YXIgaiA9IDA7IGogPCBuYWYubGVuZ3RoOyBqICs9IGRvdWJsZXMuc3RlcCkge1xuICAgIHZhciBuYWZXID0gMDtcbiAgICBmb3IgKHZhciBrID0gaiArIGRvdWJsZXMuc3RlcCAtIDE7IGsgPj0gajsgay0tKVxuICAgICAgbmFmVyA9IChuYWZXIDw8IDEpICsgbmFmW2tdO1xuICAgIHJlcHIucHVzaChuYWZXKTtcbiAgfVxuXG4gIHZhciBhID0gdGhpcy5qcG9pbnQobnVsbCwgbnVsbCwgbnVsbCk7XG4gIHZhciBiID0gdGhpcy5qcG9pbnQobnVsbCwgbnVsbCwgbnVsbCk7XG4gIGZvciAodmFyIGkgPSBJOyBpID4gMDsgaS0tKSB7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCByZXByLmxlbmd0aDsgaisrKSB7XG4gICAgICB2YXIgbmFmVyA9IHJlcHJbal07XG4gICAgICBpZiAobmFmVyA9PT0gaSlcbiAgICAgICAgYiA9IGIubWl4ZWRBZGQoZG91Ymxlcy5wb2ludHNbal0pO1xuICAgICAgZWxzZSBpZiAobmFmVyA9PT0gLWkpXG4gICAgICAgIGIgPSBiLm1peGVkQWRkKGRvdWJsZXMucG9pbnRzW2pdLm5lZygpKTtcbiAgICB9XG4gICAgYSA9IGEuYWRkKGIpO1xuICB9XG4gIHJldHVybiBhLnRvUCgpO1xufTtcblxuQmFzZUN1cnZlLnByb3RvdHlwZS5fd25hZk11bCA9IGZ1bmN0aW9uIF93bmFmTXVsKHAsIGspIHtcbiAgdmFyIHcgPSA0O1xuXG4gIC8vIFByZWNvbXB1dGUgd2luZG93XG4gIHZhciBuYWZQb2ludHMgPSBwLl9nZXROQUZQb2ludHModyk7XG4gIHcgPSBuYWZQb2ludHMud25kO1xuICB2YXIgd25kID0gbmFmUG9pbnRzLnBvaW50cztcblxuICAvLyBHZXQgTkFGIGZvcm1cbiAgdmFyIG5hZiA9IGdldE5BRihrLCB3KTtcblxuICAvLyBBZGQgYHRoaXNgKihOKzEpIGZvciBldmVyeSB3LU5BRiBpbmRleFxuICB2YXIgYWNjID0gdGhpcy5qcG9pbnQobnVsbCwgbnVsbCwgbnVsbCk7XG4gIGZvciAodmFyIGkgPSBuYWYubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAvLyBDb3VudCB6ZXJvZXNcbiAgICBmb3IgKHZhciBrID0gMDsgaSA+PSAwICYmIG5hZltpXSA9PT0gMDsgaS0tKVxuICAgICAgaysrO1xuICAgIGlmIChpID49IDApXG4gICAgICBrKys7XG4gICAgYWNjID0gYWNjLmRibHAoayk7XG5cbiAgICBpZiAoaSA8IDApXG4gICAgICBicmVhaztcbiAgICB2YXIgeiA9IG5hZltpXTtcbiAgICBhc3NlcnQoeiAhPT0gMCk7XG4gICAgaWYgKHAudHlwZSA9PT0gJ2FmZmluZScpIHtcbiAgICAgIC8vIEogKy0gUFxuICAgICAgaWYgKHogPiAwKVxuICAgICAgICBhY2MgPSBhY2MubWl4ZWRBZGQod25kWyh6IC0gMSkgPj4gMV0pO1xuICAgICAgZWxzZVxuICAgICAgICBhY2MgPSBhY2MubWl4ZWRBZGQod25kWygteiAtIDEpID4+IDFdLm5lZygpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gSiArLSBKXG4gICAgICBpZiAoeiA+IDApXG4gICAgICAgIGFjYyA9IGFjYy5hZGQod25kWyh6IC0gMSkgPj4gMV0pO1xuICAgICAgZWxzZVxuICAgICAgICBhY2MgPSBhY2MuYWRkKHduZFsoLXogLSAxKSA+PiAxXS5uZWcoKSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBwLnR5cGUgPT09ICdhZmZpbmUnID8gYWNjLnRvUCgpIDogYWNjO1xufTtcblxuQmFzZUN1cnZlLnByb3RvdHlwZS5fd25hZk11bEFkZCA9IGZ1bmN0aW9uIF93bmFmTXVsQWRkKGRlZlcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcG9pbnRzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvZWZmcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZW4sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgamFjb2JpYW5SZXN1bHQpIHtcbiAgdmFyIHduZFdpZHRoID0gdGhpcy5fd25hZlQxO1xuICB2YXIgd25kID0gdGhpcy5fd25hZlQyO1xuICB2YXIgbmFmID0gdGhpcy5fd25hZlQzO1xuXG4gIC8vIEZpbGwgYWxsIGFycmF5c1xuICB2YXIgbWF4ID0gMDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgIHZhciBwID0gcG9pbnRzW2ldO1xuICAgIHZhciBuYWZQb2ludHMgPSBwLl9nZXROQUZQb2ludHMoZGVmVyk7XG4gICAgd25kV2lkdGhbaV0gPSBuYWZQb2ludHMud25kO1xuICAgIHduZFtpXSA9IG5hZlBvaW50cy5wb2ludHM7XG4gIH1cblxuICAvLyBDb21iIHNtYWxsIHdpbmRvdyBOQUZzXG4gIGZvciAodmFyIGkgPSBsZW4gLSAxOyBpID49IDE7IGkgLT0gMikge1xuICAgIHZhciBhID0gaSAtIDE7XG4gICAgdmFyIGIgPSBpO1xuICAgIGlmICh3bmRXaWR0aFthXSAhPT0gMSB8fCB3bmRXaWR0aFtiXSAhPT0gMSkge1xuICAgICAgbmFmW2FdID0gZ2V0TkFGKGNvZWZmc1thXSwgd25kV2lkdGhbYV0pO1xuICAgICAgbmFmW2JdID0gZ2V0TkFGKGNvZWZmc1tiXSwgd25kV2lkdGhbYl0pO1xuICAgICAgbWF4ID0gTWF0aC5tYXgobmFmW2FdLmxlbmd0aCwgbWF4KTtcbiAgICAgIG1heCA9IE1hdGgubWF4KG5hZltiXS5sZW5ndGgsIG1heCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICB2YXIgY29tYiA9IFtcbiAgICAgIHBvaW50c1thXSwgLyogMSAqL1xuICAgICAgbnVsbCwgLyogMyAqL1xuICAgICAgbnVsbCwgLyogNSAqL1xuICAgICAgcG9pbnRzW2JdIC8qIDcgKi9cbiAgICBdO1xuXG4gICAgLy8gVHJ5IHRvIGF2b2lkIFByb2plY3RpdmUgcG9pbnRzLCBpZiBwb3NzaWJsZVxuICAgIGlmIChwb2ludHNbYV0ueS5jbXAocG9pbnRzW2JdLnkpID09PSAwKSB7XG4gICAgICBjb21iWzFdID0gcG9pbnRzW2FdLmFkZChwb2ludHNbYl0pO1xuICAgICAgY29tYlsyXSA9IHBvaW50c1thXS50b0ooKS5taXhlZEFkZChwb2ludHNbYl0ubmVnKCkpO1xuICAgIH0gZWxzZSBpZiAocG9pbnRzW2FdLnkuY21wKHBvaW50c1tiXS55LnJlZE5lZygpKSA9PT0gMCkge1xuICAgICAgY29tYlsxXSA9IHBvaW50c1thXS50b0ooKS5taXhlZEFkZChwb2ludHNbYl0pO1xuICAgICAgY29tYlsyXSA9IHBvaW50c1thXS5hZGQocG9pbnRzW2JdLm5lZygpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29tYlsxXSA9IHBvaW50c1thXS50b0ooKS5taXhlZEFkZChwb2ludHNbYl0pO1xuICAgICAgY29tYlsyXSA9IHBvaW50c1thXS50b0ooKS5taXhlZEFkZChwb2ludHNbYl0ubmVnKCkpO1xuICAgIH1cblxuICAgIHZhciBpbmRleCA9IFtcbiAgICAgIC0zLCAvKiAtMSAtMSAqL1xuICAgICAgLTEsIC8qIC0xIDAgKi9cbiAgICAgIC01LCAvKiAtMSAxICovXG4gICAgICAtNywgLyogMCAtMSAqL1xuICAgICAgMCwgLyogMCAwICovXG4gICAgICA3LCAvKiAwIDEgKi9cbiAgICAgIDUsIC8qIDEgLTEgKi9cbiAgICAgIDEsIC8qIDEgMCAqL1xuICAgICAgMyAgLyogMSAxICovXG4gICAgXTtcblxuICAgIHZhciBqc2YgPSBnZXRKU0YoY29lZmZzW2FdLCBjb2VmZnNbYl0pO1xuICAgIG1heCA9IE1hdGgubWF4KGpzZlswXS5sZW5ndGgsIG1heCk7XG4gICAgbmFmW2FdID0gbmV3IEFycmF5KG1heCk7XG4gICAgbmFmW2JdID0gbmV3IEFycmF5KG1heCk7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBtYXg7IGorKykge1xuICAgICAgdmFyIGphID0ganNmWzBdW2pdIHwgMDtcbiAgICAgIHZhciBqYiA9IGpzZlsxXVtqXSB8IDA7XG5cbiAgICAgIG5hZlthXVtqXSA9IGluZGV4WyhqYSArIDEpICogMyArIChqYiArIDEpXTtcbiAgICAgIG5hZltiXVtqXSA9IDA7XG4gICAgICB3bmRbYV0gPSBjb21iO1xuICAgIH1cbiAgfVxuXG4gIHZhciBhY2MgPSB0aGlzLmpwb2ludChudWxsLCBudWxsLCBudWxsKTtcbiAgdmFyIHRtcCA9IHRoaXMuX3duYWZUNDtcbiAgZm9yICh2YXIgaSA9IG1heDsgaSA+PSAwOyBpLS0pIHtcbiAgICB2YXIgayA9IDA7XG5cbiAgICB3aGlsZSAoaSA+PSAwKSB7XG4gICAgICB2YXIgemVybyA9IHRydWU7XG4gICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGxlbjsgaisrKSB7XG4gICAgICAgIHRtcFtqXSA9IG5hZltqXVtpXSB8IDA7XG4gICAgICAgIGlmICh0bXBbal0gIT09IDApXG4gICAgICAgICAgemVybyA9IGZhbHNlO1xuICAgICAgfVxuICAgICAgaWYgKCF6ZXJvKVxuICAgICAgICBicmVhaztcbiAgICAgIGsrKztcbiAgICAgIGktLTtcbiAgICB9XG4gICAgaWYgKGkgPj0gMClcbiAgICAgIGsrKztcbiAgICBhY2MgPSBhY2MuZGJscChrKTtcbiAgICBpZiAoaSA8IDApXG4gICAgICBicmVhaztcblxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgbGVuOyBqKyspIHtcbiAgICAgIHZhciB6ID0gdG1wW2pdO1xuICAgICAgdmFyIHA7XG4gICAgICBpZiAoeiA9PT0gMClcbiAgICAgICAgY29udGludWU7XG4gICAgICBlbHNlIGlmICh6ID4gMClcbiAgICAgICAgcCA9IHduZFtqXVsoeiAtIDEpID4+IDFdO1xuICAgICAgZWxzZSBpZiAoeiA8IDApXG4gICAgICAgIHAgPSB3bmRbal1bKC16IC0gMSkgPj4gMV0ubmVnKCk7XG5cbiAgICAgIGlmIChwLnR5cGUgPT09ICdhZmZpbmUnKVxuICAgICAgICBhY2MgPSBhY2MubWl4ZWRBZGQocCk7XG4gICAgICBlbHNlXG4gICAgICAgIGFjYyA9IGFjYy5hZGQocCk7XG4gICAgfVxuICB9XG4gIC8vIFplcm9pZnkgcmVmZXJlbmNlc1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKVxuICAgIHduZFtpXSA9IG51bGw7XG5cbiAgaWYgKGphY29iaWFuUmVzdWx0KVxuICAgIHJldHVybiBhY2M7XG4gIGVsc2VcbiAgICByZXR1cm4gYWNjLnRvUCgpO1xufTtcblxuZnVuY3Rpb24gQmFzZVBvaW50KGN1cnZlLCB0eXBlKSB7XG4gIHRoaXMuY3VydmUgPSBjdXJ2ZTtcbiAgdGhpcy50eXBlID0gdHlwZTtcbiAgdGhpcy5wcmVjb21wdXRlZCA9IG51bGw7XG59XG5CYXNlQ3VydmUuQmFzZVBvaW50ID0gQmFzZVBvaW50O1xuXG5CYXNlUG9pbnQucHJvdG90eXBlLmVxID0gZnVuY3Rpb24gZXEoLypvdGhlciovKSB7XG4gIHRocm93IG5ldyBFcnJvcignTm90IGltcGxlbWVudGVkJyk7XG59O1xuXG5CYXNlUG9pbnQucHJvdG90eXBlLnZhbGlkYXRlID0gZnVuY3Rpb24gdmFsaWRhdGUoKSB7XG4gIHJldHVybiB0aGlzLmN1cnZlLnZhbGlkYXRlKHRoaXMpO1xufTtcblxuQmFzZUN1cnZlLnByb3RvdHlwZS5kZWNvZGVQb2ludCA9IGZ1bmN0aW9uIGRlY29kZVBvaW50KGJ5dGVzLCBlbmMpIHtcbiAgYnl0ZXMgPSB1dGlscy50b0FycmF5KGJ5dGVzLCBlbmMpO1xuXG4gIHZhciBsZW4gPSB0aGlzLnAuYnl0ZUxlbmd0aCgpO1xuXG4gIC8vIHVuY29tcHJlc3NlZCwgaHlicmlkLW9kZCwgaHlicmlkLWV2ZW5cbiAgaWYgKChieXRlc1swXSA9PT0gMHgwNCB8fCBieXRlc1swXSA9PT0gMHgwNiB8fCBieXRlc1swXSA9PT0gMHgwNykgJiZcbiAgICAgIGJ5dGVzLmxlbmd0aCAtIDEgPT09IDIgKiBsZW4pIHtcbiAgICBpZiAoYnl0ZXNbMF0gPT09IDB4MDYpXG4gICAgICBhc3NlcnQoYnl0ZXNbYnl0ZXMubGVuZ3RoIC0gMV0gJSAyID09PSAwKTtcbiAgICBlbHNlIGlmIChieXRlc1swXSA9PT0gMHgwNylcbiAgICAgIGFzc2VydChieXRlc1tieXRlcy5sZW5ndGggLSAxXSAlIDIgPT09IDEpO1xuXG4gICAgdmFyIHJlcyA9ICB0aGlzLnBvaW50KGJ5dGVzLnNsaWNlKDEsIDEgKyBsZW4pLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBieXRlcy5zbGljZSgxICsgbGVuLCAxICsgMiAqIGxlbikpO1xuXG4gICAgcmV0dXJuIHJlcztcbiAgfSBlbHNlIGlmICgoYnl0ZXNbMF0gPT09IDB4MDIgfHwgYnl0ZXNbMF0gPT09IDB4MDMpICYmXG4gICAgICAgICAgICAgIGJ5dGVzLmxlbmd0aCAtIDEgPT09IGxlbikge1xuICAgIHJldHVybiB0aGlzLnBvaW50RnJvbVgoYnl0ZXMuc2xpY2UoMSwgMSArIGxlbiksIGJ5dGVzWzBdID09PSAweDAzKTtcbiAgfVxuICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gcG9pbnQgZm9ybWF0Jyk7XG59O1xuXG5CYXNlUG9pbnQucHJvdG90eXBlLmVuY29kZUNvbXByZXNzZWQgPSBmdW5jdGlvbiBlbmNvZGVDb21wcmVzc2VkKGVuYykge1xuICByZXR1cm4gdGhpcy5lbmNvZGUoZW5jLCB0cnVlKTtcbn07XG5cbkJhc2VQb2ludC5wcm90b3R5cGUuX2VuY29kZSA9IGZ1bmN0aW9uIF9lbmNvZGUoY29tcGFjdCkge1xuICB2YXIgbGVuID0gdGhpcy5jdXJ2ZS5wLmJ5dGVMZW5ndGgoKTtcbiAgdmFyIHggPSB0aGlzLmdldFgoKS50b0FycmF5KCdiZScsIGxlbik7XG5cbiAgaWYgKGNvbXBhY3QpXG4gICAgcmV0dXJuIFsgdGhpcy5nZXRZKCkuaXNFdmVuKCkgPyAweDAyIDogMHgwMyBdLmNvbmNhdCh4KTtcblxuICByZXR1cm4gWyAweDA0IF0uY29uY2F0KHgsIHRoaXMuZ2V0WSgpLnRvQXJyYXkoJ2JlJywgbGVuKSkgO1xufTtcblxuQmFzZVBvaW50LnByb3RvdHlwZS5lbmNvZGUgPSBmdW5jdGlvbiBlbmNvZGUoZW5jLCBjb21wYWN0KSB7XG4gIHJldHVybiB1dGlscy5lbmNvZGUodGhpcy5fZW5jb2RlKGNvbXBhY3QpLCBlbmMpO1xufTtcblxuQmFzZVBvaW50LnByb3RvdHlwZS5wcmVjb21wdXRlID0gZnVuY3Rpb24gcHJlY29tcHV0ZShwb3dlcikge1xuICBpZiAodGhpcy5wcmVjb21wdXRlZClcbiAgICByZXR1cm4gdGhpcztcblxuICB2YXIgcHJlY29tcHV0ZWQgPSB7XG4gICAgZG91YmxlczogbnVsbCxcbiAgICBuYWY6IG51bGwsXG4gICAgYmV0YTogbnVsbFxuICB9O1xuICBwcmVjb21wdXRlZC5uYWYgPSB0aGlzLl9nZXROQUZQb2ludHMoOCk7XG4gIHByZWNvbXB1dGVkLmRvdWJsZXMgPSB0aGlzLl9nZXREb3VibGVzKDQsIHBvd2VyKTtcbiAgcHJlY29tcHV0ZWQuYmV0YSA9IHRoaXMuX2dldEJldGEoKTtcbiAgdGhpcy5wcmVjb21wdXRlZCA9IHByZWNvbXB1dGVkO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuQmFzZVBvaW50LnByb3RvdHlwZS5faGFzRG91YmxlcyA9IGZ1bmN0aW9uIF9oYXNEb3VibGVzKGspIHtcbiAgaWYgKCF0aGlzLnByZWNvbXB1dGVkKVxuICAgIHJldHVybiBmYWxzZTtcblxuICB2YXIgZG91YmxlcyA9IHRoaXMucHJlY29tcHV0ZWQuZG91YmxlcztcbiAgaWYgKCFkb3VibGVzKVxuICAgIHJldHVybiBmYWxzZTtcblxuICByZXR1cm4gZG91Ymxlcy5wb2ludHMubGVuZ3RoID49IE1hdGguY2VpbCgoay5iaXRMZW5ndGgoKSArIDEpIC8gZG91Ymxlcy5zdGVwKTtcbn07XG5cbkJhc2VQb2ludC5wcm90b3R5cGUuX2dldERvdWJsZXMgPSBmdW5jdGlvbiBfZ2V0RG91YmxlcyhzdGVwLCBwb3dlcikge1xuICBpZiAodGhpcy5wcmVjb21wdXRlZCAmJiB0aGlzLnByZWNvbXB1dGVkLmRvdWJsZXMpXG4gICAgcmV0dXJuIHRoaXMucHJlY29tcHV0ZWQuZG91YmxlcztcblxuICB2YXIgZG91YmxlcyA9IFsgdGhpcyBdO1xuICB2YXIgYWNjID0gdGhpcztcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBwb3dlcjsgaSArPSBzdGVwKSB7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBzdGVwOyBqKyspXG4gICAgICBhY2MgPSBhY2MuZGJsKCk7XG4gICAgZG91Ymxlcy5wdXNoKGFjYyk7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBzdGVwOiBzdGVwLFxuICAgIHBvaW50czogZG91Ymxlc1xuICB9O1xufTtcblxuQmFzZVBvaW50LnByb3RvdHlwZS5fZ2V0TkFGUG9pbnRzID0gZnVuY3Rpb24gX2dldE5BRlBvaW50cyh3bmQpIHtcbiAgaWYgKHRoaXMucHJlY29tcHV0ZWQgJiYgdGhpcy5wcmVjb21wdXRlZC5uYWYpXG4gICAgcmV0dXJuIHRoaXMucHJlY29tcHV0ZWQubmFmO1xuXG4gIHZhciByZXMgPSBbIHRoaXMgXTtcbiAgdmFyIG1heCA9ICgxIDw8IHduZCkgLSAxO1xuICB2YXIgZGJsID0gbWF4ID09PSAxID8gbnVsbCA6IHRoaXMuZGJsKCk7XG4gIGZvciAodmFyIGkgPSAxOyBpIDwgbWF4OyBpKyspXG4gICAgcmVzW2ldID0gcmVzW2kgLSAxXS5hZGQoZGJsKTtcbiAgcmV0dXJuIHtcbiAgICB3bmQ6IHduZCxcbiAgICBwb2ludHM6IHJlc1xuICB9O1xufTtcblxuQmFzZVBvaW50LnByb3RvdHlwZS5fZ2V0QmV0YSA9IGZ1bmN0aW9uIF9nZXRCZXRhKCkge1xuICByZXR1cm4gbnVsbDtcbn07XG5cbkJhc2VQb2ludC5wcm90b3R5cGUuZGJscCA9IGZ1bmN0aW9uIGRibHAoaykge1xuICB2YXIgciA9IHRoaXM7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgazsgaSsrKVxuICAgIHIgPSByLmRibCgpO1xuICByZXR1cm4gcjtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBjdXJ2ZSA9IHJlcXVpcmUoJy4uL2N1cnZlJyk7XG52YXIgZWxsaXB0aWMgPSByZXF1aXJlKCcuLi8uLi9lbGxpcHRpYycpO1xudmFyIEJOID0gcmVxdWlyZSgnYm4uanMnKTtcbnZhciBpbmhlcml0cyA9IHJlcXVpcmUoJ2luaGVyaXRzJyk7XG52YXIgQmFzZSA9IGN1cnZlLmJhc2U7XG5cbnZhciBhc3NlcnQgPSBlbGxpcHRpYy51dGlscy5hc3NlcnQ7XG5cbmZ1bmN0aW9uIEVkd2FyZHNDdXJ2ZShjb25mKSB7XG4gIC8vIE5PVEU6IEltcG9ydGFudCBhcyB3ZSBhcmUgY3JlYXRpbmcgcG9pbnQgaW4gQmFzZS5jYWxsKClcbiAgdGhpcy50d2lzdGVkID0gKGNvbmYuYSB8IDApICE9PSAxO1xuICB0aGlzLm1PbmVBID0gdGhpcy50d2lzdGVkICYmIChjb25mLmEgfCAwKSA9PT0gLTE7XG4gIHRoaXMuZXh0ZW5kZWQgPSB0aGlzLm1PbmVBO1xuXG4gIEJhc2UuY2FsbCh0aGlzLCAnZWR3YXJkcycsIGNvbmYpO1xuXG4gIHRoaXMuYSA9IG5ldyBCTihjb25mLmEsIDE2KS51bW9kKHRoaXMucmVkLm0pO1xuICB0aGlzLmEgPSB0aGlzLmEudG9SZWQodGhpcy5yZWQpO1xuICB0aGlzLmMgPSBuZXcgQk4oY29uZi5jLCAxNikudG9SZWQodGhpcy5yZWQpO1xuICB0aGlzLmMyID0gdGhpcy5jLnJlZFNxcigpO1xuICB0aGlzLmQgPSBuZXcgQk4oY29uZi5kLCAxNikudG9SZWQodGhpcy5yZWQpO1xuICB0aGlzLmRkID0gdGhpcy5kLnJlZEFkZCh0aGlzLmQpO1xuXG4gIGFzc2VydCghdGhpcy50d2lzdGVkIHx8IHRoaXMuYy5mcm9tUmVkKCkuY21wbigxKSA9PT0gMCk7XG4gIHRoaXMub25lQyA9IChjb25mLmMgfCAwKSA9PT0gMTtcbn1cbmluaGVyaXRzKEVkd2FyZHNDdXJ2ZSwgQmFzZSk7XG5tb2R1bGUuZXhwb3J0cyA9IEVkd2FyZHNDdXJ2ZTtcblxuRWR3YXJkc0N1cnZlLnByb3RvdHlwZS5fbXVsQSA9IGZ1bmN0aW9uIF9tdWxBKG51bSkge1xuICBpZiAodGhpcy5tT25lQSlcbiAgICByZXR1cm4gbnVtLnJlZE5lZygpO1xuICBlbHNlXG4gICAgcmV0dXJuIHRoaXMuYS5yZWRNdWwobnVtKTtcbn07XG5cbkVkd2FyZHNDdXJ2ZS5wcm90b3R5cGUuX211bEMgPSBmdW5jdGlvbiBfbXVsQyhudW0pIHtcbiAgaWYgKHRoaXMub25lQylcbiAgICByZXR1cm4gbnVtO1xuICBlbHNlXG4gICAgcmV0dXJuIHRoaXMuYy5yZWRNdWwobnVtKTtcbn07XG5cbi8vIEp1c3QgZm9yIGNvbXBhdGliaWxpdHkgd2l0aCBTaG9ydCBjdXJ2ZVxuRWR3YXJkc0N1cnZlLnByb3RvdHlwZS5qcG9pbnQgPSBmdW5jdGlvbiBqcG9pbnQoeCwgeSwgeiwgdCkge1xuICByZXR1cm4gdGhpcy5wb2ludCh4LCB5LCB6LCB0KTtcbn07XG5cbkVkd2FyZHNDdXJ2ZS5wcm90b3R5cGUucG9pbnRGcm9tWCA9IGZ1bmN0aW9uIHBvaW50RnJvbVgoeCwgb2RkKSB7XG4gIHggPSBuZXcgQk4oeCwgMTYpO1xuICBpZiAoIXgucmVkKVxuICAgIHggPSB4LnRvUmVkKHRoaXMucmVkKTtcblxuICB2YXIgeDIgPSB4LnJlZFNxcigpO1xuICB2YXIgcmhzID0gdGhpcy5jMi5yZWRTdWIodGhpcy5hLnJlZE11bCh4MikpO1xuICB2YXIgbGhzID0gdGhpcy5vbmUucmVkU3ViKHRoaXMuYzIucmVkTXVsKHRoaXMuZCkucmVkTXVsKHgyKSk7XG5cbiAgdmFyIHkyID0gcmhzLnJlZE11bChsaHMucmVkSW52bSgpKTtcbiAgdmFyIHkgPSB5Mi5yZWRTcXJ0KCk7XG4gIGlmICh5LnJlZFNxcigpLnJlZFN1Yih5MikuY21wKHRoaXMuemVybykgIT09IDApXG4gICAgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHBvaW50Jyk7XG5cbiAgdmFyIGlzT2RkID0geS5mcm9tUmVkKCkuaXNPZGQoKTtcbiAgaWYgKG9kZCAmJiAhaXNPZGQgfHwgIW9kZCAmJiBpc09kZClcbiAgICB5ID0geS5yZWROZWcoKTtcblxuICByZXR1cm4gdGhpcy5wb2ludCh4LCB5KTtcbn07XG5cbkVkd2FyZHNDdXJ2ZS5wcm90b3R5cGUucG9pbnRGcm9tWSA9IGZ1bmN0aW9uIHBvaW50RnJvbVkoeSwgb2RkKSB7XG4gIHkgPSBuZXcgQk4oeSwgMTYpO1xuICBpZiAoIXkucmVkKVxuICAgIHkgPSB5LnRvUmVkKHRoaXMucmVkKTtcblxuICAvLyB4XjIgPSAoeV4yIC0gY14yKSAvIChjXjIgZCB5XjIgLSBhKVxuICB2YXIgeTIgPSB5LnJlZFNxcigpO1xuICB2YXIgbGhzID0geTIucmVkU3ViKHRoaXMuYzIpO1xuICB2YXIgcmhzID0geTIucmVkTXVsKHRoaXMuZCkucmVkTXVsKHRoaXMuYzIpLnJlZFN1Yih0aGlzLmEpO1xuICB2YXIgeDIgPSBsaHMucmVkTXVsKHJocy5yZWRJbnZtKCkpO1xuXG4gIGlmICh4Mi5jbXAodGhpcy56ZXJvKSA9PT0gMCkge1xuICAgIGlmIChvZGQpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgcG9pbnQnKTtcbiAgICBlbHNlXG4gICAgICByZXR1cm4gdGhpcy5wb2ludCh0aGlzLnplcm8sIHkpO1xuICB9XG5cbiAgdmFyIHggPSB4Mi5yZWRTcXJ0KCk7XG4gIGlmICh4LnJlZFNxcigpLnJlZFN1Yih4MikuY21wKHRoaXMuemVybykgIT09IDApXG4gICAgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHBvaW50Jyk7XG5cbiAgaWYgKHguZnJvbVJlZCgpLmlzT2RkKCkgIT09IG9kZClcbiAgICB4ID0geC5yZWROZWcoKTtcblxuICByZXR1cm4gdGhpcy5wb2ludCh4LCB5KTtcbn07XG5cbkVkd2FyZHNDdXJ2ZS5wcm90b3R5cGUudmFsaWRhdGUgPSBmdW5jdGlvbiB2YWxpZGF0ZShwb2ludCkge1xuICBpZiAocG9pbnQuaXNJbmZpbml0eSgpKVxuICAgIHJldHVybiB0cnVlO1xuXG4gIC8vIEN1cnZlOiBBICogWF4yICsgWV4yID0gQ14yICogKDEgKyBEICogWF4yICogWV4yKVxuICBwb2ludC5ub3JtYWxpemUoKTtcblxuICB2YXIgeDIgPSBwb2ludC54LnJlZFNxcigpO1xuICB2YXIgeTIgPSBwb2ludC55LnJlZFNxcigpO1xuICB2YXIgbGhzID0geDIucmVkTXVsKHRoaXMuYSkucmVkQWRkKHkyKTtcbiAgdmFyIHJocyA9IHRoaXMuYzIucmVkTXVsKHRoaXMub25lLnJlZEFkZCh0aGlzLmQucmVkTXVsKHgyKS5yZWRNdWwoeTIpKSk7XG5cbiAgcmV0dXJuIGxocy5jbXAocmhzKSA9PT0gMDtcbn07XG5cbmZ1bmN0aW9uIFBvaW50KGN1cnZlLCB4LCB5LCB6LCB0KSB7XG4gIEJhc2UuQmFzZVBvaW50LmNhbGwodGhpcywgY3VydmUsICdwcm9qZWN0aXZlJyk7XG4gIGlmICh4ID09PSBudWxsICYmIHkgPT09IG51bGwgJiYgeiA9PT0gbnVsbCkge1xuICAgIHRoaXMueCA9IHRoaXMuY3VydmUuemVybztcbiAgICB0aGlzLnkgPSB0aGlzLmN1cnZlLm9uZTtcbiAgICB0aGlzLnogPSB0aGlzLmN1cnZlLm9uZTtcbiAgICB0aGlzLnQgPSB0aGlzLmN1cnZlLnplcm87XG4gICAgdGhpcy56T25lID0gdHJ1ZTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLnggPSBuZXcgQk4oeCwgMTYpO1xuICAgIHRoaXMueSA9IG5ldyBCTih5LCAxNik7XG4gICAgdGhpcy56ID0geiA/IG5ldyBCTih6LCAxNikgOiB0aGlzLmN1cnZlLm9uZTtcbiAgICB0aGlzLnQgPSB0ICYmIG5ldyBCTih0LCAxNik7XG4gICAgaWYgKCF0aGlzLngucmVkKVxuICAgICAgdGhpcy54ID0gdGhpcy54LnRvUmVkKHRoaXMuY3VydmUucmVkKTtcbiAgICBpZiAoIXRoaXMueS5yZWQpXG4gICAgICB0aGlzLnkgPSB0aGlzLnkudG9SZWQodGhpcy5jdXJ2ZS5yZWQpO1xuICAgIGlmICghdGhpcy56LnJlZClcbiAgICAgIHRoaXMueiA9IHRoaXMuei50b1JlZCh0aGlzLmN1cnZlLnJlZCk7XG4gICAgaWYgKHRoaXMudCAmJiAhdGhpcy50LnJlZClcbiAgICAgIHRoaXMudCA9IHRoaXMudC50b1JlZCh0aGlzLmN1cnZlLnJlZCk7XG4gICAgdGhpcy56T25lID0gdGhpcy56ID09PSB0aGlzLmN1cnZlLm9uZTtcblxuICAgIC8vIFVzZSBleHRlbmRlZCBjb29yZGluYXRlc1xuICAgIGlmICh0aGlzLmN1cnZlLmV4dGVuZGVkICYmICF0aGlzLnQpIHtcbiAgICAgIHRoaXMudCA9IHRoaXMueC5yZWRNdWwodGhpcy55KTtcbiAgICAgIGlmICghdGhpcy56T25lKVxuICAgICAgICB0aGlzLnQgPSB0aGlzLnQucmVkTXVsKHRoaXMuei5yZWRJbnZtKCkpO1xuICAgIH1cbiAgfVxufVxuaW5oZXJpdHMoUG9pbnQsIEJhc2UuQmFzZVBvaW50KTtcblxuRWR3YXJkc0N1cnZlLnByb3RvdHlwZS5wb2ludEZyb21KU09OID0gZnVuY3Rpb24gcG9pbnRGcm9tSlNPTihvYmopIHtcbiAgcmV0dXJuIFBvaW50LmZyb21KU09OKHRoaXMsIG9iaik7XG59O1xuXG5FZHdhcmRzQ3VydmUucHJvdG90eXBlLnBvaW50ID0gZnVuY3Rpb24gcG9pbnQoeCwgeSwgeiwgdCkge1xuICByZXR1cm4gbmV3IFBvaW50KHRoaXMsIHgsIHksIHosIHQpO1xufTtcblxuUG9pbnQuZnJvbUpTT04gPSBmdW5jdGlvbiBmcm9tSlNPTihjdXJ2ZSwgb2JqKSB7XG4gIHJldHVybiBuZXcgUG9pbnQoY3VydmUsIG9ialswXSwgb2JqWzFdLCBvYmpbMl0pO1xufTtcblxuUG9pbnQucHJvdG90eXBlLmluc3BlY3QgPSBmdW5jdGlvbiBpbnNwZWN0KCkge1xuICBpZiAodGhpcy5pc0luZmluaXR5KCkpXG4gICAgcmV0dXJuICc8RUMgUG9pbnQgSW5maW5pdHk+JztcbiAgcmV0dXJuICc8RUMgUG9pbnQgeDogJyArIHRoaXMueC5mcm9tUmVkKCkudG9TdHJpbmcoMTYsIDIpICtcbiAgICAgICcgeTogJyArIHRoaXMueS5mcm9tUmVkKCkudG9TdHJpbmcoMTYsIDIpICtcbiAgICAgICcgejogJyArIHRoaXMuei5mcm9tUmVkKCkudG9TdHJpbmcoMTYsIDIpICsgJz4nO1xufTtcblxuUG9pbnQucHJvdG90eXBlLmlzSW5maW5pdHkgPSBmdW5jdGlvbiBpc0luZmluaXR5KCkge1xuICAvLyBYWFggVGhpcyBjb2RlIGFzc3VtZXMgdGhhdCB6ZXJvIGlzIGFsd2F5cyB6ZXJvIGluIHJlZFxuICByZXR1cm4gdGhpcy54LmNtcG4oMCkgPT09IDAgJiZcbiAgICAodGhpcy55LmNtcCh0aGlzLnopID09PSAwIHx8XG4gICAgKHRoaXMuek9uZSAmJiB0aGlzLnkuY21wKHRoaXMuY3VydmUuYykgPT09IDApKTtcbn07XG5cblBvaW50LnByb3RvdHlwZS5fZXh0RGJsID0gZnVuY3Rpb24gX2V4dERibCgpIHtcbiAgLy8gaHlwZXJlbGxpcHRpYy5vcmcvRUZEL2cxcC9hdXRvLXR3aXN0ZWQtZXh0ZW5kZWQtMS5odG1sXG4gIC8vICAgICAjZG91YmxpbmctZGJsLTIwMDgtaHdjZFxuICAvLyA0TSArIDRTXG5cbiAgLy8gQSA9IFgxXjJcbiAgdmFyIGEgPSB0aGlzLngucmVkU3FyKCk7XG4gIC8vIEIgPSBZMV4yXG4gIHZhciBiID0gdGhpcy55LnJlZFNxcigpO1xuICAvLyBDID0gMiAqIFoxXjJcbiAgdmFyIGMgPSB0aGlzLnoucmVkU3FyKCk7XG4gIGMgPSBjLnJlZElBZGQoYyk7XG4gIC8vIEQgPSBhICogQVxuICB2YXIgZCA9IHRoaXMuY3VydmUuX211bEEoYSk7XG4gIC8vIEUgPSAoWDEgKyBZMSleMiAtIEEgLSBCXG4gIHZhciBlID0gdGhpcy54LnJlZEFkZCh0aGlzLnkpLnJlZFNxcigpLnJlZElTdWIoYSkucmVkSVN1YihiKTtcbiAgLy8gRyA9IEQgKyBCXG4gIHZhciBnID0gZC5yZWRBZGQoYik7XG4gIC8vIEYgPSBHIC0gQ1xuICB2YXIgZiA9IGcucmVkU3ViKGMpO1xuICAvLyBIID0gRCAtIEJcbiAgdmFyIGggPSBkLnJlZFN1YihiKTtcbiAgLy8gWDMgPSBFICogRlxuICB2YXIgbnggPSBlLnJlZE11bChmKTtcbiAgLy8gWTMgPSBHICogSFxuICB2YXIgbnkgPSBnLnJlZE11bChoKTtcbiAgLy8gVDMgPSBFICogSFxuICB2YXIgbnQgPSBlLnJlZE11bChoKTtcbiAgLy8gWjMgPSBGICogR1xuICB2YXIgbnogPSBmLnJlZE11bChnKTtcbiAgcmV0dXJuIHRoaXMuY3VydmUucG9pbnQobngsIG55LCBueiwgbnQpO1xufTtcblxuUG9pbnQucHJvdG90eXBlLl9wcm9qRGJsID0gZnVuY3Rpb24gX3Byb2pEYmwoKSB7XG4gIC8vIGh5cGVyZWxsaXB0aWMub3JnL0VGRC9nMXAvYXV0by10d2lzdGVkLXByb2plY3RpdmUuaHRtbFxuICAvLyAgICAgI2RvdWJsaW5nLWRibC0yMDA4LWJiamxwXG4gIC8vICAgICAjZG91YmxpbmctZGJsLTIwMDctYmxcbiAgLy8gYW5kIG90aGVyc1xuICAvLyBHZW5lcmFsbHkgM00gKyA0UyBvciAyTSArIDRTXG5cbiAgLy8gQiA9IChYMSArIFkxKV4yXG4gIHZhciBiID0gdGhpcy54LnJlZEFkZCh0aGlzLnkpLnJlZFNxcigpO1xuICAvLyBDID0gWDFeMlxuICB2YXIgYyA9IHRoaXMueC5yZWRTcXIoKTtcbiAgLy8gRCA9IFkxXjJcbiAgdmFyIGQgPSB0aGlzLnkucmVkU3FyKCk7XG5cbiAgdmFyIG54O1xuICB2YXIgbnk7XG4gIHZhciBuejtcbiAgaWYgKHRoaXMuY3VydmUudHdpc3RlZCkge1xuICAgIC8vIEUgPSBhICogQ1xuICAgIHZhciBlID0gdGhpcy5jdXJ2ZS5fbXVsQShjKTtcbiAgICAvLyBGID0gRSArIERcbiAgICB2YXIgZiA9IGUucmVkQWRkKGQpO1xuICAgIGlmICh0aGlzLnpPbmUpIHtcbiAgICAgIC8vIFgzID0gKEIgLSBDIC0gRCkgKiAoRiAtIDIpXG4gICAgICBueCA9IGIucmVkU3ViKGMpLnJlZFN1YihkKS5yZWRNdWwoZi5yZWRTdWIodGhpcy5jdXJ2ZS50d28pKTtcbiAgICAgIC8vIFkzID0gRiAqIChFIC0gRClcbiAgICAgIG55ID0gZi5yZWRNdWwoZS5yZWRTdWIoZCkpO1xuICAgICAgLy8gWjMgPSBGXjIgLSAyICogRlxuICAgICAgbnogPSBmLnJlZFNxcigpLnJlZFN1YihmKS5yZWRTdWIoZik7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEggPSBaMV4yXG4gICAgICB2YXIgaCA9IHRoaXMuei5yZWRTcXIoKTtcbiAgICAgIC8vIEogPSBGIC0gMiAqIEhcbiAgICAgIHZhciBqID0gZi5yZWRTdWIoaCkucmVkSVN1YihoKTtcbiAgICAgIC8vIFgzID0gKEItQy1EKSpKXG4gICAgICBueCA9IGIucmVkU3ViKGMpLnJlZElTdWIoZCkucmVkTXVsKGopO1xuICAgICAgLy8gWTMgPSBGICogKEUgLSBEKVxuICAgICAgbnkgPSBmLnJlZE11bChlLnJlZFN1YihkKSk7XG4gICAgICAvLyBaMyA9IEYgKiBKXG4gICAgICBueiA9IGYucmVkTXVsKGopO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICAvLyBFID0gQyArIERcbiAgICB2YXIgZSA9IGMucmVkQWRkKGQpO1xuICAgIC8vIEggPSAoYyAqIFoxKV4yXG4gICAgdmFyIGggPSB0aGlzLmN1cnZlLl9tdWxDKHRoaXMueikucmVkU3FyKCk7XG4gICAgLy8gSiA9IEUgLSAyICogSFxuICAgIHZhciBqID0gZS5yZWRTdWIoaCkucmVkU3ViKGgpO1xuICAgIC8vIFgzID0gYyAqIChCIC0gRSkgKiBKXG4gICAgbnggPSB0aGlzLmN1cnZlLl9tdWxDKGIucmVkSVN1YihlKSkucmVkTXVsKGopO1xuICAgIC8vIFkzID0gYyAqIEUgKiAoQyAtIEQpXG4gICAgbnkgPSB0aGlzLmN1cnZlLl9tdWxDKGUpLnJlZE11bChjLnJlZElTdWIoZCkpO1xuICAgIC8vIFozID0gRSAqIEpcbiAgICBueiA9IGUucmVkTXVsKGopO1xuICB9XG4gIHJldHVybiB0aGlzLmN1cnZlLnBvaW50KG54LCBueSwgbnopO1xufTtcblxuUG9pbnQucHJvdG90eXBlLmRibCA9IGZ1bmN0aW9uIGRibCgpIHtcbiAgaWYgKHRoaXMuaXNJbmZpbml0eSgpKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIC8vIERvdWJsZSBpbiBleHRlbmRlZCBjb29yZGluYXRlc1xuICBpZiAodGhpcy5jdXJ2ZS5leHRlbmRlZClcbiAgICByZXR1cm4gdGhpcy5fZXh0RGJsKCk7XG4gIGVsc2VcbiAgICByZXR1cm4gdGhpcy5fcHJvakRibCgpO1xufTtcblxuUG9pbnQucHJvdG90eXBlLl9leHRBZGQgPSBmdW5jdGlvbiBfZXh0QWRkKHApIHtcbiAgLy8gaHlwZXJlbGxpcHRpYy5vcmcvRUZEL2cxcC9hdXRvLXR3aXN0ZWQtZXh0ZW5kZWQtMS5odG1sXG4gIC8vICAgICAjYWRkaXRpb24tYWRkLTIwMDgtaHdjZC0zXG4gIC8vIDhNXG5cbiAgLy8gQSA9IChZMSAtIFgxKSAqIChZMiAtIFgyKVxuICB2YXIgYSA9IHRoaXMueS5yZWRTdWIodGhpcy54KS5yZWRNdWwocC55LnJlZFN1YihwLngpKTtcbiAgLy8gQiA9IChZMSArIFgxKSAqIChZMiArIFgyKVxuICB2YXIgYiA9IHRoaXMueS5yZWRBZGQodGhpcy54KS5yZWRNdWwocC55LnJlZEFkZChwLngpKTtcbiAgLy8gQyA9IFQxICogayAqIFQyXG4gIHZhciBjID0gdGhpcy50LnJlZE11bCh0aGlzLmN1cnZlLmRkKS5yZWRNdWwocC50KTtcbiAgLy8gRCA9IFoxICogMiAqIFoyXG4gIHZhciBkID0gdGhpcy56LnJlZE11bChwLnoucmVkQWRkKHAueikpO1xuICAvLyBFID0gQiAtIEFcbiAgdmFyIGUgPSBiLnJlZFN1YihhKTtcbiAgLy8gRiA9IEQgLSBDXG4gIHZhciBmID0gZC5yZWRTdWIoYyk7XG4gIC8vIEcgPSBEICsgQ1xuICB2YXIgZyA9IGQucmVkQWRkKGMpO1xuICAvLyBIID0gQiArIEFcbiAgdmFyIGggPSBiLnJlZEFkZChhKTtcbiAgLy8gWDMgPSBFICogRlxuICB2YXIgbnggPSBlLnJlZE11bChmKTtcbiAgLy8gWTMgPSBHICogSFxuICB2YXIgbnkgPSBnLnJlZE11bChoKTtcbiAgLy8gVDMgPSBFICogSFxuICB2YXIgbnQgPSBlLnJlZE11bChoKTtcbiAgLy8gWjMgPSBGICogR1xuICB2YXIgbnogPSBmLnJlZE11bChnKTtcbiAgcmV0dXJuIHRoaXMuY3VydmUucG9pbnQobngsIG55LCBueiwgbnQpO1xufTtcblxuUG9pbnQucHJvdG90eXBlLl9wcm9qQWRkID0gZnVuY3Rpb24gX3Byb2pBZGQocCkge1xuICAvLyBoeXBlcmVsbGlwdGljLm9yZy9FRkQvZzFwL2F1dG8tdHdpc3RlZC1wcm9qZWN0aXZlLmh0bWxcbiAgLy8gICAgICNhZGRpdGlvbi1hZGQtMjAwOC1iYmpscFxuICAvLyAgICAgI2FkZGl0aW9uLWFkZC0yMDA3LWJsXG4gIC8vIDEwTSArIDFTXG5cbiAgLy8gQSA9IFoxICogWjJcbiAgdmFyIGEgPSB0aGlzLnoucmVkTXVsKHAueik7XG4gIC8vIEIgPSBBXjJcbiAgdmFyIGIgPSBhLnJlZFNxcigpO1xuICAvLyBDID0gWDEgKiBYMlxuICB2YXIgYyA9IHRoaXMueC5yZWRNdWwocC54KTtcbiAgLy8gRCA9IFkxICogWTJcbiAgdmFyIGQgPSB0aGlzLnkucmVkTXVsKHAueSk7XG4gIC8vIEUgPSBkICogQyAqIERcbiAgdmFyIGUgPSB0aGlzLmN1cnZlLmQucmVkTXVsKGMpLnJlZE11bChkKTtcbiAgLy8gRiA9IEIgLSBFXG4gIHZhciBmID0gYi5yZWRTdWIoZSk7XG4gIC8vIEcgPSBCICsgRVxuICB2YXIgZyA9IGIucmVkQWRkKGUpO1xuICAvLyBYMyA9IEEgKiBGICogKChYMSArIFkxKSAqIChYMiArIFkyKSAtIEMgLSBEKVxuICB2YXIgdG1wID0gdGhpcy54LnJlZEFkZCh0aGlzLnkpLnJlZE11bChwLngucmVkQWRkKHAueSkpLnJlZElTdWIoYykucmVkSVN1YihkKTtcbiAgdmFyIG54ID0gYS5yZWRNdWwoZikucmVkTXVsKHRtcCk7XG4gIHZhciBueTtcbiAgdmFyIG56O1xuICBpZiAodGhpcy5jdXJ2ZS50d2lzdGVkKSB7XG4gICAgLy8gWTMgPSBBICogRyAqIChEIC0gYSAqIEMpXG4gICAgbnkgPSBhLnJlZE11bChnKS5yZWRNdWwoZC5yZWRTdWIodGhpcy5jdXJ2ZS5fbXVsQShjKSkpO1xuICAgIC8vIFozID0gRiAqIEdcbiAgICBueiA9IGYucmVkTXVsKGcpO1xuICB9IGVsc2Uge1xuICAgIC8vIFkzID0gQSAqIEcgKiAoRCAtIEMpXG4gICAgbnkgPSBhLnJlZE11bChnKS5yZWRNdWwoZC5yZWRTdWIoYykpO1xuICAgIC8vIFozID0gYyAqIEYgKiBHXG4gICAgbnogPSB0aGlzLmN1cnZlLl9tdWxDKGYpLnJlZE11bChnKTtcbiAgfVxuICByZXR1cm4gdGhpcy5jdXJ2ZS5wb2ludChueCwgbnksIG56KTtcbn07XG5cblBvaW50LnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbiBhZGQocCkge1xuICBpZiAodGhpcy5pc0luZmluaXR5KCkpXG4gICAgcmV0dXJuIHA7XG4gIGlmIChwLmlzSW5maW5pdHkoKSlcbiAgICByZXR1cm4gdGhpcztcblxuICBpZiAodGhpcy5jdXJ2ZS5leHRlbmRlZClcbiAgICByZXR1cm4gdGhpcy5fZXh0QWRkKHApO1xuICBlbHNlXG4gICAgcmV0dXJuIHRoaXMuX3Byb2pBZGQocCk7XG59O1xuXG5Qb2ludC5wcm90b3R5cGUubXVsID0gZnVuY3Rpb24gbXVsKGspIHtcbiAgaWYgKHRoaXMuX2hhc0RvdWJsZXMoaykpXG4gICAgcmV0dXJuIHRoaXMuY3VydmUuX2ZpeGVkTmFmTXVsKHRoaXMsIGspO1xuICBlbHNlXG4gICAgcmV0dXJuIHRoaXMuY3VydmUuX3duYWZNdWwodGhpcywgayk7XG59O1xuXG5Qb2ludC5wcm90b3R5cGUubXVsQWRkID0gZnVuY3Rpb24gbXVsQWRkKGsxLCBwLCBrMikge1xuICByZXR1cm4gdGhpcy5jdXJ2ZS5fd25hZk11bEFkZCgxLCBbIHRoaXMsIHAgXSwgWyBrMSwgazIgXSwgMiwgZmFsc2UpO1xufTtcblxuUG9pbnQucHJvdG90eXBlLmptdWxBZGQgPSBmdW5jdGlvbiBqbXVsQWRkKGsxLCBwLCBrMikge1xuICByZXR1cm4gdGhpcy5jdXJ2ZS5fd25hZk11bEFkZCgxLCBbIHRoaXMsIHAgXSwgWyBrMSwgazIgXSwgMiwgdHJ1ZSk7XG59O1xuXG5Qb2ludC5wcm90b3R5cGUubm9ybWFsaXplID0gZnVuY3Rpb24gbm9ybWFsaXplKCkge1xuICBpZiAodGhpcy56T25lKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIC8vIE5vcm1hbGl6ZSBjb29yZGluYXRlc1xuICB2YXIgemkgPSB0aGlzLnoucmVkSW52bSgpO1xuICB0aGlzLnggPSB0aGlzLngucmVkTXVsKHppKTtcbiAgdGhpcy55ID0gdGhpcy55LnJlZE11bCh6aSk7XG4gIGlmICh0aGlzLnQpXG4gICAgdGhpcy50ID0gdGhpcy50LnJlZE11bCh6aSk7XG4gIHRoaXMueiA9IHRoaXMuY3VydmUub25lO1xuICB0aGlzLnpPbmUgPSB0cnVlO1xuICByZXR1cm4gdGhpcztcbn07XG5cblBvaW50LnByb3RvdHlwZS5uZWcgPSBmdW5jdGlvbiBuZWcoKSB7XG4gIHJldHVybiB0aGlzLmN1cnZlLnBvaW50KHRoaXMueC5yZWROZWcoKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy55LFxuICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnosXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudCAmJiB0aGlzLnQucmVkTmVnKCkpO1xufTtcblxuUG9pbnQucHJvdG90eXBlLmdldFggPSBmdW5jdGlvbiBnZXRYKCkge1xuICB0aGlzLm5vcm1hbGl6ZSgpO1xuICByZXR1cm4gdGhpcy54LmZyb21SZWQoKTtcbn07XG5cblBvaW50LnByb3RvdHlwZS5nZXRZID0gZnVuY3Rpb24gZ2V0WSgpIHtcbiAgdGhpcy5ub3JtYWxpemUoKTtcbiAgcmV0dXJuIHRoaXMueS5mcm9tUmVkKCk7XG59O1xuXG5Qb2ludC5wcm90b3R5cGUuZXEgPSBmdW5jdGlvbiBlcShvdGhlcikge1xuICByZXR1cm4gdGhpcyA9PT0gb3RoZXIgfHxcbiAgICAgICAgIHRoaXMuZ2V0WCgpLmNtcChvdGhlci5nZXRYKCkpID09PSAwICYmXG4gICAgICAgICB0aGlzLmdldFkoKS5jbXAob3RoZXIuZ2V0WSgpKSA9PT0gMDtcbn07XG5cblBvaW50LnByb3RvdHlwZS5lcVhUb1AgPSBmdW5jdGlvbiBlcVhUb1AoeCkge1xuICB2YXIgcnggPSB4LnRvUmVkKHRoaXMuY3VydmUucmVkKS5yZWRNdWwodGhpcy56KTtcbiAgaWYgKHRoaXMueC5jbXAocngpID09PSAwKVxuICAgIHJldHVybiB0cnVlO1xuXG4gIHZhciB4YyA9IHguY2xvbmUoKTtcbiAgdmFyIHQgPSB0aGlzLmN1cnZlLnJlZE4ucmVkTXVsKHRoaXMueik7XG4gIGZvciAoOzspIHtcbiAgICB4Yy5pYWRkKHRoaXMuY3VydmUubik7XG4gICAgaWYgKHhjLmNtcCh0aGlzLmN1cnZlLnApID49IDApXG4gICAgICByZXR1cm4gZmFsc2U7XG5cbiAgICByeC5yZWRJQWRkKHQpO1xuICAgIGlmICh0aGlzLnguY21wKHJ4KSA9PT0gMClcbiAgICAgIHJldHVybiB0cnVlO1xuICB9XG59O1xuXG4vLyBDb21wYXRpYmlsaXR5IHdpdGggQmFzZUN1cnZlXG5Qb2ludC5wcm90b3R5cGUudG9QID0gUG9pbnQucHJvdG90eXBlLm5vcm1hbGl6ZTtcblBvaW50LnByb3RvdHlwZS5taXhlZEFkZCA9IFBvaW50LnByb3RvdHlwZS5hZGQ7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBjdXJ2ZSA9IGV4cG9ydHM7XG5cbmN1cnZlLmJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKTtcbmN1cnZlLnNob3J0ID0gcmVxdWlyZSgnLi9zaG9ydCcpO1xuY3VydmUubW9udCA9IHJlcXVpcmUoJy4vbW9udCcpO1xuY3VydmUuZWR3YXJkcyA9IHJlcXVpcmUoJy4vZWR3YXJkcycpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgY3VydmUgPSByZXF1aXJlKCcuLi9jdXJ2ZScpO1xudmFyIEJOID0gcmVxdWlyZSgnYm4uanMnKTtcbnZhciBpbmhlcml0cyA9IHJlcXVpcmUoJ2luaGVyaXRzJyk7XG52YXIgQmFzZSA9IGN1cnZlLmJhc2U7XG5cbnZhciBlbGxpcHRpYyA9IHJlcXVpcmUoJy4uLy4uL2VsbGlwdGljJyk7XG52YXIgdXRpbHMgPSBlbGxpcHRpYy51dGlscztcblxuZnVuY3Rpb24gTW9udEN1cnZlKGNvbmYpIHtcbiAgQmFzZS5jYWxsKHRoaXMsICdtb250JywgY29uZik7XG5cbiAgdGhpcy5hID0gbmV3IEJOKGNvbmYuYSwgMTYpLnRvUmVkKHRoaXMucmVkKTtcbiAgdGhpcy5iID0gbmV3IEJOKGNvbmYuYiwgMTYpLnRvUmVkKHRoaXMucmVkKTtcbiAgdGhpcy5pNCA9IG5ldyBCTig0KS50b1JlZCh0aGlzLnJlZCkucmVkSW52bSgpO1xuICB0aGlzLnR3byA9IG5ldyBCTigyKS50b1JlZCh0aGlzLnJlZCk7XG4gIHRoaXMuYTI0ID0gdGhpcy5pNC5yZWRNdWwodGhpcy5hLnJlZEFkZCh0aGlzLnR3bykpO1xufVxuaW5oZXJpdHMoTW9udEN1cnZlLCBCYXNlKTtcbm1vZHVsZS5leHBvcnRzID0gTW9udEN1cnZlO1xuXG5Nb250Q3VydmUucHJvdG90eXBlLnZhbGlkYXRlID0gZnVuY3Rpb24gdmFsaWRhdGUocG9pbnQpIHtcbiAgdmFyIHggPSBwb2ludC5ub3JtYWxpemUoKS54O1xuICB2YXIgeDIgPSB4LnJlZFNxcigpO1xuICB2YXIgcmhzID0geDIucmVkTXVsKHgpLnJlZEFkZCh4Mi5yZWRNdWwodGhpcy5hKSkucmVkQWRkKHgpO1xuICB2YXIgeSA9IHJocy5yZWRTcXJ0KCk7XG5cbiAgcmV0dXJuIHkucmVkU3FyKCkuY21wKHJocykgPT09IDA7XG59O1xuXG5mdW5jdGlvbiBQb2ludChjdXJ2ZSwgeCwgeikge1xuICBCYXNlLkJhc2VQb2ludC5jYWxsKHRoaXMsIGN1cnZlLCAncHJvamVjdGl2ZScpO1xuICBpZiAoeCA9PT0gbnVsbCAmJiB6ID09PSBudWxsKSB7XG4gICAgdGhpcy54ID0gdGhpcy5jdXJ2ZS5vbmU7XG4gICAgdGhpcy56ID0gdGhpcy5jdXJ2ZS56ZXJvO1xuICB9IGVsc2Uge1xuICAgIHRoaXMueCA9IG5ldyBCTih4LCAxNik7XG4gICAgdGhpcy56ID0gbmV3IEJOKHosIDE2KTtcbiAgICBpZiAoIXRoaXMueC5yZWQpXG4gICAgICB0aGlzLnggPSB0aGlzLngudG9SZWQodGhpcy5jdXJ2ZS5yZWQpO1xuICAgIGlmICghdGhpcy56LnJlZClcbiAgICAgIHRoaXMueiA9IHRoaXMuei50b1JlZCh0aGlzLmN1cnZlLnJlZCk7XG4gIH1cbn1cbmluaGVyaXRzKFBvaW50LCBCYXNlLkJhc2VQb2ludCk7XG5cbk1vbnRDdXJ2ZS5wcm90b3R5cGUuZGVjb2RlUG9pbnQgPSBmdW5jdGlvbiBkZWNvZGVQb2ludChieXRlcywgZW5jKSB7XG4gIHJldHVybiB0aGlzLnBvaW50KHV0aWxzLnRvQXJyYXkoYnl0ZXMsIGVuYyksIDEpO1xufTtcblxuTW9udEN1cnZlLnByb3RvdHlwZS5wb2ludCA9IGZ1bmN0aW9uIHBvaW50KHgsIHopIHtcbiAgcmV0dXJuIG5ldyBQb2ludCh0aGlzLCB4LCB6KTtcbn07XG5cbk1vbnRDdXJ2ZS5wcm90b3R5cGUucG9pbnRGcm9tSlNPTiA9IGZ1bmN0aW9uIHBvaW50RnJvbUpTT04ob2JqKSB7XG4gIHJldHVybiBQb2ludC5mcm9tSlNPTih0aGlzLCBvYmopO1xufTtcblxuUG9pbnQucHJvdG90eXBlLnByZWNvbXB1dGUgPSBmdW5jdGlvbiBwcmVjb21wdXRlKCkge1xuICAvLyBOby1vcFxufTtcblxuUG9pbnQucHJvdG90eXBlLl9lbmNvZGUgPSBmdW5jdGlvbiBfZW5jb2RlKCkge1xuICByZXR1cm4gdGhpcy5nZXRYKCkudG9BcnJheSgnYmUnLCB0aGlzLmN1cnZlLnAuYnl0ZUxlbmd0aCgpKTtcbn07XG5cblBvaW50LmZyb21KU09OID0gZnVuY3Rpb24gZnJvbUpTT04oY3VydmUsIG9iaikge1xuICByZXR1cm4gbmV3IFBvaW50KGN1cnZlLCBvYmpbMF0sIG9ialsxXSB8fCBjdXJ2ZS5vbmUpO1xufTtcblxuUG9pbnQucHJvdG90eXBlLmluc3BlY3QgPSBmdW5jdGlvbiBpbnNwZWN0KCkge1xuICBpZiAodGhpcy5pc0luZmluaXR5KCkpXG4gICAgcmV0dXJuICc8RUMgUG9pbnQgSW5maW5pdHk+JztcbiAgcmV0dXJuICc8RUMgUG9pbnQgeDogJyArIHRoaXMueC5mcm9tUmVkKCkudG9TdHJpbmcoMTYsIDIpICtcbiAgICAgICcgejogJyArIHRoaXMuei5mcm9tUmVkKCkudG9TdHJpbmcoMTYsIDIpICsgJz4nO1xufTtcblxuUG9pbnQucHJvdG90eXBlLmlzSW5maW5pdHkgPSBmdW5jdGlvbiBpc0luZmluaXR5KCkge1xuICAvLyBYWFggVGhpcyBjb2RlIGFzc3VtZXMgdGhhdCB6ZXJvIGlzIGFsd2F5cyB6ZXJvIGluIHJlZFxuICByZXR1cm4gdGhpcy56LmNtcG4oMCkgPT09IDA7XG59O1xuXG5Qb2ludC5wcm90b3R5cGUuZGJsID0gZnVuY3Rpb24gZGJsKCkge1xuICAvLyBodHRwOi8vaHlwZXJlbGxpcHRpYy5vcmcvRUZEL2cxcC9hdXRvLW1vbnRnb20teHouaHRtbCNkb3VibGluZy1kYmwtMTk4Ny1tLTNcbiAgLy8gMk0gKyAyUyArIDRBXG5cbiAgLy8gQSA9IFgxICsgWjFcbiAgdmFyIGEgPSB0aGlzLngucmVkQWRkKHRoaXMueik7XG4gIC8vIEFBID0gQV4yXG4gIHZhciBhYSA9IGEucmVkU3FyKCk7XG4gIC8vIEIgPSBYMSAtIFoxXG4gIHZhciBiID0gdGhpcy54LnJlZFN1Yih0aGlzLnopO1xuICAvLyBCQiA9IEJeMlxuICB2YXIgYmIgPSBiLnJlZFNxcigpO1xuICAvLyBDID0gQUEgLSBCQlxuICB2YXIgYyA9IGFhLnJlZFN1YihiYik7XG4gIC8vIFgzID0gQUEgKiBCQlxuICB2YXIgbnggPSBhYS5yZWRNdWwoYmIpO1xuICAvLyBaMyA9IEMgKiAoQkIgKyBBMjQgKiBDKVxuICB2YXIgbnogPSBjLnJlZE11bChiYi5yZWRBZGQodGhpcy5jdXJ2ZS5hMjQucmVkTXVsKGMpKSk7XG4gIHJldHVybiB0aGlzLmN1cnZlLnBvaW50KG54LCBueik7XG59O1xuXG5Qb2ludC5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gYWRkKCkge1xuICB0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQgb24gTW9udGdvbWVyeSBjdXJ2ZScpO1xufTtcblxuUG9pbnQucHJvdG90eXBlLmRpZmZBZGQgPSBmdW5jdGlvbiBkaWZmQWRkKHAsIGRpZmYpIHtcbiAgLy8gaHR0cDovL2h5cGVyZWxsaXB0aWMub3JnL0VGRC9nMXAvYXV0by1tb250Z29tLXh6Lmh0bWwjZGlmZmFkZC1kYWRkLTE5ODctbS0zXG4gIC8vIDRNICsgMlMgKyA2QVxuXG4gIC8vIEEgPSBYMiArIFoyXG4gIHZhciBhID0gdGhpcy54LnJlZEFkZCh0aGlzLnopO1xuICAvLyBCID0gWDIgLSBaMlxuICB2YXIgYiA9IHRoaXMueC5yZWRTdWIodGhpcy56KTtcbiAgLy8gQyA9IFgzICsgWjNcbiAgdmFyIGMgPSBwLngucmVkQWRkKHAueik7XG4gIC8vIEQgPSBYMyAtIFozXG4gIHZhciBkID0gcC54LnJlZFN1YihwLnopO1xuICAvLyBEQSA9IEQgKiBBXG4gIHZhciBkYSA9IGQucmVkTXVsKGEpO1xuICAvLyBDQiA9IEMgKiBCXG4gIHZhciBjYiA9IGMucmVkTXVsKGIpO1xuICAvLyBYNSA9IFoxICogKERBICsgQ0IpXjJcbiAgdmFyIG54ID0gZGlmZi56LnJlZE11bChkYS5yZWRBZGQoY2IpLnJlZFNxcigpKTtcbiAgLy8gWjUgPSBYMSAqIChEQSAtIENCKV4yXG4gIHZhciBueiA9IGRpZmYueC5yZWRNdWwoZGEucmVkSVN1YihjYikucmVkU3FyKCkpO1xuICByZXR1cm4gdGhpcy5jdXJ2ZS5wb2ludChueCwgbnopO1xufTtcblxuUG9pbnQucHJvdG90eXBlLm11bCA9IGZ1bmN0aW9uIG11bChrKSB7XG4gIHZhciB0ID0gay5jbG9uZSgpO1xuICB2YXIgYSA9IHRoaXM7IC8vIChOIC8gMikgKiBRICsgUVxuICB2YXIgYiA9IHRoaXMuY3VydmUucG9pbnQobnVsbCwgbnVsbCk7IC8vIChOIC8gMikgKiBRXG4gIHZhciBjID0gdGhpczsgLy8gUVxuXG4gIGZvciAodmFyIGJpdHMgPSBbXTsgdC5jbXBuKDApICE9PSAwOyB0Lml1c2hybigxKSlcbiAgICBiaXRzLnB1c2godC5hbmRsbigxKSk7XG5cbiAgZm9yICh2YXIgaSA9IGJpdHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICBpZiAoYml0c1tpXSA9PT0gMCkge1xuICAgICAgLy8gTiAqIFEgKyBRID0gKChOIC8gMikgKiBRICsgUSkpICsgKE4gLyAyKSAqIFFcbiAgICAgIGEgPSBhLmRpZmZBZGQoYiwgYyk7XG4gICAgICAvLyBOICogUSA9IDIgKiAoKE4gLyAyKSAqIFEgKyBRKSlcbiAgICAgIGIgPSBiLmRibCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBOICogUSA9ICgoTiAvIDIpICogUSArIFEpICsgKChOIC8gMikgKiBRKVxuICAgICAgYiA9IGEuZGlmZkFkZChiLCBjKTtcbiAgICAgIC8vIE4gKiBRICsgUSA9IDIgKiAoKE4gLyAyKSAqIFEgKyBRKVxuICAgICAgYSA9IGEuZGJsKCk7XG4gICAgfVxuICB9XG4gIHJldHVybiBiO1xufTtcblxuUG9pbnQucHJvdG90eXBlLm11bEFkZCA9IGZ1bmN0aW9uIG11bEFkZCgpIHtcbiAgdGhyb3cgbmV3IEVycm9yKCdOb3Qgc3VwcG9ydGVkIG9uIE1vbnRnb21lcnkgY3VydmUnKTtcbn07XG5cblBvaW50LnByb3RvdHlwZS5qdW1sQWRkID0gZnVuY3Rpb24ganVtbEFkZCgpIHtcbiAgdGhyb3cgbmV3IEVycm9yKCdOb3Qgc3VwcG9ydGVkIG9uIE1vbnRnb21lcnkgY3VydmUnKTtcbn07XG5cblBvaW50LnByb3RvdHlwZS5lcSA9IGZ1bmN0aW9uIGVxKG90aGVyKSB7XG4gIHJldHVybiB0aGlzLmdldFgoKS5jbXAob3RoZXIuZ2V0WCgpKSA9PT0gMDtcbn07XG5cblBvaW50LnByb3RvdHlwZS5ub3JtYWxpemUgPSBmdW5jdGlvbiBub3JtYWxpemUoKSB7XG4gIHRoaXMueCA9IHRoaXMueC5yZWRNdWwodGhpcy56LnJlZEludm0oKSk7XG4gIHRoaXMueiA9IHRoaXMuY3VydmUub25lO1xuICByZXR1cm4gdGhpcztcbn07XG5cblBvaW50LnByb3RvdHlwZS5nZXRYID0gZnVuY3Rpb24gZ2V0WCgpIHtcbiAgLy8gTm9ybWFsaXplIGNvb3JkaW5hdGVzXG4gIHRoaXMubm9ybWFsaXplKCk7XG5cbiAgcmV0dXJuIHRoaXMueC5mcm9tUmVkKCk7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgY3VydmUgPSByZXF1aXJlKCcuLi9jdXJ2ZScpO1xudmFyIGVsbGlwdGljID0gcmVxdWlyZSgnLi4vLi4vZWxsaXB0aWMnKTtcbnZhciBCTiA9IHJlcXVpcmUoJ2JuLmpzJyk7XG52YXIgaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpO1xudmFyIEJhc2UgPSBjdXJ2ZS5iYXNlO1xuXG52YXIgYXNzZXJ0ID0gZWxsaXB0aWMudXRpbHMuYXNzZXJ0O1xuXG5mdW5jdGlvbiBTaG9ydEN1cnZlKGNvbmYpIHtcbiAgQmFzZS5jYWxsKHRoaXMsICdzaG9ydCcsIGNvbmYpO1xuXG4gIHRoaXMuYSA9IG5ldyBCTihjb25mLmEsIDE2KS50b1JlZCh0aGlzLnJlZCk7XG4gIHRoaXMuYiA9IG5ldyBCTihjb25mLmIsIDE2KS50b1JlZCh0aGlzLnJlZCk7XG4gIHRoaXMudGludiA9IHRoaXMudHdvLnJlZEludm0oKTtcblxuICB0aGlzLnplcm9BID0gdGhpcy5hLmZyb21SZWQoKS5jbXBuKDApID09PSAwO1xuICB0aGlzLnRocmVlQSA9IHRoaXMuYS5mcm9tUmVkKCkuc3ViKHRoaXMucCkuY21wbigtMykgPT09IDA7XG5cbiAgLy8gSWYgdGhlIGN1cnZlIGlzIGVuZG9tb3JwaGljLCBwcmVjYWxjdWxhdGUgYmV0YSBhbmQgbGFtYmRhXG4gIHRoaXMuZW5kbyA9IHRoaXMuX2dldEVuZG9tb3JwaGlzbShjb25mKTtcbiAgdGhpcy5fZW5kb1duYWZUMSA9IG5ldyBBcnJheSg0KTtcbiAgdGhpcy5fZW5kb1duYWZUMiA9IG5ldyBBcnJheSg0KTtcbn1cbmluaGVyaXRzKFNob3J0Q3VydmUsIEJhc2UpO1xubW9kdWxlLmV4cG9ydHMgPSBTaG9ydEN1cnZlO1xuXG5TaG9ydEN1cnZlLnByb3RvdHlwZS5fZ2V0RW5kb21vcnBoaXNtID0gZnVuY3Rpb24gX2dldEVuZG9tb3JwaGlzbShjb25mKSB7XG4gIC8vIE5vIGVmZmljaWVudCBlbmRvbW9ycGhpc21cbiAgaWYgKCF0aGlzLnplcm9BIHx8ICF0aGlzLmcgfHwgIXRoaXMubiB8fCB0aGlzLnAubW9kbigzKSAhPT0gMSlcbiAgICByZXR1cm47XG5cbiAgLy8gQ29tcHV0ZSBiZXRhIGFuZCBsYW1iZGEsIHRoYXQgbGFtYmRhICogUCA9IChiZXRhICogUHg7IFB5KVxuICB2YXIgYmV0YTtcbiAgdmFyIGxhbWJkYTtcbiAgaWYgKGNvbmYuYmV0YSkge1xuICAgIGJldGEgPSBuZXcgQk4oY29uZi5iZXRhLCAxNikudG9SZWQodGhpcy5yZWQpO1xuICB9IGVsc2Uge1xuICAgIHZhciBiZXRhcyA9IHRoaXMuX2dldEVuZG9Sb290cyh0aGlzLnApO1xuICAgIC8vIENob29zZSB0aGUgc21hbGxlc3QgYmV0YVxuICAgIGJldGEgPSBiZXRhc1swXS5jbXAoYmV0YXNbMV0pIDwgMCA/IGJldGFzWzBdIDogYmV0YXNbMV07XG4gICAgYmV0YSA9IGJldGEudG9SZWQodGhpcy5yZWQpO1xuICB9XG4gIGlmIChjb25mLmxhbWJkYSkge1xuICAgIGxhbWJkYSA9IG5ldyBCTihjb25mLmxhbWJkYSwgMTYpO1xuICB9IGVsc2Uge1xuICAgIC8vIENob29zZSB0aGUgbGFtYmRhIHRoYXQgaXMgbWF0Y2hpbmcgc2VsZWN0ZWQgYmV0YVxuICAgIHZhciBsYW1iZGFzID0gdGhpcy5fZ2V0RW5kb1Jvb3RzKHRoaXMubik7XG4gICAgaWYgKHRoaXMuZy5tdWwobGFtYmRhc1swXSkueC5jbXAodGhpcy5nLngucmVkTXVsKGJldGEpKSA9PT0gMCkge1xuICAgICAgbGFtYmRhID0gbGFtYmRhc1swXTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGFtYmRhID0gbGFtYmRhc1sxXTtcbiAgICAgIGFzc2VydCh0aGlzLmcubXVsKGxhbWJkYSkueC5jbXAodGhpcy5nLngucmVkTXVsKGJldGEpKSA9PT0gMCk7XG4gICAgfVxuICB9XG5cbiAgLy8gR2V0IGJhc2lzIHZlY3RvcnMsIHVzZWQgZm9yIGJhbGFuY2VkIGxlbmd0aC10d28gcmVwcmVzZW50YXRpb25cbiAgdmFyIGJhc2lzO1xuICBpZiAoY29uZi5iYXNpcykge1xuICAgIGJhc2lzID0gY29uZi5iYXNpcy5tYXAoZnVuY3Rpb24odmVjKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBhOiBuZXcgQk4odmVjLmEsIDE2KSxcbiAgICAgICAgYjogbmV3IEJOKHZlYy5iLCAxNilcbiAgICAgIH07XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgYmFzaXMgPSB0aGlzLl9nZXRFbmRvQmFzaXMobGFtYmRhKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgYmV0YTogYmV0YSxcbiAgICBsYW1iZGE6IGxhbWJkYSxcbiAgICBiYXNpczogYmFzaXNcbiAgfTtcbn07XG5cblNob3J0Q3VydmUucHJvdG90eXBlLl9nZXRFbmRvUm9vdHMgPSBmdW5jdGlvbiBfZ2V0RW5kb1Jvb3RzKG51bSkge1xuICAvLyBGaW5kIHJvb3RzIG9mIGZvciB4XjIgKyB4ICsgMSBpbiBGXG4gIC8vIFJvb3QgPSAoLTEgKy0gU3FydCgtMykpIC8gMlxuICAvL1xuICB2YXIgcmVkID0gbnVtID09PSB0aGlzLnAgPyB0aGlzLnJlZCA6IEJOLm1vbnQobnVtKTtcbiAgdmFyIHRpbnYgPSBuZXcgQk4oMikudG9SZWQocmVkKS5yZWRJbnZtKCk7XG4gIHZhciBudGludiA9IHRpbnYucmVkTmVnKCk7XG5cbiAgdmFyIHMgPSBuZXcgQk4oMykudG9SZWQocmVkKS5yZWROZWcoKS5yZWRTcXJ0KCkucmVkTXVsKHRpbnYpO1xuXG4gIHZhciBsMSA9IG50aW52LnJlZEFkZChzKS5mcm9tUmVkKCk7XG4gIHZhciBsMiA9IG50aW52LnJlZFN1YihzKS5mcm9tUmVkKCk7XG4gIHJldHVybiBbIGwxLCBsMiBdO1xufTtcblxuU2hvcnRDdXJ2ZS5wcm90b3R5cGUuX2dldEVuZG9CYXNpcyA9IGZ1bmN0aW9uIF9nZXRFbmRvQmFzaXMobGFtYmRhKSB7XG4gIC8vIGFwcnhTcXJ0ID49IHNxcnQodGhpcy5uKVxuICB2YXIgYXByeFNxcnQgPSB0aGlzLm4udXNocm4oTWF0aC5mbG9vcih0aGlzLm4uYml0TGVuZ3RoKCkgLyAyKSk7XG5cbiAgLy8gMy43NFxuICAvLyBSdW4gRUdDRCwgdW50aWwgcihMICsgMSkgPCBhcHJ4U3FydFxuICB2YXIgdSA9IGxhbWJkYTtcbiAgdmFyIHYgPSB0aGlzLm4uY2xvbmUoKTtcbiAgdmFyIHgxID0gbmV3IEJOKDEpO1xuICB2YXIgeTEgPSBuZXcgQk4oMCk7XG4gIHZhciB4MiA9IG5ldyBCTigwKTtcbiAgdmFyIHkyID0gbmV3IEJOKDEpO1xuXG4gIC8vIE5PVEU6IGFsbCB2ZWN0b3JzIGFyZSByb290cyBvZjogYSArIGIgKiBsYW1iZGEgPSAwIChtb2QgbilcbiAgdmFyIGEwO1xuICB2YXIgYjA7XG4gIC8vIEZpcnN0IHZlY3RvclxuICB2YXIgYTE7XG4gIHZhciBiMTtcbiAgLy8gU2Vjb25kIHZlY3RvclxuICB2YXIgYTI7XG4gIHZhciBiMjtcblxuICB2YXIgcHJldlI7XG4gIHZhciBpID0gMDtcbiAgdmFyIHI7XG4gIHZhciB4O1xuICB3aGlsZSAodS5jbXBuKDApICE9PSAwKSB7XG4gICAgdmFyIHEgPSB2LmRpdih1KTtcbiAgICByID0gdi5zdWIocS5tdWwodSkpO1xuICAgIHggPSB4Mi5zdWIocS5tdWwoeDEpKTtcbiAgICB2YXIgeSA9IHkyLnN1YihxLm11bCh5MSkpO1xuXG4gICAgaWYgKCFhMSAmJiByLmNtcChhcHJ4U3FydCkgPCAwKSB7XG4gICAgICBhMCA9IHByZXZSLm5lZygpO1xuICAgICAgYjAgPSB4MTtcbiAgICAgIGExID0gci5uZWcoKTtcbiAgICAgIGIxID0geDtcbiAgICB9IGVsc2UgaWYgKGExICYmICsraSA9PT0gMikge1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHByZXZSID0gcjtcblxuICAgIHYgPSB1O1xuICAgIHUgPSByO1xuICAgIHgyID0geDE7XG4gICAgeDEgPSB4O1xuICAgIHkyID0geTE7XG4gICAgeTEgPSB5O1xuICB9XG4gIGEyID0gci5uZWcoKTtcbiAgYjIgPSB4O1xuXG4gIHZhciBsZW4xID0gYTEuc3FyKCkuYWRkKGIxLnNxcigpKTtcbiAgdmFyIGxlbjIgPSBhMi5zcXIoKS5hZGQoYjIuc3FyKCkpO1xuICBpZiAobGVuMi5jbXAobGVuMSkgPj0gMCkge1xuICAgIGEyID0gYTA7XG4gICAgYjIgPSBiMDtcbiAgfVxuXG4gIC8vIE5vcm1hbGl6ZSBzaWduc1xuICBpZiAoYTEubmVnYXRpdmUpIHtcbiAgICBhMSA9IGExLm5lZygpO1xuICAgIGIxID0gYjEubmVnKCk7XG4gIH1cbiAgaWYgKGEyLm5lZ2F0aXZlKSB7XG4gICAgYTIgPSBhMi5uZWcoKTtcbiAgICBiMiA9IGIyLm5lZygpO1xuICB9XG5cbiAgcmV0dXJuIFtcbiAgICB7IGE6IGExLCBiOiBiMSB9LFxuICAgIHsgYTogYTIsIGI6IGIyIH1cbiAgXTtcbn07XG5cblNob3J0Q3VydmUucHJvdG90eXBlLl9lbmRvU3BsaXQgPSBmdW5jdGlvbiBfZW5kb1NwbGl0KGspIHtcbiAgdmFyIGJhc2lzID0gdGhpcy5lbmRvLmJhc2lzO1xuICB2YXIgdjEgPSBiYXNpc1swXTtcbiAgdmFyIHYyID0gYmFzaXNbMV07XG5cbiAgdmFyIGMxID0gdjIuYi5tdWwoaykuZGl2Um91bmQodGhpcy5uKTtcbiAgdmFyIGMyID0gdjEuYi5uZWcoKS5tdWwoaykuZGl2Um91bmQodGhpcy5uKTtcblxuICB2YXIgcDEgPSBjMS5tdWwodjEuYSk7XG4gIHZhciBwMiA9IGMyLm11bCh2Mi5hKTtcbiAgdmFyIHExID0gYzEubXVsKHYxLmIpO1xuICB2YXIgcTIgPSBjMi5tdWwodjIuYik7XG5cbiAgLy8gQ2FsY3VsYXRlIGFuc3dlclxuICB2YXIgazEgPSBrLnN1YihwMSkuc3ViKHAyKTtcbiAgdmFyIGsyID0gcTEuYWRkKHEyKS5uZWcoKTtcbiAgcmV0dXJuIHsgazE6IGsxLCBrMjogazIgfTtcbn07XG5cblNob3J0Q3VydmUucHJvdG90eXBlLnBvaW50RnJvbVggPSBmdW5jdGlvbiBwb2ludEZyb21YKHgsIG9kZCkge1xuICB4ID0gbmV3IEJOKHgsIDE2KTtcbiAgaWYgKCF4LnJlZClcbiAgICB4ID0geC50b1JlZCh0aGlzLnJlZCk7XG5cbiAgdmFyIHkyID0geC5yZWRTcXIoKS5yZWRNdWwoeCkucmVkSUFkZCh4LnJlZE11bCh0aGlzLmEpKS5yZWRJQWRkKHRoaXMuYik7XG4gIHZhciB5ID0geTIucmVkU3FydCgpO1xuICBpZiAoeS5yZWRTcXIoKS5yZWRTdWIoeTIpLmNtcCh0aGlzLnplcm8pICE9PSAwKVxuICAgIHRocm93IG5ldyBFcnJvcignaW52YWxpZCBwb2ludCcpO1xuXG4gIC8vIFhYWCBJcyB0aGVyZSBhbnkgd2F5IHRvIHRlbGwgaWYgdGhlIG51bWJlciBpcyBvZGQgd2l0aG91dCBjb252ZXJ0aW5nIGl0XG4gIC8vIHRvIG5vbi1yZWQgZm9ybT9cbiAgdmFyIGlzT2RkID0geS5mcm9tUmVkKCkuaXNPZGQoKTtcbiAgaWYgKG9kZCAmJiAhaXNPZGQgfHwgIW9kZCAmJiBpc09kZClcbiAgICB5ID0geS5yZWROZWcoKTtcblxuICByZXR1cm4gdGhpcy5wb2ludCh4LCB5KTtcbn07XG5cblNob3J0Q3VydmUucHJvdG90eXBlLnZhbGlkYXRlID0gZnVuY3Rpb24gdmFsaWRhdGUocG9pbnQpIHtcbiAgaWYgKHBvaW50LmluZilcbiAgICByZXR1cm4gdHJ1ZTtcblxuICB2YXIgeCA9IHBvaW50Lng7XG4gIHZhciB5ID0gcG9pbnQueTtcblxuICB2YXIgYXggPSB0aGlzLmEucmVkTXVsKHgpO1xuICB2YXIgcmhzID0geC5yZWRTcXIoKS5yZWRNdWwoeCkucmVkSUFkZChheCkucmVkSUFkZCh0aGlzLmIpO1xuICByZXR1cm4geS5yZWRTcXIoKS5yZWRJU3ViKHJocykuY21wbigwKSA9PT0gMDtcbn07XG5cblNob3J0Q3VydmUucHJvdG90eXBlLl9lbmRvV25hZk11bEFkZCA9XG4gICAgZnVuY3Rpb24gX2VuZG9XbmFmTXVsQWRkKHBvaW50cywgY29lZmZzLCBqYWNvYmlhblJlc3VsdCkge1xuICB2YXIgbnBvaW50cyA9IHRoaXMuX2VuZG9XbmFmVDE7XG4gIHZhciBuY29lZmZzID0gdGhpcy5fZW5kb1duYWZUMjtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgc3BsaXQgPSB0aGlzLl9lbmRvU3BsaXQoY29lZmZzW2ldKTtcbiAgICB2YXIgcCA9IHBvaW50c1tpXTtcbiAgICB2YXIgYmV0YSA9IHAuX2dldEJldGEoKTtcblxuICAgIGlmIChzcGxpdC5rMS5uZWdhdGl2ZSkge1xuICAgICAgc3BsaXQuazEuaW5lZygpO1xuICAgICAgcCA9IHAubmVnKHRydWUpO1xuICAgIH1cbiAgICBpZiAoc3BsaXQuazIubmVnYXRpdmUpIHtcbiAgICAgIHNwbGl0LmsyLmluZWcoKTtcbiAgICAgIGJldGEgPSBiZXRhLm5lZyh0cnVlKTtcbiAgICB9XG5cbiAgICBucG9pbnRzW2kgKiAyXSA9IHA7XG4gICAgbnBvaW50c1tpICogMiArIDFdID0gYmV0YTtcbiAgICBuY29lZmZzW2kgKiAyXSA9IHNwbGl0LmsxO1xuICAgIG5jb2VmZnNbaSAqIDIgKyAxXSA9IHNwbGl0LmsyO1xuICB9XG4gIHZhciByZXMgPSB0aGlzLl93bmFmTXVsQWRkKDEsIG5wb2ludHMsIG5jb2VmZnMsIGkgKiAyLCBqYWNvYmlhblJlc3VsdCk7XG5cbiAgLy8gQ2xlYW4tdXAgcmVmZXJlbmNlcyB0byBwb2ludHMgYW5kIGNvZWZmaWNpZW50c1xuICBmb3IgKHZhciBqID0gMDsgaiA8IGkgKiAyOyBqKyspIHtcbiAgICBucG9pbnRzW2pdID0gbnVsbDtcbiAgICBuY29lZmZzW2pdID0gbnVsbDtcbiAgfVxuICByZXR1cm4gcmVzO1xufTtcblxuZnVuY3Rpb24gUG9pbnQoY3VydmUsIHgsIHksIGlzUmVkKSB7XG4gIEJhc2UuQmFzZVBvaW50LmNhbGwodGhpcywgY3VydmUsICdhZmZpbmUnKTtcbiAgaWYgKHggPT09IG51bGwgJiYgeSA9PT0gbnVsbCkge1xuICAgIHRoaXMueCA9IG51bGw7XG4gICAgdGhpcy55ID0gbnVsbDtcbiAgICB0aGlzLmluZiA9IHRydWU7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy54ID0gbmV3IEJOKHgsIDE2KTtcbiAgICB0aGlzLnkgPSBuZXcgQk4oeSwgMTYpO1xuICAgIC8vIEZvcmNlIHJlZGdvbWVyeSByZXByZXNlbnRhdGlvbiB3aGVuIGxvYWRpbmcgZnJvbSBKU09OXG4gICAgaWYgKGlzUmVkKSB7XG4gICAgICB0aGlzLnguZm9yY2VSZWQodGhpcy5jdXJ2ZS5yZWQpO1xuICAgICAgdGhpcy55LmZvcmNlUmVkKHRoaXMuY3VydmUucmVkKTtcbiAgICB9XG4gICAgaWYgKCF0aGlzLngucmVkKVxuICAgICAgdGhpcy54ID0gdGhpcy54LnRvUmVkKHRoaXMuY3VydmUucmVkKTtcbiAgICBpZiAoIXRoaXMueS5yZWQpXG4gICAgICB0aGlzLnkgPSB0aGlzLnkudG9SZWQodGhpcy5jdXJ2ZS5yZWQpO1xuICAgIHRoaXMuaW5mID0gZmFsc2U7XG4gIH1cbn1cbmluaGVyaXRzKFBvaW50LCBCYXNlLkJhc2VQb2ludCk7XG5cblNob3J0Q3VydmUucHJvdG90eXBlLnBvaW50ID0gZnVuY3Rpb24gcG9pbnQoeCwgeSwgaXNSZWQpIHtcbiAgcmV0dXJuIG5ldyBQb2ludCh0aGlzLCB4LCB5LCBpc1JlZCk7XG59O1xuXG5TaG9ydEN1cnZlLnByb3RvdHlwZS5wb2ludEZyb21KU09OID0gZnVuY3Rpb24gcG9pbnRGcm9tSlNPTihvYmosIHJlZCkge1xuICByZXR1cm4gUG9pbnQuZnJvbUpTT04odGhpcywgb2JqLCByZWQpO1xufTtcblxuUG9pbnQucHJvdG90eXBlLl9nZXRCZXRhID0gZnVuY3Rpb24gX2dldEJldGEoKSB7XG4gIGlmICghdGhpcy5jdXJ2ZS5lbmRvKVxuICAgIHJldHVybjtcblxuICB2YXIgcHJlID0gdGhpcy5wcmVjb21wdXRlZDtcbiAgaWYgKHByZSAmJiBwcmUuYmV0YSlcbiAgICByZXR1cm4gcHJlLmJldGE7XG5cbiAgdmFyIGJldGEgPSB0aGlzLmN1cnZlLnBvaW50KHRoaXMueC5yZWRNdWwodGhpcy5jdXJ2ZS5lbmRvLmJldGEpLCB0aGlzLnkpO1xuICBpZiAocHJlKSB7XG4gICAgdmFyIGN1cnZlID0gdGhpcy5jdXJ2ZTtcbiAgICB2YXIgZW5kb011bCA9IGZ1bmN0aW9uKHApIHtcbiAgICAgIHJldHVybiBjdXJ2ZS5wb2ludChwLngucmVkTXVsKGN1cnZlLmVuZG8uYmV0YSksIHAueSk7XG4gICAgfTtcbiAgICBwcmUuYmV0YSA9IGJldGE7XG4gICAgYmV0YS5wcmVjb21wdXRlZCA9IHtcbiAgICAgIGJldGE6IG51bGwsXG4gICAgICBuYWY6IHByZS5uYWYgJiYge1xuICAgICAgICB3bmQ6IHByZS5uYWYud25kLFxuICAgICAgICBwb2ludHM6IHByZS5uYWYucG9pbnRzLm1hcChlbmRvTXVsKVxuICAgICAgfSxcbiAgICAgIGRvdWJsZXM6IHByZS5kb3VibGVzICYmIHtcbiAgICAgICAgc3RlcDogcHJlLmRvdWJsZXMuc3RlcCxcbiAgICAgICAgcG9pbnRzOiBwcmUuZG91Ymxlcy5wb2ludHMubWFwKGVuZG9NdWwpXG4gICAgICB9XG4gICAgfTtcbiAgfVxuICByZXR1cm4gYmV0YTtcbn07XG5cblBvaW50LnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbiB0b0pTT04oKSB7XG4gIGlmICghdGhpcy5wcmVjb21wdXRlZClcbiAgICByZXR1cm4gWyB0aGlzLngsIHRoaXMueSBdO1xuXG4gIHJldHVybiBbIHRoaXMueCwgdGhpcy55LCB0aGlzLnByZWNvbXB1dGVkICYmIHtcbiAgICBkb3VibGVzOiB0aGlzLnByZWNvbXB1dGVkLmRvdWJsZXMgJiYge1xuICAgICAgc3RlcDogdGhpcy5wcmVjb21wdXRlZC5kb3VibGVzLnN0ZXAsXG4gICAgICBwb2ludHM6IHRoaXMucHJlY29tcHV0ZWQuZG91Ymxlcy5wb2ludHMuc2xpY2UoMSlcbiAgICB9LFxuICAgIG5hZjogdGhpcy5wcmVjb21wdXRlZC5uYWYgJiYge1xuICAgICAgd25kOiB0aGlzLnByZWNvbXB1dGVkLm5hZi53bmQsXG4gICAgICBwb2ludHM6IHRoaXMucHJlY29tcHV0ZWQubmFmLnBvaW50cy5zbGljZSgxKVxuICAgIH1cbiAgfSBdO1xufTtcblxuUG9pbnQuZnJvbUpTT04gPSBmdW5jdGlvbiBmcm9tSlNPTihjdXJ2ZSwgb2JqLCByZWQpIHtcbiAgaWYgKHR5cGVvZiBvYmogPT09ICdzdHJpbmcnKVxuICAgIG9iaiA9IEpTT04ucGFyc2Uob2JqKTtcbiAgdmFyIHJlcyA9IGN1cnZlLnBvaW50KG9ialswXSwgb2JqWzFdLCByZWQpO1xuICBpZiAoIW9ialsyXSlcbiAgICByZXR1cm4gcmVzO1xuXG4gIGZ1bmN0aW9uIG9iajJwb2ludChvYmopIHtcbiAgICByZXR1cm4gY3VydmUucG9pbnQob2JqWzBdLCBvYmpbMV0sIHJlZCk7XG4gIH1cblxuICB2YXIgcHJlID0gb2JqWzJdO1xuICByZXMucHJlY29tcHV0ZWQgPSB7XG4gICAgYmV0YTogbnVsbCxcbiAgICBkb3VibGVzOiBwcmUuZG91YmxlcyAmJiB7XG4gICAgICBzdGVwOiBwcmUuZG91Ymxlcy5zdGVwLFxuICAgICAgcG9pbnRzOiBbIHJlcyBdLmNvbmNhdChwcmUuZG91Ymxlcy5wb2ludHMubWFwKG9iajJwb2ludCkpXG4gICAgfSxcbiAgICBuYWY6IHByZS5uYWYgJiYge1xuICAgICAgd25kOiBwcmUubmFmLnduZCxcbiAgICAgIHBvaW50czogWyByZXMgXS5jb25jYXQocHJlLm5hZi5wb2ludHMubWFwKG9iajJwb2ludCkpXG4gICAgfVxuICB9O1xuICByZXR1cm4gcmVzO1xufTtcblxuUG9pbnQucHJvdG90eXBlLmluc3BlY3QgPSBmdW5jdGlvbiBpbnNwZWN0KCkge1xuICBpZiAodGhpcy5pc0luZmluaXR5KCkpXG4gICAgcmV0dXJuICc8RUMgUG9pbnQgSW5maW5pdHk+JztcbiAgcmV0dXJuICc8RUMgUG9pbnQgeDogJyArIHRoaXMueC5mcm9tUmVkKCkudG9TdHJpbmcoMTYsIDIpICtcbiAgICAgICcgeTogJyArIHRoaXMueS5mcm9tUmVkKCkudG9TdHJpbmcoMTYsIDIpICsgJz4nO1xufTtcblxuUG9pbnQucHJvdG90eXBlLmlzSW5maW5pdHkgPSBmdW5jdGlvbiBpc0luZmluaXR5KCkge1xuICByZXR1cm4gdGhpcy5pbmY7XG59O1xuXG5Qb2ludC5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gYWRkKHApIHtcbiAgLy8gTyArIFAgPSBQXG4gIGlmICh0aGlzLmluZilcbiAgICByZXR1cm4gcDtcblxuICAvLyBQICsgTyA9IFBcbiAgaWYgKHAuaW5mKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIC8vIFAgKyBQID0gMlBcbiAgaWYgKHRoaXMuZXEocCkpXG4gICAgcmV0dXJuIHRoaXMuZGJsKCk7XG5cbiAgLy8gUCArICgtUCkgPSBPXG4gIGlmICh0aGlzLm5lZygpLmVxKHApKVxuICAgIHJldHVybiB0aGlzLmN1cnZlLnBvaW50KG51bGwsIG51bGwpO1xuXG4gIC8vIFAgKyBRID0gT1xuICBpZiAodGhpcy54LmNtcChwLngpID09PSAwKVxuICAgIHJldHVybiB0aGlzLmN1cnZlLnBvaW50KG51bGwsIG51bGwpO1xuXG4gIHZhciBjID0gdGhpcy55LnJlZFN1YihwLnkpO1xuICBpZiAoYy5jbXBuKDApICE9PSAwKVxuICAgIGMgPSBjLnJlZE11bCh0aGlzLngucmVkU3ViKHAueCkucmVkSW52bSgpKTtcbiAgdmFyIG54ID0gYy5yZWRTcXIoKS5yZWRJU3ViKHRoaXMueCkucmVkSVN1YihwLngpO1xuICB2YXIgbnkgPSBjLnJlZE11bCh0aGlzLngucmVkU3ViKG54KSkucmVkSVN1Yih0aGlzLnkpO1xuICByZXR1cm4gdGhpcy5jdXJ2ZS5wb2ludChueCwgbnkpO1xufTtcblxuUG9pbnQucHJvdG90eXBlLmRibCA9IGZ1bmN0aW9uIGRibCgpIHtcbiAgaWYgKHRoaXMuaW5mKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIC8vIDJQID0gT1xuICB2YXIgeXMxID0gdGhpcy55LnJlZEFkZCh0aGlzLnkpO1xuICBpZiAoeXMxLmNtcG4oMCkgPT09IDApXG4gICAgcmV0dXJuIHRoaXMuY3VydmUucG9pbnQobnVsbCwgbnVsbCk7XG5cbiAgdmFyIGEgPSB0aGlzLmN1cnZlLmE7XG5cbiAgdmFyIHgyID0gdGhpcy54LnJlZFNxcigpO1xuICB2YXIgZHlpbnYgPSB5czEucmVkSW52bSgpO1xuICB2YXIgYyA9IHgyLnJlZEFkZCh4MikucmVkSUFkZCh4MikucmVkSUFkZChhKS5yZWRNdWwoZHlpbnYpO1xuXG4gIHZhciBueCA9IGMucmVkU3FyKCkucmVkSVN1Yih0aGlzLngucmVkQWRkKHRoaXMueCkpO1xuICB2YXIgbnkgPSBjLnJlZE11bCh0aGlzLngucmVkU3ViKG54KSkucmVkSVN1Yih0aGlzLnkpO1xuICByZXR1cm4gdGhpcy5jdXJ2ZS5wb2ludChueCwgbnkpO1xufTtcblxuUG9pbnQucHJvdG90eXBlLmdldFggPSBmdW5jdGlvbiBnZXRYKCkge1xuICByZXR1cm4gdGhpcy54LmZyb21SZWQoKTtcbn07XG5cblBvaW50LnByb3RvdHlwZS5nZXRZID0gZnVuY3Rpb24gZ2V0WSgpIHtcbiAgcmV0dXJuIHRoaXMueS5mcm9tUmVkKCk7XG59O1xuXG5Qb2ludC5wcm90b3R5cGUubXVsID0gZnVuY3Rpb24gbXVsKGspIHtcbiAgayA9IG5ldyBCTihrLCAxNik7XG5cbiAgaWYgKHRoaXMuX2hhc0RvdWJsZXMoaykpXG4gICAgcmV0dXJuIHRoaXMuY3VydmUuX2ZpeGVkTmFmTXVsKHRoaXMsIGspO1xuICBlbHNlIGlmICh0aGlzLmN1cnZlLmVuZG8pXG4gICAgcmV0dXJuIHRoaXMuY3VydmUuX2VuZG9XbmFmTXVsQWRkKFsgdGhpcyBdLCBbIGsgXSk7XG4gIGVsc2VcbiAgICByZXR1cm4gdGhpcy5jdXJ2ZS5fd25hZk11bCh0aGlzLCBrKTtcbn07XG5cblBvaW50LnByb3RvdHlwZS5tdWxBZGQgPSBmdW5jdGlvbiBtdWxBZGQoazEsIHAyLCBrMikge1xuICB2YXIgcG9pbnRzID0gWyB0aGlzLCBwMiBdO1xuICB2YXIgY29lZmZzID0gWyBrMSwgazIgXTtcbiAgaWYgKHRoaXMuY3VydmUuZW5kbylcbiAgICByZXR1cm4gdGhpcy5jdXJ2ZS5fZW5kb1duYWZNdWxBZGQocG9pbnRzLCBjb2VmZnMpO1xuICBlbHNlXG4gICAgcmV0dXJuIHRoaXMuY3VydmUuX3duYWZNdWxBZGQoMSwgcG9pbnRzLCBjb2VmZnMsIDIpO1xufTtcblxuUG9pbnQucHJvdG90eXBlLmptdWxBZGQgPSBmdW5jdGlvbiBqbXVsQWRkKGsxLCBwMiwgazIpIHtcbiAgdmFyIHBvaW50cyA9IFsgdGhpcywgcDIgXTtcbiAgdmFyIGNvZWZmcyA9IFsgazEsIGsyIF07XG4gIGlmICh0aGlzLmN1cnZlLmVuZG8pXG4gICAgcmV0dXJuIHRoaXMuY3VydmUuX2VuZG9XbmFmTXVsQWRkKHBvaW50cywgY29lZmZzLCB0cnVlKTtcbiAgZWxzZVxuICAgIHJldHVybiB0aGlzLmN1cnZlLl93bmFmTXVsQWRkKDEsIHBvaW50cywgY29lZmZzLCAyLCB0cnVlKTtcbn07XG5cblBvaW50LnByb3RvdHlwZS5lcSA9IGZ1bmN0aW9uIGVxKHApIHtcbiAgcmV0dXJuIHRoaXMgPT09IHAgfHxcbiAgICAgICAgIHRoaXMuaW5mID09PSBwLmluZiAmJlxuICAgICAgICAgICAgICh0aGlzLmluZiB8fCB0aGlzLnguY21wKHAueCkgPT09IDAgJiYgdGhpcy55LmNtcChwLnkpID09PSAwKTtcbn07XG5cblBvaW50LnByb3RvdHlwZS5uZWcgPSBmdW5jdGlvbiBuZWcoX3ByZWNvbXB1dGUpIHtcbiAgaWYgKHRoaXMuaW5mKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIHZhciByZXMgPSB0aGlzLmN1cnZlLnBvaW50KHRoaXMueCwgdGhpcy55LnJlZE5lZygpKTtcbiAgaWYgKF9wcmVjb21wdXRlICYmIHRoaXMucHJlY29tcHV0ZWQpIHtcbiAgICB2YXIgcHJlID0gdGhpcy5wcmVjb21wdXRlZDtcbiAgICB2YXIgbmVnYXRlID0gZnVuY3Rpb24ocCkge1xuICAgICAgcmV0dXJuIHAubmVnKCk7XG4gICAgfTtcbiAgICByZXMucHJlY29tcHV0ZWQgPSB7XG4gICAgICBuYWY6IHByZS5uYWYgJiYge1xuICAgICAgICB3bmQ6IHByZS5uYWYud25kLFxuICAgICAgICBwb2ludHM6IHByZS5uYWYucG9pbnRzLm1hcChuZWdhdGUpXG4gICAgICB9LFxuICAgICAgZG91YmxlczogcHJlLmRvdWJsZXMgJiYge1xuICAgICAgICBzdGVwOiBwcmUuZG91Ymxlcy5zdGVwLFxuICAgICAgICBwb2ludHM6IHByZS5kb3VibGVzLnBvaW50cy5tYXAobmVnYXRlKVxuICAgICAgfVxuICAgIH07XG4gIH1cbiAgcmV0dXJuIHJlcztcbn07XG5cblBvaW50LnByb3RvdHlwZS50b0ogPSBmdW5jdGlvbiB0b0ooKSB7XG4gIGlmICh0aGlzLmluZilcbiAgICByZXR1cm4gdGhpcy5jdXJ2ZS5qcG9pbnQobnVsbCwgbnVsbCwgbnVsbCk7XG5cbiAgdmFyIHJlcyA9IHRoaXMuY3VydmUuanBvaW50KHRoaXMueCwgdGhpcy55LCB0aGlzLmN1cnZlLm9uZSk7XG4gIHJldHVybiByZXM7XG59O1xuXG5mdW5jdGlvbiBKUG9pbnQoY3VydmUsIHgsIHksIHopIHtcbiAgQmFzZS5CYXNlUG9pbnQuY2FsbCh0aGlzLCBjdXJ2ZSwgJ2phY29iaWFuJyk7XG4gIGlmICh4ID09PSBudWxsICYmIHkgPT09IG51bGwgJiYgeiA9PT0gbnVsbCkge1xuICAgIHRoaXMueCA9IHRoaXMuY3VydmUub25lO1xuICAgIHRoaXMueSA9IHRoaXMuY3VydmUub25lO1xuICAgIHRoaXMueiA9IG5ldyBCTigwKTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLnggPSBuZXcgQk4oeCwgMTYpO1xuICAgIHRoaXMueSA9IG5ldyBCTih5LCAxNik7XG4gICAgdGhpcy56ID0gbmV3IEJOKHosIDE2KTtcbiAgfVxuICBpZiAoIXRoaXMueC5yZWQpXG4gICAgdGhpcy54ID0gdGhpcy54LnRvUmVkKHRoaXMuY3VydmUucmVkKTtcbiAgaWYgKCF0aGlzLnkucmVkKVxuICAgIHRoaXMueSA9IHRoaXMueS50b1JlZCh0aGlzLmN1cnZlLnJlZCk7XG4gIGlmICghdGhpcy56LnJlZClcbiAgICB0aGlzLnogPSB0aGlzLnoudG9SZWQodGhpcy5jdXJ2ZS5yZWQpO1xuXG4gIHRoaXMuek9uZSA9IHRoaXMueiA9PT0gdGhpcy5jdXJ2ZS5vbmU7XG59XG5pbmhlcml0cyhKUG9pbnQsIEJhc2UuQmFzZVBvaW50KTtcblxuU2hvcnRDdXJ2ZS5wcm90b3R5cGUuanBvaW50ID0gZnVuY3Rpb24ganBvaW50KHgsIHksIHopIHtcbiAgcmV0dXJuIG5ldyBKUG9pbnQodGhpcywgeCwgeSwgeik7XG59O1xuXG5KUG9pbnQucHJvdG90eXBlLnRvUCA9IGZ1bmN0aW9uIHRvUCgpIHtcbiAgaWYgKHRoaXMuaXNJbmZpbml0eSgpKVxuICAgIHJldHVybiB0aGlzLmN1cnZlLnBvaW50KG51bGwsIG51bGwpO1xuXG4gIHZhciB6aW52ID0gdGhpcy56LnJlZEludm0oKTtcbiAgdmFyIHppbnYyID0gemludi5yZWRTcXIoKTtcbiAgdmFyIGF4ID0gdGhpcy54LnJlZE11bCh6aW52Mik7XG4gIHZhciBheSA9IHRoaXMueS5yZWRNdWwoemludjIpLnJlZE11bCh6aW52KTtcblxuICByZXR1cm4gdGhpcy5jdXJ2ZS5wb2ludChheCwgYXkpO1xufTtcblxuSlBvaW50LnByb3RvdHlwZS5uZWcgPSBmdW5jdGlvbiBuZWcoKSB7XG4gIHJldHVybiB0aGlzLmN1cnZlLmpwb2ludCh0aGlzLngsIHRoaXMueS5yZWROZWcoKSwgdGhpcy56KTtcbn07XG5cbkpQb2ludC5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gYWRkKHApIHtcbiAgLy8gTyArIFAgPSBQXG4gIGlmICh0aGlzLmlzSW5maW5pdHkoKSlcbiAgICByZXR1cm4gcDtcblxuICAvLyBQICsgTyA9IFBcbiAgaWYgKHAuaXNJbmZpbml0eSgpKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIC8vIDEyTSArIDRTICsgN0FcbiAgdmFyIHB6MiA9IHAuei5yZWRTcXIoKTtcbiAgdmFyIHoyID0gdGhpcy56LnJlZFNxcigpO1xuICB2YXIgdTEgPSB0aGlzLngucmVkTXVsKHB6Mik7XG4gIHZhciB1MiA9IHAueC5yZWRNdWwoejIpO1xuICB2YXIgczEgPSB0aGlzLnkucmVkTXVsKHB6Mi5yZWRNdWwocC56KSk7XG4gIHZhciBzMiA9IHAueS5yZWRNdWwoejIucmVkTXVsKHRoaXMueikpO1xuXG4gIHZhciBoID0gdTEucmVkU3ViKHUyKTtcbiAgdmFyIHIgPSBzMS5yZWRTdWIoczIpO1xuICBpZiAoaC5jbXBuKDApID09PSAwKSB7XG4gICAgaWYgKHIuY21wbigwKSAhPT0gMClcbiAgICAgIHJldHVybiB0aGlzLmN1cnZlLmpwb2ludChudWxsLCBudWxsLCBudWxsKTtcbiAgICBlbHNlXG4gICAgICByZXR1cm4gdGhpcy5kYmwoKTtcbiAgfVxuXG4gIHZhciBoMiA9IGgucmVkU3FyKCk7XG4gIHZhciBoMyA9IGgyLnJlZE11bChoKTtcbiAgdmFyIHYgPSB1MS5yZWRNdWwoaDIpO1xuXG4gIHZhciBueCA9IHIucmVkU3FyKCkucmVkSUFkZChoMykucmVkSVN1Yih2KS5yZWRJU3ViKHYpO1xuICB2YXIgbnkgPSByLnJlZE11bCh2LnJlZElTdWIobngpKS5yZWRJU3ViKHMxLnJlZE11bChoMykpO1xuICB2YXIgbnogPSB0aGlzLnoucmVkTXVsKHAueikucmVkTXVsKGgpO1xuXG4gIHJldHVybiB0aGlzLmN1cnZlLmpwb2ludChueCwgbnksIG56KTtcbn07XG5cbkpQb2ludC5wcm90b3R5cGUubWl4ZWRBZGQgPSBmdW5jdGlvbiBtaXhlZEFkZChwKSB7XG4gIC8vIE8gKyBQID0gUFxuICBpZiAodGhpcy5pc0luZmluaXR5KCkpXG4gICAgcmV0dXJuIHAudG9KKCk7XG5cbiAgLy8gUCArIE8gPSBQXG4gIGlmIChwLmlzSW5maW5pdHkoKSlcbiAgICByZXR1cm4gdGhpcztcblxuICAvLyA4TSArIDNTICsgN0FcbiAgdmFyIHoyID0gdGhpcy56LnJlZFNxcigpO1xuICB2YXIgdTEgPSB0aGlzLng7XG4gIHZhciB1MiA9IHAueC5yZWRNdWwoejIpO1xuICB2YXIgczEgPSB0aGlzLnk7XG4gIHZhciBzMiA9IHAueS5yZWRNdWwoejIpLnJlZE11bCh0aGlzLnopO1xuXG4gIHZhciBoID0gdTEucmVkU3ViKHUyKTtcbiAgdmFyIHIgPSBzMS5yZWRTdWIoczIpO1xuICBpZiAoaC5jbXBuKDApID09PSAwKSB7XG4gICAgaWYgKHIuY21wbigwKSAhPT0gMClcbiAgICAgIHJldHVybiB0aGlzLmN1cnZlLmpwb2ludChudWxsLCBudWxsLCBudWxsKTtcbiAgICBlbHNlXG4gICAgICByZXR1cm4gdGhpcy5kYmwoKTtcbiAgfVxuXG4gIHZhciBoMiA9IGgucmVkU3FyKCk7XG4gIHZhciBoMyA9IGgyLnJlZE11bChoKTtcbiAgdmFyIHYgPSB1MS5yZWRNdWwoaDIpO1xuXG4gIHZhciBueCA9IHIucmVkU3FyKCkucmVkSUFkZChoMykucmVkSVN1Yih2KS5yZWRJU3ViKHYpO1xuICB2YXIgbnkgPSByLnJlZE11bCh2LnJlZElTdWIobngpKS5yZWRJU3ViKHMxLnJlZE11bChoMykpO1xuICB2YXIgbnogPSB0aGlzLnoucmVkTXVsKGgpO1xuXG4gIHJldHVybiB0aGlzLmN1cnZlLmpwb2ludChueCwgbnksIG56KTtcbn07XG5cbkpQb2ludC5wcm90b3R5cGUuZGJscCA9IGZ1bmN0aW9uIGRibHAocG93KSB7XG4gIGlmIChwb3cgPT09IDApXG4gICAgcmV0dXJuIHRoaXM7XG4gIGlmICh0aGlzLmlzSW5maW5pdHkoKSlcbiAgICByZXR1cm4gdGhpcztcbiAgaWYgKCFwb3cpXG4gICAgcmV0dXJuIHRoaXMuZGJsKCk7XG5cbiAgaWYgKHRoaXMuY3VydmUuemVyb0EgfHwgdGhpcy5jdXJ2ZS50aHJlZUEpIHtcbiAgICB2YXIgciA9IHRoaXM7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwb3c7IGkrKylcbiAgICAgIHIgPSByLmRibCgpO1xuICAgIHJldHVybiByO1xuICB9XG5cbiAgLy8gMU0gKyAyUyArIDFBICsgTiAqICg0UyArIDVNICsgOEEpXG4gIC8vIE4gPSAxID0+IDZNICsgNlMgKyA5QVxuICB2YXIgYSA9IHRoaXMuY3VydmUuYTtcbiAgdmFyIHRpbnYgPSB0aGlzLmN1cnZlLnRpbnY7XG5cbiAgdmFyIGp4ID0gdGhpcy54O1xuICB2YXIgankgPSB0aGlzLnk7XG4gIHZhciBqeiA9IHRoaXMuejtcbiAgdmFyIGp6NCA9IGp6LnJlZFNxcigpLnJlZFNxcigpO1xuXG4gIC8vIFJldXNlIHJlc3VsdHNcbiAgdmFyIGp5ZCA9IGp5LnJlZEFkZChqeSk7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcG93OyBpKyspIHtcbiAgICB2YXIgangyID0gangucmVkU3FyKCk7XG4gICAgdmFyIGp5ZDIgPSBqeWQucmVkU3FyKCk7XG4gICAgdmFyIGp5ZDQgPSBqeWQyLnJlZFNxcigpO1xuICAgIHZhciBjID0gangyLnJlZEFkZChqeDIpLnJlZElBZGQoangyKS5yZWRJQWRkKGEucmVkTXVsKGp6NCkpO1xuXG4gICAgdmFyIHQxID0gangucmVkTXVsKGp5ZDIpO1xuICAgIHZhciBueCA9IGMucmVkU3FyKCkucmVkSVN1Yih0MS5yZWRBZGQodDEpKTtcbiAgICB2YXIgdDIgPSB0MS5yZWRJU3ViKG54KTtcbiAgICB2YXIgZG55ID0gYy5yZWRNdWwodDIpO1xuICAgIGRueSA9IGRueS5yZWRJQWRkKGRueSkucmVkSVN1YihqeWQ0KTtcbiAgICB2YXIgbnogPSBqeWQucmVkTXVsKGp6KTtcbiAgICBpZiAoaSArIDEgPCBwb3cpXG4gICAgICBqejQgPSBqejQucmVkTXVsKGp5ZDQpO1xuXG4gICAganggPSBueDtcbiAgICBqeiA9IG56O1xuICAgIGp5ZCA9IGRueTtcbiAgfVxuXG4gIHJldHVybiB0aGlzLmN1cnZlLmpwb2ludChqeCwganlkLnJlZE11bCh0aW52KSwganopO1xufTtcblxuSlBvaW50LnByb3RvdHlwZS5kYmwgPSBmdW5jdGlvbiBkYmwoKSB7XG4gIGlmICh0aGlzLmlzSW5maW5pdHkoKSlcbiAgICByZXR1cm4gdGhpcztcblxuICBpZiAodGhpcy5jdXJ2ZS56ZXJvQSlcbiAgICByZXR1cm4gdGhpcy5femVyb0RibCgpO1xuICBlbHNlIGlmICh0aGlzLmN1cnZlLnRocmVlQSlcbiAgICByZXR1cm4gdGhpcy5fdGhyZWVEYmwoKTtcbiAgZWxzZVxuICAgIHJldHVybiB0aGlzLl9kYmwoKTtcbn07XG5cbkpQb2ludC5wcm90b3R5cGUuX3plcm9EYmwgPSBmdW5jdGlvbiBfemVyb0RibCgpIHtcbiAgdmFyIG54O1xuICB2YXIgbnk7XG4gIHZhciBuejtcbiAgLy8gWiA9IDFcbiAgaWYgKHRoaXMuek9uZSkge1xuICAgIC8vIGh5cGVyZWxsaXB0aWMub3JnL0VGRC9nMXAvYXV0by1zaG9ydHctamFjb2JpYW4tMC5odG1sXG4gICAgLy8gICAgICNkb3VibGluZy1tZGJsLTIwMDctYmxcbiAgICAvLyAxTSArIDVTICsgMTRBXG5cbiAgICAvLyBYWCA9IFgxXjJcbiAgICB2YXIgeHggPSB0aGlzLngucmVkU3FyKCk7XG4gICAgLy8gWVkgPSBZMV4yXG4gICAgdmFyIHl5ID0gdGhpcy55LnJlZFNxcigpO1xuICAgIC8vIFlZWVkgPSBZWV4yXG4gICAgdmFyIHl5eXkgPSB5eS5yZWRTcXIoKTtcbiAgICAvLyBTID0gMiAqICgoWDEgKyBZWSleMiAtIFhYIC0gWVlZWSlcbiAgICB2YXIgcyA9IHRoaXMueC5yZWRBZGQoeXkpLnJlZFNxcigpLnJlZElTdWIoeHgpLnJlZElTdWIoeXl5eSk7XG4gICAgcyA9IHMucmVkSUFkZChzKTtcbiAgICAvLyBNID0gMyAqIFhYICsgYTsgYSA9IDBcbiAgICB2YXIgbSA9IHh4LnJlZEFkZCh4eCkucmVkSUFkZCh4eCk7XG4gICAgLy8gVCA9IE0gXiAyIC0gMipTXG4gICAgdmFyIHQgPSBtLnJlZFNxcigpLnJlZElTdWIocykucmVkSVN1YihzKTtcblxuICAgIC8vIDggKiBZWVlZXG4gICAgdmFyIHl5eXk4ID0geXl5eS5yZWRJQWRkKHl5eXkpO1xuICAgIHl5eXk4ID0geXl5eTgucmVkSUFkZCh5eXl5OCk7XG4gICAgeXl5eTggPSB5eXl5OC5yZWRJQWRkKHl5eXk4KTtcblxuICAgIC8vIFgzID0gVFxuICAgIG54ID0gdDtcbiAgICAvLyBZMyA9IE0gKiAoUyAtIFQpIC0gOCAqIFlZWVlcbiAgICBueSA9IG0ucmVkTXVsKHMucmVkSVN1Yih0KSkucmVkSVN1Yih5eXl5OCk7XG4gICAgLy8gWjMgPSAyKlkxXG4gICAgbnogPSB0aGlzLnkucmVkQWRkKHRoaXMueSk7XG4gIH0gZWxzZSB7XG4gICAgLy8gaHlwZXJlbGxpcHRpYy5vcmcvRUZEL2cxcC9hdXRvLXNob3J0dy1qYWNvYmlhbi0wLmh0bWxcbiAgICAvLyAgICAgI2RvdWJsaW5nLWRibC0yMDA5LWxcbiAgICAvLyAyTSArIDVTICsgMTNBXG5cbiAgICAvLyBBID0gWDFeMlxuICAgIHZhciBhID0gdGhpcy54LnJlZFNxcigpO1xuICAgIC8vIEIgPSBZMV4yXG4gICAgdmFyIGIgPSB0aGlzLnkucmVkU3FyKCk7XG4gICAgLy8gQyA9IEJeMlxuICAgIHZhciBjID0gYi5yZWRTcXIoKTtcbiAgICAvLyBEID0gMiAqICgoWDEgKyBCKV4yIC0gQSAtIEMpXG4gICAgdmFyIGQgPSB0aGlzLngucmVkQWRkKGIpLnJlZFNxcigpLnJlZElTdWIoYSkucmVkSVN1YihjKTtcbiAgICBkID0gZC5yZWRJQWRkKGQpO1xuICAgIC8vIEUgPSAzICogQVxuICAgIHZhciBlID0gYS5yZWRBZGQoYSkucmVkSUFkZChhKTtcbiAgICAvLyBGID0gRV4yXG4gICAgdmFyIGYgPSBlLnJlZFNxcigpO1xuXG4gICAgLy8gOCAqIENcbiAgICB2YXIgYzggPSBjLnJlZElBZGQoYyk7XG4gICAgYzggPSBjOC5yZWRJQWRkKGM4KTtcbiAgICBjOCA9IGM4LnJlZElBZGQoYzgpO1xuXG4gICAgLy8gWDMgPSBGIC0gMiAqIERcbiAgICBueCA9IGYucmVkSVN1YihkKS5yZWRJU3ViKGQpO1xuICAgIC8vIFkzID0gRSAqIChEIC0gWDMpIC0gOCAqIENcbiAgICBueSA9IGUucmVkTXVsKGQucmVkSVN1YihueCkpLnJlZElTdWIoYzgpO1xuICAgIC8vIFozID0gMiAqIFkxICogWjFcbiAgICBueiA9IHRoaXMueS5yZWRNdWwodGhpcy56KTtcbiAgICBueiA9IG56LnJlZElBZGQobnopO1xuICB9XG5cbiAgcmV0dXJuIHRoaXMuY3VydmUuanBvaW50KG54LCBueSwgbnopO1xufTtcblxuSlBvaW50LnByb3RvdHlwZS5fdGhyZWVEYmwgPSBmdW5jdGlvbiBfdGhyZWVEYmwoKSB7XG4gIHZhciBueDtcbiAgdmFyIG55O1xuICB2YXIgbno7XG4gIC8vIFogPSAxXG4gIGlmICh0aGlzLnpPbmUpIHtcbiAgICAvLyBoeXBlcmVsbGlwdGljLm9yZy9FRkQvZzFwL2F1dG8tc2hvcnR3LWphY29iaWFuLTMuaHRtbFxuICAgIC8vICAgICAjZG91YmxpbmctbWRibC0yMDA3LWJsXG4gICAgLy8gMU0gKyA1UyArIDE1QVxuXG4gICAgLy8gWFggPSBYMV4yXG4gICAgdmFyIHh4ID0gdGhpcy54LnJlZFNxcigpO1xuICAgIC8vIFlZID0gWTFeMlxuICAgIHZhciB5eSA9IHRoaXMueS5yZWRTcXIoKTtcbiAgICAvLyBZWVlZID0gWVleMlxuICAgIHZhciB5eXl5ID0geXkucmVkU3FyKCk7XG4gICAgLy8gUyA9IDIgKiAoKFgxICsgWVkpXjIgLSBYWCAtIFlZWVkpXG4gICAgdmFyIHMgPSB0aGlzLngucmVkQWRkKHl5KS5yZWRTcXIoKS5yZWRJU3ViKHh4KS5yZWRJU3ViKHl5eXkpO1xuICAgIHMgPSBzLnJlZElBZGQocyk7XG4gICAgLy8gTSA9IDMgKiBYWCArIGFcbiAgICB2YXIgbSA9IHh4LnJlZEFkZCh4eCkucmVkSUFkZCh4eCkucmVkSUFkZCh0aGlzLmN1cnZlLmEpO1xuICAgIC8vIFQgPSBNXjIgLSAyICogU1xuICAgIHZhciB0ID0gbS5yZWRTcXIoKS5yZWRJU3ViKHMpLnJlZElTdWIocyk7XG4gICAgLy8gWDMgPSBUXG4gICAgbnggPSB0O1xuICAgIC8vIFkzID0gTSAqIChTIC0gVCkgLSA4ICogWVlZWVxuICAgIHZhciB5eXl5OCA9IHl5eXkucmVkSUFkZCh5eXl5KTtcbiAgICB5eXl5OCA9IHl5eXk4LnJlZElBZGQoeXl5eTgpO1xuICAgIHl5eXk4ID0geXl5eTgucmVkSUFkZCh5eXl5OCk7XG4gICAgbnkgPSBtLnJlZE11bChzLnJlZElTdWIodCkpLnJlZElTdWIoeXl5eTgpO1xuICAgIC8vIFozID0gMiAqIFkxXG4gICAgbnogPSB0aGlzLnkucmVkQWRkKHRoaXMueSk7XG4gIH0gZWxzZSB7XG4gICAgLy8gaHlwZXJlbGxpcHRpYy5vcmcvRUZEL2cxcC9hdXRvLXNob3J0dy1qYWNvYmlhbi0zLmh0bWwjZG91YmxpbmctZGJsLTIwMDEtYlxuICAgIC8vIDNNICsgNVNcblxuICAgIC8vIGRlbHRhID0gWjFeMlxuICAgIHZhciBkZWx0YSA9IHRoaXMuei5yZWRTcXIoKTtcbiAgICAvLyBnYW1tYSA9IFkxXjJcbiAgICB2YXIgZ2FtbWEgPSB0aGlzLnkucmVkU3FyKCk7XG4gICAgLy8gYmV0YSA9IFgxICogZ2FtbWFcbiAgICB2YXIgYmV0YSA9IHRoaXMueC5yZWRNdWwoZ2FtbWEpO1xuICAgIC8vIGFscGhhID0gMyAqIChYMSAtIGRlbHRhKSAqIChYMSArIGRlbHRhKVxuICAgIHZhciBhbHBoYSA9IHRoaXMueC5yZWRTdWIoZGVsdGEpLnJlZE11bCh0aGlzLngucmVkQWRkKGRlbHRhKSk7XG4gICAgYWxwaGEgPSBhbHBoYS5yZWRBZGQoYWxwaGEpLnJlZElBZGQoYWxwaGEpO1xuICAgIC8vIFgzID0gYWxwaGFeMiAtIDggKiBiZXRhXG4gICAgdmFyIGJldGE0ID0gYmV0YS5yZWRJQWRkKGJldGEpO1xuICAgIGJldGE0ID0gYmV0YTQucmVkSUFkZChiZXRhNCk7XG4gICAgdmFyIGJldGE4ID0gYmV0YTQucmVkQWRkKGJldGE0KTtcbiAgICBueCA9IGFscGhhLnJlZFNxcigpLnJlZElTdWIoYmV0YTgpO1xuICAgIC8vIFozID0gKFkxICsgWjEpXjIgLSBnYW1tYSAtIGRlbHRhXG4gICAgbnogPSB0aGlzLnkucmVkQWRkKHRoaXMueikucmVkU3FyKCkucmVkSVN1YihnYW1tYSkucmVkSVN1YihkZWx0YSk7XG4gICAgLy8gWTMgPSBhbHBoYSAqICg0ICogYmV0YSAtIFgzKSAtIDggKiBnYW1tYV4yXG4gICAgdmFyIGdnYW1tYTggPSBnYW1tYS5yZWRTcXIoKTtcbiAgICBnZ2FtbWE4ID0gZ2dhbW1hOC5yZWRJQWRkKGdnYW1tYTgpO1xuICAgIGdnYW1tYTggPSBnZ2FtbWE4LnJlZElBZGQoZ2dhbW1hOCk7XG4gICAgZ2dhbW1hOCA9IGdnYW1tYTgucmVkSUFkZChnZ2FtbWE4KTtcbiAgICBueSA9IGFscGhhLnJlZE11bChiZXRhNC5yZWRJU3ViKG54KSkucmVkSVN1YihnZ2FtbWE4KTtcbiAgfVxuXG4gIHJldHVybiB0aGlzLmN1cnZlLmpwb2ludChueCwgbnksIG56KTtcbn07XG5cbkpQb2ludC5wcm90b3R5cGUuX2RibCA9IGZ1bmN0aW9uIF9kYmwoKSB7XG4gIHZhciBhID0gdGhpcy5jdXJ2ZS5hO1xuXG4gIC8vIDRNICsgNlMgKyAxMEFcbiAgdmFyIGp4ID0gdGhpcy54O1xuICB2YXIgankgPSB0aGlzLnk7XG4gIHZhciBqeiA9IHRoaXMuejtcbiAgdmFyIGp6NCA9IGp6LnJlZFNxcigpLnJlZFNxcigpO1xuXG4gIHZhciBqeDIgPSBqeC5yZWRTcXIoKTtcbiAgdmFyIGp5MiA9IGp5LnJlZFNxcigpO1xuXG4gIHZhciBjID0gangyLnJlZEFkZChqeDIpLnJlZElBZGQoangyKS5yZWRJQWRkKGEucmVkTXVsKGp6NCkpO1xuXG4gIHZhciBqeGQ0ID0gangucmVkQWRkKGp4KTtcbiAganhkNCA9IGp4ZDQucmVkSUFkZChqeGQ0KTtcbiAgdmFyIHQxID0ganhkNC5yZWRNdWwoankyKTtcbiAgdmFyIG54ID0gYy5yZWRTcXIoKS5yZWRJU3ViKHQxLnJlZEFkZCh0MSkpO1xuICB2YXIgdDIgPSB0MS5yZWRJU3ViKG54KTtcblxuICB2YXIganlkOCA9IGp5Mi5yZWRTcXIoKTtcbiAganlkOCA9IGp5ZDgucmVkSUFkZChqeWQ4KTtcbiAganlkOCA9IGp5ZDgucmVkSUFkZChqeWQ4KTtcbiAganlkOCA9IGp5ZDgucmVkSUFkZChqeWQ4KTtcbiAgdmFyIG55ID0gYy5yZWRNdWwodDIpLnJlZElTdWIoanlkOCk7XG4gIHZhciBueiA9IGp5LnJlZEFkZChqeSkucmVkTXVsKGp6KTtcblxuICByZXR1cm4gdGhpcy5jdXJ2ZS5qcG9pbnQobngsIG55LCBueik7XG59O1xuXG5KUG9pbnQucHJvdG90eXBlLnRycGwgPSBmdW5jdGlvbiB0cnBsKCkge1xuICBpZiAoIXRoaXMuY3VydmUuemVyb0EpXG4gICAgcmV0dXJuIHRoaXMuZGJsKCkuYWRkKHRoaXMpO1xuXG4gIC8vIGh5cGVyZWxsaXB0aWMub3JnL0VGRC9nMXAvYXV0by1zaG9ydHctamFjb2JpYW4tMC5odG1sI3RyaXBsaW5nLXRwbC0yMDA3LWJsXG4gIC8vIDVNICsgMTBTICsgLi4uXG5cbiAgLy8gWFggPSBYMV4yXG4gIHZhciB4eCA9IHRoaXMueC5yZWRTcXIoKTtcbiAgLy8gWVkgPSBZMV4yXG4gIHZhciB5eSA9IHRoaXMueS5yZWRTcXIoKTtcbiAgLy8gWlogPSBaMV4yXG4gIHZhciB6eiA9IHRoaXMuei5yZWRTcXIoKTtcbiAgLy8gWVlZWSA9IFlZXjJcbiAgdmFyIHl5eXkgPSB5eS5yZWRTcXIoKTtcbiAgLy8gTSA9IDMgKiBYWCArIGEgKiBaWjI7IGEgPSAwXG4gIHZhciBtID0geHgucmVkQWRkKHh4KS5yZWRJQWRkKHh4KTtcbiAgLy8gTU0gPSBNXjJcbiAgdmFyIG1tID0gbS5yZWRTcXIoKTtcbiAgLy8gRSA9IDYgKiAoKFgxICsgWVkpXjIgLSBYWCAtIFlZWVkpIC0gTU1cbiAgdmFyIGUgPSB0aGlzLngucmVkQWRkKHl5KS5yZWRTcXIoKS5yZWRJU3ViKHh4KS5yZWRJU3ViKHl5eXkpO1xuICBlID0gZS5yZWRJQWRkKGUpO1xuICBlID0gZS5yZWRBZGQoZSkucmVkSUFkZChlKTtcbiAgZSA9IGUucmVkSVN1YihtbSk7XG4gIC8vIEVFID0gRV4yXG4gIHZhciBlZSA9IGUucmVkU3FyKCk7XG4gIC8vIFQgPSAxNipZWVlZXG4gIHZhciB0ID0geXl5eS5yZWRJQWRkKHl5eXkpO1xuICB0ID0gdC5yZWRJQWRkKHQpO1xuICB0ID0gdC5yZWRJQWRkKHQpO1xuICB0ID0gdC5yZWRJQWRkKHQpO1xuICAvLyBVID0gKE0gKyBFKV4yIC0gTU0gLSBFRSAtIFRcbiAgdmFyIHUgPSBtLnJlZElBZGQoZSkucmVkU3FyKCkucmVkSVN1YihtbSkucmVkSVN1YihlZSkucmVkSVN1Yih0KTtcbiAgLy8gWDMgPSA0ICogKFgxICogRUUgLSA0ICogWVkgKiBVKVxuICB2YXIgeXl1NCA9IHl5LnJlZE11bCh1KTtcbiAgeXl1NCA9IHl5dTQucmVkSUFkZCh5eXU0KTtcbiAgeXl1NCA9IHl5dTQucmVkSUFkZCh5eXU0KTtcbiAgdmFyIG54ID0gdGhpcy54LnJlZE11bChlZSkucmVkSVN1Yih5eXU0KTtcbiAgbnggPSBueC5yZWRJQWRkKG54KTtcbiAgbnggPSBueC5yZWRJQWRkKG54KTtcbiAgLy8gWTMgPSA4ICogWTEgKiAoVSAqIChUIC0gVSkgLSBFICogRUUpXG4gIHZhciBueSA9IHRoaXMueS5yZWRNdWwodS5yZWRNdWwodC5yZWRJU3ViKHUpKS5yZWRJU3ViKGUucmVkTXVsKGVlKSkpO1xuICBueSA9IG55LnJlZElBZGQobnkpO1xuICBueSA9IG55LnJlZElBZGQobnkpO1xuICBueSA9IG55LnJlZElBZGQobnkpO1xuICAvLyBaMyA9IChaMSArIEUpXjIgLSBaWiAtIEVFXG4gIHZhciBueiA9IHRoaXMuei5yZWRBZGQoZSkucmVkU3FyKCkucmVkSVN1Yih6eikucmVkSVN1YihlZSk7XG5cbiAgcmV0dXJuIHRoaXMuY3VydmUuanBvaW50KG54LCBueSwgbnopO1xufTtcblxuSlBvaW50LnByb3RvdHlwZS5tdWwgPSBmdW5jdGlvbiBtdWwoaywga2Jhc2UpIHtcbiAgayA9IG5ldyBCTihrLCBrYmFzZSk7XG5cbiAgcmV0dXJuIHRoaXMuY3VydmUuX3duYWZNdWwodGhpcywgayk7XG59O1xuXG5KUG9pbnQucHJvdG90eXBlLmVxID0gZnVuY3Rpb24gZXEocCkge1xuICBpZiAocC50eXBlID09PSAnYWZmaW5lJylcbiAgICByZXR1cm4gdGhpcy5lcShwLnRvSigpKTtcblxuICBpZiAodGhpcyA9PT0gcClcbiAgICByZXR1cm4gdHJ1ZTtcblxuICAvLyB4MSAqIHoyXjIgPT0geDIgKiB6MV4yXG4gIHZhciB6MiA9IHRoaXMuei5yZWRTcXIoKTtcbiAgdmFyIHB6MiA9IHAuei5yZWRTcXIoKTtcbiAgaWYgKHRoaXMueC5yZWRNdWwocHoyKS5yZWRJU3ViKHAueC5yZWRNdWwoejIpKS5jbXBuKDApICE9PSAwKVxuICAgIHJldHVybiBmYWxzZTtcblxuICAvLyB5MSAqIHoyXjMgPT0geTIgKiB6MV4zXG4gIHZhciB6MyA9IHoyLnJlZE11bCh0aGlzLnopO1xuICB2YXIgcHozID0gcHoyLnJlZE11bChwLnopO1xuICByZXR1cm4gdGhpcy55LnJlZE11bChwejMpLnJlZElTdWIocC55LnJlZE11bCh6MykpLmNtcG4oMCkgPT09IDA7XG59O1xuXG5KUG9pbnQucHJvdG90eXBlLmVxWFRvUCA9IGZ1bmN0aW9uIGVxWFRvUCh4KSB7XG4gIHZhciB6cyA9IHRoaXMuei5yZWRTcXIoKTtcbiAgdmFyIHJ4ID0geC50b1JlZCh0aGlzLmN1cnZlLnJlZCkucmVkTXVsKHpzKTtcbiAgaWYgKHRoaXMueC5jbXAocngpID09PSAwKVxuICAgIHJldHVybiB0cnVlO1xuXG4gIHZhciB4YyA9IHguY2xvbmUoKTtcbiAgdmFyIHQgPSB0aGlzLmN1cnZlLnJlZE4ucmVkTXVsKHpzKTtcbiAgZm9yICg7Oykge1xuICAgIHhjLmlhZGQodGhpcy5jdXJ2ZS5uKTtcbiAgICBpZiAoeGMuY21wKHRoaXMuY3VydmUucCkgPj0gMClcbiAgICAgIHJldHVybiBmYWxzZTtcblxuICAgIHJ4LnJlZElBZGQodCk7XG4gICAgaWYgKHRoaXMueC5jbXAocngpID09PSAwKVxuICAgICAgcmV0dXJuIHRydWU7XG4gIH1cbn07XG5cbkpQb2ludC5wcm90b3R5cGUuaW5zcGVjdCA9IGZ1bmN0aW9uIGluc3BlY3QoKSB7XG4gIGlmICh0aGlzLmlzSW5maW5pdHkoKSlcbiAgICByZXR1cm4gJzxFQyBKUG9pbnQgSW5maW5pdHk+JztcbiAgcmV0dXJuICc8RUMgSlBvaW50IHg6ICcgKyB0aGlzLngudG9TdHJpbmcoMTYsIDIpICtcbiAgICAgICcgeTogJyArIHRoaXMueS50b1N0cmluZygxNiwgMikgK1xuICAgICAgJyB6OiAnICsgdGhpcy56LnRvU3RyaW5nKDE2LCAyKSArICc+Jztcbn07XG5cbkpQb2ludC5wcm90b3R5cGUuaXNJbmZpbml0eSA9IGZ1bmN0aW9uIGlzSW5maW5pdHkoKSB7XG4gIC8vIFhYWCBUaGlzIGNvZGUgYXNzdW1lcyB0aGF0IHplcm8gaXMgYWx3YXlzIHplcm8gaW4gcmVkXG4gIHJldHVybiB0aGlzLnouY21wbigwKSA9PT0gMDtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBjdXJ2ZXMgPSBleHBvcnRzO1xuXG52YXIgaGFzaCA9IHJlcXVpcmUoJ2hhc2guanMnKTtcbnZhciBlbGxpcHRpYyA9IHJlcXVpcmUoJy4uL2VsbGlwdGljJyk7XG5cbnZhciBhc3NlcnQgPSBlbGxpcHRpYy51dGlscy5hc3NlcnQ7XG5cbmZ1bmN0aW9uIFByZXNldEN1cnZlKG9wdGlvbnMpIHtcbiAgaWYgKG9wdGlvbnMudHlwZSA9PT0gJ3Nob3J0JylcbiAgICB0aGlzLmN1cnZlID0gbmV3IGVsbGlwdGljLmN1cnZlLnNob3J0KG9wdGlvbnMpO1xuICBlbHNlIGlmIChvcHRpb25zLnR5cGUgPT09ICdlZHdhcmRzJylcbiAgICB0aGlzLmN1cnZlID0gbmV3IGVsbGlwdGljLmN1cnZlLmVkd2FyZHMob3B0aW9ucyk7XG4gIGVsc2VcbiAgICB0aGlzLmN1cnZlID0gbmV3IGVsbGlwdGljLmN1cnZlLm1vbnQob3B0aW9ucyk7XG4gIHRoaXMuZyA9IHRoaXMuY3VydmUuZztcbiAgdGhpcy5uID0gdGhpcy5jdXJ2ZS5uO1xuICB0aGlzLmhhc2ggPSBvcHRpb25zLmhhc2g7XG5cbiAgYXNzZXJ0KHRoaXMuZy52YWxpZGF0ZSgpLCAnSW52YWxpZCBjdXJ2ZScpO1xuICBhc3NlcnQodGhpcy5nLm11bCh0aGlzLm4pLmlzSW5maW5pdHkoKSwgJ0ludmFsaWQgY3VydmUsIEcqTiAhPSBPJyk7XG59XG5jdXJ2ZXMuUHJlc2V0Q3VydmUgPSBQcmVzZXRDdXJ2ZTtcblxuZnVuY3Rpb24gZGVmaW5lQ3VydmUobmFtZSwgb3B0aW9ucykge1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoY3VydmVzLCBuYW1lLCB7XG4gICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBjdXJ2ZSA9IG5ldyBQcmVzZXRDdXJ2ZShvcHRpb25zKTtcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShjdXJ2ZXMsIG5hbWUsIHtcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICB2YWx1ZTogY3VydmVcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIGN1cnZlO1xuICAgIH1cbiAgfSk7XG59XG5cbmRlZmluZUN1cnZlKCdwMTkyJywge1xuICB0eXBlOiAnc2hvcnQnLFxuICBwcmltZTogJ3AxOTInLFxuICBwOiAnZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmUgZmZmZmZmZmYgZmZmZmZmZmYnLFxuICBhOiAnZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmUgZmZmZmZmZmYgZmZmZmZmZmMnLFxuICBiOiAnNjQyMTA1MTkgZTU5YzgwZTcgMGZhN2U5YWIgNzIyNDMwNDkgZmViOGRlZWMgYzE0NmI5YjEnLFxuICBuOiAnZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmYgOTlkZWY4MzYgMTQ2YmM5YjEgYjRkMjI4MzEnLFxuICBoYXNoOiBoYXNoLnNoYTI1NixcbiAgZ1JlZDogZmFsc2UsXG4gIGc6IFtcbiAgICAnMTg4ZGE4MGUgYjAzMDkwZjYgN2NiZjIwZWIgNDNhMTg4MDAgZjRmZjBhZmQgODJmZjEwMTInLFxuICAgICcwNzE5MmI5NSBmZmM4ZGE3OCA2MzEwMTFlZCA2YjI0Y2RkNSA3M2Y5NzdhMSAxZTc5NDgxMSdcbiAgXVxufSk7XG5cbmRlZmluZUN1cnZlKCdwMjI0Jywge1xuICB0eXBlOiAnc2hvcnQnLFxuICBwcmltZTogJ3AyMjQnLFxuICBwOiAnZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmYgMDAwMDAwMDAgMDAwMDAwMDAgMDAwMDAwMDEnLFxuICBhOiAnZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmUgZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmUnLFxuICBiOiAnYjQwNTBhODUgMGMwNGIzYWIgZjU0MTMyNTYgNTA0NGIwYjcgZDdiZmQ4YmEgMjcwYjM5NDMgMjM1NWZmYjQnLFxuICBuOiAnZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmYgZmZmZjE2YTIgZTBiOGYwM2UgMTNkZDI5NDUgNWM1YzJhM2QnLFxuICBoYXNoOiBoYXNoLnNoYTI1NixcbiAgZ1JlZDogZmFsc2UsXG4gIGc6IFtcbiAgICAnYjcwZTBjYmQgNmJiNGJmN2YgMzIxMzkwYjkgNGEwM2MxZDMgNTZjMjExMjIgMzQzMjgwZDYgMTE1YzFkMjEnLFxuICAgICdiZDM3NjM4OCBiNWY3MjNmYiA0YzIyZGZlNiBjZDQzNzVhMCA1YTA3NDc2NCA0NGQ1ODE5OSA4NTAwN2UzNCdcbiAgXVxufSk7XG5cbmRlZmluZUN1cnZlKCdwMjU2Jywge1xuICB0eXBlOiAnc2hvcnQnLFxuICBwcmltZTogbnVsbCxcbiAgcDogJ2ZmZmZmZmZmIDAwMDAwMDAxIDAwMDAwMDAwIDAwMDAwMDAwIDAwMDAwMDAwIGZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZmJyxcbiAgYTogJ2ZmZmZmZmZmIDAwMDAwMDAxIDAwMDAwMDAwIDAwMDAwMDAwIDAwMDAwMDAwIGZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZjJyxcbiAgYjogJzVhYzYzNWQ4IGFhM2E5M2U3IGIzZWJiZDU1IDc2OTg4NmJjIDY1MWQwNmIwIGNjNTNiMGY2IDNiY2UzYzNlIDI3ZDI2MDRiJyxcbiAgbjogJ2ZmZmZmZmZmIDAwMDAwMDAwIGZmZmZmZmZmIGZmZmZmZmZmIGJjZTZmYWFkIGE3MTc5ZTg0IGYzYjljYWMyIGZjNjMyNTUxJyxcbiAgaGFzaDogaGFzaC5zaGEyNTYsXG4gIGdSZWQ6IGZhbHNlLFxuICBnOiBbXG4gICAgJzZiMTdkMWYyIGUxMmM0MjQ3IGY4YmNlNmU1IDYzYTQ0MGYyIDc3MDM3ZDgxIDJkZWIzM2EwIGY0YTEzOTQ1IGQ4OThjMjk2JyxcbiAgICAnNGZlMzQyZTIgZmUxYTdmOWIgOGVlN2ViNGEgN2MwZjllMTYgMmJjZTMzNTcgNmIzMTVlY2UgY2JiNjQwNjggMzdiZjUxZjUnXG4gIF1cbn0pO1xuXG5kZWZpbmVDdXJ2ZSgncDM4NCcsIHtcbiAgdHlwZTogJ3Nob3J0JyxcbiAgcHJpbWU6IG51bGwsXG4gIHA6ICdmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiAnICtcbiAgICAgJ2ZmZmZmZmZlIGZmZmZmZmZmIDAwMDAwMDAwIDAwMDAwMDAwIGZmZmZmZmZmJyxcbiAgYTogJ2ZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZmICcgK1xuICAgICAnZmZmZmZmZmUgZmZmZmZmZmYgMDAwMDAwMDAgMDAwMDAwMDAgZmZmZmZmZmMnLFxuICBiOiAnYjMzMTJmYTcgZTIzZWU3ZTQgOTg4ZTA1NmIgZTNmODJkMTkgMTgxZDljNmUgZmU4MTQxMTIgMDMxNDA4OGYgJyArXG4gICAgICc1MDEzODc1YSBjNjU2Mzk4ZCA4YTJlZDE5ZCAyYTg1YzhlZCBkM2VjMmFlZicsXG4gIG46ICdmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBjNzYzNGQ4MSAnICtcbiAgICAgJ2Y0MzcyZGRmIDU4MWEwZGIyIDQ4YjBhNzdhIGVjZWMxOTZhIGNjYzUyOTczJyxcbiAgaGFzaDogaGFzaC5zaGEzODQsXG4gIGdSZWQ6IGZhbHNlLFxuICBnOiBbXG4gICAgJ2FhODdjYTIyIGJlOGIwNTM3IDhlYjFjNzFlIGYzMjBhZDc0IDZlMWQzYjYyIDhiYTc5Yjk4IDU5Zjc0MWUwIDgyNTQyYTM4ICcgK1xuICAgICc1NTAyZjI1ZCBiZjU1Mjk2YyAzYTU0NWUzOCA3Mjc2MGFiNycsXG4gICAgJzM2MTdkZTRhIDk2MjYyYzZmIDVkOWU5OGJmIDkyOTJkYzI5IGY4ZjQxZGJkIDI4OWExNDdjIGU5ZGEzMTEzIGI1ZjBiOGMwICcgK1xuICAgICcwYTYwYjFjZSAxZDdlODE5ZCA3YTQzMWQ3YyA5MGVhMGU1ZidcbiAgXVxufSk7XG5cbmRlZmluZUN1cnZlKCdwNTIxJywge1xuICB0eXBlOiAnc2hvcnQnLFxuICBwcmltZTogbnVsbCxcbiAgcDogJzAwMDAwMWZmIGZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZmICcgK1xuICAgICAnZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmYgJyArXG4gICAgICdmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZicsXG4gIGE6ICcwMDAwMDFmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiAnICtcbiAgICAgJ2ZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZmICcgK1xuICAgICAnZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmMnLFxuICBiOiAnMDAwMDAwNTEgOTUzZWI5NjEgOGUxYzlhMWYgOTI5YTIxYTAgYjY4NTQwZWUgYTJkYTcyNWIgJyArXG4gICAgICc5OWIzMTVmMyBiOGI0ODk5MSA4ZWYxMDllMSA1NjE5Mzk1MSBlYzdlOTM3YiAxNjUyYzBiZCAnICtcbiAgICAgJzNiYjFiZjA3IDM1NzNkZjg4IDNkMmMzNGYxIGVmNDUxZmQ0IDZiNTAzZjAwJyxcbiAgbjogJzAwMDAwMWZmIGZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZmICcgK1xuICAgICAnZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmEgNTE4Njg3ODMgYmYyZjk2NmIgN2ZjYzAxNDggJyArXG4gICAgICdmNzA5YTVkMCAzYmI1YzliOCA4OTljNDdhZSBiYjZmYjcxZSA5MTM4NjQwOScsXG4gIGhhc2g6IGhhc2guc2hhNTEyLFxuICBnUmVkOiBmYWxzZSxcbiAgZzogW1xuICAgICcwMDAwMDBjNiA4NThlMDZiNyAwNDA0ZTljZCA5ZTNlY2I2NiAyMzk1YjQ0MiA5YzY0ODEzOSAnICtcbiAgICAnMDUzZmI1MjEgZjgyOGFmNjAgNmI0ZDNkYmEgYTE0YjVlNzcgZWZlNzU5MjggZmUxZGMxMjcgJyArXG4gICAgJ2EyZmZhOGRlIDMzNDhiM2MxIDg1NmE0MjliIGY5N2U3ZTMxIGMyZTViZDY2JyxcbiAgICAnMDAwMDAxMTggMzkyOTZhNzggOWEzYmMwMDQgNWM4YTVmYjQgMmM3ZDFiZDkgOThmNTQ0NDkgJyArXG4gICAgJzU3OWI0NDY4IDE3YWZiZDE3IDI3M2U2NjJjIDk3ZWU3Mjk5IDVlZjQyNjQwIGM1NTBiOTAxICcgK1xuICAgICczZmFkMDc2MSAzNTNjNzA4NiBhMjcyYzI0MCA4OGJlOTQ3NiA5ZmQxNjY1MCdcbiAgXVxufSk7XG5cbmRlZmluZUN1cnZlKCdjdXJ2ZTI1NTE5Jywge1xuICB0eXBlOiAnbW9udCcsXG4gIHByaW1lOiAncDI1NTE5JyxcbiAgcDogJzdmZmZmZmZmZmZmZmZmZmYgZmZmZmZmZmZmZmZmZmZmZiBmZmZmZmZmZmZmZmZmZmZmIGZmZmZmZmZmZmZmZmZmZWQnLFxuICBhOiAnNzZkMDYnLFxuICBiOiAnMScsXG4gIG46ICcxMDAwMDAwMDAwMDAwMDAwIDAwMDAwMDAwMDAwMDAwMDAgMTRkZWY5ZGVhMmY3OWNkNiA1ODEyNjMxYTVjZjVkM2VkJyxcbiAgaGFzaDogaGFzaC5zaGEyNTYsXG4gIGdSZWQ6IGZhbHNlLFxuICBnOiBbXG4gICAgJzknXG4gIF1cbn0pO1xuXG5kZWZpbmVDdXJ2ZSgnZWQyNTUxOScsIHtcbiAgdHlwZTogJ2Vkd2FyZHMnLFxuICBwcmltZTogJ3AyNTUxOScsXG4gIHA6ICc3ZmZmZmZmZmZmZmZmZmZmIGZmZmZmZmZmZmZmZmZmZmYgZmZmZmZmZmZmZmZmZmZmZiBmZmZmZmZmZmZmZmZmZmVkJyxcbiAgYTogJy0xJyxcbiAgYzogJzEnLFxuICAvLyAtMTIxNjY1ICogKDEyMTY2Nl4oLTEpKSAobW9kIFApXG4gIGQ6ICc1MjAzNmNlZTJiNmZmZTczIDhjYzc0MDc5Nzc3OWU4OTggMDA3MDBhNGQ0MTQxZDhhYiA3NWViNGRjYTEzNTk3OGEzJyxcbiAgbjogJzEwMDAwMDAwMDAwMDAwMDAgMDAwMDAwMDAwMDAwMDAwMCAxNGRlZjlkZWEyZjc5Y2Q2IDU4MTI2MzFhNWNmNWQzZWQnLFxuICBoYXNoOiBoYXNoLnNoYTI1NixcbiAgZ1JlZDogZmFsc2UsXG4gIGc6IFtcbiAgICAnMjE2OTM2ZDNjZDZlNTNmZWMwYTRlMjMxZmRkNmRjNWM2OTJjYzc2MDk1MjVhN2IyYzk1NjJkNjA4ZjI1ZDUxYScsXG5cbiAgICAvLyA0LzVcbiAgICAnNjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY1OCdcbiAgXVxufSk7XG5cbnZhciBwcmU7XG50cnkge1xuICBwcmUgPSByZXF1aXJlKCcuL3ByZWNvbXB1dGVkL3NlY3AyNTZrMScpO1xufSBjYXRjaCAoZSkge1xuICBwcmUgPSB1bmRlZmluZWQ7XG59XG5cbmRlZmluZUN1cnZlKCdzZWNwMjU2azEnLCB7XG4gIHR5cGU6ICdzaG9ydCcsXG4gIHByaW1lOiAnazI1NicsXG4gIHA6ICdmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZSBmZmZmZmMyZicsXG4gIGE6ICcwJyxcbiAgYjogJzcnLFxuICBuOiAnZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmYgZmZmZmZmZmUgYmFhZWRjZTYgYWY0OGEwM2IgYmZkMjVlOGMgZDAzNjQxNDEnLFxuICBoOiAnMScsXG4gIGhhc2g6IGhhc2guc2hhMjU2LFxuXG4gIC8vIFByZWNvbXB1dGVkIGVuZG9tb3JwaGlzbVxuICBiZXRhOiAnN2FlOTZhMmI2NTdjMDcxMDZlNjQ0NzllYWMzNDM0ZTk5Y2YwNDk3NTEyZjU4OTk1YzEzOTZjMjg3MTk1MDFlZScsXG4gIGxhbWJkYTogJzUzNjNhZDRjYzA1YzMwZTBhNTI2MWMwMjg4MTI2NDVhMTIyZTIyZWEyMDgxNjY3OGRmMDI5NjdjMWIyM2JkNzInLFxuICBiYXNpczogW1xuICAgIHtcbiAgICAgIGE6ICczMDg2ZDIyMWE3ZDQ2YmNkZTg2YzkwZTQ5Mjg0ZWIxNScsXG4gICAgICBiOiAnLWU0NDM3ZWQ2MDEwZTg4Mjg2ZjU0N2ZhOTBhYmZlNGMzJ1xuICAgIH0sXG4gICAge1xuICAgICAgYTogJzExNGNhNTBmN2E4ZTJmM2Y2NTdjMTEwOGQ5ZDQ0Y2ZkOCcsXG4gICAgICBiOiAnMzA4NmQyMjFhN2Q0NmJjZGU4NmM5MGU0OTI4NGViMTUnXG4gICAgfVxuICBdLFxuXG4gIGdSZWQ6IGZhbHNlLFxuICBnOiBbXG4gICAgJzc5YmU2NjdlZjlkY2JiYWM1NWEwNjI5NWNlODcwYjA3MDI5YmZjZGIyZGNlMjhkOTU5ZjI4MTViMTZmODE3OTgnLFxuICAgICc0ODNhZGE3NzI2YTNjNDY1NWRhNGZiZmMwZTExMDhhOGZkMTdiNDQ4YTY4NTU0MTk5YzQ3ZDA4ZmZiMTBkNGI4JyxcbiAgICBwcmVcbiAgXVxufSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBCTiA9IHJlcXVpcmUoJ2JuLmpzJyk7XG52YXIgSG1hY0RSQkcgPSByZXF1aXJlKCdobWFjLWRyYmcnKTtcbnZhciBlbGxpcHRpYyA9IHJlcXVpcmUoJy4uLy4uL2VsbGlwdGljJyk7XG52YXIgdXRpbHMgPSBlbGxpcHRpYy51dGlscztcbnZhciBhc3NlcnQgPSB1dGlscy5hc3NlcnQ7XG5cbnZhciBLZXlQYWlyID0gcmVxdWlyZSgnLi9rZXknKTtcbnZhciBTaWduYXR1cmUgPSByZXF1aXJlKCcuL3NpZ25hdHVyZScpO1xuXG5mdW5jdGlvbiBFQyhvcHRpb25zKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBFQykpXG4gICAgcmV0dXJuIG5ldyBFQyhvcHRpb25zKTtcblxuICAvLyBTaG9ydGN1dCBgZWxsaXB0aWMuZWMoY3VydmUtbmFtZSlgXG4gIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ3N0cmluZycpIHtcbiAgICBhc3NlcnQoZWxsaXB0aWMuY3VydmVzLmhhc093blByb3BlcnR5KG9wdGlvbnMpLCAnVW5rbm93biBjdXJ2ZSAnICsgb3B0aW9ucyk7XG5cbiAgICBvcHRpb25zID0gZWxsaXB0aWMuY3VydmVzW29wdGlvbnNdO1xuICB9XG5cbiAgLy8gU2hvcnRjdXQgZm9yIGBlbGxpcHRpYy5lYyhlbGxpcHRpYy5jdXJ2ZXMuY3VydmVOYW1lKWBcbiAgaWYgKG9wdGlvbnMgaW5zdGFuY2VvZiBlbGxpcHRpYy5jdXJ2ZXMuUHJlc2V0Q3VydmUpXG4gICAgb3B0aW9ucyA9IHsgY3VydmU6IG9wdGlvbnMgfTtcblxuICB0aGlzLmN1cnZlID0gb3B0aW9ucy5jdXJ2ZS5jdXJ2ZTtcbiAgdGhpcy5uID0gdGhpcy5jdXJ2ZS5uO1xuICB0aGlzLm5oID0gdGhpcy5uLnVzaHJuKDEpO1xuICB0aGlzLmcgPSB0aGlzLmN1cnZlLmc7XG5cbiAgLy8gUG9pbnQgb24gY3VydmVcbiAgdGhpcy5nID0gb3B0aW9ucy5jdXJ2ZS5nO1xuICB0aGlzLmcucHJlY29tcHV0ZShvcHRpb25zLmN1cnZlLm4uYml0TGVuZ3RoKCkgKyAxKTtcblxuICAvLyBIYXNoIGZvciBmdW5jdGlvbiBmb3IgRFJCR1xuICB0aGlzLmhhc2ggPSBvcHRpb25zLmhhc2ggfHwgb3B0aW9ucy5jdXJ2ZS5oYXNoO1xufVxubW9kdWxlLmV4cG9ydHMgPSBFQztcblxuRUMucHJvdG90eXBlLmtleVBhaXIgPSBmdW5jdGlvbiBrZXlQYWlyKG9wdGlvbnMpIHtcbiAgcmV0dXJuIG5ldyBLZXlQYWlyKHRoaXMsIG9wdGlvbnMpO1xufTtcblxuRUMucHJvdG90eXBlLmtleUZyb21Qcml2YXRlID0gZnVuY3Rpb24ga2V5RnJvbVByaXZhdGUocHJpdiwgZW5jKSB7XG4gIHJldHVybiBLZXlQYWlyLmZyb21Qcml2YXRlKHRoaXMsIHByaXYsIGVuYyk7XG59O1xuXG5FQy5wcm90b3R5cGUua2V5RnJvbVB1YmxpYyA9IGZ1bmN0aW9uIGtleUZyb21QdWJsaWMocHViLCBlbmMpIHtcbiAgcmV0dXJuIEtleVBhaXIuZnJvbVB1YmxpYyh0aGlzLCBwdWIsIGVuYyk7XG59O1xuXG5FQy5wcm90b3R5cGUuZ2VuS2V5UGFpciA9IGZ1bmN0aW9uIGdlbktleVBhaXIob3B0aW9ucykge1xuICBpZiAoIW9wdGlvbnMpXG4gICAgb3B0aW9ucyA9IHt9O1xuXG4gIC8vIEluc3RhbnRpYXRlIEhtYWNfRFJCR1xuICB2YXIgZHJiZyA9IG5ldyBIbWFjRFJCRyh7XG4gICAgaGFzaDogdGhpcy5oYXNoLFxuICAgIHBlcnM6IG9wdGlvbnMucGVycyxcbiAgICBwZXJzRW5jOiBvcHRpb25zLnBlcnNFbmMgfHwgJ3V0ZjgnLFxuICAgIGVudHJvcHk6IG9wdGlvbnMuZW50cm9weSB8fCBlbGxpcHRpYy5yYW5kKHRoaXMuaGFzaC5obWFjU3RyZW5ndGgpLFxuICAgIGVudHJvcHlFbmM6IG9wdGlvbnMuZW50cm9weSAmJiBvcHRpb25zLmVudHJvcHlFbmMgfHwgJ3V0ZjgnLFxuICAgIG5vbmNlOiB0aGlzLm4udG9BcnJheSgpXG4gIH0pO1xuXG4gIHZhciBieXRlcyA9IHRoaXMubi5ieXRlTGVuZ3RoKCk7XG4gIHZhciBuczIgPSB0aGlzLm4uc3ViKG5ldyBCTigyKSk7XG4gIGRvIHtcbiAgICB2YXIgcHJpdiA9IG5ldyBCTihkcmJnLmdlbmVyYXRlKGJ5dGVzKSk7XG4gICAgaWYgKHByaXYuY21wKG5zMikgPiAwKVxuICAgICAgY29udGludWU7XG5cbiAgICBwcml2LmlhZGRuKDEpO1xuICAgIHJldHVybiB0aGlzLmtleUZyb21Qcml2YXRlKHByaXYpO1xuICB9IHdoaWxlICh0cnVlKTtcbn07XG5cbkVDLnByb3RvdHlwZS5fdHJ1bmNhdGVUb04gPSBmdW5jdGlvbiB0cnVuY2F0ZVRvTihtc2csIHRydW5jT25seSkge1xuICB2YXIgZGVsdGEgPSBtc2cuYnl0ZUxlbmd0aCgpICogOCAtIHRoaXMubi5iaXRMZW5ndGgoKTtcbiAgaWYgKGRlbHRhID4gMClcbiAgICBtc2cgPSBtc2cudXNocm4oZGVsdGEpO1xuICBpZiAoIXRydW5jT25seSAmJiBtc2cuY21wKHRoaXMubikgPj0gMClcbiAgICByZXR1cm4gbXNnLnN1Yih0aGlzLm4pO1xuICBlbHNlXG4gICAgcmV0dXJuIG1zZztcbn07XG5cbkVDLnByb3RvdHlwZS5zaWduID0gZnVuY3Rpb24gc2lnbihtc2csIGtleSwgZW5jLCBvcHRpb25zKSB7XG4gIGlmICh0eXBlb2YgZW5jID09PSAnb2JqZWN0Jykge1xuICAgIG9wdGlvbnMgPSBlbmM7XG4gICAgZW5jID0gbnVsbDtcbiAgfVxuICBpZiAoIW9wdGlvbnMpXG4gICAgb3B0aW9ucyA9IHt9O1xuXG4gIGtleSA9IHRoaXMua2V5RnJvbVByaXZhdGUoa2V5LCBlbmMpO1xuICBtc2cgPSB0aGlzLl90cnVuY2F0ZVRvTihuZXcgQk4obXNnLCAxNikpO1xuXG4gIC8vIFplcm8tZXh0ZW5kIGtleSB0byBwcm92aWRlIGVub3VnaCBlbnRyb3B5XG4gIHZhciBieXRlcyA9IHRoaXMubi5ieXRlTGVuZ3RoKCk7XG4gIHZhciBia2V5ID0ga2V5LmdldFByaXZhdGUoKS50b0FycmF5KCdiZScsIGJ5dGVzKTtcblxuICAvLyBaZXJvLWV4dGVuZCBub25jZSB0byBoYXZlIHRoZSBzYW1lIGJ5dGUgc2l6ZSBhcyBOXG4gIHZhciBub25jZSA9IG1zZy50b0FycmF5KCdiZScsIGJ5dGVzKTtcblxuICAvLyBJbnN0YW50aWF0ZSBIbWFjX0RSQkdcbiAgdmFyIGRyYmcgPSBuZXcgSG1hY0RSQkcoe1xuICAgIGhhc2g6IHRoaXMuaGFzaCxcbiAgICBlbnRyb3B5OiBia2V5LFxuICAgIG5vbmNlOiBub25jZSxcbiAgICBwZXJzOiBvcHRpb25zLnBlcnMsXG4gICAgcGVyc0VuYzogb3B0aW9ucy5wZXJzRW5jIHx8ICd1dGY4J1xuICB9KTtcblxuICAvLyBOdW1iZXIgb2YgYnl0ZXMgdG8gZ2VuZXJhdGVcbiAgdmFyIG5zMSA9IHRoaXMubi5zdWIobmV3IEJOKDEpKTtcblxuICBmb3IgKHZhciBpdGVyID0gMDsgdHJ1ZTsgaXRlcisrKSB7XG4gICAgdmFyIGsgPSBvcHRpb25zLmsgP1xuICAgICAgICBvcHRpb25zLmsoaXRlcikgOlxuICAgICAgICBuZXcgQk4oZHJiZy5nZW5lcmF0ZSh0aGlzLm4uYnl0ZUxlbmd0aCgpKSk7XG4gICAgayA9IHRoaXMuX3RydW5jYXRlVG9OKGssIHRydWUpO1xuICAgIGlmIChrLmNtcG4oMSkgPD0gMCB8fCBrLmNtcChuczEpID49IDApXG4gICAgICBjb250aW51ZTtcblxuICAgIHZhciBrcCA9IHRoaXMuZy5tdWwoayk7XG4gICAgaWYgKGtwLmlzSW5maW5pdHkoKSlcbiAgICAgIGNvbnRpbnVlO1xuXG4gICAgdmFyIGtwWCA9IGtwLmdldFgoKTtcbiAgICB2YXIgciA9IGtwWC51bW9kKHRoaXMubik7XG4gICAgaWYgKHIuY21wbigwKSA9PT0gMClcbiAgICAgIGNvbnRpbnVlO1xuXG4gICAgdmFyIHMgPSBrLmludm0odGhpcy5uKS5tdWwoci5tdWwoa2V5LmdldFByaXZhdGUoKSkuaWFkZChtc2cpKTtcbiAgICBzID0gcy51bW9kKHRoaXMubik7XG4gICAgaWYgKHMuY21wbigwKSA9PT0gMClcbiAgICAgIGNvbnRpbnVlO1xuXG4gICAgdmFyIHJlY292ZXJ5UGFyYW0gPSAoa3AuZ2V0WSgpLmlzT2RkKCkgPyAxIDogMCkgfFxuICAgICAgICAgICAgICAgICAgICAgICAgKGtwWC5jbXAocikgIT09IDAgPyAyIDogMCk7XG5cbiAgICAvLyBVc2UgY29tcGxlbWVudCBvZiBgc2AsIGlmIGl0IGlzID4gYG4gLyAyYFxuICAgIGlmIChvcHRpb25zLmNhbm9uaWNhbCAmJiBzLmNtcCh0aGlzLm5oKSA+IDApIHtcbiAgICAgIHMgPSB0aGlzLm4uc3ViKHMpO1xuICAgICAgcmVjb3ZlcnlQYXJhbSBePSAxO1xuICAgIH1cblxuICAgIHJldHVybiBuZXcgU2lnbmF0dXJlKHsgcjogciwgczogcywgcmVjb3ZlcnlQYXJhbTogcmVjb3ZlcnlQYXJhbSB9KTtcbiAgfVxufTtcblxuRUMucHJvdG90eXBlLnZlcmlmeSA9IGZ1bmN0aW9uIHZlcmlmeShtc2csIHNpZ25hdHVyZSwga2V5LCBlbmMpIHtcbiAgbXNnID0gdGhpcy5fdHJ1bmNhdGVUb04obmV3IEJOKG1zZywgMTYpKTtcbiAga2V5ID0gdGhpcy5rZXlGcm9tUHVibGljKGtleSwgZW5jKTtcbiAgc2lnbmF0dXJlID0gbmV3IFNpZ25hdHVyZShzaWduYXR1cmUsICdoZXgnKTtcblxuICAvLyBQZXJmb3JtIHByaW1pdGl2ZSB2YWx1ZXMgdmFsaWRhdGlvblxuICB2YXIgciA9IHNpZ25hdHVyZS5yO1xuICB2YXIgcyA9IHNpZ25hdHVyZS5zO1xuICBpZiAoci5jbXBuKDEpIDwgMCB8fCByLmNtcCh0aGlzLm4pID49IDApXG4gICAgcmV0dXJuIGZhbHNlO1xuICBpZiAocy5jbXBuKDEpIDwgMCB8fCBzLmNtcCh0aGlzLm4pID49IDApXG4gICAgcmV0dXJuIGZhbHNlO1xuXG4gIC8vIFZhbGlkYXRlIHNpZ25hdHVyZVxuICB2YXIgc2ludiA9IHMuaW52bSh0aGlzLm4pO1xuICB2YXIgdTEgPSBzaW52Lm11bChtc2cpLnVtb2QodGhpcy5uKTtcbiAgdmFyIHUyID0gc2ludi5tdWwocikudW1vZCh0aGlzLm4pO1xuXG4gIGlmICghdGhpcy5jdXJ2ZS5fbWF4d2VsbFRyaWNrKSB7XG4gICAgdmFyIHAgPSB0aGlzLmcubXVsQWRkKHUxLCBrZXkuZ2V0UHVibGljKCksIHUyKTtcbiAgICBpZiAocC5pc0luZmluaXR5KCkpXG4gICAgICByZXR1cm4gZmFsc2U7XG5cbiAgICByZXR1cm4gcC5nZXRYKCkudW1vZCh0aGlzLm4pLmNtcChyKSA9PT0gMDtcbiAgfVxuXG4gIC8vIE5PVEU6IEdyZWcgTWF4d2VsbCdzIHRyaWNrLCBpbnNwaXJlZCBieTpcbiAgLy8gaHR0cHM6Ly9naXQuaW8vdmFkM0tcblxuICB2YXIgcCA9IHRoaXMuZy5qbXVsQWRkKHUxLCBrZXkuZ2V0UHVibGljKCksIHUyKTtcbiAgaWYgKHAuaXNJbmZpbml0eSgpKVxuICAgIHJldHVybiBmYWxzZTtcblxuICAvLyBDb21wYXJlIGBwLnhgIG9mIEphY29iaWFuIHBvaW50IHdpdGggYHJgLFxuICAvLyB0aGlzIHdpbGwgZG8gYHAueCA9PSByICogcC56XjJgIGluc3RlYWQgb2YgbXVsdGlwbHlpbmcgYHAueGAgYnkgdGhlXG4gIC8vIGludmVyc2Ugb2YgYHAuel4yYFxuICByZXR1cm4gcC5lcVhUb1Aocik7XG59O1xuXG5FQy5wcm90b3R5cGUucmVjb3ZlclB1YktleSA9IGZ1bmN0aW9uKG1zZywgc2lnbmF0dXJlLCBqLCBlbmMpIHtcbiAgYXNzZXJ0KCgzICYgaikgPT09IGosICdUaGUgcmVjb3ZlcnkgcGFyYW0gaXMgbW9yZSB0aGFuIHR3byBiaXRzJyk7XG4gIHNpZ25hdHVyZSA9IG5ldyBTaWduYXR1cmUoc2lnbmF0dXJlLCBlbmMpO1xuXG4gIHZhciBuID0gdGhpcy5uO1xuICB2YXIgZSA9IG5ldyBCTihtc2cpO1xuICB2YXIgciA9IHNpZ25hdHVyZS5yO1xuICB2YXIgcyA9IHNpZ25hdHVyZS5zO1xuXG4gIC8vIEEgc2V0IExTQiBzaWduaWZpZXMgdGhhdCB0aGUgeS1jb29yZGluYXRlIGlzIG9kZFxuICB2YXIgaXNZT2RkID0gaiAmIDE7XG4gIHZhciBpc1NlY29uZEtleSA9IGogPj4gMTtcbiAgaWYgKHIuY21wKHRoaXMuY3VydmUucC51bW9kKHRoaXMuY3VydmUubikpID49IDAgJiYgaXNTZWNvbmRLZXkpXG4gICAgdGhyb3cgbmV3IEVycm9yKCdVbmFibGUgdG8gZmluZCBzZW5jb25kIGtleSBjYW5kaW5hdGUnKTtcblxuICAvLyAxLjEuIExldCB4ID0gciArIGpuLlxuICBpZiAoaXNTZWNvbmRLZXkpXG4gICAgciA9IHRoaXMuY3VydmUucG9pbnRGcm9tWChyLmFkZCh0aGlzLmN1cnZlLm4pLCBpc1lPZGQpO1xuICBlbHNlXG4gICAgciA9IHRoaXMuY3VydmUucG9pbnRGcm9tWChyLCBpc1lPZGQpO1xuXG4gIHZhciBySW52ID0gc2lnbmF0dXJlLnIuaW52bShuKTtcbiAgdmFyIHMxID0gbi5zdWIoZSkubXVsKHJJbnYpLnVtb2Qobik7XG4gIHZhciBzMiA9IHMubXVsKHJJbnYpLnVtb2Qobik7XG5cbiAgLy8gMS42LjEgQ29tcHV0ZSBRID0gcl4tMSAoc1IgLSAgZUcpXG4gIC8vICAgICAgICAgICAgICAgUSA9IHJeLTEgKHNSICsgLWVHKVxuICByZXR1cm4gdGhpcy5nLm11bEFkZChzMSwgciwgczIpO1xufTtcblxuRUMucHJvdG90eXBlLmdldEtleVJlY292ZXJ5UGFyYW0gPSBmdW5jdGlvbihlLCBzaWduYXR1cmUsIFEsIGVuYykge1xuICBzaWduYXR1cmUgPSBuZXcgU2lnbmF0dXJlKHNpZ25hdHVyZSwgZW5jKTtcbiAgaWYgKHNpZ25hdHVyZS5yZWNvdmVyeVBhcmFtICE9PSBudWxsKVxuICAgIHJldHVybiBzaWduYXR1cmUucmVjb3ZlcnlQYXJhbTtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IDQ7IGkrKykge1xuICAgIHZhciBRcHJpbWU7XG4gICAgdHJ5IHtcbiAgICAgIFFwcmltZSA9IHRoaXMucmVjb3ZlclB1YktleShlLCBzaWduYXR1cmUsIGkpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChRcHJpbWUuZXEoUSkpXG4gICAgICByZXR1cm4gaTtcbiAgfVxuICB0aHJvdyBuZXcgRXJyb3IoJ1VuYWJsZSB0byBmaW5kIHZhbGlkIHJlY292ZXJ5IGZhY3RvcicpO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIEJOID0gcmVxdWlyZSgnYm4uanMnKTtcbnZhciBlbGxpcHRpYyA9IHJlcXVpcmUoJy4uLy4uL2VsbGlwdGljJyk7XG52YXIgdXRpbHMgPSBlbGxpcHRpYy51dGlscztcbnZhciBhc3NlcnQgPSB1dGlscy5hc3NlcnQ7XG5cbmZ1bmN0aW9uIEtleVBhaXIoZWMsIG9wdGlvbnMpIHtcbiAgdGhpcy5lYyA9IGVjO1xuICB0aGlzLnByaXYgPSBudWxsO1xuICB0aGlzLnB1YiA9IG51bGw7XG5cbiAgLy8gS2V5UGFpcihlYywgeyBwcml2OiAuLi4sIHB1YjogLi4uIH0pXG4gIGlmIChvcHRpb25zLnByaXYpXG4gICAgdGhpcy5faW1wb3J0UHJpdmF0ZShvcHRpb25zLnByaXYsIG9wdGlvbnMucHJpdkVuYyk7XG4gIGlmIChvcHRpb25zLnB1YilcbiAgICB0aGlzLl9pbXBvcnRQdWJsaWMob3B0aW9ucy5wdWIsIG9wdGlvbnMucHViRW5jKTtcbn1cbm1vZHVsZS5leHBvcnRzID0gS2V5UGFpcjtcblxuS2V5UGFpci5mcm9tUHVibGljID0gZnVuY3Rpb24gZnJvbVB1YmxpYyhlYywgcHViLCBlbmMpIHtcbiAgaWYgKHB1YiBpbnN0YW5jZW9mIEtleVBhaXIpXG4gICAgcmV0dXJuIHB1YjtcblxuICByZXR1cm4gbmV3IEtleVBhaXIoZWMsIHtcbiAgICBwdWI6IHB1YixcbiAgICBwdWJFbmM6IGVuY1xuICB9KTtcbn07XG5cbktleVBhaXIuZnJvbVByaXZhdGUgPSBmdW5jdGlvbiBmcm9tUHJpdmF0ZShlYywgcHJpdiwgZW5jKSB7XG4gIGlmIChwcml2IGluc3RhbmNlb2YgS2V5UGFpcilcbiAgICByZXR1cm4gcHJpdjtcblxuICByZXR1cm4gbmV3IEtleVBhaXIoZWMsIHtcbiAgICBwcml2OiBwcml2LFxuICAgIHByaXZFbmM6IGVuY1xuICB9KTtcbn07XG5cbktleVBhaXIucHJvdG90eXBlLnZhbGlkYXRlID0gZnVuY3Rpb24gdmFsaWRhdGUoKSB7XG4gIHZhciBwdWIgPSB0aGlzLmdldFB1YmxpYygpO1xuXG4gIGlmIChwdWIuaXNJbmZpbml0eSgpKVxuICAgIHJldHVybiB7IHJlc3VsdDogZmFsc2UsIHJlYXNvbjogJ0ludmFsaWQgcHVibGljIGtleScgfTtcbiAgaWYgKCFwdWIudmFsaWRhdGUoKSlcbiAgICByZXR1cm4geyByZXN1bHQ6IGZhbHNlLCByZWFzb246ICdQdWJsaWMga2V5IGlzIG5vdCBhIHBvaW50JyB9O1xuICBpZiAoIXB1Yi5tdWwodGhpcy5lYy5jdXJ2ZS5uKS5pc0luZmluaXR5KCkpXG4gICAgcmV0dXJuIHsgcmVzdWx0OiBmYWxzZSwgcmVhc29uOiAnUHVibGljIGtleSAqIE4gIT0gTycgfTtcblxuICByZXR1cm4geyByZXN1bHQ6IHRydWUsIHJlYXNvbjogbnVsbCB9O1xufTtcblxuS2V5UGFpci5wcm90b3R5cGUuZ2V0UHVibGljID0gZnVuY3Rpb24gZ2V0UHVibGljKGNvbXBhY3QsIGVuYykge1xuICAvLyBjb21wYWN0IGlzIG9wdGlvbmFsIGFyZ3VtZW50XG4gIGlmICh0eXBlb2YgY29tcGFjdCA9PT0gJ3N0cmluZycpIHtcbiAgICBlbmMgPSBjb21wYWN0O1xuICAgIGNvbXBhY3QgPSBudWxsO1xuICB9XG5cbiAgaWYgKCF0aGlzLnB1YilcbiAgICB0aGlzLnB1YiA9IHRoaXMuZWMuZy5tdWwodGhpcy5wcml2KTtcblxuICBpZiAoIWVuYylcbiAgICByZXR1cm4gdGhpcy5wdWI7XG5cbiAgcmV0dXJuIHRoaXMucHViLmVuY29kZShlbmMsIGNvbXBhY3QpO1xufTtcblxuS2V5UGFpci5wcm90b3R5cGUuZ2V0UHJpdmF0ZSA9IGZ1bmN0aW9uIGdldFByaXZhdGUoZW5jKSB7XG4gIGlmIChlbmMgPT09ICdoZXgnKVxuICAgIHJldHVybiB0aGlzLnByaXYudG9TdHJpbmcoMTYsIDIpO1xuICBlbHNlXG4gICAgcmV0dXJuIHRoaXMucHJpdjtcbn07XG5cbktleVBhaXIucHJvdG90eXBlLl9pbXBvcnRQcml2YXRlID0gZnVuY3Rpb24gX2ltcG9ydFByaXZhdGUoa2V5LCBlbmMpIHtcbiAgdGhpcy5wcml2ID0gbmV3IEJOKGtleSwgZW5jIHx8IDE2KTtcblxuICAvLyBFbnN1cmUgdGhhdCB0aGUgcHJpdiB3b24ndCBiZSBiaWdnZXIgdGhhbiBuLCBvdGhlcndpc2Ugd2UgbWF5IGZhaWxcbiAgLy8gaW4gZml4ZWQgbXVsdGlwbGljYXRpb24gbWV0aG9kXG4gIHRoaXMucHJpdiA9IHRoaXMucHJpdi51bW9kKHRoaXMuZWMuY3VydmUubik7XG59O1xuXG5LZXlQYWlyLnByb3RvdHlwZS5faW1wb3J0UHVibGljID0gZnVuY3Rpb24gX2ltcG9ydFB1YmxpYyhrZXksIGVuYykge1xuICBpZiAoa2V5LnggfHwga2V5LnkpIHtcbiAgICAvLyBNb250Z29tZXJ5IHBvaW50cyBvbmx5IGhhdmUgYW4gYHhgIGNvb3JkaW5hdGUuXG4gICAgLy8gV2VpZXJzdHJhc3MvRWR3YXJkcyBwb2ludHMgb24gdGhlIG90aGVyIGhhbmQgaGF2ZSBib3RoIGB4YCBhbmRcbiAgICAvLyBgeWAgY29vcmRpbmF0ZXMuXG4gICAgaWYgKHRoaXMuZWMuY3VydmUudHlwZSA9PT0gJ21vbnQnKSB7XG4gICAgICBhc3NlcnQoa2V5LngsICdOZWVkIHggY29vcmRpbmF0ZScpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5lYy5jdXJ2ZS50eXBlID09PSAnc2hvcnQnIHx8XG4gICAgICAgICAgICAgICB0aGlzLmVjLmN1cnZlLnR5cGUgPT09ICdlZHdhcmRzJykge1xuICAgICAgYXNzZXJ0KGtleS54ICYmIGtleS55LCAnTmVlZCBib3RoIHggYW5kIHkgY29vcmRpbmF0ZScpO1xuICAgIH1cbiAgICB0aGlzLnB1YiA9IHRoaXMuZWMuY3VydmUucG9pbnQoa2V5LngsIGtleS55KTtcbiAgICByZXR1cm47XG4gIH1cbiAgdGhpcy5wdWIgPSB0aGlzLmVjLmN1cnZlLmRlY29kZVBvaW50KGtleSwgZW5jKTtcbn07XG5cbi8vIEVDREhcbktleVBhaXIucHJvdG90eXBlLmRlcml2ZSA9IGZ1bmN0aW9uIGRlcml2ZShwdWIpIHtcbiAgcmV0dXJuIHB1Yi5tdWwodGhpcy5wcml2KS5nZXRYKCk7XG59O1xuXG4vLyBFQ0RTQVxuS2V5UGFpci5wcm90b3R5cGUuc2lnbiA9IGZ1bmN0aW9uIHNpZ24obXNnLCBlbmMsIG9wdGlvbnMpIHtcbiAgcmV0dXJuIHRoaXMuZWMuc2lnbihtc2csIHRoaXMsIGVuYywgb3B0aW9ucyk7XG59O1xuXG5LZXlQYWlyLnByb3RvdHlwZS52ZXJpZnkgPSBmdW5jdGlvbiB2ZXJpZnkobXNnLCBzaWduYXR1cmUpIHtcbiAgcmV0dXJuIHRoaXMuZWMudmVyaWZ5KG1zZywgc2lnbmF0dXJlLCB0aGlzKTtcbn07XG5cbktleVBhaXIucHJvdG90eXBlLmluc3BlY3QgPSBmdW5jdGlvbiBpbnNwZWN0KCkge1xuICByZXR1cm4gJzxLZXkgcHJpdjogJyArICh0aGlzLnByaXYgJiYgdGhpcy5wcml2LnRvU3RyaW5nKDE2LCAyKSkgK1xuICAgICAgICAgJyBwdWI6ICcgKyAodGhpcy5wdWIgJiYgdGhpcy5wdWIuaW5zcGVjdCgpKSArICcgPic7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgQk4gPSByZXF1aXJlKCdibi5qcycpO1xuXG52YXIgZWxsaXB0aWMgPSByZXF1aXJlKCcuLi8uLi9lbGxpcHRpYycpO1xudmFyIHV0aWxzID0gZWxsaXB0aWMudXRpbHM7XG52YXIgYXNzZXJ0ID0gdXRpbHMuYXNzZXJ0O1xuXG5mdW5jdGlvbiBTaWduYXR1cmUob3B0aW9ucywgZW5jKSB7XG4gIGlmIChvcHRpb25zIGluc3RhbmNlb2YgU2lnbmF0dXJlKVxuICAgIHJldHVybiBvcHRpb25zO1xuXG4gIGlmICh0aGlzLl9pbXBvcnRERVIob3B0aW9ucywgZW5jKSlcbiAgICByZXR1cm47XG5cbiAgYXNzZXJ0KG9wdGlvbnMuciAmJiBvcHRpb25zLnMsICdTaWduYXR1cmUgd2l0aG91dCByIG9yIHMnKTtcbiAgdGhpcy5yID0gbmV3IEJOKG9wdGlvbnMuciwgMTYpO1xuICB0aGlzLnMgPSBuZXcgQk4ob3B0aW9ucy5zLCAxNik7XG4gIGlmIChvcHRpb25zLnJlY292ZXJ5UGFyYW0gPT09IHVuZGVmaW5lZClcbiAgICB0aGlzLnJlY292ZXJ5UGFyYW0gPSBudWxsO1xuICBlbHNlXG4gICAgdGhpcy5yZWNvdmVyeVBhcmFtID0gb3B0aW9ucy5yZWNvdmVyeVBhcmFtO1xufVxubW9kdWxlLmV4cG9ydHMgPSBTaWduYXR1cmU7XG5cbmZ1bmN0aW9uIFBvc2l0aW9uKCkge1xuICB0aGlzLnBsYWNlID0gMDtcbn1cblxuZnVuY3Rpb24gZ2V0TGVuZ3RoKGJ1ZiwgcCkge1xuICB2YXIgaW5pdGlhbCA9IGJ1ZltwLnBsYWNlKytdO1xuICBpZiAoIShpbml0aWFsICYgMHg4MCkpIHtcbiAgICByZXR1cm4gaW5pdGlhbDtcbiAgfVxuICB2YXIgb2N0ZXRMZW4gPSBpbml0aWFsICYgMHhmO1xuICB2YXIgdmFsID0gMDtcbiAgZm9yICh2YXIgaSA9IDAsIG9mZiA9IHAucGxhY2U7IGkgPCBvY3RldExlbjsgaSsrLCBvZmYrKykge1xuICAgIHZhbCA8PD0gODtcbiAgICB2YWwgfD0gYnVmW29mZl07XG4gIH1cbiAgcC5wbGFjZSA9IG9mZjtcbiAgcmV0dXJuIHZhbDtcbn1cblxuZnVuY3Rpb24gcm1QYWRkaW5nKGJ1Zikge1xuICB2YXIgaSA9IDA7XG4gIHZhciBsZW4gPSBidWYubGVuZ3RoIC0gMTtcbiAgd2hpbGUgKCFidWZbaV0gJiYgIShidWZbaSArIDFdICYgMHg4MCkgJiYgaSA8IGxlbikge1xuICAgIGkrKztcbiAgfVxuICBpZiAoaSA9PT0gMCkge1xuICAgIHJldHVybiBidWY7XG4gIH1cbiAgcmV0dXJuIGJ1Zi5zbGljZShpKTtcbn1cblxuU2lnbmF0dXJlLnByb3RvdHlwZS5faW1wb3J0REVSID0gZnVuY3Rpb24gX2ltcG9ydERFUihkYXRhLCBlbmMpIHtcbiAgZGF0YSA9IHV0aWxzLnRvQXJyYXkoZGF0YSwgZW5jKTtcbiAgdmFyIHAgPSBuZXcgUG9zaXRpb24oKTtcbiAgaWYgKGRhdGFbcC5wbGFjZSsrXSAhPT0gMHgzMCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICB2YXIgbGVuID0gZ2V0TGVuZ3RoKGRhdGEsIHApO1xuICBpZiAoKGxlbiArIHAucGxhY2UpICE9PSBkYXRhLmxlbmd0aCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoZGF0YVtwLnBsYWNlKytdICE9PSAweDAyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHZhciBybGVuID0gZ2V0TGVuZ3RoKGRhdGEsIHApO1xuICB2YXIgciA9IGRhdGEuc2xpY2UocC5wbGFjZSwgcmxlbiArIHAucGxhY2UpO1xuICBwLnBsYWNlICs9IHJsZW47XG4gIGlmIChkYXRhW3AucGxhY2UrK10gIT09IDB4MDIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdmFyIHNsZW4gPSBnZXRMZW5ndGgoZGF0YSwgcCk7XG4gIGlmIChkYXRhLmxlbmd0aCAhPT0gc2xlbiArIHAucGxhY2UpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdmFyIHMgPSBkYXRhLnNsaWNlKHAucGxhY2UsIHNsZW4gKyBwLnBsYWNlKTtcbiAgaWYgKHJbMF0gPT09IDAgJiYgKHJbMV0gJiAweDgwKSkge1xuICAgIHIgPSByLnNsaWNlKDEpO1xuICB9XG4gIGlmIChzWzBdID09PSAwICYmIChzWzFdICYgMHg4MCkpIHtcbiAgICBzID0gcy5zbGljZSgxKTtcbiAgfVxuXG4gIHRoaXMuciA9IG5ldyBCTihyKTtcbiAgdGhpcy5zID0gbmV3IEJOKHMpO1xuICB0aGlzLnJlY292ZXJ5UGFyYW0gPSBudWxsO1xuXG4gIHJldHVybiB0cnVlO1xufTtcblxuZnVuY3Rpb24gY29uc3RydWN0TGVuZ3RoKGFyciwgbGVuKSB7XG4gIGlmIChsZW4gPCAweDgwKSB7XG4gICAgYXJyLnB1c2gobGVuKTtcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIG9jdGV0cyA9IDEgKyAoTWF0aC5sb2cobGVuKSAvIE1hdGguTE4yID4+PiAzKTtcbiAgYXJyLnB1c2gob2N0ZXRzIHwgMHg4MCk7XG4gIHdoaWxlICgtLW9jdGV0cykge1xuICAgIGFyci5wdXNoKChsZW4gPj4+IChvY3RldHMgPDwgMykpICYgMHhmZik7XG4gIH1cbiAgYXJyLnB1c2gobGVuKTtcbn1cblxuU2lnbmF0dXJlLnByb3RvdHlwZS50b0RFUiA9IGZ1bmN0aW9uIHRvREVSKGVuYykge1xuICB2YXIgciA9IHRoaXMuci50b0FycmF5KCk7XG4gIHZhciBzID0gdGhpcy5zLnRvQXJyYXkoKTtcblxuICAvLyBQYWQgdmFsdWVzXG4gIGlmIChyWzBdICYgMHg4MClcbiAgICByID0gWyAwIF0uY29uY2F0KHIpO1xuICAvLyBQYWQgdmFsdWVzXG4gIGlmIChzWzBdICYgMHg4MClcbiAgICBzID0gWyAwIF0uY29uY2F0KHMpO1xuXG4gIHIgPSBybVBhZGRpbmcocik7XG4gIHMgPSBybVBhZGRpbmcocyk7XG5cbiAgd2hpbGUgKCFzWzBdICYmICEoc1sxXSAmIDB4ODApKSB7XG4gICAgcyA9IHMuc2xpY2UoMSk7XG4gIH1cbiAgdmFyIGFyciA9IFsgMHgwMiBdO1xuICBjb25zdHJ1Y3RMZW5ndGgoYXJyLCByLmxlbmd0aCk7XG4gIGFyciA9IGFyci5jb25jYXQocik7XG4gIGFyci5wdXNoKDB4MDIpO1xuICBjb25zdHJ1Y3RMZW5ndGgoYXJyLCBzLmxlbmd0aCk7XG4gIHZhciBiYWNrSGFsZiA9IGFyci5jb25jYXQocyk7XG4gIHZhciByZXMgPSBbIDB4MzAgXTtcbiAgY29uc3RydWN0TGVuZ3RoKHJlcywgYmFja0hhbGYubGVuZ3RoKTtcbiAgcmVzID0gcmVzLmNvbmNhdChiYWNrSGFsZik7XG4gIHJldHVybiB1dGlscy5lbmNvZGUocmVzLCBlbmMpO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGhhc2ggPSByZXF1aXJlKCdoYXNoLmpzJyk7XG52YXIgZWxsaXB0aWMgPSByZXF1aXJlKCcuLi8uLi9lbGxpcHRpYycpO1xudmFyIHV0aWxzID0gZWxsaXB0aWMudXRpbHM7XG52YXIgYXNzZXJ0ID0gdXRpbHMuYXNzZXJ0O1xudmFyIHBhcnNlQnl0ZXMgPSB1dGlscy5wYXJzZUJ5dGVzO1xudmFyIEtleVBhaXIgPSByZXF1aXJlKCcuL2tleScpO1xudmFyIFNpZ25hdHVyZSA9IHJlcXVpcmUoJy4vc2lnbmF0dXJlJyk7XG5cbmZ1bmN0aW9uIEVERFNBKGN1cnZlKSB7XG4gIGFzc2VydChjdXJ2ZSA9PT0gJ2VkMjU1MTknLCAnb25seSB0ZXN0ZWQgd2l0aCBlZDI1NTE5IHNvIGZhcicpO1xuXG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBFRERTQSkpXG4gICAgcmV0dXJuIG5ldyBFRERTQShjdXJ2ZSk7XG5cbiAgdmFyIGN1cnZlID0gZWxsaXB0aWMuY3VydmVzW2N1cnZlXS5jdXJ2ZTtcbiAgdGhpcy5jdXJ2ZSA9IGN1cnZlO1xuICB0aGlzLmcgPSBjdXJ2ZS5nO1xuICB0aGlzLmcucHJlY29tcHV0ZShjdXJ2ZS5uLmJpdExlbmd0aCgpICsgMSk7XG5cbiAgdGhpcy5wb2ludENsYXNzID0gY3VydmUucG9pbnQoKS5jb25zdHJ1Y3RvcjtcbiAgdGhpcy5lbmNvZGluZ0xlbmd0aCA9IE1hdGguY2VpbChjdXJ2ZS5uLmJpdExlbmd0aCgpIC8gOCk7XG4gIHRoaXMuaGFzaCA9IGhhc2guc2hhNTEyO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEVERFNBO1xuXG4vKipcbiogQHBhcmFtIHtBcnJheXxTdHJpbmd9IG1lc3NhZ2UgLSBtZXNzYWdlIGJ5dGVzXG4qIEBwYXJhbSB7QXJyYXl8U3RyaW5nfEtleVBhaXJ9IHNlY3JldCAtIHNlY3JldCBieXRlcyBvciBhIGtleXBhaXJcbiogQHJldHVybnMge1NpZ25hdHVyZX0gLSBzaWduYXR1cmVcbiovXG5FRERTQS5wcm90b3R5cGUuc2lnbiA9IGZ1bmN0aW9uIHNpZ24obWVzc2FnZSwgc2VjcmV0KSB7XG4gIG1lc3NhZ2UgPSBwYXJzZUJ5dGVzKG1lc3NhZ2UpO1xuICB2YXIga2V5ID0gdGhpcy5rZXlGcm9tU2VjcmV0KHNlY3JldCk7XG4gIHZhciByID0gdGhpcy5oYXNoSW50KGtleS5tZXNzYWdlUHJlZml4KCksIG1lc3NhZ2UpO1xuICB2YXIgUiA9IHRoaXMuZy5tdWwocik7XG4gIHZhciBSZW5jb2RlZCA9IHRoaXMuZW5jb2RlUG9pbnQoUik7XG4gIHZhciBzXyA9IHRoaXMuaGFzaEludChSZW5jb2RlZCwga2V5LnB1YkJ5dGVzKCksIG1lc3NhZ2UpXG4gICAgICAgICAgICAgICAubXVsKGtleS5wcml2KCkpO1xuICB2YXIgUyA9IHIuYWRkKHNfKS51bW9kKHRoaXMuY3VydmUubik7XG4gIHJldHVybiB0aGlzLm1ha2VTaWduYXR1cmUoeyBSOiBSLCBTOiBTLCBSZW5jb2RlZDogUmVuY29kZWQgfSk7XG59O1xuXG4vKipcbiogQHBhcmFtIHtBcnJheX0gbWVzc2FnZSAtIG1lc3NhZ2UgYnl0ZXNcbiogQHBhcmFtIHtBcnJheXxTdHJpbmd8U2lnbmF0dXJlfSBzaWcgLSBzaWcgYnl0ZXNcbiogQHBhcmFtIHtBcnJheXxTdHJpbmd8UG9pbnR8S2V5UGFpcn0gcHViIC0gcHVibGljIGtleVxuKiBAcmV0dXJucyB7Qm9vbGVhbn0gLSB0cnVlIGlmIHB1YmxpYyBrZXkgbWF0Y2hlcyBzaWcgb2YgbWVzc2FnZVxuKi9cbkVERFNBLnByb3RvdHlwZS52ZXJpZnkgPSBmdW5jdGlvbiB2ZXJpZnkobWVzc2FnZSwgc2lnLCBwdWIpIHtcbiAgbWVzc2FnZSA9IHBhcnNlQnl0ZXMobWVzc2FnZSk7XG4gIHNpZyA9IHRoaXMubWFrZVNpZ25hdHVyZShzaWcpO1xuICB2YXIga2V5ID0gdGhpcy5rZXlGcm9tUHVibGljKHB1Yik7XG4gIHZhciBoID0gdGhpcy5oYXNoSW50KHNpZy5SZW5jb2RlZCgpLCBrZXkucHViQnl0ZXMoKSwgbWVzc2FnZSk7XG4gIHZhciBTRyA9IHRoaXMuZy5tdWwoc2lnLlMoKSk7XG4gIHZhciBScGx1c0FoID0gc2lnLlIoKS5hZGQoa2V5LnB1YigpLm11bChoKSk7XG4gIHJldHVybiBScGx1c0FoLmVxKFNHKTtcbn07XG5cbkVERFNBLnByb3RvdHlwZS5oYXNoSW50ID0gZnVuY3Rpb24gaGFzaEludCgpIHtcbiAgdmFyIGhhc2ggPSB0aGlzLmhhc2goKTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspXG4gICAgaGFzaC51cGRhdGUoYXJndW1lbnRzW2ldKTtcbiAgcmV0dXJuIHV0aWxzLmludEZyb21MRShoYXNoLmRpZ2VzdCgpKS51bW9kKHRoaXMuY3VydmUubik7XG59O1xuXG5FRERTQS5wcm90b3R5cGUua2V5RnJvbVB1YmxpYyA9IGZ1bmN0aW9uIGtleUZyb21QdWJsaWMocHViKSB7XG4gIHJldHVybiBLZXlQYWlyLmZyb21QdWJsaWModGhpcywgcHViKTtcbn07XG5cbkVERFNBLnByb3RvdHlwZS5rZXlGcm9tU2VjcmV0ID0gZnVuY3Rpb24ga2V5RnJvbVNlY3JldChzZWNyZXQpIHtcbiAgcmV0dXJuIEtleVBhaXIuZnJvbVNlY3JldCh0aGlzLCBzZWNyZXQpO1xufTtcblxuRUREU0EucHJvdG90eXBlLm1ha2VTaWduYXR1cmUgPSBmdW5jdGlvbiBtYWtlU2lnbmF0dXJlKHNpZykge1xuICBpZiAoc2lnIGluc3RhbmNlb2YgU2lnbmF0dXJlKVxuICAgIHJldHVybiBzaWc7XG4gIHJldHVybiBuZXcgU2lnbmF0dXJlKHRoaXMsIHNpZyk7XG59O1xuXG4vKipcbiogKiBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvZHJhZnQtam9zZWZzc29uLWVkZHNhLWVkMjU1MTktMDMjc2VjdGlvbi01LjJcbipcbiogRUREU0EgZGVmaW5lcyBtZXRob2RzIGZvciBlbmNvZGluZyBhbmQgZGVjb2RpbmcgcG9pbnRzIGFuZCBpbnRlZ2Vycy4gVGhlc2UgYXJlXG4qIGhlbHBlciBjb252ZW5pZW5jZSBtZXRob2RzLCB0aGF0IHBhc3MgYWxvbmcgdG8gdXRpbGl0eSBmdW5jdGlvbnMgaW1wbGllZFxuKiBwYXJhbWV0ZXJzLlxuKlxuKi9cbkVERFNBLnByb3RvdHlwZS5lbmNvZGVQb2ludCA9IGZ1bmN0aW9uIGVuY29kZVBvaW50KHBvaW50KSB7XG4gIHZhciBlbmMgPSBwb2ludC5nZXRZKCkudG9BcnJheSgnbGUnLCB0aGlzLmVuY29kaW5nTGVuZ3RoKTtcbiAgZW5jW3RoaXMuZW5jb2RpbmdMZW5ndGggLSAxXSB8PSBwb2ludC5nZXRYKCkuaXNPZGQoKSA/IDB4ODAgOiAwO1xuICByZXR1cm4gZW5jO1xufTtcblxuRUREU0EucHJvdG90eXBlLmRlY29kZVBvaW50ID0gZnVuY3Rpb24gZGVjb2RlUG9pbnQoYnl0ZXMpIHtcbiAgYnl0ZXMgPSB1dGlscy5wYXJzZUJ5dGVzKGJ5dGVzKTtcblxuICB2YXIgbGFzdEl4ID0gYnl0ZXMubGVuZ3RoIC0gMTtcbiAgdmFyIG5vcm1lZCA9IGJ5dGVzLnNsaWNlKDAsIGxhc3RJeCkuY29uY2F0KGJ5dGVzW2xhc3RJeF0gJiB+MHg4MCk7XG4gIHZhciB4SXNPZGQgPSAoYnl0ZXNbbGFzdEl4XSAmIDB4ODApICE9PSAwO1xuXG4gIHZhciB5ID0gdXRpbHMuaW50RnJvbUxFKG5vcm1lZCk7XG4gIHJldHVybiB0aGlzLmN1cnZlLnBvaW50RnJvbVkoeSwgeElzT2RkKTtcbn07XG5cbkVERFNBLnByb3RvdHlwZS5lbmNvZGVJbnQgPSBmdW5jdGlvbiBlbmNvZGVJbnQobnVtKSB7XG4gIHJldHVybiBudW0udG9BcnJheSgnbGUnLCB0aGlzLmVuY29kaW5nTGVuZ3RoKTtcbn07XG5cbkVERFNBLnByb3RvdHlwZS5kZWNvZGVJbnQgPSBmdW5jdGlvbiBkZWNvZGVJbnQoYnl0ZXMpIHtcbiAgcmV0dXJuIHV0aWxzLmludEZyb21MRShieXRlcyk7XG59O1xuXG5FRERTQS5wcm90b3R5cGUuaXNQb2ludCA9IGZ1bmN0aW9uIGlzUG9pbnQodmFsKSB7XG4gIHJldHVybiB2YWwgaW5zdGFuY2VvZiB0aGlzLnBvaW50Q2xhc3M7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZWxsaXB0aWMgPSByZXF1aXJlKCcuLi8uLi9lbGxpcHRpYycpO1xudmFyIHV0aWxzID0gZWxsaXB0aWMudXRpbHM7XG52YXIgYXNzZXJ0ID0gdXRpbHMuYXNzZXJ0O1xudmFyIHBhcnNlQnl0ZXMgPSB1dGlscy5wYXJzZUJ5dGVzO1xudmFyIGNhY2hlZFByb3BlcnR5ID0gdXRpbHMuY2FjaGVkUHJvcGVydHk7XG5cbi8qKlxuKiBAcGFyYW0ge0VERFNBfSBlZGRzYSAtIGluc3RhbmNlXG4qIEBwYXJhbSB7T2JqZWN0fSBwYXJhbXMgLSBwdWJsaWMvcHJpdmF0ZSBrZXkgcGFyYW1ldGVyc1xuKlxuKiBAcGFyYW0ge0FycmF5PEJ5dGU+fSBbcGFyYW1zLnNlY3JldF0gLSBzZWNyZXQgc2VlZCBieXRlc1xuKiBAcGFyYW0ge1BvaW50fSBbcGFyYW1zLnB1Yl0gLSBwdWJsaWMga2V5IHBvaW50IChha2EgYEFgIGluIGVkZHNhIHRlcm1zKVxuKiBAcGFyYW0ge0FycmF5PEJ5dGU+fSBbcGFyYW1zLnB1Yl0gLSBwdWJsaWMga2V5IHBvaW50IGVuY29kZWQgYXMgYnl0ZXNcbipcbiovXG5mdW5jdGlvbiBLZXlQYWlyKGVkZHNhLCBwYXJhbXMpIHtcbiAgdGhpcy5lZGRzYSA9IGVkZHNhO1xuICB0aGlzLl9zZWNyZXQgPSBwYXJzZUJ5dGVzKHBhcmFtcy5zZWNyZXQpO1xuICBpZiAoZWRkc2EuaXNQb2ludChwYXJhbXMucHViKSlcbiAgICB0aGlzLl9wdWIgPSBwYXJhbXMucHViO1xuICBlbHNlXG4gICAgdGhpcy5fcHViQnl0ZXMgPSBwYXJzZUJ5dGVzKHBhcmFtcy5wdWIpO1xufVxuXG5LZXlQYWlyLmZyb21QdWJsaWMgPSBmdW5jdGlvbiBmcm9tUHVibGljKGVkZHNhLCBwdWIpIHtcbiAgaWYgKHB1YiBpbnN0YW5jZW9mIEtleVBhaXIpXG4gICAgcmV0dXJuIHB1YjtcbiAgcmV0dXJuIG5ldyBLZXlQYWlyKGVkZHNhLCB7IHB1YjogcHViIH0pO1xufTtcblxuS2V5UGFpci5mcm9tU2VjcmV0ID0gZnVuY3Rpb24gZnJvbVNlY3JldChlZGRzYSwgc2VjcmV0KSB7XG4gIGlmIChzZWNyZXQgaW5zdGFuY2VvZiBLZXlQYWlyKVxuICAgIHJldHVybiBzZWNyZXQ7XG4gIHJldHVybiBuZXcgS2V5UGFpcihlZGRzYSwgeyBzZWNyZXQ6IHNlY3JldCB9KTtcbn07XG5cbktleVBhaXIucHJvdG90eXBlLnNlY3JldCA9IGZ1bmN0aW9uIHNlY3JldCgpIHtcbiAgcmV0dXJuIHRoaXMuX3NlY3JldDtcbn07XG5cbmNhY2hlZFByb3BlcnR5KEtleVBhaXIsICdwdWJCeXRlcycsIGZ1bmN0aW9uIHB1YkJ5dGVzKCkge1xuICByZXR1cm4gdGhpcy5lZGRzYS5lbmNvZGVQb2ludCh0aGlzLnB1YigpKTtcbn0pO1xuXG5jYWNoZWRQcm9wZXJ0eShLZXlQYWlyLCAncHViJywgZnVuY3Rpb24gcHViKCkge1xuICBpZiAodGhpcy5fcHViQnl0ZXMpXG4gICAgcmV0dXJuIHRoaXMuZWRkc2EuZGVjb2RlUG9pbnQodGhpcy5fcHViQnl0ZXMpO1xuICByZXR1cm4gdGhpcy5lZGRzYS5nLm11bCh0aGlzLnByaXYoKSk7XG59KTtcblxuY2FjaGVkUHJvcGVydHkoS2V5UGFpciwgJ3ByaXZCeXRlcycsIGZ1bmN0aW9uIHByaXZCeXRlcygpIHtcbiAgdmFyIGVkZHNhID0gdGhpcy5lZGRzYTtcbiAgdmFyIGhhc2ggPSB0aGlzLmhhc2goKTtcbiAgdmFyIGxhc3RJeCA9IGVkZHNhLmVuY29kaW5nTGVuZ3RoIC0gMTtcblxuICB2YXIgYSA9IGhhc2guc2xpY2UoMCwgZWRkc2EuZW5jb2RpbmdMZW5ndGgpO1xuICBhWzBdICY9IDI0ODtcbiAgYVtsYXN0SXhdICY9IDEyNztcbiAgYVtsYXN0SXhdIHw9IDY0O1xuXG4gIHJldHVybiBhO1xufSk7XG5cbmNhY2hlZFByb3BlcnR5KEtleVBhaXIsICdwcml2JywgZnVuY3Rpb24gcHJpdigpIHtcbiAgcmV0dXJuIHRoaXMuZWRkc2EuZGVjb2RlSW50KHRoaXMucHJpdkJ5dGVzKCkpO1xufSk7XG5cbmNhY2hlZFByb3BlcnR5KEtleVBhaXIsICdoYXNoJywgZnVuY3Rpb24gaGFzaCgpIHtcbiAgcmV0dXJuIHRoaXMuZWRkc2EuaGFzaCgpLnVwZGF0ZSh0aGlzLnNlY3JldCgpKS5kaWdlc3QoKTtcbn0pO1xuXG5jYWNoZWRQcm9wZXJ0eShLZXlQYWlyLCAnbWVzc2FnZVByZWZpeCcsIGZ1bmN0aW9uIG1lc3NhZ2VQcmVmaXgoKSB7XG4gIHJldHVybiB0aGlzLmhhc2goKS5zbGljZSh0aGlzLmVkZHNhLmVuY29kaW5nTGVuZ3RoKTtcbn0pO1xuXG5LZXlQYWlyLnByb3RvdHlwZS5zaWduID0gZnVuY3Rpb24gc2lnbihtZXNzYWdlKSB7XG4gIGFzc2VydCh0aGlzLl9zZWNyZXQsICdLZXlQYWlyIGNhbiBvbmx5IHZlcmlmeScpO1xuICByZXR1cm4gdGhpcy5lZGRzYS5zaWduKG1lc3NhZ2UsIHRoaXMpO1xufTtcblxuS2V5UGFpci5wcm90b3R5cGUudmVyaWZ5ID0gZnVuY3Rpb24gdmVyaWZ5KG1lc3NhZ2UsIHNpZykge1xuICByZXR1cm4gdGhpcy5lZGRzYS52ZXJpZnkobWVzc2FnZSwgc2lnLCB0aGlzKTtcbn07XG5cbktleVBhaXIucHJvdG90eXBlLmdldFNlY3JldCA9IGZ1bmN0aW9uIGdldFNlY3JldChlbmMpIHtcbiAgYXNzZXJ0KHRoaXMuX3NlY3JldCwgJ0tleVBhaXIgaXMgcHVibGljIG9ubHknKTtcbiAgcmV0dXJuIHV0aWxzLmVuY29kZSh0aGlzLnNlY3JldCgpLCBlbmMpO1xufTtcblxuS2V5UGFpci5wcm90b3R5cGUuZ2V0UHVibGljID0gZnVuY3Rpb24gZ2V0UHVibGljKGVuYykge1xuICByZXR1cm4gdXRpbHMuZW5jb2RlKHRoaXMucHViQnl0ZXMoKSwgZW5jKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gS2V5UGFpcjtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIEJOID0gcmVxdWlyZSgnYm4uanMnKTtcbnZhciBlbGxpcHRpYyA9IHJlcXVpcmUoJy4uLy4uL2VsbGlwdGljJyk7XG52YXIgdXRpbHMgPSBlbGxpcHRpYy51dGlscztcbnZhciBhc3NlcnQgPSB1dGlscy5hc3NlcnQ7XG52YXIgY2FjaGVkUHJvcGVydHkgPSB1dGlscy5jYWNoZWRQcm9wZXJ0eTtcbnZhciBwYXJzZUJ5dGVzID0gdXRpbHMucGFyc2VCeXRlcztcblxuLyoqXG4qIEBwYXJhbSB7RUREU0F9IGVkZHNhIC0gZWRkc2EgaW5zdGFuY2VcbiogQHBhcmFtIHtBcnJheTxCeXRlcz58T2JqZWN0fSBzaWcgLVxuKiBAcGFyYW0ge0FycmF5PEJ5dGVzPnxQb2ludH0gW3NpZy5SXSAtIFIgcG9pbnQgYXMgUG9pbnQgb3IgYnl0ZXNcbiogQHBhcmFtIHtBcnJheTxCeXRlcz58Ym59IFtzaWcuU10gLSBTIHNjYWxhciBhcyBibiBvciBieXRlc1xuKiBAcGFyYW0ge0FycmF5PEJ5dGVzPn0gW3NpZy5SZW5jb2RlZF0gLSBSIHBvaW50IGVuY29kZWRcbiogQHBhcmFtIHtBcnJheTxCeXRlcz59IFtzaWcuU2VuY29kZWRdIC0gUyBzY2FsYXIgZW5jb2RlZFxuKi9cbmZ1bmN0aW9uIFNpZ25hdHVyZShlZGRzYSwgc2lnKSB7XG4gIHRoaXMuZWRkc2EgPSBlZGRzYTtcblxuICBpZiAodHlwZW9mIHNpZyAhPT0gJ29iamVjdCcpXG4gICAgc2lnID0gcGFyc2VCeXRlcyhzaWcpO1xuXG4gIGlmIChBcnJheS5pc0FycmF5KHNpZykpIHtcbiAgICBzaWcgPSB7XG4gICAgICBSOiBzaWcuc2xpY2UoMCwgZWRkc2EuZW5jb2RpbmdMZW5ndGgpLFxuICAgICAgUzogc2lnLnNsaWNlKGVkZHNhLmVuY29kaW5nTGVuZ3RoKVxuICAgIH07XG4gIH1cblxuICBhc3NlcnQoc2lnLlIgJiYgc2lnLlMsICdTaWduYXR1cmUgd2l0aG91dCBSIG9yIFMnKTtcblxuICBpZiAoZWRkc2EuaXNQb2ludChzaWcuUikpXG4gICAgdGhpcy5fUiA9IHNpZy5SO1xuICBpZiAoc2lnLlMgaW5zdGFuY2VvZiBCTilcbiAgICB0aGlzLl9TID0gc2lnLlM7XG5cbiAgdGhpcy5fUmVuY29kZWQgPSBBcnJheS5pc0FycmF5KHNpZy5SKSA/IHNpZy5SIDogc2lnLlJlbmNvZGVkO1xuICB0aGlzLl9TZW5jb2RlZCA9IEFycmF5LmlzQXJyYXkoc2lnLlMpID8gc2lnLlMgOiBzaWcuU2VuY29kZWQ7XG59XG5cbmNhY2hlZFByb3BlcnR5KFNpZ25hdHVyZSwgJ1MnLCBmdW5jdGlvbiBTKCkge1xuICByZXR1cm4gdGhpcy5lZGRzYS5kZWNvZGVJbnQodGhpcy5TZW5jb2RlZCgpKTtcbn0pO1xuXG5jYWNoZWRQcm9wZXJ0eShTaWduYXR1cmUsICdSJywgZnVuY3Rpb24gUigpIHtcbiAgcmV0dXJuIHRoaXMuZWRkc2EuZGVjb2RlUG9pbnQodGhpcy5SZW5jb2RlZCgpKTtcbn0pO1xuXG5jYWNoZWRQcm9wZXJ0eShTaWduYXR1cmUsICdSZW5jb2RlZCcsIGZ1bmN0aW9uIFJlbmNvZGVkKCkge1xuICByZXR1cm4gdGhpcy5lZGRzYS5lbmNvZGVQb2ludCh0aGlzLlIoKSk7XG59KTtcblxuY2FjaGVkUHJvcGVydHkoU2lnbmF0dXJlLCAnU2VuY29kZWQnLCBmdW5jdGlvbiBTZW5jb2RlZCgpIHtcbiAgcmV0dXJuIHRoaXMuZWRkc2EuZW5jb2RlSW50KHRoaXMuUygpKTtcbn0pO1xuXG5TaWduYXR1cmUucHJvdG90eXBlLnRvQnl0ZXMgPSBmdW5jdGlvbiB0b0J5dGVzKCkge1xuICByZXR1cm4gdGhpcy5SZW5jb2RlZCgpLmNvbmNhdCh0aGlzLlNlbmNvZGVkKCkpO1xufTtcblxuU2lnbmF0dXJlLnByb3RvdHlwZS50b0hleCA9IGZ1bmN0aW9uIHRvSGV4KCkge1xuICByZXR1cm4gdXRpbHMuZW5jb2RlKHRoaXMudG9CeXRlcygpLCAnaGV4JykudG9VcHBlckNhc2UoKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gU2lnbmF0dXJlO1xuIiwibW9kdWxlLmV4cG9ydHMgPSB7XG4gIGRvdWJsZXM6IHtcbiAgICBzdGVwOiA0LFxuICAgIHBvaW50czogW1xuICAgICAgW1xuICAgICAgICAnZTYwZmNlOTNiNTllOWVjNTMwMTFhYWJjMjFjMjNlOTdiMmEzMTM2OWI4N2E1YWU5YzQ0ZWU4OWUyYTZkZWMwYScsXG4gICAgICAgICdmN2UzNTA3Mzk5ZTU5NTkyOWRiOTlmMzRmNTc5MzcxMDEyOTY4OTFlNDRkMjNmMGJlMWYzMmNjZTY5NjE2ODIxJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzgyODIyNjMyMTJjNjA5ZDllYTJhNmUzZTE3MmRlMjM4ZDhjMzljYWJkNWFjMWNhMTA2NDZlMjNmZDVmNTE1MDgnLFxuICAgICAgICAnMTFmOGE4MDk4NTU3ZGZlNDVlODI1NmU4MzBiNjBhY2U2MmQ2MTNhYzJmN2IxN2JlZDMxYjZlYWZmNmUyNmNhZidcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICcxNzVlMTU5ZjcyOGI4NjVhNzJmOTljYzZjNmZjODQ2ZGUwYjkzODMzZmQyMjIyZWQ3M2ZjZTViNTUxZTViNzM5JyxcbiAgICAgICAgJ2QzNTA2ZTBkOWUzYzc5ZWJhNGVmOTdhNTFmZjcxZjVlYWNiNTk1NWFkZDI0MzQ1YzZlZmE2ZmZlZTlmZWQ2OTUnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnMzYzZDkwZDQ0N2IwMGM5Yzk5Y2VhYzA1YjYyNjJlZTA1MzQ0MWM3ZTU1NTUyZmZlNTI2YmFkOGY4M2ZmNDY0MCcsXG4gICAgICAgICc0ZTI3M2FkZmM3MzIyMjE5NTNiNDQ1Mzk3ZjMzNjMxNDViOWE4OTAwODE5OWVjYjYyMDAzYzdmM2JlZTlkZTknXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnOGI0YjVmMTY1ZGYzYzJiZThjNjI0NGI1Yjc0NTYzODg0M2U0YTc4MWExNWJjZDFiNjlmNzlhNTVkZmZkZjgwYycsXG4gICAgICAgICc0YWFkMGE2ZjY4ZDMwOGI0YjNmYmQ3ODEzYWIwZGEwNGY5ZTMzNjU0NjE2MmVlNTZiM2VmZjBjNjVmZDRmZDM2J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzcyM2NiYWE2ZTVkYjk5NmQ2YmY3NzFjMDBiZDU0OGM3YjcwMGRiZmZhNmMwZTc3YmNiNjExNTkyNTIzMmZjZGEnLFxuICAgICAgICAnOTZlODY3YjU1OTVjYzQ5OGE5MjExMzc0ODg4MjRkNmUyNjYwYTA2NTM3Nzk0OTQ4MDFkYzA2OWQ5ZWIzOWY1ZidcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdlZWJmYTRkNDkzYmViZjk4YmE1ZmVlYzgxMmMyZDNiNTA5NDc5NjEyMzdhOTE5ODM5YTUzM2VjYTBlN2RkN2ZhJyxcbiAgICAgICAgJzVkOWE4Y2EzOTcwZWYwZjI2OWVlN2VkYWYxNzgwODlkOWFlNGNkYzNhNzExZjcxMmRkZmQ0ZmRhZTFkZTg5OTknXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnMTAwZjQ0ZGE2OTZlNzE2NzI3OTFkMGEwOWI3YmRlNDU5ZjEyMTVhMjliM2MwM2JmZWZkNzgzNWIzOWE0OGRiMCcsXG4gICAgICAgICdjZGQ5ZTEzMTkyYTAwYjc3MmVjOGYzMzAwYzA5MDY2NmI3ZmY0YTE4ZmY1MTk1YWMwZmJkNWNkNjJiYzY1YTA5J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2UxMDMxYmUyNjJjN2VkMWIxZGM5MjI3YTRhMDRjMDE3YTc3ZjhkNDQ2NGYzYjM4NTJjOGFjZGU2ZTUzNGZkMmQnLFxuICAgICAgICAnOWQ3MDYxOTI4OTQwNDA1ZTZiYjZhNDE3NjU5NzUzNWFmMjkyZGQ0MTllMWNlZDc5YTQ0ZjE4ZjI5NDU2YTAwZCdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdmZWVhNmNhZTQ2ZDU1YjUzMGFjMjgzOWYxNDNiZDdlYzVjZjhiMjY2YTQxZDZhZjUyZDVlNjg4ZDkwOTQ2OTZkJyxcbiAgICAgICAgJ2U1N2M2YjZjOTdkY2UxYmFiMDZlNGUxMmJmM2VjZDVjOTgxYzg5NTdjYzQxNDQyZDMxNTVkZWJmMTgwOTAwODgnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnZGE2N2E5MWQ5MTA0OWNkY2IzNjdiZTRiZTZmZmNhM2NmZWVkNjU3ZDgwODU4M2RlMzNmYTk3OGJjMWVjNmNiMScsXG4gICAgICAgICc5YmFjYWEzNTQ4MTY0MmJjNDFmNDYzZjdlYzk3ODBlNWRlYzdhZGM1MDhmNzQwYTE3ZTllYThlMjdhNjhiZTFkJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzUzOTA0ZmFhMGIzMzRjZGRhNmUwMDA5MzVlZjIyMTUxZWMwOGQwZjdiYjExMDY5ZjU3NTQ1Y2NjMWEzN2I3YzAnLFxuICAgICAgICAnNWJjMDg3ZDBiYzgwMTA2ZDg4YzllY2NhYzIwZDNjMWMxMzk5OTk4MWUxNDQzNDY5OWRjYjA5NmIwMjI3NzFjOCdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc4ZTdiY2QwYmQzNTk4M2E3NzE5Y2NhNzc2NGNhOTA2Nzc5YjUzYTA0M2E5YjhiY2FlZmY5NTlmNDNhZDg2MDQ3JyxcbiAgICAgICAgJzEwYjc3NzBiMmEzZGE0YjM5NDAzMTA0MjBjYTk1MTQ1NzllODhlMmU0N2ZkNjhiM2VhMTAwNDdlODQ2MDM3MmEnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnMzg1ZWVkMzRjMWNkZmYyMWU2ZDA4MTg2ODliODFiZGU3MWE3ZjRmMTgzOTdlNjY5MGE4NDFlMTU5OWM0Mzg2MicsXG4gICAgICAgICcyODNiZWJjM2U4ZWEyM2Y1NjcwMWRlMTllOWViZjQ1NzZiMzA0ZWVjMjA4NmRjOGNjMDQ1OGZlNTU0MmU1NDUzJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzZmOWQ5YjgwM2VjZjE5MTYzN2M3M2E0NDEzZGZhMTgwZmRkZjg0YTU5NDdmYmM5YzYwNmVkODZjM2ZhYzNhNycsXG4gICAgICAgICc3YzgwYzY4ZTYwMzA1OWJhNjliOGUyYTMwZTQ1YzRkNDdlYTRkZDJmNWMyODEwMDJkODY4OTA2MDNhODQyMTYwJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzMzMjJkNDAxMjQzYzRlMjU4MmEyMTQ3YzEwNGQ2ZWNiZjc3NGQxNjNkYjBmNWU1MzEzYjdlMGU3NDJkMGU2YmQnLFxuICAgICAgICAnNTZlNzA3OTdlOTY2NGVmNWJmYjAxOWJjNGRkYWY5YjcyODA1ZjYzZWEyODczYWY2MjRmM2EyZTk2YzI4YjJhMCdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc4NTY3MmM3ZDJkZTBiN2RhMmJkMTc3MGQ4OTY2NTg2ODc0MWIzZjlhZjc2NDMzOTc3MjFkNzRkMjgxMzRhYjgzJyxcbiAgICAgICAgJzdjNDgxYjliNWI0M2IyZWI2Mzc0MDQ5YmZhNjJjMmU1ZTc3ZjE3ZmNjNTI5OGY0NGM4ZTMwOTRmNzkwMzEzYTYnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnOTQ4YmY4MDliMTk4OGE0NmIwNmM5ZjE5MTk0MTNiMTBmOTIyNmM2MGY2Njg4MzJmZmQ5NTlhZjYwYzgyYTBhJyxcbiAgICAgICAgJzUzYTU2Mjg1NmRjYjY2NDZkYzZiNzRjNWQxYzM0MThjNmQ0ZGZmMDhjOTdjZDJiZWQ0Y2I3Zjg4ZDhjOGU1ODknXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnNjI2MGNlN2Y0NjE4MDFjMzRmMDY3Y2UwZjAyODczYThmMWIwZTQ0ZGZjNjk3NTJhY2NlY2Q4MTlmMzhmZDhlOCcsXG4gICAgICAgICdiYzJkYTgyYjZmYTViNTcxYTdmMDkwNDk3NzZhMWVmN2VjZDI5MjIzODA1MWMxOThjMWE4NGU5NWIyYjRhZTE3J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2U1MDM3ZGUwYWZjMWQ4ZDQzZDgzNDg0MTRiYmY0MTAzMDQzZWM4ZjU3NWJmZGM0MzI5NTNjYzhkMjAzN2ZhMmQnLFxuICAgICAgICAnNDU3MTUzNGJhYTk0ZDNiNWY5Zjk4ZDA5ZmI5OTBiZGRiZDVmNWIwM2VjNDgxZjEwZTBlNWRjODQxZDc1NWJkYSdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdlMDYzNzJiMGY0YTIwN2FkZjVlYTkwNWU4ZjE3NzFiNGU3ZThkYmQxYzZhNmM1YjcyNTg2NmEwYWU0ZmNlNzI1JyxcbiAgICAgICAgJzdhOTA4OTc0YmNlMThjZmUxMmEyN2JiMmFkNWE0ODhjZDc0ODRhNzc4NzEwNDg3MGIyNzAzNGY5NGVlZTMxZGQnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnMjEzYzdhNzE1Y2Q1ZDQ1MzU4ZDBiYmY5ZGMwY2UwMjIwNGIxMGJkZGUyYTNmNTg1NDBhZDY5MDhkMDU1OTc1NCcsXG4gICAgICAgICc0YjZkYWQwYjVhZTQ2MjUwNzAxM2FkMDYyNDViYTE5MGJiNDg1MGY1ZjM2YTdlZWRkZmYyYzI3NTM0YjQ1OGYyJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzRlN2MyNzJhN2FmNGIzNGU4ZGJiOTM1MmE1NDE5YTg3ZTI4MzhjNzBhZGM2MmNkZGYwY2MzYTNiMDhmYmQ1M2MnLFxuICAgICAgICAnMTc3NDljNzY2YzlkMGIxOGUxNmZkMDlmNmRlZjY4MWI1MzBiOTYxNGJmZjdkZDMzZTBiMzk0MTgxN2RjYWFlNidcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdmZWE3NGUzZGJlNzc4YjFiMTBmMjM4YWQ2MTY4NmFhNWM3NmUzZGIyYmU0MzA1NzYzMjQyN2UyODQwZmIyN2I2JyxcbiAgICAgICAgJzZlMDU2OGRiOWIwYjEzMjk3Y2Y2NzRkZWNjYjZhZjkzMTI2YjU5NmI5NzNmN2I3NzcwMWQzZGI3ZjIzY2I5NmYnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnNzZlNjQxMTNmNjc3Y2YwZTEwYTI1NzBkNTk5OTY4ZDMxNTQ0ZTE3OWI3NjA0MzI5NTJjMDJhNDQxN2JkZGUzOScsXG4gICAgICAgICdjOTBkZGY4ZGVlNGU5NWNmNTc3MDY2ZDcwNjgxZjBkMzVlMmEzM2QyYjU2ZDIwMzJiNGIxNzUyZDE5MDFhYzAxJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2M3MzhjNTZiMDNiMmFiZTFlODI4MWJhYTc0M2Y4ZjlhOGY3Y2M2NDNkZjI2Y2JlZTNhYjE1MDI0MmJjYmI4OTEnLFxuICAgICAgICAnODkzZmI1Nzg5NTFhZDI1MzdmNzE4ZjJlYWNiZmJiYmI4MjMxNGVlZjc4ODBjZmU5MTdlNzM1ZDk2OTlhODRjMydcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdkODk1NjI2NTQ4YjY1YjgxZTI2NGM3NjM3Yzk3Mjg3N2QxZDcyZTVmM2E5MjUwMTQzNzJlOWY2NTg4ZjZjMTRiJyxcbiAgICAgICAgJ2ZlYmZhYTM4ZjJiYzdlYWU3MjhlYzYwODE4YzM0MGViMDM0MjhkNjMyYmIwNjdlMTc5MzYzZWQ3NWQ3ZDk5MWYnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnYjhkYTk0MDMyYTk1NzUxOGViMGY2NDMzNTcxZTg3NjFjZWZmYzczNjkzZTg0ZWRkNDkxNTBhNTY0ZjY3NmUwMycsXG4gICAgICAgICcyODA0ZGZhNDQ4MDVhMWU0ZDdjOTljYzk3NjI4MDhiMDkyY2M1ODRkOTVmZjNiNTExNDg4ZTRlNzRlZmRmNmU3J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2U4MGZlYTE0NDQxZmIzM2E3ZDhhZGFiOTQ3NWQ3ZmFiMjAxOWVmZmI1MTU2YTc5MmYxYTExNzc4ZTNjMGRmNWQnLFxuICAgICAgICAnZWVkMWRlN2Y2MzhlMDA3NzFlODk3NjhjYTNjYTk0NDcyZDE1NWU4MGFmMzIyZWE5ZmNiNDI5MWI2YWM5ZWM3OCdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdhMzAxNjk3YmRmY2Q3MDQzMTNiYTQ4ZTUxZDU2NzU0M2YyYTE4MjAzMWVmZDY5MTVkZGMwN2JiY2M0ZTE2MDcwJyxcbiAgICAgICAgJzczNzBmOTFjZmI2N2U0ZjUwODE4MDlmYTI1ZDQwZjliMTczNWRiZjdjMGExMWExMzBjMGQxYTA0MWUxNzdlYTEnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnOTBhZDg1YjM4OWQ2YjkzNjQ2M2Y5ZDA1MTI2NzhkZTIwOGNjMzMwYjExMzA3ZmZmYWI3YWM2M2UzZmIwNGVkNCcsXG4gICAgICAgICdlNTA3YTM2MjBhMzgyNjFhZmZkY2JkOTQyNzIyMmI4MzlhZWZhYmUxNTgyODk0ZDk5MWQ0ZDQ4Y2I2ZWYxNTAnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnOGY2OGI5ZDJmNjNiNWYzMzkyMzljMWFkOTgxZjE2MmVlODhjNTY3ODcyM2VhMzM1MWI3YjQ0NGM5ZWM0YzBkYScsXG4gICAgICAgICc2NjJhOWYyZGJhMDYzOTg2ZGUxZDkwYzJiNmJlMjE1ZGJiZWEyY2ZlOTU1MTBiZmRmMjNjYmY3OTUwMWZmZjgyJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2U0ZjNmYjAxNzZhZjg1ZDY1ZmY5OWZmOTE5OGMzNjA5MWY0OGU4NjUwMzY4MWUzZTY2ODZmZDUwNTMyMzFlMTEnLFxuICAgICAgICAnMWU2MzYzM2FkMGVmNGYxYzE2NjFhNmQwZWEwMmI3Mjg2Y2M3ZTc0ZWM5NTFkMWM5ODIyYzM4NTc2ZmViNzNiYydcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc4YzAwZmE5YjE4ZWJmMzMxZWI5NjE1MzdhNDVhNDI2NmM3MDM0ZjJmMGQ0ZTFkMDcxNmZiNmVhZTIwZWFlMjllJyxcbiAgICAgICAgJ2VmYTQ3MjY3ZmVhNTIxYTFhOWRjMzQzYTM3MzZjOTc0YzJmYWRhZmE4MWUzNmM1NGU3ZDJhNGM2NjcwMjQxNGInXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnZTdhMjZjZTY5ZGQ0ODI5ZjNlMTBjZWMwYTllOThlZDMxNDNkMDg0ZjMwOGI5MmMwOTk3ZmRkZmM2MGNiM2U0MScsXG4gICAgICAgICcyYTc1OGUzMDBmYTc5ODRiNDcxYjAwNmExYWFmYmIxOGQwYTZiMmMwNDIwZTgzZTIwZThhOTQyMWNmMmNmZDUxJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2I2NDU5ZTBlZTM2NjJlYzhkMjM1NDBjMjIzYmNiZGM1NzFjYmNiOTY3ZDc5NDI0ZjNjZjI5ZWIzZGU2YjgwZWYnLFxuICAgICAgICAnNjdjODc2ZDA2ZjNlMDZkZTFkYWRmMTZlNTY2MWRiM2M0YjNhZTZkNDhlMzViMmZmMzBiZjBiNjFhNzFiYTQ1J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2Q2OGE4MGM4MjgwYmI4NDA3OTMyMzRhYTExOGYwNjIzMWQ2ZjFmYzY3ZTczYzVhNWRlZGEwZjViNDk2OTQzZTgnLFxuICAgICAgICAnZGI4YmE5ZmZmNGI1ODZkMDBjNGIxZjkxNzdiMGUyOGI1YjBlN2I4Zjc4NDUyOTVhMjk0Yzg0MjY2YjEzMzEyMCdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICczMjRhZWQ3ZGY2NWM4MDQyNTJkYzAyNzA5MDdhMzBiMDk2MTJhZWI5NzM0NDljZWE0MDk1OTgwZmMyOGQzZDVkJyxcbiAgICAgICAgJzY0OGEzNjU3NzRiNjFmMmZmMTMwYzBjMzVhZWMxZjRmMTkyMTNiMGM3ZTMzMjg0Mzk2NzIyNGFmOTZhYjdjODQnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnNGRmOWMxNDkxOWNkZTYxZjZkNTFkZmRiZTVmZWU1ZGNlZWM0MTQzYmE4ZDFjYTg4OGU4YmQzNzNmZDA1NGM5NicsXG4gICAgICAgICczNWVjNTEwOTJkODcyODA1MDk3NGMyM2ExZDg1ZDRiNWQ1MDZjZGMyODg0OTAxOTJlYmFjMDZjYWQxMGQ1ZCdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc5YzM5MTlhODRhNDc0ODcwZmFlZDhhOWMxY2M2NjAyMTUyMzQ4OTA1NGQ3ZjAzMDhjYmZjOTljOGFjMWY5OGNkJyxcbiAgICAgICAgJ2RkYjg0ZjBmNGE0ZGRkNTc1ODRmMDQ0YmYyNjBlNjQxOTA1MzI2Zjc2YzY0YzhlNmJlN2U1ZTAzZDRmYzU5OWQnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnNjA1NzE3MGIxZGQxMmZkZjhkZTA1ZjI4MWQ4ZTA2YmI5MWUxNDkzYThiOTFkNGNjNWEyMTM4MjEyMGE5NTllNScsXG4gICAgICAgICc5YTFhZjBiMjZhNmE0ODA3YWRkOWEyZGFmNzFkZjI2MjQ2NTE1MmJjM2VlMjRjNjVlODk5YmU5MzIzODVhMmE4J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2E1NzZkZjhlMjNhMDg0MTE0MjE0MzlhNDUxOGRhMzE4ODBjZWYwZmJhN2Q0ZGYxMmIxYTY5NzNlZWNiOTQyNjYnLFxuICAgICAgICAnNDBhNmJmMjBlNzY2NDBiMmM5MmI5N2FmZTU4Y2Q4MmM0MzJlMTBhN2Y1MTRkOWYzZWU4YmUxMWFlMWIyOGVjOCdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc3Nzc4YTc4YzI4ZGVjM2UzMGEwNWZlOTYyOWRlOGMzOGJiMzBkMWY1Y2Y5YTNhMjA4Zjc2Mzg4OWJlNThhZDcxJyxcbiAgICAgICAgJzM0NjI2ZDlhYjVhNWIyMmZmNzA5OGUxMmYyZmY1ODAwODdiMzg0MTFmZjI0YWM1NjNiNTEzZmMxZmQ5ZjQzYWMnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnOTI4OTU1ZWU2MzdhODQ0NjM3MjlmZDMwZTdhZmQyZWQ1Zjk2Mjc0ZTVhZDdlNWNiMDllZGE5YzA2ZDkwM2FjJyxcbiAgICAgICAgJ2MyNTYyMTAwM2QzZjQyYTgyN2I3OGExMzA5M2E5NWVlYWMzZDI2ZWZhOGE4ZDgzZmM1MTgwZTkzNWJjZDA5MWYnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnODVkMGZlZjNlYzZkYjEwOTM5OTA2NGYzYTBlM2IyODU1NjQ1YjRhOTA3YWQzNTQ1MjdhYWU3NTE2M2Q4Mjc1MScsXG4gICAgICAgICcxZjAzNjQ4NDEzYTM4YzBiZTI5ZDQ5NmU1ODJjZjU2NjNlODc1MWU5Njg3NzMzMTU4MmMyMzdhMjRlYjFmOTYyJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2ZmMmIwZGNlOTdlZWNlOTdjMWM5YjYwNDE3OThiODVkZmRmYjZkODg4MmRhMjAzMDhmNTQwNDgyNDUyNjA4N2UnLFxuICAgICAgICAnNDkzZDEzZmVmNTI0YmExODhhZjRjNGRjNTRkMDc5MzZjN2I3ZWQ2ZmI5MGUyY2ViMmM5NTFlMDFmMGMyOTkwNydcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc4MjdmYmJlNGIxZTg4MGVhOWVkMmIyZTYzMDFiMjEyYjU3ZjFlZTE0OGNkNmRkMjg3ODBlNWUyY2Y4NTZlMjQxJyxcbiAgICAgICAgJ2M2MGY5YzkyM2M3MjdiMGI3MWJlZjJjNjdkMWQxMjY4N2ZmN2E2MzE4NjkwMzE2NmQ2MDViNjhiYWVjMjkzZWMnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnZWFhNjQ5ZjIxZjUxYmRiYWU3YmU0YWUzNGNlNmU1MjE3YTU4ZmRjZTdmNDdmOWFhN2YzYjU4ZmEyMTIwZTJiMycsXG4gICAgICAgICdiZTMyNzllZDViYmJiMDNhYzY5YTgwZjg5ODc5YWE1YTAxYTZiOTY1ZjEzZjdlNTlkNDdhNTMwNWJhNWFkOTNkJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2U0YTQyZDQzYzVjZjE2OWQ5MzkxZGY2ZGVjZjQyZWU1NDFiNmQ4ZjBjOWExMzc0MDFlMjM2MzJkZGEzNGQyNGYnLFxuICAgICAgICAnNGQ5ZjkyZTcxNmQxYzczNTI2ZmM5OWNjZmI4YWQzNGNlODg2ZWVkZmE4ZDhlNGYxM2E3ZjcxMzFkZWJhOTQxNCdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICcxZWM4MGZlZjM2MGNiZGQ5NTQxNjBmYWRhYjM1MmI2YjkyYjUzNTc2YTg4ZmVhNDk0NzE3M2I5ZDQzMDBiZjE5JyxcbiAgICAgICAgJ2FlZWZlOTM3NTZiNTM0MGQyZjNhNDk1OGE3YWJiZjVlMDE0NmU3N2Y2Mjk1YTA3YjY3MWNkYzFjYzEwN2NlZmQnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnMTQ2YTc3OGMwNDY3MGMyZjkxYjAwYWY0NjgwZGZhOGJjZTM0OTA3MTdkNThiYTg4OWRkYjU5MjgzNjY2NDJiZScsXG4gICAgICAgICdiMzE4ZTBlYzMzNTQwMjhhZGQ2Njk4MjdmOWQ0YjI4NzBhYWE5NzFkMmY3ZTVlZDFkMGIyOTc0ODNkODNlZmQwJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2ZhNTBjMGY2MWQyMmU1ZjA3ZTNhY2ViYjFhYTA3YjEyOGQwMDEyMjA5YTI4Yjk3NzZkNzZhODc5MzE4MGVlZjknLFxuICAgICAgICAnNmI4NGM2OTIyMzk3ZWJhOWI3MmNkMjg3MjI4MWE2OGE1ZTY4MzI5M2E1N2EyMTNiMzhjZDhkN2QzZjRmMjgxMSdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdkYTFkNjFkMGNhNzIxYTExYjFhNWJmNmI3ZDg4ZTg0MjFhMjg4YWI1ZDViYmE1MjIwZTUzZDMyYjVmMDY3ZWMyJyxcbiAgICAgICAgJzgxNTdmNTVhN2M5OTMwNmM3OWMwNzY2MTYxYzkxZTI5NjZhNzM4OTlkMjc5YjQ4YTY1NWZiYTBmMWFkODM2ZjEnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnYThlMjgyZmYwYzk3MDY5MDcyMTVmZjk4ZThmZDQxNjYxNTMxMWRlMDQ0NmYxZTA2MmE3M2IwNjEwZDA2NGUxMycsXG4gICAgICAgICc3Zjk3MzU1YjhkYjgxYzA5YWJmYjdmM2M1YjI1MTU4ODhiNjc5YTNlNTBkZDZiZDZjZWY3YzczMTExZjRjYzBjJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzE3NGE1M2I5YzlhMjg1ODcyZDM5ZTU2ZTY5MTNjYWIxNWQ1OWIxZmE1MTI1MDhjMDIyZjM4MmRlODMxOTQ5N2MnLFxuICAgICAgICAnY2NjOWRjMzdhYmZjOWMxNjU3YjQxNTVmMmM0N2Y5ZTY2NDZiM2ExZDhjYjk4NTQzODNkYTEzYWMwNzlhZmE3MydcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc5NTkzOTY5ODE5NDM3ODVjM2QzZTU3ZWRmNTAxOGNkYmUwMzllNzMwZTQ5MThiM2Q4ODRmZGZmMDk0NzViN2JhJyxcbiAgICAgICAgJzJlN2U1NTI4ODhjMzMxZGQ4YmEwMzg2YTRiOWNkNjg0OWM2NTNmNjRjODcwOTM4NWU5YjhhYmY4NzUyNGYyZmQnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnZDJhNjNhNTBhZTQwMWU1NmQ2NDVhMTE1M2IxMDlhOGZjY2EwYTQzZDU2MWZiYTJkYmI1MTM0MGM5ZDgyYjE1MScsXG4gICAgICAgICdlODJkODZmYjY0NDNmY2I3NTY1YWVlNThiMjk0ODIyMGE3MGY3NTBhZjQ4NGNhNTJkNDE0MjE3NGRjZjg5NDA1J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzY0NTg3ZTIzMzU0NzFlYjg5MGVlNzg5NmQ3Y2ZkYzg2NmJhY2JkYmQzODM5MzE3YjM0MzZmOWI0NTYxN2UwNzMnLFxuICAgICAgICAnZDk5ZmNkZDViZjY5MDJlMmFlOTZkZDY0NDdjMjk5YTE4NWI5MGEzOTEzM2FlYWIzNTgyOTllNWU5ZmFmNjU4OSdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc4NDgxYmRlMGU0ZTRkODg1YjNhNTQ2ZDNlNTQ5ZGUwNDJmMGFhNmNlYTI1MGU3ZmQzNThkNmM4NmRkNDVlNDU4JyxcbiAgICAgICAgJzM4ZWU3YjhjYmE1NDA0ZGQ4NGEyNWJmMzljZWNiMmNhOTAwYTc5YzQyYjI2MmU1NTZkNjRiMWI1OTc3OTA1N2UnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnMTM0NjRhNTdhNzgxMDJhYTYyYjY5NzlhZTgxN2Y0NjM3ZmZjZmVkM2M0YjFjZTMwYmNkNjMwM2Y2Y2FmNjY2YicsXG4gICAgICAgICc2OWJlMTU5MDA0NjE0NTgwZWY3ZTQzMzQ1M2NjYjBjYTQ4ZjMwMGE4MWQwOTQyZTEzZjQ5NWE5MDdmNmVjYzI3J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2JjNGE5ZGY1YjcxM2ZlMmU5YWVmNDMwYmNjMWRjOTdhMGNkOWNjZWRlMmYyODU4OGNhZGEzYTBkMmQ4M2YzNjYnLFxuICAgICAgICAnZDNhODFjYTZlNzg1YzA2MzgzOTM3YWRmNGI3OThjYWE2ZThhOWZiZmE1NDdiMTZkNzU4ZDY2NjU4MWYzM2MxJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzhjMjhhOTdiZjgyOThiYzBkMjNkOGM3NDk0NTJhMzJlNjk0YjY1ZTMwYTk0NzJhMzk1NGFiMzBmZTUzMjRjYWEnLFxuICAgICAgICAnNDBhMzA0NjNhMzMwNTE5MzM3OGZlZGYzMWY3Y2MwZWI3YWU3ODRmMDQ1MWNiOTQ1OWU3MWRjNzNjYmVmOTQ4MidcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc4ZWE5NjY2MTM5NTI3YThjMWRkOTRjZTRmMDcxZmQyM2M4YjM1MGM1YTRiYjMzNzQ4YzRiYTExMWZhY2NhZTAnLFxuICAgICAgICAnNjIwZWZhYmJjOGVlMjc4MmUyNGU3YzBjZmI5NWM1ZDczNWI3ODNiZTljZjBmOGU5NTVhZjM0YTMwZTYyYjk0NSdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdkZDM2MjVmYWVmNWJhMDYwNzQ2Njk3MTZiYmQzNzg4ZDg5YmRkZTgxNTk1OTk2ODA5MmY3NmNjNGViOWE5Nzg3JyxcbiAgICAgICAgJzdhMTg4ZmEzNTIwZTMwZDQ2MWRhMjUwMTA0NTczMWNhOTQxNDYxOTgyODgzMzk1OTM3ZjY4ZDAwYzY0NGE1NzMnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnZjcxMGQ3OWQ5ZWI5NjIyOTdlNGY2MjMyYjQwZThmN2ZlYjJiYzYzODE0NjE0ZDY5MmMxMmRlNzUyNDA4MjIxZScsXG4gICAgICAgICdlYTk4ZTY3MjMyZDNiMzI5NWQzYjUzNTUzMjExNWNjYWM4NjEyYzcyMTg1MTYxNzUyNmFlNDdhOWM3N2JmYzgyJ1xuICAgICAgXVxuICAgIF1cbiAgfSxcbiAgbmFmOiB7XG4gICAgd25kOiA3LFxuICAgIHBvaW50czogW1xuICAgICAgW1xuICAgICAgICAnZjkzMDhhMDE5MjU4YzMxMDQ5MzQ0Zjg1Zjg5ZDUyMjliNTMxYzg0NTgzNmY5OWIwODYwMWYxMTNiY2UwMzZmOScsXG4gICAgICAgICczODhmN2IwZjYzMmRlODE0MGZlMzM3ZTYyYTM3ZjM1NjY1MDBhOTk5MzRjMjIzMWI2Y2I5ZmQ3NTg0YjhlNjcyJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzJmOGJkZTRkMWEwNzIwOTM1NWI0YTcyNTBhNWM1MTI4ZTg4Yjg0YmRkYzYxOWFiN2NiYThkNTY5YjI0MGVmZTQnLFxuICAgICAgICAnZDhhYzIyMjYzNmU1ZTNkNmQ0ZGJhOWRkYTZjOWM0MjZmNzg4MjcxYmFiMGQ2ODQwZGNhODdkM2FhNmFjNjJkNidcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc1Y2JkZjA2NDZlNWRiNGVhYTM5OGYzNjVmMmVhN2EwZTNkNDE5YjdlMDMzMGUzOWNlOTJiZGRlZGNhYzRmOWJjJyxcbiAgICAgICAgJzZhZWJjYTQwYmEyNTU5NjBhMzE3OGQ2ZDg2MWE1NGRiYTgxM2QwYjgxM2ZkZTdiNWE1MDgyNjI4MDg3MjY0ZGEnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnYWNkNDg0ZTJmMGM3ZjY1MzA5YWQxNzhhOWY1NTlhYmRlMDk3OTY5NzRjNTdlNzE0YzM1ZjExMGRmYzI3Y2NiZScsXG4gICAgICAgICdjYzMzODkyMWIwYTdkOWZkNjQzODA5NzE3NjNiNjFlOWFkZDg4OGE0Mzc1ZjhlMGYwNWNjMjYyYWM2NGY5YzM3J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzc3NGFlN2Y4NThhOTQxMWU1ZWY0MjQ2YjcwYzY1YWFjNTY0OTk4MGJlNWMxNzg5MWJiZWMxNzg5NWRhMDA4Y2InLFxuICAgICAgICAnZDk4NGEwMzJlYjZiNWUxOTAyNDNkZDU2ZDdiN2IzNjUzNzJkYjFlMmRmZjlkNmE4MzAxZDc0YzljOTUzYzYxYidcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdmMjg3NzNjMmQ5NzUyODhiYzdkMWQyMDVjMzc0ODY1MWIwNzVmYmM2NjEwZTU4Y2RkZWVkZGY4ZjE5NDA1YWE4JyxcbiAgICAgICAgJ2FiMDkwMmU4ZDg4MGE4OTc1ODIxMmViNjVjZGFmNDczYTFhMDZkYTUyMWZhOTFmMjliNWNiNTJkYjAzZWQ4MSdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdkNzkyNGQ0ZjdkNDNlYTk2NWE0NjVhZTMwOTVmZjQxMTMxZTU5NDZmM2M4NWY3OWU0NGFkYmNmOGUyN2UwODBlJyxcbiAgICAgICAgJzU4MWUyODcyYTg2YzcyYTY4Mzg0MmVjMjI4Y2M2ZGVmZWE0MGFmMmJkODk2ZDNhNWM1MDRkYzlmZjZhMjZiNTgnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnZGVmZGVhNGNkYjY3Nzc1MGE0MjBmZWU4MDdlYWNmMjFlYjk4OThhZTc5Yjk3Njg3NjZlNGZhYTA0YTJkNGEzNCcsXG4gICAgICAgICc0MjExYWIwNjk0NjM1MTY4ZTk5N2IwZWFkMmE5M2RhZWNlZDFmNGEwNGE5NWMwZjZjZmIxOTlmNjllNTZlYjc3J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzJiNGVhMGE3OTdhNDQzZDI5M2VmNWNmZjQ0NGY0OTc5ZjA2YWNmZWJkN2U4NmQyNzc0NzU2NTYxMzgzODViNmMnLFxuICAgICAgICAnODVlODliYzAzNzk0NWQ5M2IzNDMwODNiNWExYzg2MTMxYTAxZjYwYzUwMjY5NzYzYjU3MGM4NTRlNWMwOWI3YSdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICczNTJiYmY0YTRjZGQxMjU2NGY5M2ZhMzMyY2UzMzMzMDFkOWFkNDAyNzFmODEwNzE4MTM0MGFlZjI1YmU1OWQ1JyxcbiAgICAgICAgJzMyMWViNDA3NTM0OGY1MzRkNTljMTgyNTlkZGEzZTFmNGExYjNiMmU3MWIxMDM5YzY3YmQzZDhiY2Y4MTk5OGMnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnMmZhMjEwNGQ2YjM4ZDExYjAyMzAwMTA1NTk4NzkxMjRlNDJhYjhkZmVmZjVmZjI5ZGM5Y2RhZGQ0ZWNhY2MzZicsXG4gICAgICAgICcyZGUxMDY4Mjk1ZGQ4NjViNjQ1NjkzMzViZDVkZDgwMTgxZDcwZWNmYzg4MjY0ODQyM2JhNzZiNTMyYjdkNjcnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnOTI0ODI3OWIwOWI0ZDY4ZGFiMjFhOWIwNjZlZGRhODMyNjNjM2Q4NGUwOTU3MmUyNjljYTBjZDdmNTQ1MzcxNCcsXG4gICAgICAgICc3MzAxNmY3YmYyMzRhYWRlNWQxYWE3MWJkZWEyYjFmZjNmYzBkZTJhODg3OTEyZmZlNTRhMzJjZTk3Y2IzNDAyJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2RhZWQ0ZjJiZTNhOGJmMjc4ZTcwMTMyZmIwYmViNzUyMmY1NzBlMTQ0YmY2MTVjMDdlOTk2ZDQ0M2RlZTg3MjknLFxuICAgICAgICAnYTY5ZGNlNGE3ZDZjOThlOGQ0YTFhY2E4N2VmOGQ3MDAzZjgzYzIzMGYzYWZhNzI2YWI0MGU1MjI5MGJlMWM1NSdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdjNDRkMTJjNzA2NWQ4MTJlOGFjZjI4ZDdjYmIxOWY5MDExZWNkOWU5ZmRmMjgxYjBlNmEzYjVlODdkMjJlN2RiJyxcbiAgICAgICAgJzIxMTlhNDYwY2UzMjZjZGM3NmM0NTkyNmM5ODJmZGFjMGUxMDZlODYxZWRmNjFjNWEwMzkwNjNmMGUwZTY0ODInXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnNmEyNDViZjZkYzY5ODUwNGM4OWEyMGNmZGVkNjA4NTMxNTJiNjk1MzM2YzI4MDYzYjYxYzY1Y2JkMjY5ZTZiNCcsXG4gICAgICAgICdlMDIyY2Y0MmMyYmQ0YTcwOGIzZjUxMjZmMTZhMjRhZDhiMzNiYTQ4ZDA0MjNiNmVmZDVlNjM0ODEwMGQ4YTgyJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzE2OTdmZmE2ZmQ5ZGU2MjdjMDc3ZTNkMmZlNTQxMDg0Y2UxMzMwMGIwYmVjMTE0NmY5NWFlNTdmMGQwYmQ2YTUnLFxuICAgICAgICAnYjljMzk4ZjE4NjgwNmY1ZDI3NTYxNTA2ZTQ1NTc0MzNhMmNmMTUwMDllNDk4YWU3YWRlZTlkNjNkMDFiMjM5NidcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc2MDViZGIwMTk5ODE3MThiOTg2ZDBmMDdlODM0Y2IwZDlkZWI4MzYwZmZiN2Y2MWRmOTgyMzQ1ZWYyN2E3NDc5JyxcbiAgICAgICAgJzI5NzJkMmRlNGY4ZDIwNjgxYTc4ZDkzZWM5NmZlMjNjMjZiZmFlODRmYjE0ZGI0M2IwMWUxZTkwNTZiOGM0OSdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc2MmQxNGRhYjQxNTBiZjQ5NzQwMmZkYzQ1YTIxNWUxMGRjYjAxYzM1NDk1OWIxMGNmZTMxYzdlOWQ4N2ZmMzNkJyxcbiAgICAgICAgJzgwZmMwNmJkOGNjNWIwMTA5ODA4OGExOTUwZWVkMGRiMDFhYTEzMjk2N2FiNDcyMjM1ZjU2NDI0ODNiMjVlYWYnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnODBjNjBhZDAwNDBmMjdkYWRlNWI0YjA2YzQwOGU1NmIyYzUwZTlmNTZiOWI4YjQyNWU1NTVjMmY4NjMwOGI2ZicsXG4gICAgICAgICcxYzM4MzAzZjFjYzVjMzBmMjZlNjZiYWQ3ZmU3MmY3MGE2NWVlZDRjYmU3MDI0ZWIxYWEwMWY1NjQzMGJkNTdhJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzdhOTM3NWFkNjE2N2FkNTRhYTc0YzYzNDhjYzU0ZDM0NGNjNWRjOTQ4N2Q4NDcwNDlkNWVhYmIwZmEwM2M4ZmInLFxuICAgICAgICAnZDBlM2ZhOWVjYTg3MjY5MDk1NTllMGQ3OTI2OTA0NmJkYzU5ZWExMGM3MGNlMmIwMmQ0OTllYzIyNGRjN2Y3J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2Q1MjhlY2Q5YjY5NmI1NGM5MDdhOWVkMDQ1NDQ3YTc5YmI0MDhlYzM5YjY4ZGY1MDRiYjUxZjQ1OWJjM2ZmYzknLFxuICAgICAgICAnZWVjZjQxMjUzMTM2ZTVmOTk5NjZmMjE4ODFmZDY1NmViYzQzNDU0MDVjNTIwZGJjMDYzNDY1YjUyMTQwOTkzMydcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc0OTM3MGE0YjVmNDM0MTJlYTI1ZjUxNGU4ZWNkYWQwNTI2NjExNWU0YTdlY2IxMzg3MjMxODA4ZjhiNDU5NjMnLFxuICAgICAgICAnNzU4ZjNmNDFhZmQ2ZWQ0MjhiMzA4MWIwNTEyZmQ2MmE1NGMzZjNhZmJiNWI2NzY0YjY1MzA1MmExMjk0OWM5YSdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc3N2YyMzA5MzZlZTg4Y2JiZDczZGY5MzBkNjQ3MDJlZjg4MWQ4MTFlMGUxNDk4ZTJmMWMxM2ViMWZjMzQ1ZDc0JyxcbiAgICAgICAgJzk1OGVmNDJhNzg4NmI2NDAwYTA4MjY2ZTliYTFiMzc4OTZjOTUzMzBkOTcwNzdjYmJlOGViM2M3NjcxYzYwZDYnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnZjJkYWM5OTFjYzRjZTRiOWVhNDQ4ODdlNWM3YzBiY2U1OGM4MDA3NGFiOWQ0ZGJhZWIyODUzMWI3NzM5ZjUzMCcsXG4gICAgICAgICdlMGRlZGM5YjNiMmY4ZGFkNGRhMWYzMmRlYzI1MzFkZjllYjVmYmViMDU5OGU0ZmQxYTExN2RiYTcwM2EzYzM3J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzQ2M2IzZDlmNjYyNjIxZmIxYjRiZThmYmJlMjUyMDEyNWEyMTZjZGZjOWRhZTNkZWJjYmE0ODUwYzY5MGQ0NWInLFxuICAgICAgICAnNWVkNDMwZDc4YzI5NmMzNTQzMTE0MzA2ZGQ4NjIyZDdjNjIyZTI3Yzk3MGExZGUzMWNiMzc3YjAxYWY3MzA3ZSdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdmMTZmODA0MjQ0ZTQ2ZTJhMDkyMzJkNGFmZjNiNTk5NzZiOThmYWMxNDMyOGEyZDFhMzI0OTZiNDk5OThmMjQ3JyxcbiAgICAgICAgJ2NlZGFiZDliODIyMDNmN2UxM2QyMDZmY2RmNGUzM2Q5MmE2YzUzYzI2ZTVjY2UyNmQ2NTc5OTYyYzRlMzFkZjYnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnY2FmNzU0MjcyZGM4NDU2M2IwMzUyYjdhMTQzMTFhZjU1ZDI0NTMxNWFjZTI3YzY1MzY5ZTE1ZjcxNTFkNDFkMScsXG4gICAgICAgICdjYjQ3NDY2MGVmMzVmNWYyYTQxYjY0M2ZhNWU0NjA1NzVmNGZhOWI3OTYyMjMyYTVjMzJmOTA4MzE4YTA0NDc2J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzI2MDBjYTRiMjgyY2I5ODZmODVkMGYxNzA5OTc5ZDhiNDRhMDljMDdjYjg2ZDdjMTI0NDk3YmM4NmYwODIxMjAnLFxuICAgICAgICAnNDExOWI4ODc1M2MxNWJkNmE2OTNiMDNmY2RkYmI0NWQ1YWM2YmU3NGFiNWYwZWY0NGIwYmU5NDc1YTdlNGI0MCdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc3NjM1Y2E3MmQ3ZTg0MzJjMzM4ZWM1M2NkMTIyMjBiYzAxYzQ4Njg1ZTI0ZjdkYzhjNjAyYTc3NDY5OThlNDM1JyxcbiAgICAgICAgJzkxYjY0OTYwOTQ4OWQ2MTNkMWQ1ZTU5MGY3OGU2ZDc0ZWNmYzA2MWQ1NzA0OGJhZDllNzZmMzAyYzViOWM2MSdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc3NTRlMzIzOWYzMjU1NzBjZGJiZjRhODdkZWVlOGE2NmI3ZjJiMzM0NzlkNDY4ZmJjMWE1MDc0M2JmNTZjYzE4JyxcbiAgICAgICAgJzY3M2ZiODZlNWJkYTMwZmIzY2QwZWQzMDRlYTQ5YTAyM2VlMzNkMDE5N2E2OTVkMGM1ZDk4MDkzYzUzNjY4MydcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdlM2U2YmQxMDcxYTFlOTZhZmY1Nzg1OWM4MmQ1NzBmMDMzMDgwMDY2MWQxYzk1MmY5ZmUyNjk0NjkxZDliOWU4JyxcbiAgICAgICAgJzU5YzllMGJiYTM5NGU3NmY0MGMwYWE1ODM3OWEzY2I2YTVhMjI4Mzk5M2U5MGM0MTY3MDAyYWY0OTIwZTM3ZjUnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnMTg2YjQ4M2QwNTZhMDMzODI2YWU3M2Q4OGY3MzI5ODVjNGNjYjFmMzJiYTM1ZjRiNGNjNDdmZGNmMDRhYTZlYicsXG4gICAgICAgICczYjk1MmQzMmM2N2NmNzdlMmUxNzQ0NmUyMDQxODBhYjIxZmI4MDkwODk1MTM4YjRhNGE3OTdmODZlODA4ODhiJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2RmOWQ3MGE2Yjk4NzZjZTU0NGM5ODU2MWY0YmU0ZjcyNTQ0MmU2ZDJiNzM3ZDljOTFhODMyMTcyNGNlMDk2M2YnLFxuICAgICAgICAnNTVlYjJkYWZkODRkNmNjZDVmODYyYjc4NWRjMzlkNGFiMTU3MjIyNzIwZWY5ZGEyMTdiOGM0NWNmMmJhMjQxNydcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc1ZWRkNWNjMjNjNTFlODdhNDk3Y2E4MTVkNWRjZTBmOGFiNTI1NTRmODQ5ZWQ4OTk1ZGU2NGM1ZjM0Y2U3MTQzJyxcbiAgICAgICAgJ2VmYWU5YzhkYmMxNDEzMDY2MWU4Y2VjMDMwYzg5YWQwYzEzYzY2YzBkMTdhMjkwNWNkYzcwNmFiNzM5OWE4NjgnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnMjkwNzk4YzJiNjQ3NjgzMGRhMTJmZTAyMjg3ZTllNzc3YWEzZmJhMWMzNTViMTdhNzIyZDM2MmY4NDYxNGZiYScsXG4gICAgICAgICdlMzhkYTc2ZGNkNDQwNjIxOTg4ZDAwYmNmNzlhZjI1ZDViMjljMDk0ZGIyYTIzMTQ2ZDAwM2FmZDQxOTQzZTdhJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2FmM2M0MjNhOTVkOWY1YjMwNTQ3NTRlZmExNTBhYzM5Y2QyOTU1MmZlMzYwMjU3MzYyZGZkZWNlZjQwNTNiNDUnLFxuICAgICAgICAnZjk4YTNmZDgzMWViMmI3NDlhOTNiMGU2ZjM1Y2ZiNDBjOGNkNWFhNjY3YTE1NTgxYmMyZmVkZWQ0OThmZDljNidcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc3NjZkYmIyNGQxMzRlNzQ1Y2NjYWEyOGM5OWJmMjc0OTA2YmI2NmIyNmRjZjk4ZGY4ZDJmZWQ1MGQ4ODQyNDlhJyxcbiAgICAgICAgJzc0NGIxMTUyZWFjYmU1ZTM4ZGNjODg3OTgwZGEzOGI4OTc1ODRhNjVmYTA2Y2VkZDJjOTI0Zjk3Y2JhYzU5OTYnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnNTlkYmY0NmY4Yzk0NzU5YmEyMTI3N2MzMzc4NGY0MTY0NWY3YjQ0ZjZjNTk2YTU4Y2U5MmU2NjYxOTFhYmUzZScsXG4gICAgICAgICdjNTM0YWQ0NDE3NWZiYzMwMGY0ZWE2Y2U2NDgzMDlhMDQyY2U3MzlhNzkxOTc5OGNkODVlMjE2YzRhMzA3ZjZlJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2YxM2FkYTk1MTAzYzQ1MzczMDVlNjkxZTc0ZTlhNGE4ZGQ2NDdlNzExYTk1ZTczY2I2MmRjNjAxOGNmZDg3YjgnLFxuICAgICAgICAnZTEzODE3YjQ0ZWUxNGRlNjYzYmY0YmM4MDgzNDFmMzI2OTQ5ZTIxYTZhNzVjMjU3MDc3ODQxOWJkYWY1NzMzZCdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc3NzU0YjRmYTBlOGFjZWQwNmQ0MTY3YTJjNTljY2E0Y2RhMTg2OWMwNmViYWRmYjY0ODg1NTAwMTVhODg1MjJjJyxcbiAgICAgICAgJzMwZTkzZTg2NGU2NjlkODIyMjRiOTY3YzMwMjBiOGZhOGQxZTRlMzUwYjZjYmNjNTM3YTQ4YjU3ODQxMTYzYTInXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnOTQ4ZGNhZGY1OTkwZTA0OGFhMzg3NGQ0NmFiZWY5ZDcwMTg1OGY5NWRlODA0MWQyYTY4MjhjOTllMjI2MjUxOScsXG4gICAgICAgICdlNDkxYTQyNTM3ZjZlNTk3ZDVkMjhhMzIyNGIxYmMyNWRmOTE1NGVmYmQyZWYxZDJjYmJhMmNhZTUzNDdkNTdlJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzc5NjI0MTQ0NTBjNzZjMTY4OWM3YjQ4ZjgyMDJlYzM3ZmIyMjRjZjVhYzBiZmExNTcwMzI4YThhM2Q3Yzc3YWInLFxuICAgICAgICAnMTAwYjYxMGVjNGZmYjQ3NjBkNWMxZmMxMzNlZjZmNmIxMjUwN2EwNTFmMDRhYzU3NjBhZmE1YjI5ZGI4MzQzNydcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICczNTE0MDg3ODM0OTY0YjU0YjE1YjE2MDY0NGQ5MTU0ODVhMTY5NzcyMjViODg0N2JiMGRkMDg1MTM3ZWM0N2NhJyxcbiAgICAgICAgJ2VmMGFmYmIyMDU2MjA1NDQ4ZTE2NTJjNDhlODEyN2ZjNjAzOWU3N2MxNWMyMzc4YjdlN2QxNWEwZGUyOTMzMTEnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnZDNjYzMwYWQ2YjQ4M2U0YmM3OWNlMmM5ZGQ4YmM1NDk5M2U5NDdlYjhkZjc4N2I0NDI5NDNkM2Y3YjUyN2VhZicsXG4gICAgICAgICc4YjM3OGEyMmQ4MjcyNzhkODljNWU5YmU4Zjk1MDhhZTNjMmFkNDYyOTAzNTg2MzBhZmIzNGRiMDRlZWRlMGE0J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzE2MjRkODQ3ODA3MzI4NjBjZTFjNzhmY2JmZWZlMDhiMmIyOTgyM2RiOTEzZjY0OTM5NzViYTBmZjQ4NDc2MTAnLFxuICAgICAgICAnNjg2NTFjZjliNmRhOTAzZTA5MTQ0NDhjNmNkOWQ0Y2E4OTY4NzhmNTI4MmJlNGM4Y2MwNmUyYTQwNDA3ODU3NSdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc3MzNjZTgwZGE5NTVhOGEyNjkwMmM5NTYzM2U2MmE5ODUxOTI0NzRiNWFmMjA3ZGE2ZGY3YjRmZDVmYzYxY2Q0JyxcbiAgICAgICAgJ2Y1NDM1YTJiZDJiYWRmN2Q0ODVhNGQ4YjhkYjlmY2NlM2UxZWY4ZTAyMDFlNDU3OGM1NDY3M2JjMWRjNWVhMWQnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnMTVkOTQ0MTI1NDk0NTA2NGNmMWExYzMzYmJkM2I0OWY4OTY2YzUwOTIxNzFlNjk5ZWYyNThkZmFiODFjMDQ1YycsXG4gICAgICAgICdkNTZlYjMwYjY5NDYzZTcyMzRmNTEzN2I3M2I4NDE3NzQzNDgwMGJhY2ViZmM2ODVmYzM3YmJlOWVmZTQwNzBkJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2ExZDBmY2YyZWM5ZGU2NzViNjEyMTM2ZTVjZTcwZDI3MWMyMTQxN2M5ZDJiOGFhYWFjMTM4NTk5ZDA3MTc5NDAnLFxuICAgICAgICAnZWRkNzdmNTBiY2I1YTNjYWIyZTkwNzM3MzA5NjY3ZjI2NDE0NjJhNTQwNzBmM2Q1MTkyMTJkMzljMTk3YTYyOSdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdlMjJmYmUxNWMwYWY4Y2NjNTc4MGMwNzM1Zjg0ZGJlOWE3OTBiYWRlZTgyNDVjMDZjN2NhMzczMzFjYjM2OTgwJyxcbiAgICAgICAgJ2E4NTViYWJhZDVjZDYwYzg4YjQzMGE2OWY1M2ExYTdhMzgyODkxNTQ5NjQ3OTliZTQzZDA2ZDc3ZDMxZGEwNidcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICczMTEwOTFkZDk4NjBlOGUyMGVlMTM0NzNjMTE1NWY1ZjY5NjM1ZTM5NDcwNGVhYTc0MDA5NDUyMjQ2Y2ZhOWIzJyxcbiAgICAgICAgJzY2ZGI2NTZmODdkMWYwNGZmZmQxZjA0Nzg4YzA2ODMwODcxZWM1YTY0ZmVlZTY4NWJkODBmMGIxMjg2ZDgzNzQnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnMzRjMWZkMDRkMzAxYmU4OWIzMWMwNDQyZDNlNmFjMjQ4ODM5MjhiNDVhOTM0MDc4MTg2N2Q0MjMyZWMyZGJkZicsXG4gICAgICAgICc5NDE0Njg1ZTk3YjFiNTk1NGJkNDZmNzMwMTc0MTM2ZDU3ZjFjZWViNDg3NDQzZGM1MzIxODU3YmE3M2FiZWUnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnZjIxOWVhNWQ2YjU0NzAxYzFjMTRkZTViNTU3ZWI0MmE4ZDEzZjNhYmJjZDA4YWZmY2MyYTVlNmIwNDliOGQ2MycsXG4gICAgICAgICc0Y2I5NTk1N2U4M2Q0MGIwZjczYWY0NTQ0Y2NjZjZiMWY0YjA4ZDNjMDdiMjdmYjhkOGMyOTYyYTQwMDc2NmQxJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2Q3Yjg3NDBmNzRhOGZiYWFiMWY2ODNkYjhmNDVkZTI2NTQzYTU0OTBiY2E2MjcwODcyMzY5MTI0NjlhMGI0NDgnLFxuICAgICAgICAnZmE3Nzk2ODEyOGQ5YzkyZWUxMDEwZjMzN2FkNDcxN2VmZjE1ZGI1ZWQzYzA0OWIzNDExZTAzMTVlYWE0NTkzYidcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICczMmQzMWMyMjJmOGY2ZjBlZjg2ZjdjOThkM2EzMzM1ZWFkNWJjZDMyYWJkZDk0Mjg5ZmU0ZDMwOTFhYTgyNGJmJyxcbiAgICAgICAgJzVmMzAzMmY1ODkyMTU2ZTM5Y2NkM2Q3OTE1YjllMWRhMmU2ZGFjOWU2ZjI2ZTk2MTExOGQxNGI4NDYyZTE2NjEnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnNzQ2MWYzNzE5MTRhYjMyNjcxMDQ1YTE1NWQ5ODMxZWE4NzkzZDc3Y2Q1OTU5MmM0MzQwZjg2Y2JjMTgzNDdiNScsXG4gICAgICAgICc4ZWMwYmEyMzhiOTZiZWMwY2JkZGRjYWUwYWE0NDI1NDJlZWUxZmY1MGM5ODZlYTZiMzk4NDdiM2NjMDkyZmY2J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2VlMDc5YWRiMWRmMTg2MDA3NDM1NmEyNWFhMzgyMDZhNmQ3MTZiMmMzZTY3NDUzZDI4NzY5OGJhZDdiMmIyZDYnLFxuICAgICAgICAnOGRjMjQxMmFhZmUzYmU1YzRjNWYzN2UwZWNjNWY5ZjZhNDQ2OTg5YWYwNGM0ZTI1ZWJhYWM0NzllYzFjOGMxZSdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICcxNmVjOTNlNDQ3ZWM4M2YwNDY3YjE4MzAyZWU2MjBmN2U2NWRlMzMxODc0YzlkYzcyYmZkODYxNmJhOWRhNmI1JyxcbiAgICAgICAgJzVlNDYzMTE1MGU2MmZiNDBkMGU4YzJhN2NhNTgwNGEzOWQ1ODE4NmE1MGU0OTcxMzk2MjY3NzhlMjViMDY3NGQnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnZWFhNWY5ODBjMjQ1ZjZmMDM4OTc4MjkwYWZhNzBiNmJkODg1NTg5N2Y5OGI2YWE0ODViOTYwNjVkNTM3YmQ5OScsXG4gICAgICAgICdmNjVmNWQzZTI5MmMyZTA4MTlhNTI4MzkxYzk5NDYyNGQ3ODQ4NjlkN2U2ZWE2N2ZiMTgwNDEwMjRlZGMwN2RjJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzc4Yzk0MDc1NDRhYzEzMjY5MmVlMTkxMGEwMjQzOTk1OGFlMDQ4NzcxNTEzNDJlYTk2YzRiNmIzNWE0OWY1MScsXG4gICAgICAgICdmM2UwMzE5MTY5ZWI5Yjg1ZDU0MDQ3OTU1MzlhNWU2OGZhMWZiZDU4M2MwNjRkMjQ2MmI2NzVmMTk0YTNkZGI0J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzQ5NGY0YmUyMTlhMWE3NzAxNmRjZDgzODQzMWFlYTAwMDFjZGM4YWU3YTZmYzY4ODcyNjU3OGQ5NzAyODU3YTUnLFxuICAgICAgICAnNDIyNDJhOTY5MjgzYTVmMzM5YmE3ZjA3NWUzNmJhMmFmOTI1Y2UzMGQ3NjdlZDZlNTVmNGIwMzE4ODBkNTYyYydcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdhNTk4YTgwMzBkYTZkODZjNmJjN2YyZjUxNDRlYTU0OWQyODIxMWVhNThmYWE3MGViZjRjMWU2NjVjMWZlOWI1JyxcbiAgICAgICAgJzIwNGI1ZDZmODQ4MjJjMzA3ZTRiNGE3MTQwNzM3YWVjMjNmYzYzYjY1YjM1Zjg2YTEwMDI2ZGJkMmQ4NjRlNmInXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnYzQxOTE2MzY1YWJiMmI1ZDA5MTkyZjVmMmRiZWFmZWMyMDhmMDIwZjEyNTcwYTE4NGRiYWRjM2U1ODU5NTk5NycsXG4gICAgICAgICc0ZjE0MzUxZDAwODdlZmE0OWQyNDViMzI4OTg0OTg5ZDVjYWY5NDUwZjM0YmZjMGVkMTZlOTZiNThmYTk5MTMnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnODQxZDYwNjNhNTg2ZmE0NzVhNzI0NjA0ZGEwM2JjNWI5MmEyZTBkMmUwYTM2YWNmZTRjNzNhNTUxNDc0Mjg4MScsXG4gICAgICAgICc3Mzg2N2Y1OWMwNjU5ZTgxOTA0ZjlhMWM3NTQzNjk4ZTYyNTYyZDY3NDRjMTY5Y2U3YTM2ZGUwMWE4ZDYxNTQnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnNWU5NWJiMzk5YTY5NzFkMzc2MDI2OTQ3Zjg5YmRlMmYyODJiMzM4MTA5MjhiZTRkZWQxMTJhYzRkNzBlMjBkNScsXG4gICAgICAgICczOWYyM2YzNjY4MDkwODViZWViZmM3MTE4MTMxMzc3NWE5OWM5YWVkN2Q4YmEzOGIxNjEzODRjNzQ2MDEyODY1J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzM2ZTQ2NDFhNTM5NDhmZDQ3NmMzOWY4YTk5ZmQ5NzRlNWVjMDc1NjRiNTMxNWQ4YmY5OTQ3MWJjYTBlZjJmNjYnLFxuICAgICAgICAnZDI0MjRiMWIxYWJlNGViODE2NDIyN2IwODVjOWFhOTQ1NmVhMTM0OTNmZDU2M2UwNmZkNTFjZjU2OTRjNzhmYydcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICczMzY1ODFlYTdiZmJiYjI5MGMxOTFhMmY1MDdhNDFjZjU2NDM4NDIxNzBlOTE0ZmFlYWIyN2MyYzU3OWY3MjYnLFxuICAgICAgICAnZWFkMTIxNjg1OTVmZTFiZTk5MjUyMTI5YjZlNTZiMzM5MWY3YWIxNDEwY2QxZTBlZjNkY2RjYWJkMmZkYTIyNCdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc4YWI4OTgxNmRhZGZkNmI2YTFmMjYzNGZjZjAwZWM4NDAzNzgxMDI1ZWQ2ODkwYzQ4NDk3NDI3MDZiZDQzZWRlJyxcbiAgICAgICAgJzZmZGNlZjA5ZjJmNmQwYTA0NGU2NTRhZWY2MjQxMzZmNTAzZDQ1OWMzZTg5ODQ1ODU4YTQ3YTkxMjljZGQyNGUnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnMWUzM2YxYTc0NmM5YzU3NzgxMzMzNDRkOTI5OWZjYWEyMGIwOTM4ZThhY2ZmMjU0NGJiNDAyODRiOGM1ZmI5NCcsXG4gICAgICAgICc2MDY2MDI1N2RkMTFiM2FhOWM4ZWQ2MThkMjRlZGZmMjMwNmQzMjBmMWQwMzAxMGUzM2E3ZDIwNTdmM2IzYjYnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnODViN2MxZGNiM2NlYzFiN2VlN2YzMGRlZDc5ZGQyMGEwZWQxZjRjYzE4Y2JjZmNmYTQxMDM2MWZkOGYwOGYzMScsXG4gICAgICAgICczZDk4YTljZGQwMjZkZDQzZjM5MDQ4ZjI1YTg4NDdmNGZjYWZhZDE4OTVkN2E2MzNjNmZlZDNjMzVlOTk5NTExJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzI5ZGY5ZmJkOGQ5ZTQ2NTA5Mjc1ZjRiMTI1ZDZkNDVkN2ZiZTlhM2I4NzhhN2FmODcyYTI4MDA2NjFhYzVmNTEnLFxuICAgICAgICAnYjRjNGZlOTljNzc1YTYwNmUyZDg4NjIxNzkxMzlmZmRhNjFkYzg2MWMwMTllNTVjZDI4NzZlYjJhMjdkODRiJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2EwYjFjYWUwNmIwYTg0N2EzZmVhNmU2NzFhYWY4YWRmZGZlNThjYTJmNzY4MTA1YzgwODJiMmU0NDlmY2UyNTInLFxuICAgICAgICAnYWU0MzQxMDJlZGRlMDk1OGVjNGIxOWQ5MTdhNmEyOGU2YjcyZGExODM0YWZmMGU2NTBmMDQ5NTAzYTI5NmNmMidcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc0ZThjZWFmYjliM2U5YTEzNmRjN2ZmNjdlODQwMjk1YjQ5OWRmYjNiMjEzM2U0YmExMTNmMmU0YzBlMTIxZTUnLFxuICAgICAgICAnY2YyMTc0MTE4YzhiNmQ3YTRiNDhmNmQ1MzRjZTVjNzk0MjJjMDg2YTYzNDYwNTAyYjgyN2NlNjJhMzI2NjgzYydcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdkMjRhNDRlMDQ3ZTE5YjZmNWFmYjgxYzdjYTJmNjkwODBhNTA3NjY4OWEwMTA5MTlmNDI3MjVjMmI3ODlhMzNiJyxcbiAgICAgICAgJzZmYjhkNTU5MWI0NjZmOGZjNjNkYjUwZjFjMGYxYzY5MDEzZjk5Njg4N2I4MjQ0ZDJjZGVjNDE3YWZlYThmYTMnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnZWEwMTYwNmE3YTZjOWNkZDI0OWZkZmNmYWNiOTk1ODQwMDFlZGQyOGFiYmFiNzdiNTEwNGU5OGU4ZTNiMzVkNCcsXG4gICAgICAgICczMjJhZjQ5MDhjNzMxMmIwY2ZiZmUzNjlmN2E3YjNjZGI3ZDQ0OTRiYzI4MjM3MDBjZmQ2NTIxODhhM2VhOThkJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2FmOGFkZGJmMmI2NjFjOGE2YzYzMjg2NTVlYjk2NjUxMjUyMDA3ZDhjNWVhMzFiZTRhZDE5NmRlOGNlMjEzMWYnLFxuICAgICAgICAnNjc0OWU2N2MwMjliODVmNTJhMDM0ZWFmZDA5NjgzNmIyNTIwODE4NjgwZTI2YWM4ZjNkZmJjZGI3MTc0OTcwMCdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdlM2FlMTk3NDU2NmNhMDZjYzUxNmQ0N2UwZmIxNjVhNjc0YTNkYWJjZmNhMTVlNzIyZjBlMzQ1MGY0NTg4OScsXG4gICAgICAgICcyYWVhYmU3ZTQ1MzE1MTAxMTYyMTdmMDdiZjRkMDczMDBkZTk3ZTQ4NzRmODFmNTMzNDIwYTcyZWViMGJkNmE0J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzU5MWVlMzU1MzEzZDk5NzIxY2Y2OTkzZmZlZDFlM2UzMDE5OTNmZjNlZDI1ODgwMjA3NWVhOGNlZDM5N2UyNDYnLFxuICAgICAgICAnYjBlYTU1OGExMTNjMzBiZWE2MGZjNDc3NTQ2MGM3OTAxZmYwYjA1M2QyNWNhMmJkZWVlOThmMWE0YmU1ZDE5NidcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICcxMTM5NmQ1NWZkYTU0YzQ5ZjE5YWE5NzMxOGQ4ZGE2MWZhODU4NGU0N2IwODQ5NDUwNzdjZjAzMjU1YjUyOTg0JyxcbiAgICAgICAgJzk5OGM3NGE4Y2Q0NWFjMDEyODlkNTgzM2E3YmViNDc0NGZmNTM2YjAxYjI1N2JlNGM1NzY3YmVhOTNlYTU3YTQnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnM2M1ZDJhMWJhMzljNWExNzkwMDAwNzM4YzllMGM0MGI4ZGNkZmQ1NDY4NzU0YjY0MDU1NDAxNTdlMDE3YWE3YScsXG4gICAgICAgICdiMjI4NDI3OTk5NWEzNGUyZjlkNGRlNzM5NmZjMThiODBmOWI4YjlmZGQyNzBmNjY2MWY3OWNhNGM4MWJkMjU3J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2NjODcwNGI4YTYwYTBkZWZhM2E5OWE3Mjk5ZjJlOWMzZmJjMzk1YWZiMDRhYzA3ODQyNWVmOGExNzkzY2MwMzAnLFxuICAgICAgICAnYmRkNDYwMzlmZWVkMTc4ODFkMWUwODYyZGIzNDdmOGNmMzk1Yjc0ZmM0YmNkYzRlOTQwYjc0ZTNhYzFmMWIxMydcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdjNTMzZTRmN2VhODU1NWFhY2Q5Nzc3YWM1Y2FkMjliOTdkZDRkZWZjY2M1M2VlN2VhMjA0MTE5YjI4ODliMTk3JyxcbiAgICAgICAgJzZmMGEyNTZiYzVlZmRmNDI5YTJmYjYyNDJmMWE0M2EyZDliOTI1YmI0YTRiM2EyNmJiOGUwZjQ1ZWI1OTYwOTYnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnYzE0ZjhmMmNjYjI3ZDZmMTA5ZjZkMDhkMDNjYzk2YTY5YmE4YzM0ZWVjMDdiYmNmNTY2ZDQ4ZTMzZGE2NTkzJyxcbiAgICAgICAgJ2MzNTlkNjkyM2JiMzk4ZjdmZDQ0NzNlMTZmZTFjMjg0NzViNzQwZGQwOTgwNzVlNmMwZTg2NDkxMTNkYzNhMzgnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnYTZjYmMzMDQ2YmM2YTQ1MGJhYzI0Nzg5ZmExNzExNWE0Yzk3MzllZDc1ZjhmMjFjZTQ0MWY3MmUwYjkwZTZlZicsXG4gICAgICAgICcyMWFlN2Y0NjgwZTg4OWJiMTMwNjE5ZTJjMGY5NWEzNjBjZWI1NzNjNzA2MDMxMzk4NjJhZmQ2MTdmYTliOWYnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnMzQ3ZDZkOWEwMmM0ODkyN2ViZmI4NmMxMzU5YjFjYWYxMzBhM2MwMjY3ZDExY2U2MzQ0YjM5Zjk5ZDQzY2MzOCcsXG4gICAgICAgICc2MGVhN2Y2MWEzNTM1MjRkMWM5ODdmNmVjZWM5MmYwODZkNTY1YWI2ODc4NzBjYjEyNjg5ZmYxZTMxYzc0NDQ4J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2RhNjU0NWQyMTgxZGI4ZDk4M2Y3ZGNiMzc1ZWY1ODY2ZDQ3YzY3YjFiZjMxYzhjZjg1NWVmNzQzN2I3MjY1NmEnLFxuICAgICAgICAnNDliOTY3MTVhYjY4NzhhNzllNzhmMDdjZTU2ODBjNWQ2NjczMDUxYjQ5MzViZDg5N2ZlYTgyNGI3N2RjMjA4YSdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdjNDA3NDdjYzlkMDEyY2IxYTEzYjgxNDgzMDljNmRlN2VjMjVkNjk0NWQ2NTcxNDZiOWQ1OTk0YjhmZWIxMTExJyxcbiAgICAgICAgJzVjYTU2MDc1M2JlMmExMmZjNmRlNmNhZjJjYjQ4OTU2NWRiOTM2MTU2Yjk1MTRlMWJiNWU4MzAzN2UwZmEyZDQnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnNGU0MmM4ZWM4MmM5OTc5OGNjZjNhNjEwYmU4NzBlNzgzMzhjN2Y3MTMzNDhiZDM0YzgyMDNlZjQwMzdmMzUwMicsXG4gICAgICAgICc3NTcxZDc0ZWU1ZTBmYjkyYTdhOGIzM2EwNzc4MzM0MWE1NDkyMTQ0Y2M1NGJjYzQwYTk0NDczNjkzNjA2NDM3J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzM3NzVhYjcwODliYzZhZjgyM2FiYTJlMWFmNzBiMjM2ZDI1MWNhZGIwYzg2NzQzMjg3NTIyYTFiM2IwZGVkZWEnLFxuICAgICAgICAnYmU1MmQxMDdiY2ZhMDlkOGJjYjk3MzZhODI4Y2ZhN2ZhYzhkYjE3YmY3YTc2YTJjNDJhZDk2MTQwOTAxOGNmNydcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdjZWUzMWNiZjdlMzRlYzM3OWQ5NGZiODE0ZDNkNzc1YWQ5NTQ1OTVkMTMxNGJhODg0Njk1OWUzZTgyZjc0ZTI2JyxcbiAgICAgICAgJzhmZDY0YTE0YzA2YjU4OWMyNmI5NDdhZTJiY2Y2YmZhMDE0OWVmMGJlMTRlZDRkODBmNDQ4YTAxYzQzYjFjNmQnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnYjRmOWVhZWEwOWI2OTE3NjE5ZjZlYTZhNGViNTQ2NGVmZGRiNThmZDQ1YjFlYmVmY2RjMWEwMWQwOGI0Nzk4NicsXG4gICAgICAgICczOWU1Yzk5MjViNWE1NGIwNzQzM2E0ZjE4YzYxNzI2ZjhiYjEzMWMwMTJjYTU0MmViMjRhOGFjMDcyMDA2ODJhJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2Q0MjYzZGZjM2QyZGY5MjNhMDE3OWE0ODk2NmQzMGNlODRlMjUxNWFmYzNkY2NjMWI3NzkwNzc5MmViY2M2MGUnLFxuICAgICAgICAnNjJkZmFmMDdhMGY3OGZlYjMwZTMwZDYyOTU4NTNjZTE4OWUxMjc3NjBhZDZjZjdmYWUxNjRlMTIyYTIwOGQ1NCdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc0ODQ1NzUyNDgyMGZhNjVhNGY4ZDM1ZWI2OTMwODU3YzAwMzJhY2MwYTRhMmRlNDIyMjMzZWVkYTg5NzYxMmM0JyxcbiAgICAgICAgJzI1YTc0OGFiMzY3OTc5ZDk4NzMzYzM4YTFmYTFjMmU3ZGM2Y2MwN2RiMmQ2MGE5YWU3YTc2YWFhNDliZDBmNzcnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnZGZlZWVmMTg4MTEwMWYyY2IxMTY0NGYzYTJhZmRmYzIwNDVlMTk5MTkxNTI5MjNmMzY3YTE3NjdjMTFjY2VkYScsXG4gICAgICAgICdlY2ZiNzA1NmNmMWRlMDQyZjk0MjBiYWIzOTY3OTNjMGMzOTBiZGU3NGI0YmJkZmYxNmE4M2FlMDlhOWE3NTE3J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzZkN2VmNmIxNzU0M2Y4MzczYzU3M2Y0NGUxZjM4OTgzNWQ4OWJjYmM2MDYyY2VkMzZjODJkZjgzYjhmYWU4NTknLFxuICAgICAgICAnY2Q0NTBlYzMzNTQzODk4NmRmZWZhMTBjNTdmZWE5YmNjNTIxYTA5NTliMmQ4MGJiZjc0YjE5MGRjYTcxMmQxMCdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdlNzU2MDVkNTkxMDJhNWEyNjg0NTAwZDNiOTkxZjJlM2YzYzg4YjkzMjI1NTQ3MDM1YWYyNWFmNjZlMDQ1NDFmJyxcbiAgICAgICAgJ2Y1YzU0NzU0YThmNzFlZTU0MGI5YjQ4NzI4NDczZTMxNGY3MjlhYzUzMDhiMDY5MzgzNjA5OTBlMmJmYWQxMjUnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnZWI5ODY2MGY0YzRkZmFhMDZhMmJlNDUzZDUwMjBiYzk5YTBjMmU2MGFiZTM4ODQ1N2RkNDNmZWZiMWVkNjIwYycsXG4gICAgICAgICc2Y2I5YTg4NzZkOWNiODUyMDYwOWFmM2FkZDI2Y2QyMGEwYTdjZDhhOTQxMTEzMWNlODVmNDQxMDAwOTkyMjNlJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzEzZTg3YjAyN2Q4NTE0ZDM1OTM5ZjJlNjg5MmIxOTkyMjE1NDU5Njk0MTg4ODMzNmRjMzU2M2UzYjhkYmE5NDInLFxuICAgICAgICAnZmVmNWEzYzY4MDU5YTZkZWM1ZDYyNDExNGJmMWU5MWFhYzJiOWRhNTY4ZDZhYmViMjU3MGQ1NTY0NmI4YWRmMSdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdlZTE2MzAyNmU5ZmQ2ZmUwMTdjMzhmMDZhNWJlNmZjMTI1NDI0YjM3MWNlMjcwOGU3YmY0NDkxNjkxZTU3NjRhJyxcbiAgICAgICAgJzFhY2IyNTBmMjU1ZGQ2MWM0M2Q5NGNjYzY3MGQwZjU4ZjQ5YWUzZmExNWI5NjYyM2U1NDMwZGEwYWQ2YzYyYjInXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnYjI2OGY1ZWY5YWQ1MWU0ZDc4ZGUzYTc1MGMyZGM4OWIxZTYyNmQ0MzUwNTg2Nzk5OTkzMmU1ZGIzM2FmM2Q4MCcsXG4gICAgICAgICc1ZjMxMGQ0YjNjOTliOWViYjE5Zjc3ZDQxYzFkZWUwMThjZjBkMzRmZDQxOTE2MTQwMDNlOTQ1YTEyMTZlNDIzJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2ZmMDdmMzExOGE5ZGYwMzVlOWZhZDg1ZWI2YzdiZmU0MmIwMmYwMWNhOTljZWVhM2JmN2ZmZGJhOTNjNDc1MGQnLFxuICAgICAgICAnNDM4MTM2ZDYwM2U4NThhM2E1YzQ0MGMzOGVjY2JhZGRjMWQyOTQyMTE0ZTJlZGRkNDc0MGQwOThjZWQxZjBkOCdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc4ZDhiOTg1NWM3YzA1MmEzNDE0NmZkMjBmZmI2NThiZWE0YjlmNjllMGQ4MjVlYmVjMTZlOGMzY2UyYjUyNmExJyxcbiAgICAgICAgJ2NkYjU1OWVlZGMyZDc5ZjkyNmJhZjQ0ZmI4NGVhNGQ0NGJjZjUwZmVlNTFkN2NlYjMwZTJlN2Y0NjMwMzY3NTgnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnNTJkYjBiNTM4NGRmYmYwNWJmYTlkNDcyZDdhZTI2ZGZlNGI4NTFjZWNhOTFiMWViYTU0MjYzMTgwZGEzMmI2MycsXG4gICAgICAgICdjM2I5OTdkMDUwZWU1ZDQyM2ViYWY2NmE2ZGI5ZjU3YjMxODBjOTAyODc1Njc5ZGU5MjRiNjlkODRhN2IzNzUnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnZTYyZjk0OTBkM2Q1MWRhNjM5NWVmZDI0ZTgwOTE5Y2M3ZDBmMjljM2YzZmE0OGM2ZmZmNTQzYmVjYmQ0MzM1MicsXG4gICAgICAgICc2ZDg5YWQ3YmE0ODc2YjBiMjJjMmNhMjgwYzY4Mjg2MmYzNDJjODU5MWYxZGFmNTE3MGUwN2JmZDljY2FmYTdkJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzdmMzBlYTI0NzZiMzk5YjQ5NTc1MDljODhmNzdkMDE5MWFmYTJmZjVjYjdiMTRmZDZkOGU3ZDY1YWFhYjExOTMnLFxuICAgICAgICAnY2E1ZWY3ZDRiMjMxYzk0YzNiMTUzODlhNWY2MzExZTlkYWZmN2JiNjdiMTAzZTk4ODBlZjRiZmY2MzdhY2FlYydcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc1MDk4ZmYxZTFkOWYxNGZiNDZhMjEwZmFkYTZjOTAzZmVmMGZiN2I0YTFkZDFkOWFjNjBhMDM2MTgwMGI3YTAwJyxcbiAgICAgICAgJzk3MzExNDFkODFmYzhmODA4NGQzN2M2ZTc1NDIwMDZiM2VlMWI0MGQ2MGRmZTUzNjJhNWIxMzJmZDE3ZGRjMCdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICczMmI3OGM3ZGU5ZWU1MTJhNzI4OTViZTZiOWNiZWZhNmUyZjNjNGNjY2U0NDVjOTZiOWYyYzgxZTI3NzhhZDU4JyxcbiAgICAgICAgJ2VlMTg0OWY1MTNkZjcxZTMyZWZjMzg5NmVlMjgyNjBjNzNiYjgwNTQ3YWUyMjc1YmE0OTcyMzc3OTRjODc1M2MnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnZTJjYjc0ZmRkYzhlOWZiY2QwNzZlZWYyYTdjNzJiMGNlMzdkNTBmMDgyNjlkZmMwNzRiNTgxNTUwNTQ3YTRmNycsXG4gICAgICAgICdkM2FhMmVkNzFjOWRkMjI0N2E2MmRmMDYyNzM2ZWIwYmFkZGVhOWUzNjEyMmQyYmU4NjQxYWJjYjAwNWNjNGE0J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzg0Mzg0NDc1NjZkNGQ3YmVkYWRjMjk5NDk2YWIzNTc0MjYwMDlhMzVmMjM1Y2IxNDFiZTBkOTljZDEwYWUzYTgnLFxuICAgICAgICAnYzRlMTAyMDkxNjk4MGE0ZGE1ZDAxYWM1ZTZhZDMzMDczNGVmMGQ3OTA2NjMxYzRmMjM5MDQyNmIyZWRkNzkxZidcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc0MTYyZDQ4OGI4OTQwMjAzOWI1ODRjNmZjNmMzMDg4NzA1ODdkOWM0NmY2NjBiODc4YWI2NWM4MmM3MTFkNjdlJyxcbiAgICAgICAgJzY3MTYzZTkwMzIzNjI4OWY3NzZmMjJjMjVmYjhhM2FmYzE3MzJmMmI4NGI0ZTk1ZGJkYTQ3YWU1YTA4NTI2NDknXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnM2ZhZDNmYTg0Y2FmMGYzNGYwZjg5YmZkMmRjZjU0ZmMxNzVkNzY3YWVjM2U1MDY4NGYzYmE0YTRiZjVmNjgzZCcsXG4gICAgICAgICdjZDFiYzdjYjZjYzQwN2JiMmYwY2E2NDdjNzE4YTczMGNmNzE4NzJlN2QwZDJhNTNmYTIwZWZjZGZlNjE4MjYnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnNjc0ZjI2MDBhMzAwN2EwMDU2OGMxYTdjZTA1ZDA4MTZjMWZiODRiZjEzNzA3OThmMWM2OTUzMmZhZWIxYTg2YicsXG4gICAgICAgICcyOTlkMjFmOTQxM2YzM2IzZWRmNDNiMjU3MDA0NTgwYjcwZGI1N2RhMGIxODIyNTllMDllZWNjNjllMGQzOGE1J1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2QzMmY0ZGE1NGFkZTc0YWJiODFiODE1YWQxZmIzYjI2M2Q4MmQ2YzY5MjcxNGJjZmY4N2QyOWJkNWVlOWYwOGYnLFxuICAgICAgICAnZjk0MjllNzM4YjhlNTNiOTY4ZTk5MDE2YzA1OTcwNzc4MmUxNGY0NTM1MzU5ZDU4MmZjNDE2OTEwYjNlZWE4NydcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICczMGU0ZTY3MDQzNTM4NTU1NmU1OTM2NTcxMzU4NDVkMzZmYmI2OTMxZjcyYjA4Y2IxZWQ5NTRmMWUzY2UzZmY2JyxcbiAgICAgICAgJzQ2MmY5YmNlNjE5ODk4NjM4NDk5MzUwMTEzYmJjOWIxMGE4NzhkMzVkYTcwNzQwZGM2OTVhNTU5ZWI4OGRiN2InXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnYmUyMDYyMDAzYzUxY2MzMDA0NjgyOTA0MzMwZTRkZWU3ZjNkY2QxMGIwMWU1ODBiZjE5NzFiMDRkNGNhZDI5NycsXG4gICAgICAgICc2MjE4OGJjNDlkNjFlNTQyODU3M2Q0OGE3NGUxYzY1NWIxYzYxMDkwOTA1NjgyYTBkNTU1OGVkNzJkY2NiOWJjJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzkzMTQ0NDIzYWNlMzQ1MWVkMjllMGZiOWFjMmFmMjExY2I2ZTg0YTYwMWRmNTk5M2M0MTk4NTlmZmY1ZGYwNGEnLFxuICAgICAgICAnN2MxMGRmYjE2NGMzNDI1ZjVjNzFhM2Y5ZDc5OTIwMzhmMTA2NTIyNGY3MmJiOWQxZDkwMmE2ZDEzMDM3YjQ3YydcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICdiMDE1ZjgwNDRmNWZjYmRjZjIxY2EyNmQ2YzM0ZmI4MTk3ODI5MjA1YzdiN2QyYTdjYjY2NDE4YzE1N2IxMTJjJyxcbiAgICAgICAgJ2FiOGMxZTA4NmQwNGU4MTM3NDRhNjU1YjJkZjhkNWY4M2IzY2RjNmZhYTMwODhjMWQzYWVhMTQ1NGUzYTFkNWYnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnZDVlOWUxZGE2NDlkOTdkODllNDg2ODExN2E0NjVhM2E0ZjhhMThkZTU3YTE0MGQzNmIzZjJhZjM0MWEyMWI1MicsXG4gICAgICAgICc0Y2IwNDQzN2YzOTFlZDczMTExYTEzY2MxZDRkZDBkYjE2OTM0NjVjMjI0MDQ4MGQ4OTU1ZTg1OTJmMjc0NDdhJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJ2QzYWU0MTA0N2RkN2NhMDY1ZGJmOGVkNzdiOTkyNDM5OTgzMDA1Y2Q3MmUxNmQ2Zjk5NmE1MzE2ZDM2OTY2YmInLFxuICAgICAgICAnYmQxYWViMjFhZDIyZWJiMjJhMTBmMDMwMzQxN2M2ZDk2NGY4Y2RkN2RmMGFjYTYxNGIxMGRjMTRkMTI1YWM0NidcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc0NjNlMjc2M2Q4ODVmOTU4ZmM2NmNkZDIyODAwZjBhNDg3MTk3ZDBhODJlMzc3YjQ5ZjgwYWY4N2M4OTdiMDY1JyxcbiAgICAgICAgJ2JmZWZhY2RiMGU1ZDBmZDdkZjNhMzExYTk0ZGUwNjJiMjZiODBjNjFmYmM5NzUwOGI3OTk5MjY3MWVmN2NhN2YnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnNzk4NWZkZmQxMjdjMDU2N2M2ZjUzZWMxYmI2M2VjMzE1OGU1OTdjNDBiZmU3NDdjODNjZGRmYzkxMDY0MTkxNycsXG4gICAgICAgICc2MDNjMTJkYWYzZDk4NjJlZjJiMjVmZTFkZTI4OWFlZDI0ZWQyOTFlMGVjNjcwODcwM2E1YmQ1NjdmMzJlZDAzJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzc0YTFhZDZiNWY3NmUzOWRiMmRkMjQ5NDEwZWFjN2Y5OWU3NGM1OWNiODNkMmQwZWQ1ZmYxNTQzZGE3NzAzZTknLFxuICAgICAgICAnY2M2MTU3ZWYxOGM5YzYzY2Q2MTkzZDgzNjMxYmJlYTAwOTNlMDk2ODk0MmU4YzMzZDU3MzdmZDc5MGUwZGIwOCdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICczMDY4MmE1MDcwMzM3NWY2MDJkNDE2NjY0YmExOWI3ZmM5YmFiNDJjNzI3NDc0NjNhNzFkMDg5NmIyMmY2ZGEzJyxcbiAgICAgICAgJzU1M2UwNGY2YjAxOGI0ZmE2YzhmMzllN2YzMTFkMzE3NjI5MGQwZTBmMTljYTczZjE3NzE0ZDk5NzdhMjJmZjgnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnOWUyMTU4ZjBkN2MwZDVmMjZjMzc5MWVmZWZhNzk1OTc2NTRlN2EyYjI0NjRmNTJiMWVlNmMxMzQ3NzY5ZWY1NycsXG4gICAgICAgICc3MTJmY2RkMWI5MDUzZjA5MDAzYTM0ODFmYTc3NjJlOWZmZDdjOGVmMzVhMzg1MDllMmZiZjI2MjkwMDgzNzMnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnMTc2ZTI2OTg5YTQzYzljZmViYTQwMjljMjAyNTM4YzI4MTcyZTU2NmUzYzRmY2U3MzIyODU3ZjNiZTMyN2Q2NicsXG4gICAgICAgICdlZDhjYzlkMDRiMjllYjg3N2QyNzBiNDg3OGRjNDNjMTlhZWZkMzFmNGVlZTA5ZWU3YjQ3ODM0YzFmYTRiMWMzJ1xuICAgICAgXSxcbiAgICAgIFtcbiAgICAgICAgJzc1ZDQ2ZWZlYTM3NzFlNmU2OGFiYjg5YTEzYWQ3NDdlY2YxODkyMzkzZGZjNGYxYjcwMDQ3ODhjNTAzNzRkYTgnLFxuICAgICAgICAnOTg1MjM5MGE5OTUwNzY3OWZkMGI4NmZkMmIzOWE4NjhkN2VmYzIyMTUxMzQ2ZTFhM2NhNDcyNjU4NmE2YmVkOCdcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgICc4MDlhMjBjNjdkNjQ5MDBmZmI2OThjNGM4MjVmNmQ1ZjIzMTBmYjA0NTFjODY5MzQ1YjczMTlmNjQ1NjA1NzIxJyxcbiAgICAgICAgJzllOTk0OTgwZDk5MTdlMjJiNzZiMDYxOTI3ZmEwNDE0M2QwOTZjY2M1NDk2M2U2YTVlYmZhNWYzZjhlMjg2YzEnXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICAnMWIzODkwM2E0M2Y3ZjExNGVkNDUwMGI0ZWFjNzA4M2ZkZWZlY2UxY2YyOWM2MzUyOGQ1NjM0NDZmOTcyYzE4MCcsXG4gICAgICAgICc0MDM2ZWRjOTMxYTYwYWU4ODkzNTNmNzdmZDUzZGU0YTI3MDhiMjZiNmY1ZGE3MmFkMzM5NDExOWRhZjQwOGY5J1xuICAgICAgXVxuICAgIF1cbiAgfVxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHV0aWxzID0gZXhwb3J0cztcbnZhciBCTiA9IHJlcXVpcmUoJ2JuLmpzJyk7XG52YXIgbWluQXNzZXJ0ID0gcmVxdWlyZSgnbWluaW1hbGlzdGljLWFzc2VydCcpO1xudmFyIG1pblV0aWxzID0gcmVxdWlyZSgnbWluaW1hbGlzdGljLWNyeXB0by11dGlscycpO1xuXG51dGlscy5hc3NlcnQgPSBtaW5Bc3NlcnQ7XG51dGlscy50b0FycmF5ID0gbWluVXRpbHMudG9BcnJheTtcbnV0aWxzLnplcm8yID0gbWluVXRpbHMuemVybzI7XG51dGlscy50b0hleCA9IG1pblV0aWxzLnRvSGV4O1xudXRpbHMuZW5jb2RlID0gbWluVXRpbHMuZW5jb2RlO1xuXG4vLyBSZXByZXNlbnQgbnVtIGluIGEgdy1OQUYgZm9ybVxuZnVuY3Rpb24gZ2V0TkFGKG51bSwgdykge1xuICB2YXIgbmFmID0gW107XG4gIHZhciB3cyA9IDEgPDwgKHcgKyAxKTtcbiAgdmFyIGsgPSBudW0uY2xvbmUoKTtcbiAgd2hpbGUgKGsuY21wbigxKSA+PSAwKSB7XG4gICAgdmFyIHo7XG4gICAgaWYgKGsuaXNPZGQoKSkge1xuICAgICAgdmFyIG1vZCA9IGsuYW5kbG4od3MgLSAxKTtcbiAgICAgIGlmIChtb2QgPiAod3MgPj4gMSkgLSAxKVxuICAgICAgICB6ID0gKHdzID4+IDEpIC0gbW9kO1xuICAgICAgZWxzZVxuICAgICAgICB6ID0gbW9kO1xuICAgICAgay5pc3Vibih6KTtcbiAgICB9IGVsc2Uge1xuICAgICAgeiA9IDA7XG4gICAgfVxuICAgIG5hZi5wdXNoKHopO1xuXG4gICAgLy8gT3B0aW1pemF0aW9uLCBzaGlmdCBieSB3b3JkIGlmIHBvc3NpYmxlXG4gICAgdmFyIHNoaWZ0ID0gKGsuY21wbigwKSAhPT0gMCAmJiBrLmFuZGxuKHdzIC0gMSkgPT09IDApID8gKHcgKyAxKSA6IDE7XG4gICAgZm9yICh2YXIgaSA9IDE7IGkgPCBzaGlmdDsgaSsrKVxuICAgICAgbmFmLnB1c2goMCk7XG4gICAgay5pdXNocm4oc2hpZnQpO1xuICB9XG5cbiAgcmV0dXJuIG5hZjtcbn1cbnV0aWxzLmdldE5BRiA9IGdldE5BRjtcblxuLy8gUmVwcmVzZW50IGsxLCBrMiBpbiBhIEpvaW50IFNwYXJzZSBGb3JtXG5mdW5jdGlvbiBnZXRKU0YoazEsIGsyKSB7XG4gIHZhciBqc2YgPSBbXG4gICAgW10sXG4gICAgW11cbiAgXTtcblxuICBrMSA9IGsxLmNsb25lKCk7XG4gIGsyID0gazIuY2xvbmUoKTtcbiAgdmFyIGQxID0gMDtcbiAgdmFyIGQyID0gMDtcbiAgd2hpbGUgKGsxLmNtcG4oLWQxKSA+IDAgfHwgazIuY21wbigtZDIpID4gMCkge1xuXG4gICAgLy8gRmlyc3QgcGhhc2VcbiAgICB2YXIgbTE0ID0gKGsxLmFuZGxuKDMpICsgZDEpICYgMztcbiAgICB2YXIgbTI0ID0gKGsyLmFuZGxuKDMpICsgZDIpICYgMztcbiAgICBpZiAobTE0ID09PSAzKVxuICAgICAgbTE0ID0gLTE7XG4gICAgaWYgKG0yNCA9PT0gMylcbiAgICAgIG0yNCA9IC0xO1xuICAgIHZhciB1MTtcbiAgICBpZiAoKG0xNCAmIDEpID09PSAwKSB7XG4gICAgICB1MSA9IDA7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBtOCA9IChrMS5hbmRsbig3KSArIGQxKSAmIDc7XG4gICAgICBpZiAoKG04ID09PSAzIHx8IG04ID09PSA1KSAmJiBtMjQgPT09IDIpXG4gICAgICAgIHUxID0gLW0xNDtcbiAgICAgIGVsc2VcbiAgICAgICAgdTEgPSBtMTQ7XG4gICAgfVxuICAgIGpzZlswXS5wdXNoKHUxKTtcblxuICAgIHZhciB1MjtcbiAgICBpZiAoKG0yNCAmIDEpID09PSAwKSB7XG4gICAgICB1MiA9IDA7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBtOCA9IChrMi5hbmRsbig3KSArIGQyKSAmIDc7XG4gICAgICBpZiAoKG04ID09PSAzIHx8IG04ID09PSA1KSAmJiBtMTQgPT09IDIpXG4gICAgICAgIHUyID0gLW0yNDtcbiAgICAgIGVsc2VcbiAgICAgICAgdTIgPSBtMjQ7XG4gICAgfVxuICAgIGpzZlsxXS5wdXNoKHUyKTtcblxuICAgIC8vIFNlY29uZCBwaGFzZVxuICAgIGlmICgyICogZDEgPT09IHUxICsgMSlcbiAgICAgIGQxID0gMSAtIGQxO1xuICAgIGlmICgyICogZDIgPT09IHUyICsgMSlcbiAgICAgIGQyID0gMSAtIGQyO1xuICAgIGsxLml1c2hybigxKTtcbiAgICBrMi5pdXNocm4oMSk7XG4gIH1cblxuICByZXR1cm4ganNmO1xufVxudXRpbHMuZ2V0SlNGID0gZ2V0SlNGO1xuXG5mdW5jdGlvbiBjYWNoZWRQcm9wZXJ0eShvYmosIG5hbWUsIGNvbXB1dGVyKSB7XG4gIHZhciBrZXkgPSAnXycgKyBuYW1lO1xuICBvYmoucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24gY2FjaGVkUHJvcGVydHkoKSB7XG4gICAgcmV0dXJuIHRoaXNba2V5XSAhPT0gdW5kZWZpbmVkID8gdGhpc1trZXldIDpcbiAgICAgICAgICAgdGhpc1trZXldID0gY29tcHV0ZXIuY2FsbCh0aGlzKTtcbiAgfTtcbn1cbnV0aWxzLmNhY2hlZFByb3BlcnR5ID0gY2FjaGVkUHJvcGVydHk7XG5cbmZ1bmN0aW9uIHBhcnNlQnl0ZXMoYnl0ZXMpIHtcbiAgcmV0dXJuIHR5cGVvZiBieXRlcyA9PT0gJ3N0cmluZycgPyB1dGlscy50b0FycmF5KGJ5dGVzLCAnaGV4JykgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJ5dGVzO1xufVxudXRpbHMucGFyc2VCeXRlcyA9IHBhcnNlQnl0ZXM7XG5cbmZ1bmN0aW9uIGludEZyb21MRShieXRlcykge1xuICByZXR1cm4gbmV3IEJOKGJ5dGVzLCAnaGV4JywgJ2xlJyk7XG59XG51dGlscy5pbnRGcm9tTEUgPSBpbnRGcm9tTEU7XG5cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJuYW1lXCI6IFwiZWxsaXB0aWNcIixcbiAgXCJ2ZXJzaW9uXCI6IFwiNi40LjFcIixcbiAgXCJkZXNjcmlwdGlvblwiOiBcIkVDIGNyeXB0b2dyYXBoeVwiLFxuICBcIm1haW5cIjogXCJsaWIvZWxsaXB0aWMuanNcIixcbiAgXCJmaWxlc1wiOiBbXG4gICAgXCJsaWJcIlxuICBdLFxuICBcInNjcmlwdHNcIjoge1xuICAgIFwianNjc1wiOiBcImpzY3MgYmVuY2htYXJrcy8qLmpzIGxpYi8qLmpzIGxpYi8qKi8qLmpzIGxpYi8qKi8qKi8qLmpzIHRlc3QvaW5kZXguanNcIixcbiAgICBcImpzaGludFwiOiBcImpzY3MgYmVuY2htYXJrcy8qLmpzIGxpYi8qLmpzIGxpYi8qKi8qLmpzIGxpYi8qKi8qKi8qLmpzIHRlc3QvaW5kZXguanNcIixcbiAgICBcImxpbnRcIjogXCJucG0gcnVuIGpzY3MgJiYgbnBtIHJ1biBqc2hpbnRcIixcbiAgICBcInVuaXRcIjogXCJpc3RhbmJ1bCB0ZXN0IF9tb2NoYSAtLXJlcG9ydGVyPXNwZWMgdGVzdC9pbmRleC5qc1wiLFxuICAgIFwidGVzdFwiOiBcIm5wbSBydW4gbGludCAmJiBucG0gcnVuIHVuaXRcIixcbiAgICBcInZlcnNpb25cIjogXCJncnVudCBkaXN0ICYmIGdpdCBhZGQgZGlzdC9cIlxuICB9LFxuICBcInJlcG9zaXRvcnlcIjoge1xuICAgIFwidHlwZVwiOiBcImdpdFwiLFxuICAgIFwidXJsXCI6IFwiZ2l0QGdpdGh1Yi5jb206aW5kdXRueS9lbGxpcHRpY1wiXG4gIH0sXG4gIFwia2V5d29yZHNcIjogW1xuICAgIFwiRUNcIixcbiAgICBcIkVsbGlwdGljXCIsXG4gICAgXCJjdXJ2ZVwiLFxuICAgIFwiQ3J5cHRvZ3JhcGh5XCJcbiAgXSxcbiAgXCJhdXRob3JcIjogXCJGZWRvciBJbmR1dG55IDxmZWRvckBpbmR1dG55LmNvbT5cIixcbiAgXCJsaWNlbnNlXCI6IFwiTUlUXCIsXG4gIFwiYnVnc1wiOiB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vaW5kdXRueS9lbGxpcHRpYy9pc3N1ZXNcIlxuICB9LFxuICBcImhvbWVwYWdlXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2luZHV0bnkvZWxsaXB0aWNcIixcbiAgXCJkZXZEZXBlbmRlbmNpZXNcIjoge1xuICAgIFwiYnJmc1wiOiBcIl4xLjQuM1wiLFxuICAgIFwiY292ZXJhbGxzXCI6IFwiXjIuMTEuM1wiLFxuICAgIFwiZ3J1bnRcIjogXCJeMC40LjVcIixcbiAgICBcImdydW50LWJyb3dzZXJpZnlcIjogXCJeNS4wLjBcIixcbiAgICBcImdydW50LWNsaVwiOiBcIl4xLjIuMFwiLFxuICAgIFwiZ3J1bnQtY29udHJpYi1jb25uZWN0XCI6IFwiXjEuMC4wXCIsXG4gICAgXCJncnVudC1jb250cmliLWNvcHlcIjogXCJeMS4wLjBcIixcbiAgICBcImdydW50LWNvbnRyaWItdWdsaWZ5XCI6IFwiXjEuMC4xXCIsXG4gICAgXCJncnVudC1tb2NoYS1pc3RhbmJ1bFwiOiBcIl4zLjAuMVwiLFxuICAgIFwiZ3J1bnQtc2F1Y2VsYWJzXCI6IFwiXjguNi4yXCIsXG4gICAgXCJpc3RhbmJ1bFwiOiBcIl4wLjQuMlwiLFxuICAgIFwianNjc1wiOiBcIl4yLjkuMFwiLFxuICAgIFwianNoaW50XCI6IFwiXjIuNi4wXCIsXG4gICAgXCJtb2NoYVwiOiBcIl4yLjEuMFwiXG4gIH0sXG4gIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICBcImJuLmpzXCI6IFwiXjQuNC4wXCIsXG4gICAgXCJicm9yYW5kXCI6IFwiXjEuMC4xXCIsXG4gICAgXCJoYXNoLmpzXCI6IFwiXjEuMC4wXCIsXG4gICAgXCJobWFjLWRyYmdcIjogXCJeMS4wLjBcIixcbiAgICBcImluaGVyaXRzXCI6IFwiXjIuMC4xXCIsXG4gICAgXCJtaW5pbWFsaXN0aWMtYXNzZXJ0XCI6IFwiXjEuMC4wXCIsXG4gICAgXCJtaW5pbWFsaXN0aWMtY3J5cHRvLXV0aWxzXCI6IFwiXjEuMC4wXCJcbiAgfVxufVxuIiwidmFyIGhhc2ggPSBleHBvcnRzO1xuXG5oYXNoLnV0aWxzID0gcmVxdWlyZSgnLi9oYXNoL3V0aWxzJyk7XG5oYXNoLmNvbW1vbiA9IHJlcXVpcmUoJy4vaGFzaC9jb21tb24nKTtcbmhhc2guc2hhID0gcmVxdWlyZSgnLi9oYXNoL3NoYScpO1xuaGFzaC5yaXBlbWQgPSByZXF1aXJlKCcuL2hhc2gvcmlwZW1kJyk7XG5oYXNoLmhtYWMgPSByZXF1aXJlKCcuL2hhc2gvaG1hYycpO1xuXG4vLyBQcm94eSBoYXNoIGZ1bmN0aW9ucyB0byB0aGUgbWFpbiBvYmplY3Rcbmhhc2guc2hhMSA9IGhhc2guc2hhLnNoYTE7XG5oYXNoLnNoYTI1NiA9IGhhc2guc2hhLnNoYTI1Njtcbmhhc2guc2hhMjI0ID0gaGFzaC5zaGEuc2hhMjI0O1xuaGFzaC5zaGEzODQgPSBoYXNoLnNoYS5zaGEzODQ7XG5oYXNoLnNoYTUxMiA9IGhhc2guc2hhLnNoYTUxMjtcbmhhc2gucmlwZW1kMTYwID0gaGFzaC5yaXBlbWQucmlwZW1kMTYwO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG52YXIgYXNzZXJ0ID0gcmVxdWlyZSgnbWluaW1hbGlzdGljLWFzc2VydCcpO1xuXG5mdW5jdGlvbiBCbG9ja0hhc2goKSB7XG4gIHRoaXMucGVuZGluZyA9IG51bGw7XG4gIHRoaXMucGVuZGluZ1RvdGFsID0gMDtcbiAgdGhpcy5ibG9ja1NpemUgPSB0aGlzLmNvbnN0cnVjdG9yLmJsb2NrU2l6ZTtcbiAgdGhpcy5vdXRTaXplID0gdGhpcy5jb25zdHJ1Y3Rvci5vdXRTaXplO1xuICB0aGlzLmhtYWNTdHJlbmd0aCA9IHRoaXMuY29uc3RydWN0b3IuaG1hY1N0cmVuZ3RoO1xuICB0aGlzLnBhZExlbmd0aCA9IHRoaXMuY29uc3RydWN0b3IucGFkTGVuZ3RoIC8gODtcbiAgdGhpcy5lbmRpYW4gPSAnYmlnJztcblxuICB0aGlzLl9kZWx0YTggPSB0aGlzLmJsb2NrU2l6ZSAvIDg7XG4gIHRoaXMuX2RlbHRhMzIgPSB0aGlzLmJsb2NrU2l6ZSAvIDMyO1xufVxuZXhwb3J0cy5CbG9ja0hhc2ggPSBCbG9ja0hhc2g7XG5cbkJsb2NrSGFzaC5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24gdXBkYXRlKG1zZywgZW5jKSB7XG4gIC8vIENvbnZlcnQgbWVzc2FnZSB0byBhcnJheSwgcGFkIGl0LCBhbmQgam9pbiBpbnRvIDMyYml0IGJsb2Nrc1xuICBtc2cgPSB1dGlscy50b0FycmF5KG1zZywgZW5jKTtcbiAgaWYgKCF0aGlzLnBlbmRpbmcpXG4gICAgdGhpcy5wZW5kaW5nID0gbXNnO1xuICBlbHNlXG4gICAgdGhpcy5wZW5kaW5nID0gdGhpcy5wZW5kaW5nLmNvbmNhdChtc2cpO1xuICB0aGlzLnBlbmRpbmdUb3RhbCArPSBtc2cubGVuZ3RoO1xuXG4gIC8vIEVub3VnaCBkYXRhLCB0cnkgdXBkYXRpbmdcbiAgaWYgKHRoaXMucGVuZGluZy5sZW5ndGggPj0gdGhpcy5fZGVsdGE4KSB7XG4gICAgbXNnID0gdGhpcy5wZW5kaW5nO1xuXG4gICAgLy8gUHJvY2VzcyBwZW5kaW5nIGRhdGEgaW4gYmxvY2tzXG4gICAgdmFyIHIgPSBtc2cubGVuZ3RoICUgdGhpcy5fZGVsdGE4O1xuICAgIHRoaXMucGVuZGluZyA9IG1zZy5zbGljZShtc2cubGVuZ3RoIC0gciwgbXNnLmxlbmd0aCk7XG4gICAgaWYgKHRoaXMucGVuZGluZy5sZW5ndGggPT09IDApXG4gICAgICB0aGlzLnBlbmRpbmcgPSBudWxsO1xuXG4gICAgbXNnID0gdXRpbHMuam9pbjMyKG1zZywgMCwgbXNnLmxlbmd0aCAtIHIsIHRoaXMuZW5kaWFuKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1zZy5sZW5ndGg7IGkgKz0gdGhpcy5fZGVsdGEzMilcbiAgICAgIHRoaXMuX3VwZGF0ZShtc2csIGksIGkgKyB0aGlzLl9kZWx0YTMyKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuQmxvY2tIYXNoLnByb3RvdHlwZS5kaWdlc3QgPSBmdW5jdGlvbiBkaWdlc3QoZW5jKSB7XG4gIHRoaXMudXBkYXRlKHRoaXMuX3BhZCgpKTtcbiAgYXNzZXJ0KHRoaXMucGVuZGluZyA9PT0gbnVsbCk7XG5cbiAgcmV0dXJuIHRoaXMuX2RpZ2VzdChlbmMpO1xufTtcblxuQmxvY2tIYXNoLnByb3RvdHlwZS5fcGFkID0gZnVuY3Rpb24gcGFkKCkge1xuICB2YXIgbGVuID0gdGhpcy5wZW5kaW5nVG90YWw7XG4gIHZhciBieXRlcyA9IHRoaXMuX2RlbHRhODtcbiAgdmFyIGsgPSBieXRlcyAtICgobGVuICsgdGhpcy5wYWRMZW5ndGgpICUgYnl0ZXMpO1xuICB2YXIgcmVzID0gbmV3IEFycmF5KGsgKyB0aGlzLnBhZExlbmd0aCk7XG4gIHJlc1swXSA9IDB4ODA7XG4gIGZvciAodmFyIGkgPSAxOyBpIDwgazsgaSsrKVxuICAgIHJlc1tpXSA9IDA7XG5cbiAgLy8gQXBwZW5kIGxlbmd0aFxuICBsZW4gPDw9IDM7XG4gIGlmICh0aGlzLmVuZGlhbiA9PT0gJ2JpZycpIHtcbiAgICBmb3IgKHZhciB0ID0gODsgdCA8IHRoaXMucGFkTGVuZ3RoOyB0KyspXG4gICAgICByZXNbaSsrXSA9IDA7XG5cbiAgICByZXNbaSsrXSA9IDA7XG4gICAgcmVzW2krK10gPSAwO1xuICAgIHJlc1tpKytdID0gMDtcbiAgICByZXNbaSsrXSA9IDA7XG4gICAgcmVzW2krK10gPSAobGVuID4+PiAyNCkgJiAweGZmO1xuICAgIHJlc1tpKytdID0gKGxlbiA+Pj4gMTYpICYgMHhmZjtcbiAgICByZXNbaSsrXSA9IChsZW4gPj4+IDgpICYgMHhmZjtcbiAgICByZXNbaSsrXSA9IGxlbiAmIDB4ZmY7XG4gIH0gZWxzZSB7XG4gICAgcmVzW2krK10gPSBsZW4gJiAweGZmO1xuICAgIHJlc1tpKytdID0gKGxlbiA+Pj4gOCkgJiAweGZmO1xuICAgIHJlc1tpKytdID0gKGxlbiA+Pj4gMTYpICYgMHhmZjtcbiAgICByZXNbaSsrXSA9IChsZW4gPj4+IDI0KSAmIDB4ZmY7XG4gICAgcmVzW2krK10gPSAwO1xuICAgIHJlc1tpKytdID0gMDtcbiAgICByZXNbaSsrXSA9IDA7XG4gICAgcmVzW2krK10gPSAwO1xuXG4gICAgZm9yICh0ID0gODsgdCA8IHRoaXMucGFkTGVuZ3RoOyB0KyspXG4gICAgICByZXNbaSsrXSA9IDA7XG4gIH1cblxuICByZXR1cm4gcmVzO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpO1xudmFyIGFzc2VydCA9IHJlcXVpcmUoJ21pbmltYWxpc3RpYy1hc3NlcnQnKTtcblxuZnVuY3Rpb24gSG1hYyhoYXNoLCBrZXksIGVuYykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgSG1hYykpXG4gICAgcmV0dXJuIG5ldyBIbWFjKGhhc2gsIGtleSwgZW5jKTtcbiAgdGhpcy5IYXNoID0gaGFzaDtcbiAgdGhpcy5ibG9ja1NpemUgPSBoYXNoLmJsb2NrU2l6ZSAvIDg7XG4gIHRoaXMub3V0U2l6ZSA9IGhhc2gub3V0U2l6ZSAvIDg7XG4gIHRoaXMuaW5uZXIgPSBudWxsO1xuICB0aGlzLm91dGVyID0gbnVsbDtcblxuICB0aGlzLl9pbml0KHV0aWxzLnRvQXJyYXkoa2V5LCBlbmMpKTtcbn1cbm1vZHVsZS5leHBvcnRzID0gSG1hYztcblxuSG1hYy5wcm90b3R5cGUuX2luaXQgPSBmdW5jdGlvbiBpbml0KGtleSkge1xuICAvLyBTaG9ydGVuIGtleSwgaWYgbmVlZGVkXG4gIGlmIChrZXkubGVuZ3RoID4gdGhpcy5ibG9ja1NpemUpXG4gICAga2V5ID0gbmV3IHRoaXMuSGFzaCgpLnVwZGF0ZShrZXkpLmRpZ2VzdCgpO1xuICBhc3NlcnQoa2V5Lmxlbmd0aCA8PSB0aGlzLmJsb2NrU2l6ZSk7XG5cbiAgLy8gQWRkIHBhZGRpbmcgdG8ga2V5XG4gIGZvciAodmFyIGkgPSBrZXkubGVuZ3RoOyBpIDwgdGhpcy5ibG9ja1NpemU7IGkrKylcbiAgICBrZXkucHVzaCgwKTtcblxuICBmb3IgKGkgPSAwOyBpIDwga2V5Lmxlbmd0aDsgaSsrKVxuICAgIGtleVtpXSBePSAweDM2O1xuICB0aGlzLmlubmVyID0gbmV3IHRoaXMuSGFzaCgpLnVwZGF0ZShrZXkpO1xuXG4gIC8vIDB4MzYgXiAweDVjID0gMHg2YVxuICBmb3IgKGkgPSAwOyBpIDwga2V5Lmxlbmd0aDsgaSsrKVxuICAgIGtleVtpXSBePSAweDZhO1xuICB0aGlzLm91dGVyID0gbmV3IHRoaXMuSGFzaCgpLnVwZGF0ZShrZXkpO1xufTtcblxuSG1hYy5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24gdXBkYXRlKG1zZywgZW5jKSB7XG4gIHRoaXMuaW5uZXIudXBkYXRlKG1zZywgZW5jKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5IbWFjLnByb3RvdHlwZS5kaWdlc3QgPSBmdW5jdGlvbiBkaWdlc3QoZW5jKSB7XG4gIHRoaXMub3V0ZXIudXBkYXRlKHRoaXMuaW5uZXIuZGlnZXN0KCkpO1xuICByZXR1cm4gdGhpcy5vdXRlci5kaWdlc3QoZW5jKTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKTtcbnZhciBjb21tb24gPSByZXF1aXJlKCcuL2NvbW1vbicpO1xuXG52YXIgcm90bDMyID0gdXRpbHMucm90bDMyO1xudmFyIHN1bTMyID0gdXRpbHMuc3VtMzI7XG52YXIgc3VtMzJfMyA9IHV0aWxzLnN1bTMyXzM7XG52YXIgc3VtMzJfNCA9IHV0aWxzLnN1bTMyXzQ7XG52YXIgQmxvY2tIYXNoID0gY29tbW9uLkJsb2NrSGFzaDtcblxuZnVuY3Rpb24gUklQRU1EMTYwKCkge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgUklQRU1EMTYwKSlcbiAgICByZXR1cm4gbmV3IFJJUEVNRDE2MCgpO1xuXG4gIEJsb2NrSGFzaC5jYWxsKHRoaXMpO1xuXG4gIHRoaXMuaCA9IFsgMHg2NzQ1MjMwMSwgMHhlZmNkYWI4OSwgMHg5OGJhZGNmZSwgMHgxMDMyNTQ3NiwgMHhjM2QyZTFmMCBdO1xuICB0aGlzLmVuZGlhbiA9ICdsaXR0bGUnO1xufVxudXRpbHMuaW5oZXJpdHMoUklQRU1EMTYwLCBCbG9ja0hhc2gpO1xuZXhwb3J0cy5yaXBlbWQxNjAgPSBSSVBFTUQxNjA7XG5cblJJUEVNRDE2MC5ibG9ja1NpemUgPSA1MTI7XG5SSVBFTUQxNjAub3V0U2l6ZSA9IDE2MDtcblJJUEVNRDE2MC5obWFjU3RyZW5ndGggPSAxOTI7XG5SSVBFTUQxNjAucGFkTGVuZ3RoID0gNjQ7XG5cblJJUEVNRDE2MC5wcm90b3R5cGUuX3VwZGF0ZSA9IGZ1bmN0aW9uIHVwZGF0ZShtc2csIHN0YXJ0KSB7XG4gIHZhciBBID0gdGhpcy5oWzBdO1xuICB2YXIgQiA9IHRoaXMuaFsxXTtcbiAgdmFyIEMgPSB0aGlzLmhbMl07XG4gIHZhciBEID0gdGhpcy5oWzNdO1xuICB2YXIgRSA9IHRoaXMuaFs0XTtcbiAgdmFyIEFoID0gQTtcbiAgdmFyIEJoID0gQjtcbiAgdmFyIENoID0gQztcbiAgdmFyIERoID0gRDtcbiAgdmFyIEVoID0gRTtcbiAgZm9yICh2YXIgaiA9IDA7IGogPCA4MDsgaisrKSB7XG4gICAgdmFyIFQgPSBzdW0zMihcbiAgICAgIHJvdGwzMihcbiAgICAgICAgc3VtMzJfNChBLCBmKGosIEIsIEMsIEQpLCBtc2dbcltqXSArIHN0YXJ0XSwgSyhqKSksXG4gICAgICAgIHNbal0pLFxuICAgICAgRSk7XG4gICAgQSA9IEU7XG4gICAgRSA9IEQ7XG4gICAgRCA9IHJvdGwzMihDLCAxMCk7XG4gICAgQyA9IEI7XG4gICAgQiA9IFQ7XG4gICAgVCA9IHN1bTMyKFxuICAgICAgcm90bDMyKFxuICAgICAgICBzdW0zMl80KEFoLCBmKDc5IC0gaiwgQmgsIENoLCBEaCksIG1zZ1tyaFtqXSArIHN0YXJ0XSwgS2goaikpLFxuICAgICAgICBzaFtqXSksXG4gICAgICBFaCk7XG4gICAgQWggPSBFaDtcbiAgICBFaCA9IERoO1xuICAgIERoID0gcm90bDMyKENoLCAxMCk7XG4gICAgQ2ggPSBCaDtcbiAgICBCaCA9IFQ7XG4gIH1cbiAgVCA9IHN1bTMyXzModGhpcy5oWzFdLCBDLCBEaCk7XG4gIHRoaXMuaFsxXSA9IHN1bTMyXzModGhpcy5oWzJdLCBELCBFaCk7XG4gIHRoaXMuaFsyXSA9IHN1bTMyXzModGhpcy5oWzNdLCBFLCBBaCk7XG4gIHRoaXMuaFszXSA9IHN1bTMyXzModGhpcy5oWzRdLCBBLCBCaCk7XG4gIHRoaXMuaFs0XSA9IHN1bTMyXzModGhpcy5oWzBdLCBCLCBDaCk7XG4gIHRoaXMuaFswXSA9IFQ7XG59O1xuXG5SSVBFTUQxNjAucHJvdG90eXBlLl9kaWdlc3QgPSBmdW5jdGlvbiBkaWdlc3QoZW5jKSB7XG4gIGlmIChlbmMgPT09ICdoZXgnKVxuICAgIHJldHVybiB1dGlscy50b0hleDMyKHRoaXMuaCwgJ2xpdHRsZScpO1xuICBlbHNlXG4gICAgcmV0dXJuIHV0aWxzLnNwbGl0MzIodGhpcy5oLCAnbGl0dGxlJyk7XG59O1xuXG5mdW5jdGlvbiBmKGosIHgsIHksIHopIHtcbiAgaWYgKGogPD0gMTUpXG4gICAgcmV0dXJuIHggXiB5IF4gejtcbiAgZWxzZSBpZiAoaiA8PSAzMSlcbiAgICByZXR1cm4gKHggJiB5KSB8ICgofngpICYgeik7XG4gIGVsc2UgaWYgKGogPD0gNDcpXG4gICAgcmV0dXJuICh4IHwgKH55KSkgXiB6O1xuICBlbHNlIGlmIChqIDw9IDYzKVxuICAgIHJldHVybiAoeCAmIHopIHwgKHkgJiAofnopKTtcbiAgZWxzZVxuICAgIHJldHVybiB4IF4gKHkgfCAofnopKTtcbn1cblxuZnVuY3Rpb24gSyhqKSB7XG4gIGlmIChqIDw9IDE1KVxuICAgIHJldHVybiAweDAwMDAwMDAwO1xuICBlbHNlIGlmIChqIDw9IDMxKVxuICAgIHJldHVybiAweDVhODI3OTk5O1xuICBlbHNlIGlmIChqIDw9IDQ3KVxuICAgIHJldHVybiAweDZlZDllYmExO1xuICBlbHNlIGlmIChqIDw9IDYzKVxuICAgIHJldHVybiAweDhmMWJiY2RjO1xuICBlbHNlXG4gICAgcmV0dXJuIDB4YTk1M2ZkNGU7XG59XG5cbmZ1bmN0aW9uIEtoKGopIHtcbiAgaWYgKGogPD0gMTUpXG4gICAgcmV0dXJuIDB4NTBhMjhiZTY7XG4gIGVsc2UgaWYgKGogPD0gMzEpXG4gICAgcmV0dXJuIDB4NWM0ZGQxMjQ7XG4gIGVsc2UgaWYgKGogPD0gNDcpXG4gICAgcmV0dXJuIDB4NmQ3MDNlZjM7XG4gIGVsc2UgaWYgKGogPD0gNjMpXG4gICAgcmV0dXJuIDB4N2E2ZDc2ZTk7XG4gIGVsc2VcbiAgICByZXR1cm4gMHgwMDAwMDAwMDtcbn1cblxudmFyIHIgPSBbXG4gIDAsIDEsIDIsIDMsIDQsIDUsIDYsIDcsIDgsIDksIDEwLCAxMSwgMTIsIDEzLCAxNCwgMTUsXG4gIDcsIDQsIDEzLCAxLCAxMCwgNiwgMTUsIDMsIDEyLCAwLCA5LCA1LCAyLCAxNCwgMTEsIDgsXG4gIDMsIDEwLCAxNCwgNCwgOSwgMTUsIDgsIDEsIDIsIDcsIDAsIDYsIDEzLCAxMSwgNSwgMTIsXG4gIDEsIDksIDExLCAxMCwgMCwgOCwgMTIsIDQsIDEzLCAzLCA3LCAxNSwgMTQsIDUsIDYsIDIsXG4gIDQsIDAsIDUsIDksIDcsIDEyLCAyLCAxMCwgMTQsIDEsIDMsIDgsIDExLCA2LCAxNSwgMTNcbl07XG5cbnZhciByaCA9IFtcbiAgNSwgMTQsIDcsIDAsIDksIDIsIDExLCA0LCAxMywgNiwgMTUsIDgsIDEsIDEwLCAzLCAxMixcbiAgNiwgMTEsIDMsIDcsIDAsIDEzLCA1LCAxMCwgMTQsIDE1LCA4LCAxMiwgNCwgOSwgMSwgMixcbiAgMTUsIDUsIDEsIDMsIDcsIDE0LCA2LCA5LCAxMSwgOCwgMTIsIDIsIDEwLCAwLCA0LCAxMyxcbiAgOCwgNiwgNCwgMSwgMywgMTEsIDE1LCAwLCA1LCAxMiwgMiwgMTMsIDksIDcsIDEwLCAxNCxcbiAgMTIsIDE1LCAxMCwgNCwgMSwgNSwgOCwgNywgNiwgMiwgMTMsIDE0LCAwLCAzLCA5LCAxMVxuXTtcblxudmFyIHMgPSBbXG4gIDExLCAxNCwgMTUsIDEyLCA1LCA4LCA3LCA5LCAxMSwgMTMsIDE0LCAxNSwgNiwgNywgOSwgOCxcbiAgNywgNiwgOCwgMTMsIDExLCA5LCA3LCAxNSwgNywgMTIsIDE1LCA5LCAxMSwgNywgMTMsIDEyLFxuICAxMSwgMTMsIDYsIDcsIDE0LCA5LCAxMywgMTUsIDE0LCA4LCAxMywgNiwgNSwgMTIsIDcsIDUsXG4gIDExLCAxMiwgMTQsIDE1LCAxNCwgMTUsIDksIDgsIDksIDE0LCA1LCA2LCA4LCA2LCA1LCAxMixcbiAgOSwgMTUsIDUsIDExLCA2LCA4LCAxMywgMTIsIDUsIDEyLCAxMywgMTQsIDExLCA4LCA1LCA2XG5dO1xuXG52YXIgc2ggPSBbXG4gIDgsIDksIDksIDExLCAxMywgMTUsIDE1LCA1LCA3LCA3LCA4LCAxMSwgMTQsIDE0LCAxMiwgNixcbiAgOSwgMTMsIDE1LCA3LCAxMiwgOCwgOSwgMTEsIDcsIDcsIDEyLCA3LCA2LCAxNSwgMTMsIDExLFxuICA5LCA3LCAxNSwgMTEsIDgsIDYsIDYsIDE0LCAxMiwgMTMsIDUsIDE0LCAxMywgMTMsIDcsIDUsXG4gIDE1LCA1LCA4LCAxMSwgMTQsIDE0LCA2LCAxNCwgNiwgOSwgMTIsIDksIDEyLCA1LCAxNSwgOCxcbiAgOCwgNSwgMTIsIDksIDEyLCA1LCAxNCwgNiwgOCwgMTMsIDYsIDUsIDE1LCAxMywgMTEsIDExXG5dO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnRzLnNoYTEgPSByZXF1aXJlKCcuL3NoYS8xJyk7XG5leHBvcnRzLnNoYTIyNCA9IHJlcXVpcmUoJy4vc2hhLzIyNCcpO1xuZXhwb3J0cy5zaGEyNTYgPSByZXF1aXJlKCcuL3NoYS8yNTYnKTtcbmV4cG9ydHMuc2hhMzg0ID0gcmVxdWlyZSgnLi9zaGEvMzg0Jyk7XG5leHBvcnRzLnNoYTUxMiA9IHJlcXVpcmUoJy4vc2hhLzUxMicpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpO1xudmFyIGNvbW1vbiA9IHJlcXVpcmUoJy4uL2NvbW1vbicpO1xudmFyIHNoYUNvbW1vbiA9IHJlcXVpcmUoJy4vY29tbW9uJyk7XG5cbnZhciByb3RsMzIgPSB1dGlscy5yb3RsMzI7XG52YXIgc3VtMzIgPSB1dGlscy5zdW0zMjtcbnZhciBzdW0zMl81ID0gdXRpbHMuc3VtMzJfNTtcbnZhciBmdF8xID0gc2hhQ29tbW9uLmZ0XzE7XG52YXIgQmxvY2tIYXNoID0gY29tbW9uLkJsb2NrSGFzaDtcblxudmFyIHNoYTFfSyA9IFtcbiAgMHg1QTgyNzk5OSwgMHg2RUQ5RUJBMSxcbiAgMHg4RjFCQkNEQywgMHhDQTYyQzFENlxuXTtcblxuZnVuY3Rpb24gU0hBMSgpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFNIQTEpKVxuICAgIHJldHVybiBuZXcgU0hBMSgpO1xuXG4gIEJsb2NrSGFzaC5jYWxsKHRoaXMpO1xuICB0aGlzLmggPSBbXG4gICAgMHg2NzQ1MjMwMSwgMHhlZmNkYWI4OSwgMHg5OGJhZGNmZSxcbiAgICAweDEwMzI1NDc2LCAweGMzZDJlMWYwIF07XG4gIHRoaXMuVyA9IG5ldyBBcnJheSg4MCk7XG59XG5cbnV0aWxzLmluaGVyaXRzKFNIQTEsIEJsb2NrSGFzaCk7XG5tb2R1bGUuZXhwb3J0cyA9IFNIQTE7XG5cblNIQTEuYmxvY2tTaXplID0gNTEyO1xuU0hBMS5vdXRTaXplID0gMTYwO1xuU0hBMS5obWFjU3RyZW5ndGggPSA4MDtcblNIQTEucGFkTGVuZ3RoID0gNjQ7XG5cblNIQTEucHJvdG90eXBlLl91cGRhdGUgPSBmdW5jdGlvbiBfdXBkYXRlKG1zZywgc3RhcnQpIHtcbiAgdmFyIFcgPSB0aGlzLlc7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCAxNjsgaSsrKVxuICAgIFdbaV0gPSBtc2dbc3RhcnQgKyBpXTtcblxuICBmb3IoOyBpIDwgVy5sZW5ndGg7IGkrKylcbiAgICBXW2ldID0gcm90bDMyKFdbaSAtIDNdIF4gV1tpIC0gOF0gXiBXW2kgLSAxNF0gXiBXW2kgLSAxNl0sIDEpO1xuXG4gIHZhciBhID0gdGhpcy5oWzBdO1xuICB2YXIgYiA9IHRoaXMuaFsxXTtcbiAgdmFyIGMgPSB0aGlzLmhbMl07XG4gIHZhciBkID0gdGhpcy5oWzNdO1xuICB2YXIgZSA9IHRoaXMuaFs0XTtcblxuICBmb3IgKGkgPSAwOyBpIDwgVy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBzID0gfn4oaSAvIDIwKTtcbiAgICB2YXIgdCA9IHN1bTMyXzUocm90bDMyKGEsIDUpLCBmdF8xKHMsIGIsIGMsIGQpLCBlLCBXW2ldLCBzaGExX0tbc10pO1xuICAgIGUgPSBkO1xuICAgIGQgPSBjO1xuICAgIGMgPSByb3RsMzIoYiwgMzApO1xuICAgIGIgPSBhO1xuICAgIGEgPSB0O1xuICB9XG5cbiAgdGhpcy5oWzBdID0gc3VtMzIodGhpcy5oWzBdLCBhKTtcbiAgdGhpcy5oWzFdID0gc3VtMzIodGhpcy5oWzFdLCBiKTtcbiAgdGhpcy5oWzJdID0gc3VtMzIodGhpcy5oWzJdLCBjKTtcbiAgdGhpcy5oWzNdID0gc3VtMzIodGhpcy5oWzNdLCBkKTtcbiAgdGhpcy5oWzRdID0gc3VtMzIodGhpcy5oWzRdLCBlKTtcbn07XG5cblNIQTEucHJvdG90eXBlLl9kaWdlc3QgPSBmdW5jdGlvbiBkaWdlc3QoZW5jKSB7XG4gIGlmIChlbmMgPT09ICdoZXgnKVxuICAgIHJldHVybiB1dGlscy50b0hleDMyKHRoaXMuaCwgJ2JpZycpO1xuICBlbHNlXG4gICAgcmV0dXJuIHV0aWxzLnNwbGl0MzIodGhpcy5oLCAnYmlnJyk7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpO1xudmFyIFNIQTI1NiA9IHJlcXVpcmUoJy4vMjU2Jyk7XG5cbmZ1bmN0aW9uIFNIQTIyNCgpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFNIQTIyNCkpXG4gICAgcmV0dXJuIG5ldyBTSEEyMjQoKTtcblxuICBTSEEyNTYuY2FsbCh0aGlzKTtcbiAgdGhpcy5oID0gW1xuICAgIDB4YzEwNTllZDgsIDB4MzY3Y2Q1MDcsIDB4MzA3MGRkMTcsIDB4ZjcwZTU5MzksXG4gICAgMHhmZmMwMGIzMSwgMHg2ODU4MTUxMSwgMHg2NGY5OGZhNywgMHhiZWZhNGZhNCBdO1xufVxudXRpbHMuaW5oZXJpdHMoU0hBMjI0LCBTSEEyNTYpO1xubW9kdWxlLmV4cG9ydHMgPSBTSEEyMjQ7XG5cblNIQTIyNC5ibG9ja1NpemUgPSA1MTI7XG5TSEEyMjQub3V0U2l6ZSA9IDIyNDtcblNIQTIyNC5obWFjU3RyZW5ndGggPSAxOTI7XG5TSEEyMjQucGFkTGVuZ3RoID0gNjQ7XG5cblNIQTIyNC5wcm90b3R5cGUuX2RpZ2VzdCA9IGZ1bmN0aW9uIGRpZ2VzdChlbmMpIHtcbiAgLy8gSnVzdCB0cnVuY2F0ZSBvdXRwdXRcbiAgaWYgKGVuYyA9PT0gJ2hleCcpXG4gICAgcmV0dXJuIHV0aWxzLnRvSGV4MzIodGhpcy5oLnNsaWNlKDAsIDcpLCAnYmlnJyk7XG4gIGVsc2VcbiAgICByZXR1cm4gdXRpbHMuc3BsaXQzMih0aGlzLmguc2xpY2UoMCwgNyksICdiaWcnKTtcbn07XG5cbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKTtcbnZhciBjb21tb24gPSByZXF1aXJlKCcuLi9jb21tb24nKTtcbnZhciBzaGFDb21tb24gPSByZXF1aXJlKCcuL2NvbW1vbicpO1xudmFyIGFzc2VydCA9IHJlcXVpcmUoJ21pbmltYWxpc3RpYy1hc3NlcnQnKTtcblxudmFyIHN1bTMyID0gdXRpbHMuc3VtMzI7XG52YXIgc3VtMzJfNCA9IHV0aWxzLnN1bTMyXzQ7XG52YXIgc3VtMzJfNSA9IHV0aWxzLnN1bTMyXzU7XG52YXIgY2gzMiA9IHNoYUNvbW1vbi5jaDMyO1xudmFyIG1hajMyID0gc2hhQ29tbW9uLm1hajMyO1xudmFyIHMwXzI1NiA9IHNoYUNvbW1vbi5zMF8yNTY7XG52YXIgczFfMjU2ID0gc2hhQ29tbW9uLnMxXzI1NjtcbnZhciBnMF8yNTYgPSBzaGFDb21tb24uZzBfMjU2O1xudmFyIGcxXzI1NiA9IHNoYUNvbW1vbi5nMV8yNTY7XG5cbnZhciBCbG9ja0hhc2ggPSBjb21tb24uQmxvY2tIYXNoO1xuXG52YXIgc2hhMjU2X0sgPSBbXG4gIDB4NDI4YTJmOTgsIDB4NzEzNzQ0OTEsIDB4YjVjMGZiY2YsIDB4ZTliNWRiYTUsXG4gIDB4Mzk1NmMyNWIsIDB4NTlmMTExZjEsIDB4OTIzZjgyYTQsIDB4YWIxYzVlZDUsXG4gIDB4ZDgwN2FhOTgsIDB4MTI4MzViMDEsIDB4MjQzMTg1YmUsIDB4NTUwYzdkYzMsXG4gIDB4NzJiZTVkNzQsIDB4ODBkZWIxZmUsIDB4OWJkYzA2YTcsIDB4YzE5YmYxNzQsXG4gIDB4ZTQ5YjY5YzEsIDB4ZWZiZTQ3ODYsIDB4MGZjMTlkYzYsIDB4MjQwY2ExY2MsXG4gIDB4MmRlOTJjNmYsIDB4NGE3NDg0YWEsIDB4NWNiMGE5ZGMsIDB4NzZmOTg4ZGEsXG4gIDB4OTgzZTUxNTIsIDB4YTgzMWM2NmQsIDB4YjAwMzI3YzgsIDB4YmY1OTdmYzcsXG4gIDB4YzZlMDBiZjMsIDB4ZDVhNzkxNDcsIDB4MDZjYTYzNTEsIDB4MTQyOTI5NjcsXG4gIDB4MjdiNzBhODUsIDB4MmUxYjIxMzgsIDB4NGQyYzZkZmMsIDB4NTMzODBkMTMsXG4gIDB4NjUwYTczNTQsIDB4NzY2YTBhYmIsIDB4ODFjMmM5MmUsIDB4OTI3MjJjODUsXG4gIDB4YTJiZmU4YTEsIDB4YTgxYTY2NGIsIDB4YzI0YjhiNzAsIDB4Yzc2YzUxYTMsXG4gIDB4ZDE5MmU4MTksIDB4ZDY5OTA2MjQsIDB4ZjQwZTM1ODUsIDB4MTA2YWEwNzAsXG4gIDB4MTlhNGMxMTYsIDB4MWUzNzZjMDgsIDB4Mjc0ODc3NGMsIDB4MzRiMGJjYjUsXG4gIDB4MzkxYzBjYjMsIDB4NGVkOGFhNGEsIDB4NWI5Y2NhNGYsIDB4NjgyZTZmZjMsXG4gIDB4NzQ4ZjgyZWUsIDB4NzhhNTYzNmYsIDB4ODRjODc4MTQsIDB4OGNjNzAyMDgsXG4gIDB4OTBiZWZmZmEsIDB4YTQ1MDZjZWIsIDB4YmVmOWEzZjcsIDB4YzY3MTc4ZjJcbl07XG5cbmZ1bmN0aW9uIFNIQTI1NigpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFNIQTI1NikpXG4gICAgcmV0dXJuIG5ldyBTSEEyNTYoKTtcblxuICBCbG9ja0hhc2guY2FsbCh0aGlzKTtcbiAgdGhpcy5oID0gW1xuICAgIDB4NmEwOWU2NjcsIDB4YmI2N2FlODUsIDB4M2M2ZWYzNzIsIDB4YTU0ZmY1M2EsXG4gICAgMHg1MTBlNTI3ZiwgMHg5YjA1Njg4YywgMHgxZjgzZDlhYiwgMHg1YmUwY2QxOVxuICBdO1xuICB0aGlzLmsgPSBzaGEyNTZfSztcbiAgdGhpcy5XID0gbmV3IEFycmF5KDY0KTtcbn1cbnV0aWxzLmluaGVyaXRzKFNIQTI1NiwgQmxvY2tIYXNoKTtcbm1vZHVsZS5leHBvcnRzID0gU0hBMjU2O1xuXG5TSEEyNTYuYmxvY2tTaXplID0gNTEyO1xuU0hBMjU2Lm91dFNpemUgPSAyNTY7XG5TSEEyNTYuaG1hY1N0cmVuZ3RoID0gMTkyO1xuU0hBMjU2LnBhZExlbmd0aCA9IDY0O1xuXG5TSEEyNTYucHJvdG90eXBlLl91cGRhdGUgPSBmdW5jdGlvbiBfdXBkYXRlKG1zZywgc3RhcnQpIHtcbiAgdmFyIFcgPSB0aGlzLlc7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCAxNjsgaSsrKVxuICAgIFdbaV0gPSBtc2dbc3RhcnQgKyBpXTtcbiAgZm9yICg7IGkgPCBXLmxlbmd0aDsgaSsrKVxuICAgIFdbaV0gPSBzdW0zMl80KGcxXzI1NihXW2kgLSAyXSksIFdbaSAtIDddLCBnMF8yNTYoV1tpIC0gMTVdKSwgV1tpIC0gMTZdKTtcblxuICB2YXIgYSA9IHRoaXMuaFswXTtcbiAgdmFyIGIgPSB0aGlzLmhbMV07XG4gIHZhciBjID0gdGhpcy5oWzJdO1xuICB2YXIgZCA9IHRoaXMuaFszXTtcbiAgdmFyIGUgPSB0aGlzLmhbNF07XG4gIHZhciBmID0gdGhpcy5oWzVdO1xuICB2YXIgZyA9IHRoaXMuaFs2XTtcbiAgdmFyIGggPSB0aGlzLmhbN107XG5cbiAgYXNzZXJ0KHRoaXMuay5sZW5ndGggPT09IFcubGVuZ3RoKTtcbiAgZm9yIChpID0gMDsgaSA8IFcubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgVDEgPSBzdW0zMl81KGgsIHMxXzI1NihlKSwgY2gzMihlLCBmLCBnKSwgdGhpcy5rW2ldLCBXW2ldKTtcbiAgICB2YXIgVDIgPSBzdW0zMihzMF8yNTYoYSksIG1hajMyKGEsIGIsIGMpKTtcbiAgICBoID0gZztcbiAgICBnID0gZjtcbiAgICBmID0gZTtcbiAgICBlID0gc3VtMzIoZCwgVDEpO1xuICAgIGQgPSBjO1xuICAgIGMgPSBiO1xuICAgIGIgPSBhO1xuICAgIGEgPSBzdW0zMihUMSwgVDIpO1xuICB9XG5cbiAgdGhpcy5oWzBdID0gc3VtMzIodGhpcy5oWzBdLCBhKTtcbiAgdGhpcy5oWzFdID0gc3VtMzIodGhpcy5oWzFdLCBiKTtcbiAgdGhpcy5oWzJdID0gc3VtMzIodGhpcy5oWzJdLCBjKTtcbiAgdGhpcy5oWzNdID0gc3VtMzIodGhpcy5oWzNdLCBkKTtcbiAgdGhpcy5oWzRdID0gc3VtMzIodGhpcy5oWzRdLCBlKTtcbiAgdGhpcy5oWzVdID0gc3VtMzIodGhpcy5oWzVdLCBmKTtcbiAgdGhpcy5oWzZdID0gc3VtMzIodGhpcy5oWzZdLCBnKTtcbiAgdGhpcy5oWzddID0gc3VtMzIodGhpcy5oWzddLCBoKTtcbn07XG5cblNIQTI1Ni5wcm90b3R5cGUuX2RpZ2VzdCA9IGZ1bmN0aW9uIGRpZ2VzdChlbmMpIHtcbiAgaWYgKGVuYyA9PT0gJ2hleCcpXG4gICAgcmV0dXJuIHV0aWxzLnRvSGV4MzIodGhpcy5oLCAnYmlnJyk7XG4gIGVsc2VcbiAgICByZXR1cm4gdXRpbHMuc3BsaXQzMih0aGlzLmgsICdiaWcnKTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7XG5cbnZhciBTSEE1MTIgPSByZXF1aXJlKCcuLzUxMicpO1xuXG5mdW5jdGlvbiBTSEEzODQoKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBTSEEzODQpKVxuICAgIHJldHVybiBuZXcgU0hBMzg0KCk7XG5cbiAgU0hBNTEyLmNhbGwodGhpcyk7XG4gIHRoaXMuaCA9IFtcbiAgICAweGNiYmI5ZDVkLCAweGMxMDU5ZWQ4LFxuICAgIDB4NjI5YTI5MmEsIDB4MzY3Y2Q1MDcsXG4gICAgMHg5MTU5MDE1YSwgMHgzMDcwZGQxNyxcbiAgICAweDE1MmZlY2Q4LCAweGY3MGU1OTM5LFxuICAgIDB4NjczMzI2NjcsIDB4ZmZjMDBiMzEsXG4gICAgMHg4ZWI0NGE4NywgMHg2ODU4MTUxMSxcbiAgICAweGRiMGMyZTBkLCAweDY0Zjk4ZmE3LFxuICAgIDB4NDdiNTQ4MWQsIDB4YmVmYTRmYTQgXTtcbn1cbnV0aWxzLmluaGVyaXRzKFNIQTM4NCwgU0hBNTEyKTtcbm1vZHVsZS5leHBvcnRzID0gU0hBMzg0O1xuXG5TSEEzODQuYmxvY2tTaXplID0gMTAyNDtcblNIQTM4NC5vdXRTaXplID0gMzg0O1xuU0hBMzg0LmhtYWNTdHJlbmd0aCA9IDE5MjtcblNIQTM4NC5wYWRMZW5ndGggPSAxMjg7XG5cblNIQTM4NC5wcm90b3R5cGUuX2RpZ2VzdCA9IGZ1bmN0aW9uIGRpZ2VzdChlbmMpIHtcbiAgaWYgKGVuYyA9PT0gJ2hleCcpXG4gICAgcmV0dXJuIHV0aWxzLnRvSGV4MzIodGhpcy5oLnNsaWNlKDAsIDEyKSwgJ2JpZycpO1xuICBlbHNlXG4gICAgcmV0dXJuIHV0aWxzLnNwbGl0MzIodGhpcy5oLnNsaWNlKDAsIDEyKSwgJ2JpZycpO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKTtcbnZhciBjb21tb24gPSByZXF1aXJlKCcuLi9jb21tb24nKTtcbnZhciBhc3NlcnQgPSByZXF1aXJlKCdtaW5pbWFsaXN0aWMtYXNzZXJ0Jyk7XG5cbnZhciByb3RyNjRfaGkgPSB1dGlscy5yb3RyNjRfaGk7XG52YXIgcm90cjY0X2xvID0gdXRpbHMucm90cjY0X2xvO1xudmFyIHNocjY0X2hpID0gdXRpbHMuc2hyNjRfaGk7XG52YXIgc2hyNjRfbG8gPSB1dGlscy5zaHI2NF9sbztcbnZhciBzdW02NCA9IHV0aWxzLnN1bTY0O1xudmFyIHN1bTY0X2hpID0gdXRpbHMuc3VtNjRfaGk7XG52YXIgc3VtNjRfbG8gPSB1dGlscy5zdW02NF9sbztcbnZhciBzdW02NF80X2hpID0gdXRpbHMuc3VtNjRfNF9oaTtcbnZhciBzdW02NF80X2xvID0gdXRpbHMuc3VtNjRfNF9sbztcbnZhciBzdW02NF81X2hpID0gdXRpbHMuc3VtNjRfNV9oaTtcbnZhciBzdW02NF81X2xvID0gdXRpbHMuc3VtNjRfNV9sbztcblxudmFyIEJsb2NrSGFzaCA9IGNvbW1vbi5CbG9ja0hhc2g7XG5cbnZhciBzaGE1MTJfSyA9IFtcbiAgMHg0MjhhMmY5OCwgMHhkNzI4YWUyMiwgMHg3MTM3NDQ5MSwgMHgyM2VmNjVjZCxcbiAgMHhiNWMwZmJjZiwgMHhlYzRkM2IyZiwgMHhlOWI1ZGJhNSwgMHg4MTg5ZGJiYyxcbiAgMHgzOTU2YzI1YiwgMHhmMzQ4YjUzOCwgMHg1OWYxMTFmMSwgMHhiNjA1ZDAxOSxcbiAgMHg5MjNmODJhNCwgMHhhZjE5NGY5YiwgMHhhYjFjNWVkNSwgMHhkYTZkODExOCxcbiAgMHhkODA3YWE5OCwgMHhhMzAzMDI0MiwgMHgxMjgzNWIwMSwgMHg0NTcwNmZiZSxcbiAgMHgyNDMxODViZSwgMHg0ZWU0YjI4YywgMHg1NTBjN2RjMywgMHhkNWZmYjRlMixcbiAgMHg3MmJlNWQ3NCwgMHhmMjdiODk2ZiwgMHg4MGRlYjFmZSwgMHgzYjE2OTZiMSxcbiAgMHg5YmRjMDZhNywgMHgyNWM3MTIzNSwgMHhjMTliZjE3NCwgMHhjZjY5MjY5NCxcbiAgMHhlNDliNjljMSwgMHg5ZWYxNGFkMiwgMHhlZmJlNDc4NiwgMHgzODRmMjVlMyxcbiAgMHgwZmMxOWRjNiwgMHg4YjhjZDViNSwgMHgyNDBjYTFjYywgMHg3N2FjOWM2NSxcbiAgMHgyZGU5MmM2ZiwgMHg1OTJiMDI3NSwgMHg0YTc0ODRhYSwgMHg2ZWE2ZTQ4MyxcbiAgMHg1Y2IwYTlkYywgMHhiZDQxZmJkNCwgMHg3NmY5ODhkYSwgMHg4MzExNTNiNSxcbiAgMHg5ODNlNTE1MiwgMHhlZTY2ZGZhYiwgMHhhODMxYzY2ZCwgMHgyZGI0MzIxMCxcbiAgMHhiMDAzMjdjOCwgMHg5OGZiMjEzZiwgMHhiZjU5N2ZjNywgMHhiZWVmMGVlNCxcbiAgMHhjNmUwMGJmMywgMHgzZGE4OGZjMiwgMHhkNWE3OTE0NywgMHg5MzBhYTcyNSxcbiAgMHgwNmNhNjM1MSwgMHhlMDAzODI2ZiwgMHgxNDI5Mjk2NywgMHgwYTBlNmU3MCxcbiAgMHgyN2I3MGE4NSwgMHg0NmQyMmZmYywgMHgyZTFiMjEzOCwgMHg1YzI2YzkyNixcbiAgMHg0ZDJjNmRmYywgMHg1YWM0MmFlZCwgMHg1MzM4MGQxMywgMHg5ZDk1YjNkZixcbiAgMHg2NTBhNzM1NCwgMHg4YmFmNjNkZSwgMHg3NjZhMGFiYiwgMHgzYzc3YjJhOCxcbiAgMHg4MWMyYzkyZSwgMHg0N2VkYWVlNiwgMHg5MjcyMmM4NSwgMHgxNDgyMzUzYixcbiAgMHhhMmJmZThhMSwgMHg0Y2YxMDM2NCwgMHhhODFhNjY0YiwgMHhiYzQyMzAwMSxcbiAgMHhjMjRiOGI3MCwgMHhkMGY4OTc5MSwgMHhjNzZjNTFhMywgMHgwNjU0YmUzMCxcbiAgMHhkMTkyZTgxOSwgMHhkNmVmNTIxOCwgMHhkNjk5MDYyNCwgMHg1NTY1YTkxMCxcbiAgMHhmNDBlMzU4NSwgMHg1NzcxMjAyYSwgMHgxMDZhYTA3MCwgMHgzMmJiZDFiOCxcbiAgMHgxOWE0YzExNiwgMHhiOGQyZDBjOCwgMHgxZTM3NmMwOCwgMHg1MTQxYWI1MyxcbiAgMHgyNzQ4Nzc0YywgMHhkZjhlZWI5OSwgMHgzNGIwYmNiNSwgMHhlMTliNDhhOCxcbiAgMHgzOTFjMGNiMywgMHhjNWM5NWE2MywgMHg0ZWQ4YWE0YSwgMHhlMzQxOGFjYixcbiAgMHg1YjljY2E0ZiwgMHg3NzYzZTM3MywgMHg2ODJlNmZmMywgMHhkNmIyYjhhMyxcbiAgMHg3NDhmODJlZSwgMHg1ZGVmYjJmYywgMHg3OGE1NjM2ZiwgMHg0MzE3MmY2MCxcbiAgMHg4NGM4NzgxNCwgMHhhMWYwYWI3MiwgMHg4Y2M3MDIwOCwgMHgxYTY0MzllYyxcbiAgMHg5MGJlZmZmYSwgMHgyMzYzMWUyOCwgMHhhNDUwNmNlYiwgMHhkZTgyYmRlOSxcbiAgMHhiZWY5YTNmNywgMHhiMmM2NzkxNSwgMHhjNjcxNzhmMiwgMHhlMzcyNTMyYixcbiAgMHhjYTI3M2VjZSwgMHhlYTI2NjE5YywgMHhkMTg2YjhjNywgMHgyMWMwYzIwNyxcbiAgMHhlYWRhN2RkNiwgMHhjZGUwZWIxZSwgMHhmNTdkNGY3ZiwgMHhlZTZlZDE3OCxcbiAgMHgwNmYwNjdhYSwgMHg3MjE3NmZiYSwgMHgwYTYzN2RjNSwgMHhhMmM4OThhNixcbiAgMHgxMTNmOTgwNCwgMHhiZWY5MGRhZSwgMHgxYjcxMGIzNSwgMHgxMzFjNDcxYixcbiAgMHgyOGRiNzdmNSwgMHgyMzA0N2Q4NCwgMHgzMmNhYWI3YiwgMHg0MGM3MjQ5MyxcbiAgMHgzYzllYmUwYSwgMHgxNWM5YmViYywgMHg0MzFkNjdjNCwgMHg5YzEwMGQ0YyxcbiAgMHg0Y2M1ZDRiZSwgMHhjYjNlNDJiNiwgMHg1OTdmMjk5YywgMHhmYzY1N2UyYSxcbiAgMHg1ZmNiNmZhYiwgMHgzYWQ2ZmFlYywgMHg2YzQ0MTk4YywgMHg0YTQ3NTgxN1xuXTtcblxuZnVuY3Rpb24gU0hBNTEyKCkge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgU0hBNTEyKSlcbiAgICByZXR1cm4gbmV3IFNIQTUxMigpO1xuXG4gIEJsb2NrSGFzaC5jYWxsKHRoaXMpO1xuICB0aGlzLmggPSBbXG4gICAgMHg2YTA5ZTY2NywgMHhmM2JjYzkwOCxcbiAgICAweGJiNjdhZTg1LCAweDg0Y2FhNzNiLFxuICAgIDB4M2M2ZWYzNzIsIDB4ZmU5NGY4MmIsXG4gICAgMHhhNTRmZjUzYSwgMHg1ZjFkMzZmMSxcbiAgICAweDUxMGU1MjdmLCAweGFkZTY4MmQxLFxuICAgIDB4OWIwNTY4OGMsIDB4MmIzZTZjMWYsXG4gICAgMHgxZjgzZDlhYiwgMHhmYjQxYmQ2YixcbiAgICAweDViZTBjZDE5LCAweDEzN2UyMTc5IF07XG4gIHRoaXMuayA9IHNoYTUxMl9LO1xuICB0aGlzLlcgPSBuZXcgQXJyYXkoMTYwKTtcbn1cbnV0aWxzLmluaGVyaXRzKFNIQTUxMiwgQmxvY2tIYXNoKTtcbm1vZHVsZS5leHBvcnRzID0gU0hBNTEyO1xuXG5TSEE1MTIuYmxvY2tTaXplID0gMTAyNDtcblNIQTUxMi5vdXRTaXplID0gNTEyO1xuU0hBNTEyLmhtYWNTdHJlbmd0aCA9IDE5MjtcblNIQTUxMi5wYWRMZW5ndGggPSAxMjg7XG5cblNIQTUxMi5wcm90b3R5cGUuX3ByZXBhcmVCbG9jayA9IGZ1bmN0aW9uIF9wcmVwYXJlQmxvY2sobXNnLCBzdGFydCkge1xuICB2YXIgVyA9IHRoaXMuVztcblxuICAvLyAzMiB4IDMyYml0IHdvcmRzXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgMzI7IGkrKylcbiAgICBXW2ldID0gbXNnW3N0YXJ0ICsgaV07XG4gIGZvciAoOyBpIDwgVy5sZW5ndGg7IGkgKz0gMikge1xuICAgIHZhciBjMF9oaSA9IGcxXzUxMl9oaShXW2kgLSA0XSwgV1tpIC0gM10pOyAgLy8gaSAtIDJcbiAgICB2YXIgYzBfbG8gPSBnMV81MTJfbG8oV1tpIC0gNF0sIFdbaSAtIDNdKTtcbiAgICB2YXIgYzFfaGkgPSBXW2kgLSAxNF07ICAvLyBpIC0gN1xuICAgIHZhciBjMV9sbyA9IFdbaSAtIDEzXTtcbiAgICB2YXIgYzJfaGkgPSBnMF81MTJfaGkoV1tpIC0gMzBdLCBXW2kgLSAyOV0pOyAgLy8gaSAtIDE1XG4gICAgdmFyIGMyX2xvID0gZzBfNTEyX2xvKFdbaSAtIDMwXSwgV1tpIC0gMjldKTtcbiAgICB2YXIgYzNfaGkgPSBXW2kgLSAzMl07ICAvLyBpIC0gMTZcbiAgICB2YXIgYzNfbG8gPSBXW2kgLSAzMV07XG5cbiAgICBXW2ldID0gc3VtNjRfNF9oaShcbiAgICAgIGMwX2hpLCBjMF9sbyxcbiAgICAgIGMxX2hpLCBjMV9sbyxcbiAgICAgIGMyX2hpLCBjMl9sbyxcbiAgICAgIGMzX2hpLCBjM19sbyk7XG4gICAgV1tpICsgMV0gPSBzdW02NF80X2xvKFxuICAgICAgYzBfaGksIGMwX2xvLFxuICAgICAgYzFfaGksIGMxX2xvLFxuICAgICAgYzJfaGksIGMyX2xvLFxuICAgICAgYzNfaGksIGMzX2xvKTtcbiAgfVxufTtcblxuU0hBNTEyLnByb3RvdHlwZS5fdXBkYXRlID0gZnVuY3Rpb24gX3VwZGF0ZShtc2csIHN0YXJ0KSB7XG4gIHRoaXMuX3ByZXBhcmVCbG9jayhtc2csIHN0YXJ0KTtcblxuICB2YXIgVyA9IHRoaXMuVztcblxuICB2YXIgYWggPSB0aGlzLmhbMF07XG4gIHZhciBhbCA9IHRoaXMuaFsxXTtcbiAgdmFyIGJoID0gdGhpcy5oWzJdO1xuICB2YXIgYmwgPSB0aGlzLmhbM107XG4gIHZhciBjaCA9IHRoaXMuaFs0XTtcbiAgdmFyIGNsID0gdGhpcy5oWzVdO1xuICB2YXIgZGggPSB0aGlzLmhbNl07XG4gIHZhciBkbCA9IHRoaXMuaFs3XTtcbiAgdmFyIGVoID0gdGhpcy5oWzhdO1xuICB2YXIgZWwgPSB0aGlzLmhbOV07XG4gIHZhciBmaCA9IHRoaXMuaFsxMF07XG4gIHZhciBmbCA9IHRoaXMuaFsxMV07XG4gIHZhciBnaCA9IHRoaXMuaFsxMl07XG4gIHZhciBnbCA9IHRoaXMuaFsxM107XG4gIHZhciBoaCA9IHRoaXMuaFsxNF07XG4gIHZhciBobCA9IHRoaXMuaFsxNV07XG5cbiAgYXNzZXJ0KHRoaXMuay5sZW5ndGggPT09IFcubGVuZ3RoKTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBXLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgdmFyIGMwX2hpID0gaGg7XG4gICAgdmFyIGMwX2xvID0gaGw7XG4gICAgdmFyIGMxX2hpID0gczFfNTEyX2hpKGVoLCBlbCk7XG4gICAgdmFyIGMxX2xvID0gczFfNTEyX2xvKGVoLCBlbCk7XG4gICAgdmFyIGMyX2hpID0gY2g2NF9oaShlaCwgZWwsIGZoLCBmbCwgZ2gsIGdsKTtcbiAgICB2YXIgYzJfbG8gPSBjaDY0X2xvKGVoLCBlbCwgZmgsIGZsLCBnaCwgZ2wpO1xuICAgIHZhciBjM19oaSA9IHRoaXMua1tpXTtcbiAgICB2YXIgYzNfbG8gPSB0aGlzLmtbaSArIDFdO1xuICAgIHZhciBjNF9oaSA9IFdbaV07XG4gICAgdmFyIGM0X2xvID0gV1tpICsgMV07XG5cbiAgICB2YXIgVDFfaGkgPSBzdW02NF81X2hpKFxuICAgICAgYzBfaGksIGMwX2xvLFxuICAgICAgYzFfaGksIGMxX2xvLFxuICAgICAgYzJfaGksIGMyX2xvLFxuICAgICAgYzNfaGksIGMzX2xvLFxuICAgICAgYzRfaGksIGM0X2xvKTtcbiAgICB2YXIgVDFfbG8gPSBzdW02NF81X2xvKFxuICAgICAgYzBfaGksIGMwX2xvLFxuICAgICAgYzFfaGksIGMxX2xvLFxuICAgICAgYzJfaGksIGMyX2xvLFxuICAgICAgYzNfaGksIGMzX2xvLFxuICAgICAgYzRfaGksIGM0X2xvKTtcblxuICAgIGMwX2hpID0gczBfNTEyX2hpKGFoLCBhbCk7XG4gICAgYzBfbG8gPSBzMF81MTJfbG8oYWgsIGFsKTtcbiAgICBjMV9oaSA9IG1hajY0X2hpKGFoLCBhbCwgYmgsIGJsLCBjaCwgY2wpO1xuICAgIGMxX2xvID0gbWFqNjRfbG8oYWgsIGFsLCBiaCwgYmwsIGNoLCBjbCk7XG5cbiAgICB2YXIgVDJfaGkgPSBzdW02NF9oaShjMF9oaSwgYzBfbG8sIGMxX2hpLCBjMV9sbyk7XG4gICAgdmFyIFQyX2xvID0gc3VtNjRfbG8oYzBfaGksIGMwX2xvLCBjMV9oaSwgYzFfbG8pO1xuXG4gICAgaGggPSBnaDtcbiAgICBobCA9IGdsO1xuXG4gICAgZ2ggPSBmaDtcbiAgICBnbCA9IGZsO1xuXG4gICAgZmggPSBlaDtcbiAgICBmbCA9IGVsO1xuXG4gICAgZWggPSBzdW02NF9oaShkaCwgZGwsIFQxX2hpLCBUMV9sbyk7XG4gICAgZWwgPSBzdW02NF9sbyhkbCwgZGwsIFQxX2hpLCBUMV9sbyk7XG5cbiAgICBkaCA9IGNoO1xuICAgIGRsID0gY2w7XG5cbiAgICBjaCA9IGJoO1xuICAgIGNsID0gYmw7XG5cbiAgICBiaCA9IGFoO1xuICAgIGJsID0gYWw7XG5cbiAgICBhaCA9IHN1bTY0X2hpKFQxX2hpLCBUMV9sbywgVDJfaGksIFQyX2xvKTtcbiAgICBhbCA9IHN1bTY0X2xvKFQxX2hpLCBUMV9sbywgVDJfaGksIFQyX2xvKTtcbiAgfVxuXG4gIHN1bTY0KHRoaXMuaCwgMCwgYWgsIGFsKTtcbiAgc3VtNjQodGhpcy5oLCAyLCBiaCwgYmwpO1xuICBzdW02NCh0aGlzLmgsIDQsIGNoLCBjbCk7XG4gIHN1bTY0KHRoaXMuaCwgNiwgZGgsIGRsKTtcbiAgc3VtNjQodGhpcy5oLCA4LCBlaCwgZWwpO1xuICBzdW02NCh0aGlzLmgsIDEwLCBmaCwgZmwpO1xuICBzdW02NCh0aGlzLmgsIDEyLCBnaCwgZ2wpO1xuICBzdW02NCh0aGlzLmgsIDE0LCBoaCwgaGwpO1xufTtcblxuU0hBNTEyLnByb3RvdHlwZS5fZGlnZXN0ID0gZnVuY3Rpb24gZGlnZXN0KGVuYykge1xuICBpZiAoZW5jID09PSAnaGV4JylcbiAgICByZXR1cm4gdXRpbHMudG9IZXgzMih0aGlzLmgsICdiaWcnKTtcbiAgZWxzZVxuICAgIHJldHVybiB1dGlscy5zcGxpdDMyKHRoaXMuaCwgJ2JpZycpO1xufTtcblxuZnVuY3Rpb24gY2g2NF9oaSh4aCwgeGwsIHloLCB5bCwgemgpIHtcbiAgdmFyIHIgPSAoeGggJiB5aCkgXiAoKH54aCkgJiB6aCk7XG4gIGlmIChyIDwgMClcbiAgICByICs9IDB4MTAwMDAwMDAwO1xuICByZXR1cm4gcjtcbn1cblxuZnVuY3Rpb24gY2g2NF9sbyh4aCwgeGwsIHloLCB5bCwgemgsIHpsKSB7XG4gIHZhciByID0gKHhsICYgeWwpIF4gKCh+eGwpICYgemwpO1xuICBpZiAociA8IDApXG4gICAgciArPSAweDEwMDAwMDAwMDtcbiAgcmV0dXJuIHI7XG59XG5cbmZ1bmN0aW9uIG1hajY0X2hpKHhoLCB4bCwgeWgsIHlsLCB6aCkge1xuICB2YXIgciA9ICh4aCAmIHloKSBeICh4aCAmIHpoKSBeICh5aCAmIHpoKTtcbiAgaWYgKHIgPCAwKVxuICAgIHIgKz0gMHgxMDAwMDAwMDA7XG4gIHJldHVybiByO1xufVxuXG5mdW5jdGlvbiBtYWo2NF9sbyh4aCwgeGwsIHloLCB5bCwgemgsIHpsKSB7XG4gIHZhciByID0gKHhsICYgeWwpIF4gKHhsICYgemwpIF4gKHlsICYgemwpO1xuICBpZiAociA8IDApXG4gICAgciArPSAweDEwMDAwMDAwMDtcbiAgcmV0dXJuIHI7XG59XG5cbmZ1bmN0aW9uIHMwXzUxMl9oaSh4aCwgeGwpIHtcbiAgdmFyIGMwX2hpID0gcm90cjY0X2hpKHhoLCB4bCwgMjgpO1xuICB2YXIgYzFfaGkgPSByb3RyNjRfaGkoeGwsIHhoLCAyKTsgIC8vIDM0XG4gIHZhciBjMl9oaSA9IHJvdHI2NF9oaSh4bCwgeGgsIDcpOyAgLy8gMzlcblxuICB2YXIgciA9IGMwX2hpIF4gYzFfaGkgXiBjMl9oaTtcbiAgaWYgKHIgPCAwKVxuICAgIHIgKz0gMHgxMDAwMDAwMDA7XG4gIHJldHVybiByO1xufVxuXG5mdW5jdGlvbiBzMF81MTJfbG8oeGgsIHhsKSB7XG4gIHZhciBjMF9sbyA9IHJvdHI2NF9sbyh4aCwgeGwsIDI4KTtcbiAgdmFyIGMxX2xvID0gcm90cjY0X2xvKHhsLCB4aCwgMik7ICAvLyAzNFxuICB2YXIgYzJfbG8gPSByb3RyNjRfbG8oeGwsIHhoLCA3KTsgIC8vIDM5XG5cbiAgdmFyIHIgPSBjMF9sbyBeIGMxX2xvIF4gYzJfbG87XG4gIGlmIChyIDwgMClcbiAgICByICs9IDB4MTAwMDAwMDAwO1xuICByZXR1cm4gcjtcbn1cblxuZnVuY3Rpb24gczFfNTEyX2hpKHhoLCB4bCkge1xuICB2YXIgYzBfaGkgPSByb3RyNjRfaGkoeGgsIHhsLCAxNCk7XG4gIHZhciBjMV9oaSA9IHJvdHI2NF9oaSh4aCwgeGwsIDE4KTtcbiAgdmFyIGMyX2hpID0gcm90cjY0X2hpKHhsLCB4aCwgOSk7ICAvLyA0MVxuXG4gIHZhciByID0gYzBfaGkgXiBjMV9oaSBeIGMyX2hpO1xuICBpZiAociA8IDApXG4gICAgciArPSAweDEwMDAwMDAwMDtcbiAgcmV0dXJuIHI7XG59XG5cbmZ1bmN0aW9uIHMxXzUxMl9sbyh4aCwgeGwpIHtcbiAgdmFyIGMwX2xvID0gcm90cjY0X2xvKHhoLCB4bCwgMTQpO1xuICB2YXIgYzFfbG8gPSByb3RyNjRfbG8oeGgsIHhsLCAxOCk7XG4gIHZhciBjMl9sbyA9IHJvdHI2NF9sbyh4bCwgeGgsIDkpOyAgLy8gNDFcblxuICB2YXIgciA9IGMwX2xvIF4gYzFfbG8gXiBjMl9sbztcbiAgaWYgKHIgPCAwKVxuICAgIHIgKz0gMHgxMDAwMDAwMDA7XG4gIHJldHVybiByO1xufVxuXG5mdW5jdGlvbiBnMF81MTJfaGkoeGgsIHhsKSB7XG4gIHZhciBjMF9oaSA9IHJvdHI2NF9oaSh4aCwgeGwsIDEpO1xuICB2YXIgYzFfaGkgPSByb3RyNjRfaGkoeGgsIHhsLCA4KTtcbiAgdmFyIGMyX2hpID0gc2hyNjRfaGkoeGgsIHhsLCA3KTtcblxuICB2YXIgciA9IGMwX2hpIF4gYzFfaGkgXiBjMl9oaTtcbiAgaWYgKHIgPCAwKVxuICAgIHIgKz0gMHgxMDAwMDAwMDA7XG4gIHJldHVybiByO1xufVxuXG5mdW5jdGlvbiBnMF81MTJfbG8oeGgsIHhsKSB7XG4gIHZhciBjMF9sbyA9IHJvdHI2NF9sbyh4aCwgeGwsIDEpO1xuICB2YXIgYzFfbG8gPSByb3RyNjRfbG8oeGgsIHhsLCA4KTtcbiAgdmFyIGMyX2xvID0gc2hyNjRfbG8oeGgsIHhsLCA3KTtcblxuICB2YXIgciA9IGMwX2xvIF4gYzFfbG8gXiBjMl9sbztcbiAgaWYgKHIgPCAwKVxuICAgIHIgKz0gMHgxMDAwMDAwMDA7XG4gIHJldHVybiByO1xufVxuXG5mdW5jdGlvbiBnMV81MTJfaGkoeGgsIHhsKSB7XG4gIHZhciBjMF9oaSA9IHJvdHI2NF9oaSh4aCwgeGwsIDE5KTtcbiAgdmFyIGMxX2hpID0gcm90cjY0X2hpKHhsLCB4aCwgMjkpOyAgLy8gNjFcbiAgdmFyIGMyX2hpID0gc2hyNjRfaGkoeGgsIHhsLCA2KTtcblxuICB2YXIgciA9IGMwX2hpIF4gYzFfaGkgXiBjMl9oaTtcbiAgaWYgKHIgPCAwKVxuICAgIHIgKz0gMHgxMDAwMDAwMDA7XG4gIHJldHVybiByO1xufVxuXG5mdW5jdGlvbiBnMV81MTJfbG8oeGgsIHhsKSB7XG4gIHZhciBjMF9sbyA9IHJvdHI2NF9sbyh4aCwgeGwsIDE5KTtcbiAgdmFyIGMxX2xvID0gcm90cjY0X2xvKHhsLCB4aCwgMjkpOyAgLy8gNjFcbiAgdmFyIGMyX2xvID0gc2hyNjRfbG8oeGgsIHhsLCA2KTtcblxuICB2YXIgciA9IGMwX2xvIF4gYzFfbG8gXiBjMl9sbztcbiAgaWYgKHIgPCAwKVxuICAgIHIgKz0gMHgxMDAwMDAwMDA7XG4gIHJldHVybiByO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpO1xudmFyIHJvdHIzMiA9IHV0aWxzLnJvdHIzMjtcblxuZnVuY3Rpb24gZnRfMShzLCB4LCB5LCB6KSB7XG4gIGlmIChzID09PSAwKVxuICAgIHJldHVybiBjaDMyKHgsIHksIHopO1xuICBpZiAocyA9PT0gMSB8fCBzID09PSAzKVxuICAgIHJldHVybiBwMzIoeCwgeSwgeik7XG4gIGlmIChzID09PSAyKVxuICAgIHJldHVybiBtYWozMih4LCB5LCB6KTtcbn1cbmV4cG9ydHMuZnRfMSA9IGZ0XzE7XG5cbmZ1bmN0aW9uIGNoMzIoeCwgeSwgeikge1xuICByZXR1cm4gKHggJiB5KSBeICgofngpICYgeik7XG59XG5leHBvcnRzLmNoMzIgPSBjaDMyO1xuXG5mdW5jdGlvbiBtYWozMih4LCB5LCB6KSB7XG4gIHJldHVybiAoeCAmIHkpIF4gKHggJiB6KSBeICh5ICYgeik7XG59XG5leHBvcnRzLm1hajMyID0gbWFqMzI7XG5cbmZ1bmN0aW9uIHAzMih4LCB5LCB6KSB7XG4gIHJldHVybiB4IF4geSBeIHo7XG59XG5leHBvcnRzLnAzMiA9IHAzMjtcblxuZnVuY3Rpb24gczBfMjU2KHgpIHtcbiAgcmV0dXJuIHJvdHIzMih4LCAyKSBeIHJvdHIzMih4LCAxMykgXiByb3RyMzIoeCwgMjIpO1xufVxuZXhwb3J0cy5zMF8yNTYgPSBzMF8yNTY7XG5cbmZ1bmN0aW9uIHMxXzI1Nih4KSB7XG4gIHJldHVybiByb3RyMzIoeCwgNikgXiByb3RyMzIoeCwgMTEpIF4gcm90cjMyKHgsIDI1KTtcbn1cbmV4cG9ydHMuczFfMjU2ID0gczFfMjU2O1xuXG5mdW5jdGlvbiBnMF8yNTYoeCkge1xuICByZXR1cm4gcm90cjMyKHgsIDcpIF4gcm90cjMyKHgsIDE4KSBeICh4ID4+PiAzKTtcbn1cbmV4cG9ydHMuZzBfMjU2ID0gZzBfMjU2O1xuXG5mdW5jdGlvbiBnMV8yNTYoeCkge1xuICByZXR1cm4gcm90cjMyKHgsIDE3KSBeIHJvdHIzMih4LCAxOSkgXiAoeCA+Pj4gMTApO1xufVxuZXhwb3J0cy5nMV8yNTYgPSBnMV8yNTY7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBhc3NlcnQgPSByZXF1aXJlKCdtaW5pbWFsaXN0aWMtYXNzZXJ0Jyk7XG52YXIgaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpO1xuXG5leHBvcnRzLmluaGVyaXRzID0gaW5oZXJpdHM7XG5cbmZ1bmN0aW9uIGlzU3Vycm9nYXRlUGFpcihtc2csIGkpIHtcbiAgaWYgKChtc2cuY2hhckNvZGVBdChpKSAmIDB4RkMwMCkgIT09IDB4RDgwMCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoaSA8IDAgfHwgaSArIDEgPj0gbXNnLmxlbmd0aCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gKG1zZy5jaGFyQ29kZUF0KGkgKyAxKSAmIDB4RkMwMCkgPT09IDB4REMwMDtcbn1cblxuZnVuY3Rpb24gdG9BcnJheShtc2csIGVuYykge1xuICBpZiAoQXJyYXkuaXNBcnJheShtc2cpKVxuICAgIHJldHVybiBtc2cuc2xpY2UoKTtcbiAgaWYgKCFtc2cpXG4gICAgcmV0dXJuIFtdO1xuICB2YXIgcmVzID0gW107XG4gIGlmICh0eXBlb2YgbXNnID09PSAnc3RyaW5nJykge1xuICAgIGlmICghZW5jKSB7XG4gICAgICAvLyBJbnNwaXJlZCBieSBzdHJpbmdUb1V0ZjhCeXRlQXJyYXkoKSBpbiBjbG9zdXJlLWxpYnJhcnkgYnkgR29vZ2xlXG4gICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vZ29vZ2xlL2Nsb3N1cmUtbGlicmFyeS9ibG9iLzg1OThkODcyNDJhZjU5YWFjMjMzMjcwNzQyYzg5ODRlMmIyYmRiZTAvY2xvc3VyZS9nb29nL2NyeXB0L2NyeXB0LmpzI0wxMTctTDE0M1xuICAgICAgLy8gQXBhY2hlIExpY2Vuc2UgMi4wXG4gICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vZ29vZ2xlL2Nsb3N1cmUtbGlicmFyeS9ibG9iL21hc3Rlci9MSUNFTlNFXG4gICAgICB2YXIgcCA9IDA7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1zZy5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgYyA9IG1zZy5jaGFyQ29kZUF0KGkpO1xuICAgICAgICBpZiAoYyA8IDEyOCkge1xuICAgICAgICAgIHJlc1twKytdID0gYztcbiAgICAgICAgfSBlbHNlIGlmIChjIDwgMjA0OCkge1xuICAgICAgICAgIHJlc1twKytdID0gKGMgPj4gNikgfCAxOTI7XG4gICAgICAgICAgcmVzW3ArK10gPSAoYyAmIDYzKSB8IDEyODtcbiAgICAgICAgfSBlbHNlIGlmIChpc1N1cnJvZ2F0ZVBhaXIobXNnLCBpKSkge1xuICAgICAgICAgIGMgPSAweDEwMDAwICsgKChjICYgMHgwM0ZGKSA8PCAxMCkgKyAobXNnLmNoYXJDb2RlQXQoKytpKSAmIDB4MDNGRik7XG4gICAgICAgICAgcmVzW3ArK10gPSAoYyA+PiAxOCkgfCAyNDA7XG4gICAgICAgICAgcmVzW3ArK10gPSAoKGMgPj4gMTIpICYgNjMpIHwgMTI4O1xuICAgICAgICAgIHJlc1twKytdID0gKChjID4+IDYpICYgNjMpIHwgMTI4O1xuICAgICAgICAgIHJlc1twKytdID0gKGMgJiA2MykgfCAxMjg7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzW3ArK10gPSAoYyA+PiAxMikgfCAyMjQ7XG4gICAgICAgICAgcmVzW3ArK10gPSAoKGMgPj4gNikgJiA2MykgfCAxMjg7XG4gICAgICAgICAgcmVzW3ArK10gPSAoYyAmIDYzKSB8IDEyODtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZW5jID09PSAnaGV4Jykge1xuICAgICAgbXNnID0gbXNnLnJlcGxhY2UoL1teYS16MC05XSsvaWcsICcnKTtcbiAgICAgIGlmIChtc2cubGVuZ3RoICUgMiAhPT0gMClcbiAgICAgICAgbXNnID0gJzAnICsgbXNnO1xuICAgICAgZm9yIChpID0gMDsgaSA8IG1zZy5sZW5ndGg7IGkgKz0gMilcbiAgICAgICAgcmVzLnB1c2gocGFyc2VJbnQobXNnW2ldICsgbXNnW2kgKyAxXSwgMTYpKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgZm9yIChpID0gMDsgaSA8IG1zZy5sZW5ndGg7IGkrKylcbiAgICAgIHJlc1tpXSA9IG1zZ1tpXSB8IDA7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn1cbmV4cG9ydHMudG9BcnJheSA9IHRvQXJyYXk7XG5cbmZ1bmN0aW9uIHRvSGV4KG1zZykge1xuICB2YXIgcmVzID0gJyc7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbXNnLmxlbmd0aDsgaSsrKVxuICAgIHJlcyArPSB6ZXJvMihtc2dbaV0udG9TdHJpbmcoMTYpKTtcbiAgcmV0dXJuIHJlcztcbn1cbmV4cG9ydHMudG9IZXggPSB0b0hleDtcblxuZnVuY3Rpb24gaHRvbmwodykge1xuICB2YXIgcmVzID0gKHcgPj4+IDI0KSB8XG4gICAgICAgICAgICAoKHcgPj4+IDgpICYgMHhmZjAwKSB8XG4gICAgICAgICAgICAoKHcgPDwgOCkgJiAweGZmMDAwMCkgfFxuICAgICAgICAgICAgKCh3ICYgMHhmZikgPDwgMjQpO1xuICByZXR1cm4gcmVzID4+PiAwO1xufVxuZXhwb3J0cy5odG9ubCA9IGh0b25sO1xuXG5mdW5jdGlvbiB0b0hleDMyKG1zZywgZW5kaWFuKSB7XG4gIHZhciByZXMgPSAnJztcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBtc2cubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgdyA9IG1zZ1tpXTtcbiAgICBpZiAoZW5kaWFuID09PSAnbGl0dGxlJylcbiAgICAgIHcgPSBodG9ubCh3KTtcbiAgICByZXMgKz0gemVybzgody50b1N0cmluZygxNikpO1xuICB9XG4gIHJldHVybiByZXM7XG59XG5leHBvcnRzLnRvSGV4MzIgPSB0b0hleDMyO1xuXG5mdW5jdGlvbiB6ZXJvMih3b3JkKSB7XG4gIGlmICh3b3JkLmxlbmd0aCA9PT0gMSlcbiAgICByZXR1cm4gJzAnICsgd29yZDtcbiAgZWxzZVxuICAgIHJldHVybiB3b3JkO1xufVxuZXhwb3J0cy56ZXJvMiA9IHplcm8yO1xuXG5mdW5jdGlvbiB6ZXJvOCh3b3JkKSB7XG4gIGlmICh3b3JkLmxlbmd0aCA9PT0gNylcbiAgICByZXR1cm4gJzAnICsgd29yZDtcbiAgZWxzZSBpZiAod29yZC5sZW5ndGggPT09IDYpXG4gICAgcmV0dXJuICcwMCcgKyB3b3JkO1xuICBlbHNlIGlmICh3b3JkLmxlbmd0aCA9PT0gNSlcbiAgICByZXR1cm4gJzAwMCcgKyB3b3JkO1xuICBlbHNlIGlmICh3b3JkLmxlbmd0aCA9PT0gNClcbiAgICByZXR1cm4gJzAwMDAnICsgd29yZDtcbiAgZWxzZSBpZiAod29yZC5sZW5ndGggPT09IDMpXG4gICAgcmV0dXJuICcwMDAwMCcgKyB3b3JkO1xuICBlbHNlIGlmICh3b3JkLmxlbmd0aCA9PT0gMilcbiAgICByZXR1cm4gJzAwMDAwMCcgKyB3b3JkO1xuICBlbHNlIGlmICh3b3JkLmxlbmd0aCA9PT0gMSlcbiAgICByZXR1cm4gJzAwMDAwMDAnICsgd29yZDtcbiAgZWxzZVxuICAgIHJldHVybiB3b3JkO1xufVxuZXhwb3J0cy56ZXJvOCA9IHplcm84O1xuXG5mdW5jdGlvbiBqb2luMzIobXNnLCBzdGFydCwgZW5kLCBlbmRpYW4pIHtcbiAgdmFyIGxlbiA9IGVuZCAtIHN0YXJ0O1xuICBhc3NlcnQobGVuICUgNCA9PT0gMCk7XG4gIHZhciByZXMgPSBuZXcgQXJyYXkobGVuIC8gNCk7XG4gIGZvciAodmFyIGkgPSAwLCBrID0gc3RhcnQ7IGkgPCByZXMubGVuZ3RoOyBpKyssIGsgKz0gNCkge1xuICAgIHZhciB3O1xuICAgIGlmIChlbmRpYW4gPT09ICdiaWcnKVxuICAgICAgdyA9IChtc2dba10gPDwgMjQpIHwgKG1zZ1trICsgMV0gPDwgMTYpIHwgKG1zZ1trICsgMl0gPDwgOCkgfCBtc2dbayArIDNdO1xuICAgIGVsc2VcbiAgICAgIHcgPSAobXNnW2sgKyAzXSA8PCAyNCkgfCAobXNnW2sgKyAyXSA8PCAxNikgfCAobXNnW2sgKyAxXSA8PCA4KSB8IG1zZ1trXTtcbiAgICByZXNbaV0gPSB3ID4+PiAwO1xuICB9XG4gIHJldHVybiByZXM7XG59XG5leHBvcnRzLmpvaW4zMiA9IGpvaW4zMjtcblxuZnVuY3Rpb24gc3BsaXQzMihtc2csIGVuZGlhbikge1xuICB2YXIgcmVzID0gbmV3IEFycmF5KG1zZy5sZW5ndGggKiA0KTtcbiAgZm9yICh2YXIgaSA9IDAsIGsgPSAwOyBpIDwgbXNnLmxlbmd0aDsgaSsrLCBrICs9IDQpIHtcbiAgICB2YXIgbSA9IG1zZ1tpXTtcbiAgICBpZiAoZW5kaWFuID09PSAnYmlnJykge1xuICAgICAgcmVzW2tdID0gbSA+Pj4gMjQ7XG4gICAgICByZXNbayArIDFdID0gKG0gPj4+IDE2KSAmIDB4ZmY7XG4gICAgICByZXNbayArIDJdID0gKG0gPj4+IDgpICYgMHhmZjtcbiAgICAgIHJlc1trICsgM10gPSBtICYgMHhmZjtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzW2sgKyAzXSA9IG0gPj4+IDI0O1xuICAgICAgcmVzW2sgKyAyXSA9IChtID4+PiAxNikgJiAweGZmO1xuICAgICAgcmVzW2sgKyAxXSA9IChtID4+PiA4KSAmIDB4ZmY7XG4gICAgICByZXNba10gPSBtICYgMHhmZjtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlcztcbn1cbmV4cG9ydHMuc3BsaXQzMiA9IHNwbGl0MzI7XG5cbmZ1bmN0aW9uIHJvdHIzMih3LCBiKSB7XG4gIHJldHVybiAodyA+Pj4gYikgfCAodyA8PCAoMzIgLSBiKSk7XG59XG5leHBvcnRzLnJvdHIzMiA9IHJvdHIzMjtcblxuZnVuY3Rpb24gcm90bDMyKHcsIGIpIHtcbiAgcmV0dXJuICh3IDw8IGIpIHwgKHcgPj4+ICgzMiAtIGIpKTtcbn1cbmV4cG9ydHMucm90bDMyID0gcm90bDMyO1xuXG5mdW5jdGlvbiBzdW0zMihhLCBiKSB7XG4gIHJldHVybiAoYSArIGIpID4+PiAwO1xufVxuZXhwb3J0cy5zdW0zMiA9IHN1bTMyO1xuXG5mdW5jdGlvbiBzdW0zMl8zKGEsIGIsIGMpIHtcbiAgcmV0dXJuIChhICsgYiArIGMpID4+PiAwO1xufVxuZXhwb3J0cy5zdW0zMl8zID0gc3VtMzJfMztcblxuZnVuY3Rpb24gc3VtMzJfNChhLCBiLCBjLCBkKSB7XG4gIHJldHVybiAoYSArIGIgKyBjICsgZCkgPj4+IDA7XG59XG5leHBvcnRzLnN1bTMyXzQgPSBzdW0zMl80O1xuXG5mdW5jdGlvbiBzdW0zMl81KGEsIGIsIGMsIGQsIGUpIHtcbiAgcmV0dXJuIChhICsgYiArIGMgKyBkICsgZSkgPj4+IDA7XG59XG5leHBvcnRzLnN1bTMyXzUgPSBzdW0zMl81O1xuXG5mdW5jdGlvbiBzdW02NChidWYsIHBvcywgYWgsIGFsKSB7XG4gIHZhciBiaCA9IGJ1Zltwb3NdO1xuICB2YXIgYmwgPSBidWZbcG9zICsgMV07XG5cbiAgdmFyIGxvID0gKGFsICsgYmwpID4+PiAwO1xuICB2YXIgaGkgPSAobG8gPCBhbCA/IDEgOiAwKSArIGFoICsgYmg7XG4gIGJ1Zltwb3NdID0gaGkgPj4+IDA7XG4gIGJ1Zltwb3MgKyAxXSA9IGxvO1xufVxuZXhwb3J0cy5zdW02NCA9IHN1bTY0O1xuXG5mdW5jdGlvbiBzdW02NF9oaShhaCwgYWwsIGJoLCBibCkge1xuICB2YXIgbG8gPSAoYWwgKyBibCkgPj4+IDA7XG4gIHZhciBoaSA9IChsbyA8IGFsID8gMSA6IDApICsgYWggKyBiaDtcbiAgcmV0dXJuIGhpID4+PiAwO1xufVxuZXhwb3J0cy5zdW02NF9oaSA9IHN1bTY0X2hpO1xuXG5mdW5jdGlvbiBzdW02NF9sbyhhaCwgYWwsIGJoLCBibCkge1xuICB2YXIgbG8gPSBhbCArIGJsO1xuICByZXR1cm4gbG8gPj4+IDA7XG59XG5leHBvcnRzLnN1bTY0X2xvID0gc3VtNjRfbG87XG5cbmZ1bmN0aW9uIHN1bTY0XzRfaGkoYWgsIGFsLCBiaCwgYmwsIGNoLCBjbCwgZGgsIGRsKSB7XG4gIHZhciBjYXJyeSA9IDA7XG4gIHZhciBsbyA9IGFsO1xuICBsbyA9IChsbyArIGJsKSA+Pj4gMDtcbiAgY2FycnkgKz0gbG8gPCBhbCA/IDEgOiAwO1xuICBsbyA9IChsbyArIGNsKSA+Pj4gMDtcbiAgY2FycnkgKz0gbG8gPCBjbCA/IDEgOiAwO1xuICBsbyA9IChsbyArIGRsKSA+Pj4gMDtcbiAgY2FycnkgKz0gbG8gPCBkbCA/IDEgOiAwO1xuXG4gIHZhciBoaSA9IGFoICsgYmggKyBjaCArIGRoICsgY2Fycnk7XG4gIHJldHVybiBoaSA+Pj4gMDtcbn1cbmV4cG9ydHMuc3VtNjRfNF9oaSA9IHN1bTY0XzRfaGk7XG5cbmZ1bmN0aW9uIHN1bTY0XzRfbG8oYWgsIGFsLCBiaCwgYmwsIGNoLCBjbCwgZGgsIGRsKSB7XG4gIHZhciBsbyA9IGFsICsgYmwgKyBjbCArIGRsO1xuICByZXR1cm4gbG8gPj4+IDA7XG59XG5leHBvcnRzLnN1bTY0XzRfbG8gPSBzdW02NF80X2xvO1xuXG5mdW5jdGlvbiBzdW02NF81X2hpKGFoLCBhbCwgYmgsIGJsLCBjaCwgY2wsIGRoLCBkbCwgZWgsIGVsKSB7XG4gIHZhciBjYXJyeSA9IDA7XG4gIHZhciBsbyA9IGFsO1xuICBsbyA9IChsbyArIGJsKSA+Pj4gMDtcbiAgY2FycnkgKz0gbG8gPCBhbCA/IDEgOiAwO1xuICBsbyA9IChsbyArIGNsKSA+Pj4gMDtcbiAgY2FycnkgKz0gbG8gPCBjbCA/IDEgOiAwO1xuICBsbyA9IChsbyArIGRsKSA+Pj4gMDtcbiAgY2FycnkgKz0gbG8gPCBkbCA/IDEgOiAwO1xuICBsbyA9IChsbyArIGVsKSA+Pj4gMDtcbiAgY2FycnkgKz0gbG8gPCBlbCA/IDEgOiAwO1xuXG4gIHZhciBoaSA9IGFoICsgYmggKyBjaCArIGRoICsgZWggKyBjYXJyeTtcbiAgcmV0dXJuIGhpID4+PiAwO1xufVxuZXhwb3J0cy5zdW02NF81X2hpID0gc3VtNjRfNV9oaTtcblxuZnVuY3Rpb24gc3VtNjRfNV9sbyhhaCwgYWwsIGJoLCBibCwgY2gsIGNsLCBkaCwgZGwsIGVoLCBlbCkge1xuICB2YXIgbG8gPSBhbCArIGJsICsgY2wgKyBkbCArIGVsO1xuXG4gIHJldHVybiBsbyA+Pj4gMDtcbn1cbmV4cG9ydHMuc3VtNjRfNV9sbyA9IHN1bTY0XzVfbG87XG5cbmZ1bmN0aW9uIHJvdHI2NF9oaShhaCwgYWwsIG51bSkge1xuICB2YXIgciA9IChhbCA8PCAoMzIgLSBudW0pKSB8IChhaCA+Pj4gbnVtKTtcbiAgcmV0dXJuIHIgPj4+IDA7XG59XG5leHBvcnRzLnJvdHI2NF9oaSA9IHJvdHI2NF9oaTtcblxuZnVuY3Rpb24gcm90cjY0X2xvKGFoLCBhbCwgbnVtKSB7XG4gIHZhciByID0gKGFoIDw8ICgzMiAtIG51bSkpIHwgKGFsID4+PiBudW0pO1xuICByZXR1cm4gciA+Pj4gMDtcbn1cbmV4cG9ydHMucm90cjY0X2xvID0gcm90cjY0X2xvO1xuXG5mdW5jdGlvbiBzaHI2NF9oaShhaCwgYWwsIG51bSkge1xuICByZXR1cm4gYWggPj4+IG51bTtcbn1cbmV4cG9ydHMuc2hyNjRfaGkgPSBzaHI2NF9oaTtcblxuZnVuY3Rpb24gc2hyNjRfbG8oYWgsIGFsLCBudW0pIHtcbiAgdmFyIHIgPSAoYWggPDwgKDMyIC0gbnVtKSkgfCAoYWwgPj4+IG51bSk7XG4gIHJldHVybiByID4+PiAwO1xufVxuZXhwb3J0cy5zaHI2NF9sbyA9IHNocjY0X2xvO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgaGFzaCA9IHJlcXVpcmUoJ2hhc2guanMnKTtcbnZhciB1dGlscyA9IHJlcXVpcmUoJ21pbmltYWxpc3RpYy1jcnlwdG8tdXRpbHMnKTtcbnZhciBhc3NlcnQgPSByZXF1aXJlKCdtaW5pbWFsaXN0aWMtYXNzZXJ0Jyk7XG5cbmZ1bmN0aW9uIEhtYWNEUkJHKG9wdGlvbnMpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEhtYWNEUkJHKSlcbiAgICByZXR1cm4gbmV3IEhtYWNEUkJHKG9wdGlvbnMpO1xuICB0aGlzLmhhc2ggPSBvcHRpb25zLmhhc2g7XG4gIHRoaXMucHJlZFJlc2lzdCA9ICEhb3B0aW9ucy5wcmVkUmVzaXN0O1xuXG4gIHRoaXMub3V0TGVuID0gdGhpcy5oYXNoLm91dFNpemU7XG4gIHRoaXMubWluRW50cm9weSA9IG9wdGlvbnMubWluRW50cm9weSB8fCB0aGlzLmhhc2guaG1hY1N0cmVuZ3RoO1xuXG4gIHRoaXMuX3Jlc2VlZCA9IG51bGw7XG4gIHRoaXMucmVzZWVkSW50ZXJ2YWwgPSBudWxsO1xuICB0aGlzLksgPSBudWxsO1xuICB0aGlzLlYgPSBudWxsO1xuXG4gIHZhciBlbnRyb3B5ID0gdXRpbHMudG9BcnJheShvcHRpb25zLmVudHJvcHksIG9wdGlvbnMuZW50cm9weUVuYyB8fCAnaGV4Jyk7XG4gIHZhciBub25jZSA9IHV0aWxzLnRvQXJyYXkob3B0aW9ucy5ub25jZSwgb3B0aW9ucy5ub25jZUVuYyB8fCAnaGV4Jyk7XG4gIHZhciBwZXJzID0gdXRpbHMudG9BcnJheShvcHRpb25zLnBlcnMsIG9wdGlvbnMucGVyc0VuYyB8fCAnaGV4Jyk7XG4gIGFzc2VydChlbnRyb3B5Lmxlbmd0aCA+PSAodGhpcy5taW5FbnRyb3B5IC8gOCksXG4gICAgICAgICAnTm90IGVub3VnaCBlbnRyb3B5LiBNaW5pbXVtIGlzOiAnICsgdGhpcy5taW5FbnRyb3B5ICsgJyBiaXRzJyk7XG4gIHRoaXMuX2luaXQoZW50cm9weSwgbm9uY2UsIHBlcnMpO1xufVxubW9kdWxlLmV4cG9ydHMgPSBIbWFjRFJCRztcblxuSG1hY0RSQkcucHJvdG90eXBlLl9pbml0ID0gZnVuY3Rpb24gaW5pdChlbnRyb3B5LCBub25jZSwgcGVycykge1xuICB2YXIgc2VlZCA9IGVudHJvcHkuY29uY2F0KG5vbmNlKS5jb25jYXQocGVycyk7XG5cbiAgdGhpcy5LID0gbmV3IEFycmF5KHRoaXMub3V0TGVuIC8gOCk7XG4gIHRoaXMuViA9IG5ldyBBcnJheSh0aGlzLm91dExlbiAvIDgpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuVi5sZW5ndGg7IGkrKykge1xuICAgIHRoaXMuS1tpXSA9IDB4MDA7XG4gICAgdGhpcy5WW2ldID0gMHgwMTtcbiAgfVxuXG4gIHRoaXMuX3VwZGF0ZShzZWVkKTtcbiAgdGhpcy5fcmVzZWVkID0gMTtcbiAgdGhpcy5yZXNlZWRJbnRlcnZhbCA9IDB4MTAwMDAwMDAwMDAwMDsgIC8vIDJeNDhcbn07XG5cbkhtYWNEUkJHLnByb3RvdHlwZS5faG1hYyA9IGZ1bmN0aW9uIGhtYWMoKSB7XG4gIHJldHVybiBuZXcgaGFzaC5obWFjKHRoaXMuaGFzaCwgdGhpcy5LKTtcbn07XG5cbkhtYWNEUkJHLnByb3RvdHlwZS5fdXBkYXRlID0gZnVuY3Rpb24gdXBkYXRlKHNlZWQpIHtcbiAgdmFyIGttYWMgPSB0aGlzLl9obWFjKClcbiAgICAgICAgICAgICAgICAgLnVwZGF0ZSh0aGlzLlYpXG4gICAgICAgICAgICAgICAgIC51cGRhdGUoWyAweDAwIF0pO1xuICBpZiAoc2VlZClcbiAgICBrbWFjID0ga21hYy51cGRhdGUoc2VlZCk7XG4gIHRoaXMuSyA9IGttYWMuZGlnZXN0KCk7XG4gIHRoaXMuViA9IHRoaXMuX2htYWMoKS51cGRhdGUodGhpcy5WKS5kaWdlc3QoKTtcbiAgaWYgKCFzZWVkKVxuICAgIHJldHVybjtcblxuICB0aGlzLksgPSB0aGlzLl9obWFjKClcbiAgICAgICAgICAgICAgIC51cGRhdGUodGhpcy5WKVxuICAgICAgICAgICAgICAgLnVwZGF0ZShbIDB4MDEgXSlcbiAgICAgICAgICAgICAgIC51cGRhdGUoc2VlZClcbiAgICAgICAgICAgICAgIC5kaWdlc3QoKTtcbiAgdGhpcy5WID0gdGhpcy5faG1hYygpLnVwZGF0ZSh0aGlzLlYpLmRpZ2VzdCgpO1xufTtcblxuSG1hY0RSQkcucHJvdG90eXBlLnJlc2VlZCA9IGZ1bmN0aW9uIHJlc2VlZChlbnRyb3B5LCBlbnRyb3B5RW5jLCBhZGQsIGFkZEVuYykge1xuICAvLyBPcHRpb25hbCBlbnRyb3B5IGVuY1xuICBpZiAodHlwZW9mIGVudHJvcHlFbmMgIT09ICdzdHJpbmcnKSB7XG4gICAgYWRkRW5jID0gYWRkO1xuICAgIGFkZCA9IGVudHJvcHlFbmM7XG4gICAgZW50cm9weUVuYyA9IG51bGw7XG4gIH1cblxuICBlbnRyb3B5ID0gdXRpbHMudG9BcnJheShlbnRyb3B5LCBlbnRyb3B5RW5jKTtcbiAgYWRkID0gdXRpbHMudG9BcnJheShhZGQsIGFkZEVuYyk7XG5cbiAgYXNzZXJ0KGVudHJvcHkubGVuZ3RoID49ICh0aGlzLm1pbkVudHJvcHkgLyA4KSxcbiAgICAgICAgICdOb3QgZW5vdWdoIGVudHJvcHkuIE1pbmltdW0gaXM6ICcgKyB0aGlzLm1pbkVudHJvcHkgKyAnIGJpdHMnKTtcblxuICB0aGlzLl91cGRhdGUoZW50cm9weS5jb25jYXQoYWRkIHx8IFtdKSk7XG4gIHRoaXMuX3Jlc2VlZCA9IDE7XG59O1xuXG5IbWFjRFJCRy5wcm90b3R5cGUuZ2VuZXJhdGUgPSBmdW5jdGlvbiBnZW5lcmF0ZShsZW4sIGVuYywgYWRkLCBhZGRFbmMpIHtcbiAgaWYgKHRoaXMuX3Jlc2VlZCA+IHRoaXMucmVzZWVkSW50ZXJ2YWwpXG4gICAgdGhyb3cgbmV3IEVycm9yKCdSZXNlZWQgaXMgcmVxdWlyZWQnKTtcblxuICAvLyBPcHRpb25hbCBlbmNvZGluZ1xuICBpZiAodHlwZW9mIGVuYyAhPT0gJ3N0cmluZycpIHtcbiAgICBhZGRFbmMgPSBhZGQ7XG4gICAgYWRkID0gZW5jO1xuICAgIGVuYyA9IG51bGw7XG4gIH1cblxuICAvLyBPcHRpb25hbCBhZGRpdGlvbmFsIGRhdGFcbiAgaWYgKGFkZCkge1xuICAgIGFkZCA9IHV0aWxzLnRvQXJyYXkoYWRkLCBhZGRFbmMgfHwgJ2hleCcpO1xuICAgIHRoaXMuX3VwZGF0ZShhZGQpO1xuICB9XG5cbiAgdmFyIHRlbXAgPSBbXTtcbiAgd2hpbGUgKHRlbXAubGVuZ3RoIDwgbGVuKSB7XG4gICAgdGhpcy5WID0gdGhpcy5faG1hYygpLnVwZGF0ZSh0aGlzLlYpLmRpZ2VzdCgpO1xuICAgIHRlbXAgPSB0ZW1wLmNvbmNhdCh0aGlzLlYpO1xuICB9XG5cbiAgdmFyIHJlcyA9IHRlbXAuc2xpY2UoMCwgbGVuKTtcbiAgdGhpcy5fdXBkYXRlKGFkZCk7XG4gIHRoaXMuX3Jlc2VlZCsrO1xuICByZXR1cm4gdXRpbHMuZW5jb2RlKHJlcywgZW5jKTtcbn07XG4iLCJpZiAodHlwZW9mIE9iamVjdC5jcmVhdGUgPT09ICdmdW5jdGlvbicpIHtcbiAgLy8gaW1wbGVtZW50YXRpb24gZnJvbSBzdGFuZGFyZCBub2RlLmpzICd1dGlsJyBtb2R1bGVcbiAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbmhlcml0cyhjdG9yLCBzdXBlckN0b3IpIHtcbiAgICBjdG9yLnN1cGVyXyA9IHN1cGVyQ3RvclxuICAgIGN0b3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShzdXBlckN0b3IucHJvdG90eXBlLCB7XG4gICAgICBjb25zdHJ1Y3Rvcjoge1xuICAgICAgICB2YWx1ZTogY3RvcixcbiAgICAgICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgICAgIHdyaXRhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcbn0gZWxzZSB7XG4gIC8vIG9sZCBzY2hvb2wgc2hpbSBmb3Igb2xkIGJyb3dzZXJzXG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5oZXJpdHMoY3Rvciwgc3VwZXJDdG9yKSB7XG4gICAgY3Rvci5zdXBlcl8gPSBzdXBlckN0b3JcbiAgICB2YXIgVGVtcEN0b3IgPSBmdW5jdGlvbiAoKSB7fVxuICAgIFRlbXBDdG9yLnByb3RvdHlwZSA9IHN1cGVyQ3Rvci5wcm90b3R5cGVcbiAgICBjdG9yLnByb3RvdHlwZSA9IG5ldyBUZW1wQ3RvcigpXG4gICAgY3Rvci5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBjdG9yXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gYXNzZXJ0O1xuXG5mdW5jdGlvbiBhc3NlcnQodmFsLCBtc2cpIHtcbiAgaWYgKCF2YWwpXG4gICAgdGhyb3cgbmV3IEVycm9yKG1zZyB8fCAnQXNzZXJ0aW9uIGZhaWxlZCcpO1xufVxuXG5hc3NlcnQuZXF1YWwgPSBmdW5jdGlvbiBhc3NlcnRFcXVhbChsLCByLCBtc2cpIHtcbiAgaWYgKGwgIT0gcilcbiAgICB0aHJvdyBuZXcgRXJyb3IobXNnIHx8ICgnQXNzZXJ0aW9uIGZhaWxlZDogJyArIGwgKyAnICE9ICcgKyByKSk7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbHMgPSBleHBvcnRzO1xuXG5mdW5jdGlvbiB0b0FycmF5KG1zZywgZW5jKSB7XG4gIGlmIChBcnJheS5pc0FycmF5KG1zZykpXG4gICAgcmV0dXJuIG1zZy5zbGljZSgpO1xuICBpZiAoIW1zZylcbiAgICByZXR1cm4gW107XG4gIHZhciByZXMgPSBbXTtcbiAgaWYgKHR5cGVvZiBtc2cgIT09ICdzdHJpbmcnKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtc2cubGVuZ3RoOyBpKyspXG4gICAgICByZXNbaV0gPSBtc2dbaV0gfCAwO1xuICAgIHJldHVybiByZXM7XG4gIH1cbiAgaWYgKGVuYyA9PT0gJ2hleCcpIHtcbiAgICBtc2cgPSBtc2cucmVwbGFjZSgvW15hLXowLTldKy9pZywgJycpO1xuICAgIGlmIChtc2cubGVuZ3RoICUgMiAhPT0gMClcbiAgICAgIG1zZyA9ICcwJyArIG1zZztcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1zZy5sZW5ndGg7IGkgKz0gMilcbiAgICAgIHJlcy5wdXNoKHBhcnNlSW50KG1zZ1tpXSArIG1zZ1tpICsgMV0sIDE2KSk7XG4gIH0gZWxzZSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtc2cubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBjID0gbXNnLmNoYXJDb2RlQXQoaSk7XG4gICAgICB2YXIgaGkgPSBjID4+IDg7XG4gICAgICB2YXIgbG8gPSBjICYgMHhmZjtcbiAgICAgIGlmIChoaSlcbiAgICAgICAgcmVzLnB1c2goaGksIGxvKTtcbiAgICAgIGVsc2VcbiAgICAgICAgcmVzLnB1c2gobG8pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzO1xufVxudXRpbHMudG9BcnJheSA9IHRvQXJyYXk7XG5cbmZ1bmN0aW9uIHplcm8yKHdvcmQpIHtcbiAgaWYgKHdvcmQubGVuZ3RoID09PSAxKVxuICAgIHJldHVybiAnMCcgKyB3b3JkO1xuICBlbHNlXG4gICAgcmV0dXJuIHdvcmQ7XG59XG51dGlscy56ZXJvMiA9IHplcm8yO1xuXG5mdW5jdGlvbiB0b0hleChtc2cpIHtcbiAgdmFyIHJlcyA9ICcnO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG1zZy5sZW5ndGg7IGkrKylcbiAgICByZXMgKz0gemVybzIobXNnW2ldLnRvU3RyaW5nKDE2KSk7XG4gIHJldHVybiByZXM7XG59XG51dGlscy50b0hleCA9IHRvSGV4O1xuXG51dGlscy5lbmNvZGUgPSBmdW5jdGlvbiBlbmNvZGUoYXJyLCBlbmMpIHtcbiAgaWYgKGVuYyA9PT0gJ2hleCcpXG4gICAgcmV0dXJuIHRvSGV4KGFycik7XG4gIGVsc2VcbiAgICByZXR1cm4gYXJyO1xufTtcbiJdfQ==
