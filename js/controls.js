/**
 * 第一人称漫游控制
 * 支持：键盘 WASD/方向键、鼠标拖拽转视角、指针锁定、移动端虚拟摇杆、平滑飞行导航
 */
(function () {
  class FPControls {
    constructor(camera, dom, opts) {
      this.camera = camera;
      this.dom = dom;
      this.opts = opts || {};
      this.pos = new THREE.Vector3(0, 1.65, 0);
      this.vel = new THREE.Vector3();
      this.yaw = 0;
      this.pitch = 0;
      this.speed = 4.2;
      this.keys = {};
      this.collidables = [];
      this.bounds = { minX: -20, maxX: 20, minZ: -14, maxZ: 14 };
      this.enabled = true;
      this.flying = null;
      this.touch = { active: false, id: null, sx: 0, sy: 0 };
      this.joy = { x: 0, y: 0, active: false };
      this.dragging = false;
      this.bob = 0;
      this.onBlocked = null; // 被碰撞体挡住时回调(msg)
      this._lastBlock = 0;
      this._bind();
    }

    _bind() {
      const self = this;
      window.addEventListener('keydown', (e) => {
        self.keys[e.code] = true;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      });
      window.addEventListener('keyup', (e) => {
        self.keys[e.code] = false;
      });
      window.addEventListener('blur', () => {
        self.keys = {};
      });

      this.dom.addEventListener('mousedown', (e) => {
        if (e.target.closest('.ui-layer')) return;
        self.dragging = true;
        self.lastX = e.clientX;
        self.lastY = e.clientY;
      });
      window.addEventListener('mouseup', () => {
        self.dragging = false;
      });
      window.addEventListener('mousemove', (e) => {
        if (!self.dragging || !self.enabled) return;
        const dx = e.clientX - self.lastX;
        const dy = e.clientY - self.lastY;
        self.lastX = e.clientX;
        self.lastY = e.clientY;
        self.yaw -= dx * 0.0032;
        self.pitch -= dy * 0.0028;
        self._clampPitch();
      });

      // 触摸：左侧摇杆区移动，右侧滑动转视角
      this.dom.addEventListener('touchstart', (e) => {
        if (e.target.closest('.ui-layer')) return;
        for (const t of e.changedTouches) {
          if (t.clientX < window.innerWidth * 0.35 && !this.joy.active) {
            this.joy.active = true;
            this.joy.id = t.identifier;
            this.jox = t.clientX;
            this.joy2 = t.clientY;
          } else if (!this.touch.active) {
            this.touch.active = true;
            this.touch.id = t.identifier;
            this.touch.sx = t.clientX;
            this.touch.sy = t.clientY;
            this.lastX = t.clientX;
            this.lastY = t.clientY;
          }
        }
      }, { passive: true });

      this.dom.addEventListener('touchmove', (e) => {
        for (const t of e.changedTouches) {
          if (this.joy.active && t.identifier === this.joy.id) {
            const dx = t.clientX - this.jox;
            const dy = t.clientY - this.joy2;
            const max = 55;
            const len = Math.hypot(dx, dy) || 1;
            const k = Math.min(1, len / max);
            this.joy.x = (dx / len) * k;
            this.joy.y = (dy / len) * k;
            const knob = document.getElementById('joyKnob');
            if (knob) knob.style.transform = `translate(${this.joy.x * 34}px, ${this.joy.y * 34}px)`;
          } else if (this.touch.active && t.identifier === this.touch.id) {
            const dx = t.clientX - this.lastX;
            const dy = t.clientY - this.lastY;
            this.lastX = t.clientX;
            this.lastY = t.clientY;
            this.yaw -= dx * 0.005;
            this.pitch -= dy * 0.004;
            this._clampPitch();
          }
        }
      }, { passive: true });

      const endTouch = (e) => {
        for (const t of e.changedTouches) {
          if (this.joy.active && t.identifier === this.joy.id) {
            this.joy.active = false;
            this.joy.x = this.joy.y = 0;
            const knob = document.getElementById('joyKnob');
            if (knob) knob.style.transform = 'translate(0,0)';
          }
          if (this.touch.active && t.identifier === this.touch.id) this.touch.active = false;
        }
      };
      this.dom.addEventListener('touchend', endTouch, { passive: true });
      this.dom.addEventListener('touchcancel', endTouch, { passive: true });
    }

    _clampPitch() {
      const lim = Math.PI / 2 - 0.08;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    }

    setBounds(halfW, halfD) {
      this.bounds = { minX: -halfW + 1.2, maxX: halfW - 1.2, minZ: -halfD + 1.2, maxZ: halfD - 1.2 };
    }

    // 平滑飞往指定点与朝向
    flyTo(targetPos, targetLook, dur) {
      const from = this.pos.clone();
      const fromYaw = this.yaw;
      const fromPitch = this.pitch;
      const dir = new THREE.Vector3().subVectors(targetLook, targetPos);
      const toYaw = Math.atan2(-dir.x, -dir.z);
      const toPitch = Math.asin(THREE.MathUtils.clamp(dir.y / dir.length(), -1, 1));
      // 取最近的等价角度，避免转一大圈
      let dy = toYaw - fromYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.flying = {
        t: 0,
        dur: dur || 1.5,
        from,
        to: targetPos.clone(),
        fromYaw,
        dYaw: dy,
        fromPitch,
        toPitch,
      };
    }

    lookAtPoint(p) {
      const dir = new THREE.Vector3().subVectors(p, this.pos);
      this.yaw = Math.atan2(-dir.x, -dir.z);
      this.pitch = Math.asin(THREE.MathUtils.clamp(dir.y / dir.length(), -1, 1));
      this._clampPitch();
    }

    _resolveCollision(p) {
      const r = 0.5;
      // 房间边界
      p.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, p.x));
      p.z = Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, p.z));
      // 展区障碍（AABB 推挤）
      for (const b of this.collidables) {
        const hit = p.x + r > b.minX && p.x - r < b.maxX && p.z + r > b.minZ && p.z - r < b.maxZ;
        if (!hit) continue;
        // 感应条（noBlock）：只触发提示，不推挤、不阻挡
        if (b.noBlock) {
          if (b.hint && this.onBlocked) {
            const now = performance.now();
            if (now - this._lastBlock > 2500) {
              this._lastBlock = now;
              this.onBlocked(b.hint);
            }
          }
          continue;
        }
        const dxL = p.x + r - b.minX; // 向左推出距离
        const dxR = b.maxX - (p.x - r);
        const dzL = p.z + r - b.minZ;
        const dzR = b.maxZ - (p.z - r);
        const m = Math.min(dxL, dxR, dzL, dzR);
        if (m === dxL) p.x = b.minX - r;
        else if (m === dxR) p.x = b.maxX + r;
        else if (m === dzL) p.z = b.minZ - r;
        else p.z = b.maxZ + r;
        // 实体碰撞体若带提示文案：被挡住时轻提示（节流，避免每帧刷屏）
        if (b.hint && this.onBlocked) {
          const now = performance.now();
          if (now - this._lastBlock > 2500) {
            this._lastBlock = now;
            this.onBlocked(b.hint);
          }
        }
      }
      return p;
    }

    update(dt) {
      if (this.flying) {
        const f = this.flying;
        f.t += dt;
        const k = Math.min(1, f.t / f.dur);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOutQuad
        this.pos.lerpVectors(f.from, f.to, e);
        this.yaw = f.fromYaw + f.dYaw * e;
        this.pitch = f.fromPitch + (f.toPitch - f.fromPitch) * e;
        if (k >= 1) this.flying = null;
      } else if (this.enabled) {
        // 输入
        let ix = 0;
        let iz = 0;
        if (this.keys['KeyW'] || this.keys['ArrowUp']) iz += 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) iz -= 1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) ix -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) ix += 1;
        if (this.joy.active) {
          ix += this.joy.x;
          iz -= this.joy.y;
        }
        const len = Math.hypot(ix, iz);
        if (len > 1) {
          ix /= len;
          iz /= len;
        }
        const boost = this.keys['ShiftLeft'] || this.keys['ShiftRight'] ? 2.1 : 1;
        const sp = this.speed * boost;
        // 由 yaw 决定的前向（相机看向 -z 旋转 yaw 后）
        const sin = Math.sin(this.yaw);
        const cos = Math.cos(this.yaw);
        const fx = -sin;
        const fz = -cos;
        const rx = cos;
        const rz = -sin;
        const target = new THREE.Vector3(fx * iz + rx * ix, 0, fz * iz + rz * ix).multiplyScalar(sp);
        // 阻尼
        this.vel.lerp(target, Math.min(1, dt * 9));
        if (this.vel.lengthSq() < 1e-5) this.vel.set(0, 0, 0);
        const next = this.pos.clone().addScaledVector(this.vel, dt);
        this._resolveCollision(next);
        this.pos.copy(next);
        // 行走起伏
        this.bob += dt * this.vel.length() * 1.7;
      }

      this.camera.position.set(this.pos.x, this.pos.y + Math.sin(this.bob) * 0.035, this.pos.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
      this.camera.rotation.z = 0;
    }
  }

  window.FPControls = FPControls;
})();
