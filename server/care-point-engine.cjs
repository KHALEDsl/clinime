(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CarePointPuzzle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Directions are clockwise: north, east, south, west.
  var bases = { curve: [0, 1], straight: [0, 2], end: [0] };
  function normalized(value) {
    return Number.isFinite(value) ? ((Math.trunc(value) % 4) + 4) % 4 : 0;
  }
  function ports(tile) {
    if (!tile || !bases[tile.type]) return [];
    var rotation = normalized(tile.rotation);
    return bases[tile.type].map(function (port) { return (port + rotation) % 4; });
  }
  function copyTile(tile) {
    return Object.assign({}, tile, { rotation: normalized(tile.rotation) });
  }
  function clone(level) { return level.tiles.map(copyTile); }
  function rotate(board, index) {
    return board.map(function (tile, i) {
      var result = copyTile(tile);
      if (i === index && !tile.fixed) result.rotation = (result.rotation + 1) % 4;
      return result;
    });
  }
  function equivalent(tile, rotation) {
    var period = tile.type === 'straight' ? 2 : 4;
    return normalized(tile.rotation) % period === normalized(rotation) % period;
  }
  function hint(level, board) {
    for (var i = 0; i < board.length; i += 1) {
      if (!board[i].fixed && !equivalent(board[i], level.solution[i])) return i;
    }
    return null;
  }
  function minMoves(level) {
    return level.tiles.reduce(function (total, tile, index) {
      if (tile.fixed) return total;
      var period = tile.type === 'straight' ? 2 : 4;
      return total + ((normalized(level.solution[index]) - normalized(tile.rotation)) % period + period) % period;
    }, 0);
  }
  function neighbor(index, port, rows, cols) {
    var row = Math.floor(index / cols), col = index % cols;
    if (port === 0) return row > 0 ? index - cols : null;
    if (port === 1) return col < cols - 1 ? index + 1 : null;
    if (port === 2) return row < rows - 1 ? index + cols : null;
    return col > 0 ? index - 1 : null;
  }
  function trace(level, board) {
    var path = [], flowers = [], steps = [], seen = new Set();
    var index = level.start, entry = null;
    var flowerSet = new Set(level.flowers);
    function result(reason, blockedAt) {
      var value = {
        path: path, flowers: flowers, steps: steps,
        success: reason === 'goal' && flowers.length === flowerSet.size,
        reason: reason
      };
      if (blockedAt !== undefined) value.blockedAt = blockedAt;
      return value;
    }
    while (true) {
      if (!board[index]) return result('gap', index);
      if (seen.has(index)) return result('loop', index);
      seen.add(index);
      var available = ports(board[index]);
      path.push(index);
      if (flowerSet.has(index)) flowers.push(index);
      var exits = available.filter(function (port) { return port !== entry; });
      var exit = index === level.goal ? null : (exits.length ? exits[0] : null);
      steps.push({ index: index, row: Math.floor(index / level.cols), col: index % level.cols,
        entry: entry, exit: exit, ports: available.slice() });
      if (index === level.goal) return result('goal');
      if (exit === null) return result('gap', index);
      var next = neighbor(index, exit, level.rows, level.cols);
      if (next === null) return result('edge', index);
      var opposite = (exit + 2) % 4;
      if (!board[next] || ports(board[next]).indexOf(opposite) === -1) return result('gap', next);
      if (seen.has(next)) return result('loop', next);
      index = next;
      entry = opposite;
    }
  }
  function direction(from, to) {
    return to === from - 4 ? 0 : to === from + 1 ? 1 : to === from + 4 ? 2 : 3;
  }
  function makeLevel(id, name, path, flowers, scramble) {
    var tiles = Array.from({ length: 16 }, function (_, index) {
      // Fixed single-port dead ends prevent a decoy from becoming a shortcut.
      return { type: 'end', rotation: index % 4, fixed: true };
    });
    path.forEach(function (index, position) {
      var required = [];
      if (position > 0) required.push(direction(index, path[position - 1]));
      if (position < path.length - 1) required.push(direction(index, path[position + 1]));
      var type = required.length === 1 ? 'end' : (Math.abs(required[0] - required[1]) === 2 ? 'straight' : 'curve');
      var rotation = [0, 1, 2, 3].find(function (candidate) {
        var actual = ports({ type: type, rotation: candidate });
        return required.every(function (port) { return actual.indexOf(port) !== -1; });
      });
      tiles[index] = { type: type, rotation: rotation, fixed: position === 0 || position === path.length - 1 };
    });
    var solution = tiles.map(function (tile) { return tile.rotation; });
    tiles.forEach(function (tile, index) {
      if (!tile.fixed) tile.rotation = normalized(tile.rotation + scramble[index]);
      Object.freeze(tile);
    });
    return Object.freeze({ id: id, name: name, rows: 4, cols: 4, start: 0, goal: 15,
      flowers: Object.freeze(flowers), tiles: Object.freeze(tiles), solution: Object.freeze(solution) });
  }
  var challengePaths;
  function availablePaths() {
    if (challengePaths) return challengePaths;
    var paths = [];
    function visit(path, seen) {
      var index = path[path.length - 1];
      if (index === 15) {
        if (path.length >= 9 && path[path.length - 2] === 11) paths.push(Object.freeze(path));
        return;
      }
      if (path.length >= 15) return;
      for (var port = 0; port < 4; port += 1) {
        var next = neighbor(index, port, 4, 4);
        if (next === null || (seen & (1 << next))) continue;
        visit(path.concat(next), seen | (1 << next));
      }
    }
    // Preserve the fixed source's east-facing port. The goal accepts only north.
    visit([0, 1], (1 << 0) | (1 << 1));
    challengePaths = Object.freeze(paths);
    return challengePaths;
  }
  function hashSeed(seed) {
    var value = 2166136261;
    for (var i = 0; i < seed.length; i += 1) {
      value = Math.imul(value ^ seed.charCodeAt(i), 16777619);
    }
    return value >>> 0;
  }
  function seededRandom(seed) {
    var state = seed;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      var value = Math.imul(state ^ (state >>> 15), state | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeChallenge(seed) {
    if (typeof seed !== 'string') throw new TypeError('Challenge seed must be a string.');
    var hash = hashSeed(seed), random = seededRandom(hash);
    var paths = availablePaths();
    var path = paths[Math.floor(random() * paths.length)];
    var interior = path.slice(1, -1), flowerCandidates = interior.slice();
    // Shuffle a copy: shared path candidates and prior challenges stay immutable.
    for (var i = flowerCandidates.length - 1; i > 0; i -= 1) {
      var j = Math.floor(random() * (i + 1));
      var saved = flowerCandidates[i];
      flowerCandidates[i] = flowerCandidates[j];
      flowerCandidates[j] = saved;
    }
    // Keep checkpoint order consistent with the source-to-goal traversal.
    var flowers = interior.filter(function (index) { return flowerCandidates.slice(0, 3).indexOf(index) !== -1; });
    var scramble = Array.from({ length: 16 }, function () { return 0; });
    interior.forEach(function (index) {
      // Some correct pieces keep the small board approachable.
      scramble[index] = random() < 0.4 ? 0 : 1 + Math.floor(random() * 3);
    });
    // Tile 1 is always on the route. A quarter turn changes either pipe type,
    // so a fresh board can never already satisfy the complete solution.
    scramble[1] = 1;
    var level = makeLevel('challenge-v1-' + hash.toString(36), 'مسار العناية', path, flowers, scramble);
    return Object.freeze(Object.assign({}, level, { seed: seed }));
  }
  var levels = Object.freeze([
    makeLevel('first-care', 'أول عناية', [0, 1, 5, 4, 8, 9, 10, 6, 7, 11, 15], [5, 10, 11],
      [0, 1, 0, 0, 3, 2, 1, 3, 1, 0, 1, 2, 0, 0, 0, 0]),
    makeLevel('care-route', 'درب العناية', [0, 1, 2, 6, 5, 9, 8, 12, 13, 14, 10, 11, 15], [6, 9, 14],
      [0, 1, 2, 0, 0, 3, 1, 0, 2, 1, 3, 1, 3, 1, 2, 0]),
    makeLevel('care-bloom', 'تفتّح العناية', [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 13, 14, 10, 11, 15], [6, 9, 11],
      [0, 1, 1, 3, 2, 1, 0, 2, 3, 2, 1, 3, 0, 1, 2, 0])
  ]);
  return Object.freeze({ levels: levels, ports: ports, rotate: rotate, trace: trace,
    clone: clone, hint: hint, minMoves: minMoves, makeChallenge: makeChallenge });
});
