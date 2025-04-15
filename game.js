'use strict';

class Fighter extends Actor {
  constructor(x, y) {
    super(0, 0, 16, 16, x, y, ['player']);
    this._interval = 5;
    this._timeCount = 0;
    this._speed = 3;
    this._velocityX = 0;
    this._velocityY = 0;
    this.addEventListener('hit', (e) => {
      if (e.target.hasTag('enemyBullet')) {
        this.destroy();
      }
    });
  }

  update(gameInfo, input) {
    this._velocityX = 0;
    this._velocityY = 0;
    if (input.getKey('ArrowUp') && this.y > 0) { this._velocityY -= this._speed; }
    if (input.getKey('ArrowDown') && this.y < gameInfo.screenHeight) { this._velocityY += this._speed; }
    if (input.getKey('ArrowRight') && this.x < gameInfo.screenWidth) { this._velocityX += this._speed; }
    if (input.getKey('ArrowLeft') && this.x > 0) { this._velocityX -= this._speed; }
    this.x += this._velocityX;
    this.y += this._velocityY;

    this._timeCount++;
    const isFireReady = this._timeCount > this._interval;
    if (isFireReady && input.getKey(' ')) {
      const bullet = new Bullet(this.x, this.y);
      this.spawn(bullet);
      this._timeCount = 0;
    }
  }
}


class Bullet extends Actor {
  constructor(x, y) {
    super(0, 16, 16, 16, x, y, ['playerBullet']);
    this.speed = 6;
    this.addEventListener('hit', (e) => {
      if (e.target.hasTag('enemy')) { this.destroy(); }
    });
  }

  update(gameInfo, input) {
    this.y -= this.speed;
    if (this.y < 0) this.destroy();
  }
}


class Enemy extends Actor {
  constructor(x, y) {
    super(16, 0, 16, 16, x, y, ['enemy']);
    this.maxHp = 120;
    this.currentHp = this.maxHp;
    this._interval = 120;
    this._timeCount = 0;
    this._velocityX = 0.3;
    this.addEventListener('hit', (e) => {
      if (e.target.hasTag('playerBullet')) {
        this.currentHp--;
        this.dispatchEvent('changehp', new Event(this));
      }
    });
  }

  // degree度の方向にspeedの速さで弾を発射する
  shootBullet(degree, speed) {
    const rad = degree / 180 * Math.PI;
    const velocityX = Math.cos(rad) * speed;
    const velocityY = Math.sin(rad) * speed;
    const bullet = new EnemyBullet(this.x, this.y, velocityX, velocityY);
    this.spawn(bullet);
  }

  // num個の弾を円形に発射する
  shootCircularBullets(num, speed) {
    const degree = 360 / num;
    for (let i = 0; i < num; i++) {
      this.shootBullet(degree * i, speed);
    }
  }

  update(gameInfo, input) {
    if (this.currentHp <= 0) {
      this.destroy();
    }

    // 左右に移動する
    this.x += this._velocityX;
    if (this.x <= 80 || this.x >= 240) { this._velocityX *= -1; }

    // インターバルを経過していたら弾を撃つ
    this._timeCount++;
    if (this._timeCount > this._interval) {
      this.shootCircularBullets(15, 1);
      this._timeCount = 0;
    }
  }
}


class EnemyHpBar extends Actor {
  constructor(x, y, enemy) {
    super(0, 0, 0, 0, x, y);
    this._width = 240;
    this._height = 12;
    this._innerWidth = this._width;
    enemy.addEventListener('changehp', (e) => {
      const maxHp = e.target.maxHp;
      const hp = e.target.currentHp;
      this._innerWidth = this._width * (hp / maxHp);
    });
  }

  render(target) {
    const ctx = target.getContext('2d');
    ctx.strokeStyle = 'white';
    ctx.fillStyle = 'white';
    ctx.strokeRect(this.x, this.y, this._width, this._height);
    ctx.fillRect(this.x, this.y, this._innerWidth, this._height);
  }
}


class EnemyBullet extends Actor {
  constructor(x, y, velocityX, velocityY) {
    super(16, 16, 16, 16, x, y, ['enemyBullet']);
    this.velocityX = velocityX;
    this.velocityY = velocityY;
  }

  update(gameInfo, input) {
    this.x += this.velocityX;
    this.y += this.velocityY;
    if (this.x < 0 || this.x > gameInfo.screenWidth || this.y < 0 || this.y > gameInfo.screenHeight) this.destroy();
  }
}


class TextLabel extends Actor {
  constructor(x, y, text) {
    super(0, 0, 0, 0, x, y);
    this.text = text;
  }

  render(target) {
    const ctx = target.getContext('2d');
    ctx.font = '24px sans-serif';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.fillText(this.text, this.x, this.y);
  }
}


class GameOverLabel extends TextLabel {
  update(gameInfo, input) {
    super.update(gameInfo, input);
    if (input.getKeyDown(' ')) {
      this.destroy();
    }
  }
}


class MainScene extends Scene {
  constructor(renderingTarget) {
    super('Main', renderingTarget, 320, 480, 'black');
    const fighter = new Fighter(160, 400);
    const enemy = new Enemy(160, 80);
    const hpBar = new EnemyHpBar(40, 20, enemy);
    this.add(fighter);
    this.add(enemy);
    this.add(hpBar);
    fighter.addEventListener('destroy', (e) => {
      const gameover = new GameOverLabel(160, 216, 'GAME OVER');
      gameover.addEventListener('destroy', (e) => {
        const mainScene = new MainScene(this.renderingTarget);
        this.change(mainScene);
      });
      this.add(gameover);
    });
    enemy.addEventListener('destroy', (e) => {
      const endScene = new EndScene(renderingTarget);
      this.change(endScene);
    });
  }
}


class StartScene extends Scene {
  constructor(renderingTarget) {
    super('Title', renderingTarget, 320, 480, 'black');
    const title = new TextLabel(160, 216, 'GAME START');
    this.add(title);
  }

  update(gameInfo, input) {
    super.update(gameInfo, input);
    if (input.getKeyDown(' ')) {
      const mainScene = new MainScene(this.renderingTarget);
      this.change(mainScene);
    }
  }
}


class EndScene extends Scene {
  constructor(renderingTarget) {
    super('Title', renderingTarget, 320, 480, 'black');
    const title = new TextLabel(160, 216, 'GAME CLEAR');
    this.add(title);
  }

  update(gameInfo, input) {
    super.update(gameInfo, input);
    if (input.getKeyDown(' ')) {
      const mainScene = new MainScene(this.renderingTarget);
      this.change(mainScene);
    }
  }
}


assets.addImage('sprite', './sprite.png');
assets.loadAll().then((a) => {
  const scene = new StartScene(document.getElementById('canvas'));
  const game = new Game('My Shooting Game', 320, 480, 60, scene);
  game.start();
});
