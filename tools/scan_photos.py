#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
扫描 assets/ 下的展陈图片，生成两个文件：

1. assets/photos/manifest.js  —— 路径清单（展厅 -> 图片路径，按文件名自然排序）
   作用：让"把图丢进对应展厅文件夹"就能自动补进还空着的展陈槽位。
   槽位优先顺序：主图(hero) → 展板小图1 → 展板小图2 → 人物立牌1 → 人物立牌2。
   data.js 里已经用 hero / photos[] / photo 显式指定过的文件不会被重复分配。

2. assets/photos/embed.js —— data-URL 内嵌素材包（仅当页面以 file:// 打开时才会被加载）
   作用：浏览器在 file:// 下把每个本地文件当作"唯一源"，图片画进 canvas 后上传 WebGL 会被
   安全策略拒绝（SecurityError: The image element contains cross-origin data），表现为
   墙面照片全部空白。data-URL 与页面同源，不受该限制，因此双击 index.html 也能正常出图。

用法（在本项目根目录执行）：
    python tools/scan_photos.py

提示：安装了 Pillow 时会先把大图缩到长边 1600px 并重新压缩，内嵌包体积约 3~4MB；
      未安装 Pillow 时退化为原图直嵌，体积会明显变大。
      安装：python -m pip install pillow
"""
import base64
import io
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTO_DIR = os.path.join(ROOT, 'assets', 'photos')
MANIFEST_OUT = os.path.join(PHOTO_DIR, 'manifest.js')
EMBED_OUT = os.path.join(PHOTO_DIR, 'embed.js')
EXTS = {'.jpg', '.jpeg', '.png', '.webp', '.avif'}

# 内嵌包只收录运行时真正会当贴图用的图：各展厅照片 + 展厅主图
# （序厅横幅 assets/lobby-title.png 已按需求移除，不再打包）
ZONE_IDS = ['jgs', 'yanan', 'xbp', 'hqq', 'xsd']
EXTRA_EMBED = []
MAX_EDGE = 1600
JPEG_QUALITY = 82

try:
    from PIL import Image
except Exception:  # noqa: BLE001
    Image = None


def natural_key(name):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', name)]


def scan_manifest():
    data = {}
    for zone in sorted(os.listdir(PHOTO_DIR)):
        d = os.path.join(PHOTO_DIR, zone)
        if not os.path.isdir(d):
            continue
        files = [f for f in os.listdir(d) if os.path.splitext(f)[1].lower() in EXTS]
        files.sort(key=natural_key)
        if files:
            data[zone] = ['assets/photos/%s/%s' % (zone, f) for f in files]
    return data


def to_data_url(path):
    """把图片转成 data-URL；有 Pillow 时顺带缩放压缩。"""
    ext = os.path.splitext(path)[1].lower()
    raw = open(path, 'rb').read()
    if Image is None:
        mime = 'image/png' if ext == '.png' else 'image/jpeg'
        return 'data:%s;base64,%s' % (mime, base64.b64encode(raw).decode('ascii'))

    im = Image.open(io.BytesIO(raw))
    is_png = ext == '.png'
    if is_png:
        im = im.convert('RGBA' if ('A' in im.getbands() or im.mode == 'P') else 'RGB')
    else:
        im = im.convert('RGB')

    w, h = im.size
    long_edge = max(w, h)
    if long_edge > MAX_EDGE:
        s = float(MAX_EDGE) / long_edge
        im = im.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)

    buf = io.BytesIO()
    if is_png:
        im.save(buf, 'PNG', optimize=True)
        mime = 'image/png'
    else:
        im.save(buf, 'JPEG', quality=JPEG_QUALITY, optimize=True)
        mime = 'image/jpeg'
    return 'data:%s;base64,%s' % (mime, base64.b64encode(buf.getvalue()).decode('ascii'))


def build_embed(manifest):
    paths = []
    for zone in ZONE_IDS:
        for p in manifest.get(zone, []):
            paths.append(p)
        hero = 'assets/%s.jpg' % zone
        if os.path.exists(os.path.join(ROOT, hero)):
            paths.append(hero)
    # 液晶屏预抽封面帧（tools/make_posters.py 生成）也要内嵌，否则 file:// 下屏幕仍是占位图
    for zone in ZONE_IDS:
        poster = 'assets/posters/%s.jpg' % zone
        if os.path.exists(os.path.join(ROOT, poster)):
            paths.append(poster)
    for p in EXTRA_EMBED:
        if os.path.exists(os.path.join(ROOT, p)):
            paths.append(p)

    seen_hash = {}
    embed = {}
    for p in paths:
        abs_p = os.path.join(ROOT, p)
        if not os.path.exists(abs_p):
            continue
        import hashlib
        h = hashlib.md5(open(abs_p, 'rb').read()).hexdigest()
        if h in seen_hash:          # 同一张图被多个路径引用（如 jgs/1.jpg 与 jgs.jpg 同图）
            embed[p] = seen_hash[h]
            continue
        url = to_data_url(abs_p)
        seen_hash[h] = url
        embed[p] = url
    return embed


def main():
    if not os.path.isdir(PHOTO_DIR):
        raise SystemExit('找不到目录: ' + PHOTO_DIR)

    manifest = scan_manifest()

    body = json.dumps(manifest, ensure_ascii=False, indent=2)
    js = (
        '/**\n'
        ' * 自动生成，请勿手改。\n'
        ' * 重新生成：python tools/scan_photos.py\n'
        ' * 键 = 展厅 id，值 = 该文件夹里的图片（按文件名自然排序）\n'
        ' */\n'
        'window.PHOTO_MANIFEST = ' + body + ';\n'
    )
    with open(MANIFEST_OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)

    total = sum(len(v) for v in manifest.values())
    print('已写入 %s' % os.path.relpath(MANIFEST_OUT, ROOT))
    for k, v in manifest.items():
        print('  %-6s %d 张' % (k, len(v)))
    print('  合计 %d 张' % total)

    embed = build_embed(manifest)
    lines = [
        '/**',
        ' * 自动生成，请勿手改。',
        ' * 本地文件协议（file://）专用：同源 data-URL 素材包。',
        ' * 浏览器在 file:// 下禁止把本地图片上传为 WebGL 贴图，本文件绕开该限制。',
        ' * 重新生成：python tools/scan_photos.py',
        ' */',
        'window.PHOTO_EMBED = {',
    ]
    items = sorted(embed.items())
    for i, (k, v) in enumerate(items):
        comma = ',' if i < len(items) - 1 else ''
        lines.append('  %s: %s%s' % (json.dumps(k, ensure_ascii=False), json.dumps(v), comma))
    lines.append('};')
    with open(EMBED_OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')

    size = os.path.getsize(EMBED_OUT) / 1048576.0
    print('已写入 %s（%d 张内嵌，%.2f MB）' % (os.path.relpath(EMBED_OUT, ROOT), len(embed), size))
    if Image is None:
        print('提示：当前 python 未安装 Pillow，内嵌包使用原图，体积偏大。'
              '安装命令：python -m pip install pillow')


if __name__ == '__main__':
    main()
