'use strict';

class Assets {
  constructor() {
    this._promises = [];
    this._assets = new Map();
  }

  addImage(name, url) {
    const img = new Image();
    img.src = url;

    const promise = new Promise((resolve, reject) => {
      img.addEventListener('load', (e) => {
        this._assets.set(name, img);
        resolve(img);
      });
    });

    this._promises.push(promise);
  }

  loadAll() {
    return Promise.all(this._promises).then((p) => this._assets);
  }

  get(name) {
    return this._assets.get(name);
  }
}

const assets = new Assets();


class Event {
  constructor(target) {
    this.target = target;
  }
}


class EventDispatcher {
  constructor() {
    this._eventListeners = {};
  }

  addEventListener(type, callback) {
    if (this._eventListeners[type] == undefined) {
      this._eventListeners[type] = [];
    }
    this._eventListeners[type].push(callback);
  }

  dispatchEvent(type, event) {
    const listeners = this._eventListeners[type];
    if (listeners != undefined) listeners.forEach((callback) => callback(event));
  }
}


class Actor extends EventDispatcher {
  constructor(sx, sy, width, height, x, y, tags) {
    super();
    this.sx = sx;
    this.sy = sy;
    this.width = width;
    this.height = height;
    this.hitArea = {
      x: x - width / 4,
      y: y - height / 4,
      width: width / 2,
      height: height / 2
    };
    this.dx = x - width / 2;
    this.dy = y - height / 2;
    this.x = x;
    this.y = y;
    this.tags = tags
  }

  hitTest(other) {
    const horizontal = (other.hitArea.x < this.hitArea.x + this.hitArea.width) && (this.hitArea.x < other.hitArea.x + other.hitArea.width);
    const vertical = (other.hitArea.y < this.hitArea.y + this.hitArea.height) && (this.hitArea.y < other.hitArea.y + other.hitArea.height);
    return (horizontal && vertical);
  }

  update(gameInfo, input) { }

  render(target) {
    const ctx = target.getContext('2d');
    ctx.drawImage(assets.get('sprite'), this.sx, this.sy, this.width, this.height, this.dx, this.dy, this.width, this.height);
  }

  hasTag(tagName) {
    return this.tags.includes(tagName);
  }

  spawn(actor) {
    this.dispatchEvent('spawn', new Event(actor));
  }

  destroy() {
    this.dispatchEvent('destroy', new Event(this));
  }

  get x() {
    return this._x;
  }

  set x(value) {
    this._x = value;
    this.dx = value - this.width / 2;
    this.hitArea.x = value - this.width / 4;
  }

  get y() {
    return this._y;
  }

  set y(value) {
    this._y = value;
    this.dy = value - this.height / 2;
    this.hitArea.y = value - this.height / 4;
  }
}


class Input {
  constructor(keyMap, prevKeyMap) {
    this.keyMap = keyMap;
    this.prevKeyMap = prevKeyMap;
  }

  _getKeyFromMap(keyName, map) {
    if (map.has(keyName)) {
      return map.get(keyName);
    } else {
      return false;
    }
  }

  _getPrevKey(keyName) {
    return this._getKeyFromMap(keyName, this.prevKeyMap);
  }

  getKey(keyName) {
    return this._getKeyFromMap(keyName, this.keyMap);
  }

  getKeyDown(keyName) {
    const prevDown = this._getPrevKey(keyName);
    const currentDown = this.getKey(keyName);
    return (!prevDown && currentDown);
  }

  getKeyUp(keyName) {
    const prevDown = this._getPrevKey(keyName);
    const currentDown = this.getKey(keyName);
    return (prevDown && !currentDown);
  }
}


class InputReceiver {
  constructor() {
    this._keyMap = new Map();
    this._prevKeyMap = new Map();

    addEventListener('keydown', (ke) => this._keyMap.set(ke.key, true));
    addEventListener('keyup', (ke) => this._keyMap.set(ke.key, false));
  }

  getInput() {
    const keyMap = new Map(this._keyMap);
    const prevKeyMap = new Map(this._prevKeyMap);
    this._prevKeyMap = new Map(this._keyMap);
    return new Input(keyMap, prevKeyMap);
  }
}


class Scene extends EventDispatcher {
  constructor(name, renderingTarget, width, height, background) {
    super();
    this.name = name;
    this.renderingTarget = renderingTarget;
    this.width = width;
    this.height = height;
    this.background = background;
    this.actors = [];
    this._destroyedActors = [];
    this._data = [null];
    this._currentLevel = 0;
    this._level = 3;
    // 入力レベルまでdataを伸長する
    while (this._currentLevel < this._level) {
      this._expand();
    }
  }

  add(actor) {
    this.actors.push(actor);
    actor.addEventListener('spawn', (e) => this.add(e.target));
    actor.addEventListener('destroy', (e) => this._addDestroyedActor(e.target));
    this._addData(actor);
  }

  // 衝突判定用のデータを追加
  _addData(actor) {
    const collider = {
      top: actor.hitArea.y,
      bottom: actor.hitArea.y + actor.hitArea.height,
      left: actor.hitArea.x,
      right: actor.hitArea.x + actor.hitArea.width
    }

    // モートン番号の計算
    const leftTopMorton = this._calc2DMortonNumber(collider.left, collider.top);
    const rightBottomMorton = this._calc2DMortonNumber(collider.right, collider.bottom);

    // 左上も右下も-1（画面外）であるならば、レベル0として扱う
    if (leftTopMorton === -1 && rightBottomMorton === -1) {
      this._addNode(actor, 0, 0);
      return;
    }

    // 左上と右下が同じ番号に所属していたら、それはひとつのセルに収まっているということなので、特に計算もせずそのまま現在のレベルのセルに入れる
    if (leftTopMorton === rightBottomMorton) {
      this._addNode(actor, this._currentLevel, leftTopMorton);
      return;
    }

    // 左上と右下が異なる番号 (=境界をまたいでいる) の場合、所属するレベルを計算する
    const level = this._calcLevel(leftTopMorton, rightBottomMorton);

    // そのレベルでの所属する番号を計算する
    // モートン番号の代表値として大きい方を採用する (片方が-1の場合、-1でない方を採用したいため)
    const larger = Math.max(leftTopMorton, rightBottomMorton);
    const cellNumber = this._calcCell(larger, level);

    // 線形四分木に追加する
    this._addNode(actor, level, cellNumber);
  }

  // 要素をdataに追加
  // 必要なのは、要素と、レベルと、レベル内での番号
  _addNode(node, level, index) {
    // オフセットは(4^L - 1)/3で求まる
    // それにindexを足せば線形四分木上での位置が出る
    const offset = ((4 ** level) - 1) / 3;
    const linearIndex = offset + index;

    // もしdataの長さが足りないなら拡張する
    while (this._data.length <= linearIndex) {
      this._expandData();
    }

    // セルの初期値はnullとする
    // しかし上の階層がnullのままだと面倒が発生する
    // なので要素を追加する前に親やその先祖すべてを空配列で初期化する
    let parentCellIndex = linearIndex;
    while (this._data[parentCellIndex] === null) {
      this._data[parentCellIndex] = [];

      parentCellIndex = Math.floor((parentCellIndex - 1) / 4);
      if (parentCellIndex >= this._data.length) {
        break;
      }
    }

    // セルに要素を追加する
    const cell = this._data[linearIndex];
    cell.push(node);
  }

  // 16bitの数値を1bit飛ばしの32bitにする
  _separateBit32(n) {
    n = (n | (n << 8)) & 0x00ff00ff;
    n = (n | (n << 4)) & 0x0f0f0f0f;
    n = (n | (n << 2)) & 0x33333333;
    return (n | (n << 1)) & 0x55555555;
  }

  // x, y座標からモートン番号を算出する。
  _calc2DMortonNumber(x, y) {
    // 空間の外の場合-1を返す
    if (x < 0 || y < 0) {
      return -1;
    }
    if (x > this.width || y > this.height) {
      return -1;
    }

    // 空間の中の位置を求める
    const xCell = Math.floor(x / (this.width / (2 ** this._currentLevel)));
    const yCell = Math.floor(y / (this.height / (2 ** this._currentLevel)));

    // x位置とy位置をそれぞれ1bit飛ばしの数にし、それらをあわせてひとつの数にする (モートン番号)
    return (this._separateBit32(xCell) | (this._separateBit32(yCell) << 1));
  }

  // オブジェクトの所属レベルを算出する
  // XORを取った数を2bitずつ右シフトして、0でない数が捨てられたときのシフト回数を採用する
  _calcLevel(leftTopMorton, rightBottomMorton) {
    const xorMorton = leftTopMorton ^ rightBottomMorton;
    let level = this._currentLevel - 1;
    let attachedLevel = this._currentLevel;

    for (let i = 0; level >= 0; i++) {
      const flag = (xorMorton >> (i * 2)) & 0x3;
      if (flag > 0) {
        attachedLevel = level;
      }

      level--;
    }

    return attachedLevel;
  }

  // 階層を求めるときにシフトした数だけ右シフトすれば空間の位置がわかる
  _calcCell(morton, level) {
    const shift = ((this._currentLevel - level) * 2);
    return morton >> shift;
  }

  remove(actor) {
    const index = this.actors.indexOf(actor);
    this.actors.splice(index, 1);
  }

  change(scene) {
    const event = new Event(scene);
    this.dispatchEvent('change', event);
  }

  update(gameInfo, input) {
    this._updateAll(gameInfo, input);
    this._hitTest();
    this._disposeDestroyedActors();
    this._clearScreen(gameInfo);
    this._renderAll();
  }

  _updateAll(gameInfo, input) {
    this.actors.forEach((actor) => actor.update(gameInfo, input));
  }

  _disposeDestroyedActors() {
    this._destroyedActors.forEach((actor) => this.remove(actor));
    this._destroyedActors = [];
  }

  _addDestroyedActor(actor) {
    this._destroyedActors.push(actor);
  }

  // 線形四分木の長さを伸ばす
  _expand() {
    const nextLevel = this._currentLevel + 1;
    const length = ((4 ** (nextLevel + 1)) - 1) / 3;
    while (this._data.length < length) {
      this._data.push(null);
    }
    this._currentLevel++;
  }

  // 当たり判定
  _hitTest(currentIndex = 0, objList = []) {
    this._clear();
    // 各Actorを四分木に登録
    this.actors.forEach((actor) => {
      this._addData(actor);
    });

    const currentCell = this._data[currentIndex];

    // まず、現在のセルの中と、衝突オブジェクトリストとで当たり判定
    if(currentCell !== null) this._hitTestInCell(currentCell, objList);

    // 次に、下位セルを持つか調べる
    let hasChildren = false;
    for (let i = 0; i < 4; i++) {
      const nextIndex = currentIndex * 4 + 1 + i;

      // 下位セルがあったら、
      const hasChildCell = (nextIndex < this._data.length) && (this._data[nextIndex] !== null);
      hasChildren = hasChildren || hasChildCell;
      if (hasChildCell) {
        // 衝突オブジェクトリストにpushして、
        objList.push(...currentCell);
        // 下位セルで当たり判定を取り、再帰
        this._hitTest(nextIndex, objList);
      }
    }

    // 終わりに、追加したオブジェクトをpopする
    if (hasChildren) {
      const popNum = currentCell.length;
      for (let i = 0; i < popNum; i++) {
        objList.pop();
      }
    }
  }

  // セルの中の当たり判定
  // 衝突オブジェクトリストとも取る
  _hitTestInCell(cell, objList) {
    // まず、セルの中を総当たり
    const length = cell.length;
    for (let i = 0; i < length - 1; i++) {
      const obj1 = cell[i];
      for (let j = i + 1; j < length; j++) {
        const obj2 = cell[j];
        this._detectCollision(obj1, obj2);
      }
    }
    // 次に、衝突オブジェクトリストと判定
    const objLength = objList.length;
    const cellLength = cell.length;
    for (let i = 0; i < objLength; i++) {
      const obj = objList[i];
      for (let j = 0; j < cellLength; j++) {
        const cellObj = cell[j];
        this._detectCollision(obj, cellObj);
      }
    }
  }

  // 線形四分木をクリア
  _clear() {
    this._data.fill(null);
  }

  // 当たり判定の検出器
  _detectCollision(actor1, actor2) {
    const hit = actor1.hitTest(actor2);
    if (hit) {
      actor1.dispatchEvent('hit', new Event(actor2));
      actor2.dispatchEvent('hit', new Event(actor1));
    }
  }

  _clearScreen(gameInfo) {
    const ctx = this.renderingTarget.getContext('2d');
    ctx.fillStyle = this.background;
    ctx.fillRect((gameInfo.screenWidth - this.width) / 2, (gameInfo.screenHeight - this.height) / 2, this.width, this.height);
  }

  _renderAll() {
    this.actors.forEach((actor) => actor.render(this.renderingTarget));
  }
}


class GameInformation {
  constructor(title, screenWidth, screenHeight, maxFps, currentFps) {
    this.title = title;
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.maxFps = maxFps;
    this.currentFps = currentFps;
  }
}


class Game {
  constructor(title, width, height, maxFps, rootScene) {
    this.title = title;
    this.width = width;
    this.height = height;
    this.maxFps = maxFps;
    this.currentFps = 0;
    this.rootScene = rootScene;
    this._inputReceiver = new InputReceiver();
    this._prevTimestamp = 0;
    console.log(`${title}が初期化されました。`);
    this.change(rootScene);
  }

  change(scene) {
    this.currentScene = scene;
    this.currentScene.addEventListener('change', (e) => this.change(e.target));
    console.log(`シーンが${scene.name}に切り替わりました。`);
  }

  start() {
    requestAnimationFrame(this._loop.bind(this));
  }

  _loop(timestamp) {
    const start = performance.now();
    const elapsedSec = (timestamp - this._prevTimestamp) / 1000;
    const accuracy = 0.9;
    const frameTime = 1 / this.maxFps * accuracy;
    if (elapsedSec <= frameTime) {
      requestAnimationFrame(this._loop.bind(this));
      return;
    }
    this._prevTimestamp = timestamp;
    this.currentFps = 1 / elapsedSec;
    const info = new GameInformation(this.title, this.width, this.height, this.maxFps, this.currentFps);
    const input = this._inputReceiver.getInput();
    this.currentScene.update(info, input);
    const end = performance.now();
    const timeStr = (end - start).toPrecision(4);
    //console.log(timeStr);
    requestAnimationFrame(this._loop.bind(this));
  }
}
