var SequenceModule = require('./Sequence');
var ImmutableMap = require('./Map');
var Sequence = SequenceModule.Sequence;
var IndexedSequence = SequenceModule.IndexedSequence;


class Set extends Sequence {

  // @pragma Construction

  constructor(/*...values*/) {
    return Set.fromArray(arguments);
  }

  static empty() {
    return __EMPTY_SET || (__EMPTY_SET = Set._make());
  }

  static fromArray(values) {
    if (values.length === 0) {
      return Set.empty();
    }
    return Set.empty().withMutations(set => {
      for (var ii = 0; ii < values.length; ii++) {
        set.add(values[ii]);
      }
    });
  }

  toString() {
    return this.__toString('Set {', '}');
  }

  // @pragma Access

  has(value) {
    return this._map ? this._map.has(value) : false;
  }

  get(value, notFoundValue) {
    return this.has(value) ? value : notFoundValue;
  }

  // @pragma Modification

  clear() {
    if (this.__ownerID) {
      this.length = 0;
      this._map = null;
      return this;
    }
    return Set.empty();
  }

  add(value) {
    if (value == null) {
      return this;
    }
    var newMap = this._map;
    if (!newMap) {
      newMap = ImmutableMap.empty().__ensureOwner(this.__ownerID);
    }
    newMap = newMap.set(value, null);
    if (this.__ownerID) {
      this.length = newMap.length;
      this._map = newMap;
      return this;
    }
    return newMap === this._map ? this : Set._make(newMap);
  }

  delete(value) {
    if (value == null || this._map == null) {
      return this;
    }
    var newMap = this._map.delete(value);
    if (newMap.length === 0) {
      return this.clear();
    }
    if (this.__ownerID) {
      this.length = newMap.length;
      this._map = newMap;
      return this;
    }
    return newMap === this._map ? this : Set._make(newMap);
  }

  // @pragma Composition

  union(/*...seqs*/) {
    var seqs = arguments;
    if (seqs.length === 0) {
      return this;
    }
    return this.withMutations(set => {
      for (var ii = 0; ii < seqs.length; ii++) {
        var seq = seqs[ii];
        seq = seq.forEach ? seq : Sequence(seq);
        seq.forEach(value => set.add(value));
      }
    });
  }

  intersect(...seqs) {
    if (seqs.length === 0) {
      return this;
    }
    seqs = seqs.map(seq => Sequence(seq));
    var originalSet = this;
    return this.withMutations(set => {
      originalSet.forEach(value => {
        if (!seqs.every(seq => seq.contains(value))) {
          set.delete(value);
        }
      });
    });
  }

  difference(...seqs) {
    if (seqs.length === 0) {
      return this;
    }
    seqs = seqs.map(seq => Sequence(seq));
    var originalSet = this;
    return this.withMutations(set => {
      originalSet.forEach(value => {
        if (seqs.some(seq => seq.contains(value))) {
          set.delete(value);
        }
      });
    });
  }

  isSubset(seq) {
    seq = Sequence(seq);
    return this.every(value => seq.contains(value));
  }

  isSuperset(seq) {
    var set = this;
    seq = Sequence(seq);
    return seq.every(value => set.contains(value));
  }

  // @pragma Mutability

  __ensureOwner(ownerID) {
    if (ownerID === this.__ownerID) {
      return this;
    }
    var newMap = this._map && this._map.__ensureOwner(ownerID);
    if (!ownerID) {
      this.__ownerID = ownerID;
      this._map = newMap;
      return this;
    }
    return Set._make(newMap, ownerID);
  }

  // @pragma Iteration

  toSet() {
    return this;
  }

  __deepEquals(other) {
    return !(this._map || other._map) || this._map.equals(other._map);
  }

  __iterate(fn, reverse) {
    var collection = this;
    return this._map ? this._map.__iterate((_, k) => fn(k, k, collection), reverse) : 0;
  }

  // @pragma Private

  static _make(map, ownerID) {
    var set = Object.create(Set.prototype);
    set.length = map ? map.length : 0;
    set._map = map;
    set.__ownerID = ownerID;
    return set;
  }
}

Set.prototype.contains = Set.prototype.has;
Set.prototype.withMutations = ImmutableMap.prototype.withMutations;
Set.prototype.__toJS = IndexedSequence.prototype.__toJS;
Set.prototype.__toStringMapper = IndexedSequence.prototype.__toStringMapper;


var __EMPTY_SET;

module.exports = Set;
