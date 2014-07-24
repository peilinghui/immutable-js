var Immutable = require('./Immutable');


class Sequence {
  constructor(value) {
    if (arguments.length !== 1) {
      value = Array.prototype.slice.call(arguments);
    } else {
      if (value instanceof Sequence) {
        return value;
      }
      if (!Array.isArray(value)) {
        if (value && typeof value === 'object') {
          var objectSequence = makeSequence();
          objectSequence.toObject = () => value;
          objectSequence.cacheResult = function() {
            if (this.length == null) {
              this.length = Object.keys(value).length;
            }
            return this;
          }
          objectSequence.__iterate = objectIterator.bind(null, value);
          return objectSequence;
        }
        value = [value];
      }
    }
    var arraySequence = makeIndexedSequence();
    arraySequence.length = value.length;
    arraySequence.toArray = () => value;
    arraySequence.__iterate = arrayIterator.bind(null, value);
    return arraySequence;
  }

  toString() {
    return this.__toString('Seq {', '}');
  }

  __toString(head, tail) {
    if (this.length === 0) {
      return head + tail;
    }
    return head + ' ' + this.map(this.__toStringMapper).join(', ') + ' ' + tail;
  }

  __toStringMapper(v, k) {
    return quoteString(k) + ': ' + quoteString(v);
  }

  toJSON() {
    return this.map(value => value.toJSON ? value.toJSON() : value).__toJS();
  }

  toArray() {
    var array = new Array(this.length || 0);
    this.values().forEach((v, i) => { array[i] = v; });
    return array;
  }

  toObject() {
    var object = {};
    this.forEach((v, k) => { object[k] = v; });
    return object;
  }

  toVector() {
    // Use Late Binding here to solve the circular dependency.
    return require('./Vector').empty().merge(this.values());
  }

  toMap() {
    // Use Late Binding here to solve the circular dependency.
    return require('./Map').empty().merge(this);
  }

  toOrderedMap() {
    // Use Late Binding here to solve the circular dependency.
    return require('./OrderedMap').empty().merge(this);
  }

  toSet() {
    // Use Late Binding here to solve the circular dependency.
    return require('./Set').empty().union(this);
  }

  equals(other) {
    if (this === other) {
      return true;
    }
    if (!(other instanceof Sequence)) {
      return false;
    }
    if (this.length != null && other.length != null) {
      if (this.length !== other.length) {
        return false;
      }
      if (this.length === 0 && other.length === 0) {
        return true;
      }
    }
    return this.__deepEquals(other);
  }

  __deepEquals(other) {
    var entries = this.cacheResult().entries().toArray();
    var iterations = 0;
    return other.every((v, k) => {
      var entry = entries[iterations++];
      return Immutable.is(k, entry[0]) && Immutable.is(v, entry[1]);
    });
  }

  join(separator) {
    separator = separator || ',';
    var string = '';
    var isFirst = true;
    this.forEach((v, k) => {
      if (isFirst) {
        isFirst = false;
        string += v;
      } else {
        string += separator + v;
      }
    });
    return string;
  }

  concat(...values) {
    var sequences = [this].concat(values.map(value => Sequence(value)));
    var concatSequence = this.__makeSequence();
    concatSequence.length = sequences.reduce(
      (sum, seq) => sum != null && seq.length != null ? sum + seq.length : undefined, 0
    );
    concatSequence.__iterateUncached = (fn, reverse) => {
      var iterations = 0;
      var stoppedIteration;
      var lastIndex = sequences.length - 1;
      for (var ii = 0; ii <= lastIndex && !stoppedIteration; ii++) {
        var seq = sequences[reverse ? lastIndex - ii : ii];
        iterations += seq.__iterate((v, k, c) => {
          if (fn(v, k, c) === false) {
            stoppedIteration = true;
            return false;
          }
        }, reverse);
      }
      return iterations;
    };
    return concatSequence;
  }

  reverse(maintainIndices) {
    var sequence = this;
    var reversedSequence = sequence.__makeSequence();
    reversedSequence.length = sequence.length;
    reversedSequence.__iterateUncached = (fn, reverse) => sequence.__iterate(fn, !reverse);
    reversedSequence.reverse = () => sequence;
    return reversedSequence;
  }

  keys() {
    return this.map(keyMapper).values();
  }

  values() {
    // values() always returns an IndexedSequence.
    var sequence = this;
    var valuesSequence = makeIndexedSequence(sequence);
    valuesSequence.length = sequence.length;
    valuesSequence.values = returnThis;
    valuesSequence.__iterateUncached = function (fn, reverse, flipIndices) {
      if (flipIndices && this.length == null) {
        return this.cacheResult().__iterate(fn, reverse, flipIndices);
      }
      var iterations = 0;
      var predicate;
      if (flipIndices) {
        iterations = this.length - 1;
        predicate = (v, k, c) => fn(v, iterations--, c) !== false;
      } else {
        predicate = (v, k, c) => fn(v, iterations++, c) !== false;
      }
      sequence.__iterate(predicate, reverse); // intentionally do not pass flipIndices
      return flipIndices ? this.length : iterations;
    }
    return valuesSequence;
  }

  entries() {
    var sequence = this;
    if (sequence._cache) {
      // We cache as an entries array, so we can just return the cache!
      return Sequence(sequence._cache);
    }
    var entriesSequence = sequence.map(entryMapper).values();
    entriesSequence.fromEntries = () => sequence;
    return entriesSequence;
  }

  forEach(sideEffect, thisArg) {
    return this.__iterate(thisArg ? sideEffect.bind(thisArg) : sideEffect);
  }

  first(predicate, thisArg) {
    var firstValue;
    (predicate ? this.filter(predicate, thisArg) : this).take(1).forEach(v => { firstValue = v; });
    return firstValue;
  }

  last(predicate, thisArg) {
    return this.reverse(true).first(predicate, thisArg);
  }

  reduce(reducer, initialReduction, thisArg) {
    var reduction = initialReduction;
    this.forEach((v, k, c) => {
      reduction = reducer.call(thisArg, reduction, v, k, c);
    });
    return reduction;
  }

  reduceRight(reducer, initialReduction, thisArg) {
    return this.reverse(true).reduce(reducer, initialReduction, thisArg);
  }

  every(predicate, thisArg) {
    var returnValue = true;
    this.forEach((v, k, c) => {
      if (!predicate.call(thisArg, v, k, c)) {
        returnValue = false;
        return false;
      }
    });
    return returnValue;
  }

  some(predicate, thisArg) {
    return !this.every(not(predicate), thisArg);
  }

  has(searchKey) {
    return this.get(searchKey, __SENTINEL) !== __SENTINEL;
  }

  get(searchKey, notFoundValue) {
    return this.find((_, key) => Immutable.is(key, searchKey), null, notFoundValue);
  }

  getIn(searchKeyPath, notFoundValue) {
    return getInDeepSequence(this, searchKeyPath, notFoundValue, 0);
  }

  contains(searchValue) {
    return this.find(value => Immutable.is(value, searchValue), null, __SENTINEL) !== __SENTINEL;
  }

  find(predicate, thisArg, notFoundValue) {
    var foundValue = notFoundValue;
    this.forEach((v, k, c) => {
      if (predicate.call(thisArg, v, k, c)) {
        foundValue = v;
        return false;
      }
    });
    return foundValue;
  }

  findKey(predicate, thisArg) {
    var foundKey;
    this.forEach((v, k, c) => {
      if (predicate.call(thisArg, v, k, c)) {
        foundKey = k;
        return false;
      }
    });
    return foundKey;
  }

  findLast(predicate, thisArg, notFoundValue) {
    return this.reverse(true).find(predicate, thisArg, notFoundValue);
  }

  findLastKey(predicate, thisArg) {
    return this.reverse(true).findKey(predicate, thisArg);
  }

  flip() {
    // flip() always returns a non-indexed Sequence.
    var sequence = this;
    var flipSequence = makeSequence();
    flipSequence.length = sequence.length;
    flipSequence.flip = () => sequence;
    flipSequence.__iterateUncached = (fn, reverse) =>
      sequence.__iterate((v, k, c) => fn(k, v, c) !== false, reverse);
    return flipSequence;
  }

  map(mapper, thisArg) {
    var sequence = this;
    var mappedSequence = sequence.__makeSequence();
    mappedSequence.length = sequence.length;
    mappedSequence.__iterateUncached = (fn, reverse) =>
      sequence.__iterate((v, k, c) => fn(mapper.call(thisArg, v, k, c), k, c) !== false, reverse);
    return mappedSequence;
  }

  filter(predicate, thisArg) {
    return filterFactory(this, predicate, thisArg, true, false);
  }

  slice(begin, end) {
    if (wholeSlice(begin, end, this.length)) {
      return this;
    }
    var resolvedBegin = resolveBegin(begin, this.length);
    var resolvedEnd = resolveEnd(end, this.length);
    // begin or end will be NaN if they were provided as negative numbers and
    // this sequence's length is unknown. In that case, convert it to an
    // IndexedSequence by getting entries() and convert back to a sequence with
    // fromEntries(). IndexedSequence.prototype.slice will appropriately handle
    // this case.
    if (resolvedBegin !== resolvedBegin || resolvedEnd !== resolvedEnd) {
      return this.entries().slice(begin, end).fromEntries();
    }
    var skipped = resolvedBegin === 0 ? this : this.skip(resolvedBegin);
    return resolvedEnd == null || resolvedEnd === this.length ?
      skipped : skipped.take(resolvedEnd - resolvedBegin);
  }

  splice(index, removeNum, ...values) {
    if (removeNum === 0 && values.length === 0) {
      return this;
    }
    return this.slice(0, index).concat(values, this.slice(index + removeNum));
  }

  take(amount) {
    var iterations = 0;
    var sequence = this.takeWhile(() => iterations++ < amount);
    sequence.length = this.length && Math.min(this.length, amount);
    return sequence;
  }

  takeLast(amount, maintainIndices) {
    return this.reverse(maintainIndices).take(amount).reverse(maintainIndices);
  }

  takeWhile(predicate, thisArg, maintainIndices) {
    var sequence = this;
    var takeSequence = sequence.__makeSequence();
    takeSequence.__iterateUncached = function(fn, reverse, flipIndices) {
      if (reverse) {
        // TODO: can we do a better job of this?
        return this.cacheResult().__iterate(fn, reverse, flipIndices);
      }
      var iterations = 0;
      sequence.__iterate((v, k, c) => {
        if (predicate.call(thisArg, v, k, c) && fn(v, k, c) !== false) {
          iterations++;
        } else {
          return false;
        }
      }, reverse, flipIndices);
      return iterations;
    };
    return takeSequence;
  }

  takeUntil(predicate, thisArg, maintainIndices) {
    return this.takeWhile(not(predicate), thisArg, maintainIndices);
  }

  skip(amount, maintainIndices) {
    if (amount === 0) {
      return this;
    }
    var iterations = 0;
    var sequence = this.skipWhile(() => iterations++ < amount, null, maintainIndices);
    sequence.length = this.length && Math.max(0, this.length - amount);
    return sequence;
  }

  skipLast(amount, maintainIndices) {
    return this.reverse(maintainIndices).skip(amount).reverse(maintainIndices);
  }

  skipWhile(predicate, thisArg, maintainIndices) {
    var sequence = this;
    var skipSequence = sequence.__makeSequence();
    skipSequence.__iterateUncached = function (fn, reverse, flipIndices) {
      if (reverse) {
        // TODO: can we do a better job of this?
        return this.cacheResult().__iterate(fn, reverse, flipIndices);
      }
      var isSkipping = true;
      var iterations = 0;
      sequence.__iterate((v, k, c) => {
        if (!(isSkipping && (isSkipping = predicate.call(thisArg, v, k, c)))) {
          if (fn(v, k, c) !== false) {
            iterations++;
          } else {
            return false;
          }
        }
      }, reverse, flipIndices);
      return iterations;
    };
    return skipSequence;
  }

  skipUntil(predicate, thisArg, maintainIndices) {
    return this.skipWhile(not(predicate), thisArg, maintainIndices);
  }

  groupBy(mapper, context) {
    var seq = this;
    var groups = require('./OrderedMap').empty().withMutations(map => {
      seq.forEach((value, key, collection) => {
        var groupKey = mapper(value, key, collection);
        var group = map.get(groupKey, __SENTINEL);
        if (group === __SENTINEL) {
          group = [];
          map.set(groupKey, group);
        }
        group.push([key, value]);
      });
    })
    return groups.map(group => Sequence(group).fromEntries());
  }

  cacheResult() {
    if (!this._cache && this.__iterateUncached) {
      this._cache = this.entries().toArray();
      if (this.length == null) {
        this.length = this._cache.length;
      }
    }
    return this;
  }

  // abstract __iterateUncached(fn, reverse)

  __iterate(fn, reverse, flipIndices) {
    if (!this._cache) {
      return this.__iterateUncached(fn, reverse, flipIndices);
    }
    var maxIndex = this.length - 1;
    var cache = this._cache;
    var c = this;
    if (reverse) {
      for (var ii = cache.length - 1; ii >= 0; ii--) {
        var revEntry = cache[ii];
        if (fn(revEntry[1], flipIndices ? revEntry[0] : maxIndex - revEntry[0], c) === false) {
          break;
        }
      }
    } else {
      cache.every(flipIndices ?
        entry => fn(entry[1], maxIndex - entry[0], c) !== false :
        entry => fn(entry[1], entry[0], c) !== false
      );
    }
    return this.length;
  }

  __makeSequence() {
    return makeSequence();
  }
}

Sequence.prototype.inspect = Sequence.prototype.toSource = function() { return this.toString(); };
Sequence.prototype.__toJS = Sequence.prototype.toObject;


class IndexedSequence extends Sequence {

  toString() {
    return this.__toString('Seq [', ']');
  }

  toArray() {
    var array = new Array(this.length || 0);
    array.length = this.forEach((v, i) => { array[i] = v; });
    return array;
  }

  toVector() {
    // Use Late Binding here to solve the circular dependency.
    return require('./Vector').empty().merge(this);
  }

  join(separator) {
    separator = separator || ',';
    var string = '';
    var prevIndex = 0;
    this.forEach((v, i) => {
      var numSeparators = i - prevIndex;
      prevIndex = i;
      string += (numSeparators === 1 ? separator : repeatString(separator, numSeparators)) + v;
    });
    if (this.length && prevIndex < this.length - 1) {
      string += repeatString(separator, this.length - 1 - prevIndex);
    }
    return string;
  }

  concat(...values) {
    var sequences = [this].concat(values).map(value => Sequence(value));
    var concatSequence = this.__makeSequence();
    concatSequence.length = sequences.reduce(
      (sum, seq) => sum != null && seq.length != null ? sum + seq.length : undefined, 0
    );
    concatSequence.__iterateUncached = function(fn, reverse, flipIndices) {
      if (flipIndices && !this.length) {
        // In order to reverse indices, first we must create a cached
        // representation. This ensures we will have the correct total length
        // so index reversal works as expected.
        return this.cacheResult().__iterate(fn, reverse, flipIndices);
      }
      var iterations = 0;
      var stoppedIteration;
      var maxIndex = flipIndices && this.length - 1;
      var maxSequencesIndex = sequences.length - 1;
      for (var ii = 0; ii <= maxSequencesIndex && !stoppedIteration; ii++) {
        var sequence = sequences[reverse ? maxSequencesIndex - ii : ii];
        if (!(sequence instanceof IndexedSequence)) {
          sequence = sequence.values();
        }
        iterations += sequence.__iterate((v, index, c) => {
          index += iterations;
          if (fn(v, flipIndices ? maxIndex - index : index, c) === false) {
            stoppedIteration = true;
            return false;
          }
        }, reverse); // intentionally do not pass flipIndices
      }
      return iterations;
    }
    return concatSequence;
  }

  reverse(maintainIndices) {
    var sequence = this;
    var reversedSequence = sequence.__makeSequence();
    reversedSequence.length = sequence.length;
    reversedSequence.__reversedIndices = !!(maintainIndices ^ sequence.__reversedIndices);
    reversedSequence.__iterateUncached = (fn, reverse, flipIndices) =>
      sequence.__iterate(fn, !reverse, flipIndices ^ maintainIndices);
    reversedSequence.reverse = function (_maintainIndices) {
      return maintainIndices === _maintainIndices ? sequence :
        IndexedSequence.prototype.reverse.call(this, _maintainIndices);
    }
    return reversedSequence;
  }

  fromEntries() {
    var sequence = this;
    var fromEntriesSequence = sequence.__makeSequence();
    fromEntriesSequence.length = sequence.length;
    fromEntriesSequence.entries = () => sequence;
    fromEntriesSequence.__iterateUncached = (fn, reverse, flipIndices) =>
      sequence.__iterate((entry, _, c) => fn(entry[1], entry[0], c), reverse, flipIndices);
    return fromEntriesSequence;
  }

  // Overridden to supply undefined length
  values() {
    var valuesSequence = super.values();
    valuesSequence.length = undefined;
    return valuesSequence;
  }

  filter(predicate, thisArg, maintainIndices) {
    var filterSequence = filterFactory(this, predicate, thisArg, maintainIndices, maintainIndices);
    if (maintainIndices) {
      filterSequence.length = this.length;
    }
    return filterSequence;
  }

  indexOf(searchValue) {
    return this.findIndex(value => Immutable.is(value, searchValue));
  }

  findIndex(predicate, thisArg) {
    var key = this.findKey(predicate, thisArg);
    return key == null ? -1 : key;
  }

  lastIndexOf(searchValue) {
    return this.reverse(true).indexOf(searchValue);
  }

  findLastIndex(predicate, thisArg) {
    return this.reverse(true).findIndex(predicate, thisArg);
  }

  slice(begin, end, maintainIndices) {
    var sequence = this;
    if (wholeSlice(begin, end, sequence.length)) {
      return sequence;
    }
    var sliceSequence = sequence.__makeSequence();
    var resolvedBegin = resolveBegin(begin, sequence.length);
    var resolvedEnd = resolveEnd(end, sequence.length);
    sliceSequence.length = sequence.length && (maintainIndices ? sequence.length : resolvedEnd - resolvedBegin);
    sliceSequence.__reversedIndices = sequence.__reversedIndices;
    sliceSequence.__iterateUncached = function(fn, reverse, flipIndices) {
      if (reverse) {
        // TODO: reverse should be possible here.
        return this.cacheResult().__iterate(fn, reverse, flipIndices);
      }
      var reversedIndices = this.__reversedIndices ^ flipIndices;
      if (resolvedBegin !== resolvedBegin ||
          resolvedEnd !== resolvedEnd ||
          (reversedIndices && sequence.length == null)) {
        sequence.cacheResult();
        resolvedBegin = resolveBegin(begin, sequence.length);
        resolvedEnd = resolveEnd(end, sequence.length);
      }
      var iiBegin = reversedIndices ? sequence.length - resolvedEnd : resolvedBegin;
      var iiEnd = reversedIndices ? sequence.length - resolvedBegin : resolvedEnd;
      var length = sequence.__iterate((v, ii, c) =>
        !(ii >= iiBegin && (iiEnd == null || ii < iiEnd)) || fn(v, maintainIndices ? ii : ii - iiBegin, c) !== false,
        reverse, flipIndices
      );
      return this.length || (maintainIndices ? length : Math.max(0, length - iiBegin));
    };
    return sliceSequence;
  }

  // Overrides to get length correct.
  takeWhile(predicate, thisArg, maintainIndices) {
    var sequence = this;
    var takeSequence = sequence.__makeSequence();
    takeSequence.__iterateUncached = function (fn, reverse, flipIndices) {
      if (reverse) {
        // TODO: can we do a better job of this?
        return this.cacheResult().__iterate(fn, reverse, flipIndices);
      }
      var iterations = 0;
      // TODO: ensure didFinish is necessary here
      var didFinish = true;
      var length = sequence.__iterate((v, ii, c) => {
        if (predicate.call(thisArg, v, ii, c) && fn(v, ii, c) !== false) {
          iterations = ii;
        } else {
          didFinish = false;
          return false;
        }
      }, reverse, flipIndices);
      return maintainIndices ? takeSequence.length : didFinish ? length : iterations + 1;
    };
    if (maintainIndices) {
      takeSequence.length = this.length;
    }
    return takeSequence;
  }

  skipWhile(predicate, thisArg, maintainIndices) {
    var sequence = this;
    var skipWhileSequence = sequence.__makeSequence();
    if (maintainIndices) {
      skipWhileSequence.length = this.length;
    }
    skipWhileSequence.__iterateUncached = function (fn, reverse, flipIndices) {
      if (reverse) {
        // TODO: can we do a better job of this?
        return this.cacheResult().__iterate(fn, reverse, flipIndices)
      }
      var reversedIndices = sequence.__reversedIndices ^ flipIndices;
      var isSkipping = true;
      var indexOffset = 0;
      var length = sequence.__iterate((v, ii, c) => {
        if (isSkipping) {
          isSkipping = predicate.call(thisArg, v, ii, c);
          if (!isSkipping) {
            indexOffset = ii;
          }
        }
        return isSkipping || fn(v, flipIndices || maintainIndices ? ii : ii - indexOffset, c) !== false;
      }, reverse, flipIndices);
      return maintainIndices ? length : reversedIndices ? indexOffset + 1 : length - indexOffset;
    };
    return skipWhileSequence;
  }

  groupBy(mapper, context, maintainIndices) {
    var seq = this;
    var groups = require('./OrderedMap').empty().withMutations(map => {
      seq.forEach((value, index, collection) => {
        var groupKey = mapper(value, index, collection);
        var group = map.get(groupKey, __SENTINEL);
        if (group === __SENTINEL) {
          group = new Array(maintainIndices ? seq.length : 0);
          map.set(groupKey, group);
        }
        maintainIndices ? (group[index] = value) : group.push(value);
      });
    });
    return groups.map(group => Sequence(group));
  }

  // abstract __iterateUncached(fn, reverse, flipIndices)

  __makeSequence() {
    return makeIndexedSequence(this);
  }
}

IndexedSequence.prototype.__toJS = IndexedSequence.prototype.toArray;
IndexedSequence.prototype.__toStringMapper = quoteString;


function makeSequence() {
  return Object.create(Sequence.prototype);
}

function makeIndexedSequence(parent) {
  var newSequence = Object.create(IndexedSequence.prototype);
  newSequence.__reversedIndices = parent ? parent.__reversedIndices : false;
  return newSequence;
}

function arrayIterator(array, fn, reverse, flipIndices) {
  var maxIndex = array.length - 1;
  var lastIndex = -1;
  if (reverse) {
    for (var ii = maxIndex; ii >= 0; ii--) {
      if (array.hasOwnProperty(ii) &&
          fn(array[ii], flipIndices ? ii : maxIndex - ii, array) === false) {
        return lastIndex + 1;
      }
      lastIndex = ii;
    }
    return array.length;
  } else {
    var didFinish = array.every((value, index) => {
      if (fn(value, flipIndices ? maxIndex - index : index, array) === false) {
        return false;
      } else {
        lastIndex = index;
        return true;
      }
    });
    return didFinish ? array.length : lastIndex + 1;
  }
}

function objectIterator(object, fn, reverse) {
  if (reverse) {
    var keys = Object.keys(object);
    for (var ii = keys.length - 1; ii >= 0; ii--) {
      if (fn(object[keys[ii]], keys[ii], object) === false) {
        return keys.length - ii + 1;
      }
    }
    return keys.length;
  } else {
    var iterations = 0;
    for (var key in object) if (object.hasOwnProperty(key)) {
      if (fn(object[key], key, object) === false) {
        break;
      }
      iterations++;
    }
    return iterations;
  }
}

function getInDeepSequence(seq, keyPath, notFoundValue, pathOffset) {
  var nested = seq.get ? seq.get(keyPath[pathOffset], __SENTINEL) : __SENTINEL;
  if (nested === __SENTINEL) {
    return notFoundValue;
  }
  if (pathOffset === keyPath.length - 1) {
    return nested;
  }
  return getInDeepSequence(nested, keyPath, notFoundValue, pathOffset + 1);
}

function wholeSlice(begin, end, length) {
  return (begin === 0 || (length != null && begin <= -length)) &&
    (end == null || (length != null && end >= length));
}

function resolveBegin(begin, length) {
  return begin < 0 ? Math.max(0, length + begin) : length ? Math.min(length, begin) : begin;
}

function resolveEnd(end, length) {
  return end == null ? length : end < 0 ? Math.max(0, length + end) : length ? Math.min(length, end) : end;
}

function keyMapper(v, k) {
  return k;
}

function entryMapper(v, k) {
  return [k, v];
}

function returnThis() {
  return this;
}

/**
 * Sequence.prototype.filter and IndexedSequence.prototype.filter are so close
 * in behavior that it makes sense to build a factory with the few differences
 * encoded as booleans.
 */
function filterFactory(sequence, predicate, thisArg, useKeys, maintainIndices) {
  var filterSequence = sequence.__makeSequence();
  filterSequence.__iterateUncached = (fn, reverse, flipIndices) => {
    var iterations = 0;
    var length = sequence.__iterate((v, k, c) => {
      if (predicate.call(thisArg, v, k, c)) {
        if (fn(v, useKeys ? k : iterations, c) !== false) {
          iterations++;
        } else {
          return false;
        }
      }
    }, reverse, flipIndices);
    return maintainIndices ? length : iterations;
  };
  return filterSequence;
}

function not(predicate) {
  return function() {
    return !predicate.apply(this, arguments);
  }
}

function quoteString(value) {
  return typeof value === 'string' ? JSON.stringify(value) : value;
}

function repeatString(string, times) {
  var repeated = '';
  while (times) {
    if (times & 1) {
      repeated += string;
    }
    if ((times >>= 1)) {
      string += string;
    }
  }
  return repeated;
}


var __SENTINEL = {};

exports.Sequence = Sequence;
exports.IndexedSequence = IndexedSequence;
